#!/usr/bin/env node
/**
 * Backfill transaction FX snapshots from Tracker counterparty_* via external_ids.
 * Does NOT re-run ETL apply (idempotent inserts skip existing rows).
 *
 * Default dry-run. Pass --apply to UPDATE.
 *
 * Usage:
 *   pnpm --filter @verimaya/api fx:backfill -- --tenant-id <uuid> --tracker-tenant-id <uuid>
 *   pnpm --filter @verimaya/api fx:backfill -- --apply --tenant-id <uuid> --tracker-tenant-id <uuid>
 *
 * Env:
 *   DATABASE_URL_APP     Verimaya app role (RLS)
 *   TRACKER_DATABASE_URL Tracker Postgres (read-only)
 */

const path = require('node:path');
const { config: loadEnv } = require('dotenv');
const postgres = require('postgres');
const { resolveFxSnapshot, SOURCE } = require('./etl');

loadEnv({ path: path.join(__dirname, '..', '.env') });

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
	/** @type {{ apply: boolean, help: boolean, tenantId: string | null, trackerTenantId: string | null }} */
	const out = { apply: false, help: false, tenantId: null, trackerTenantId: null };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--') continue;
		if (arg === '--apply') out.apply = true;
		else if (arg === '--dry-run') out.apply = false;
		else if (arg === '--help' || arg === '-h') out.help = true;
		else if (arg === '--tenant-id') {
			const next = argv[++i];
			if (!next) throw new Error('--tenant-id requires a uuid');
			out.tenantId = next;
		} else if (arg.startsWith('--tenant-id=')) out.tenantId = arg.slice('--tenant-id='.length);
		else if (arg === '--tracker-tenant-id') {
			const next = argv[++i];
			if (!next) throw new Error('--tracker-tenant-id requires a uuid');
			out.trackerTenantId = next;
		} else if (arg.startsWith('--tracker-tenant-id=')) {
			out.trackerTenantId = arg.slice('--tracker-tenant-id='.length);
		}
	}
	return out;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log(`Usage: node scripts/backfill-fx.js [options]
  --tenant-id <uuid>          Verimaya tenant (required)
  --tracker-tenant-id <uuid>  Tracker tenant (required)
  --dry-run                   (default) report only
  --apply                     UPDATE amount_base/base_currency/fx_rate/fx_dated

Env: DATABASE_URL_APP, TRACKER_DATABASE_URL`);
		process.exit(0);
	}

	if (!args.tenantId || !args.trackerTenantId) {
		console.error('--tenant-id and --tracker-tenant-id are required');
		process.exit(1);
	}

	const appUrl = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
	const trackerUrl = process.env.TRACKER_DATABASE_URL;
	if (!appUrl) {
		console.error('DATABASE_URL_APP (or DATABASE_URL) is required');
		process.exit(1);
	}
	if (!trackerUrl) {
		console.error('TRACKER_DATABASE_URL is required');
		process.exit(1);
	}

	const app = postgres(appUrl, { max: 2 });
	const tracker = postgres(trackerUrl, { max: 2, ssl: 'require' });

	try {
		const [tenant] = await app`
			select id, base_currency from tenants where id = ${args.tenantId} limit 1
		`;
		if (!tenant) {
			console.error(`Tenant not found: ${args.tenantId}`);
			process.exit(1);
		}
		const tenantBase = String(tenant.base_currency ?? 'TRY');

		const mapped = await app.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${args.tenantId}, true)`;
			return tx`
				select e.external_id, e.internal_id,
					t.currency, t.amount, t.occurred_on,
					t.amount_base, t.base_currency, t.fx_rate, t.fx_dated
				from external_ids e
				join transactions t on t.id = e.internal_id
				where e.tenant_id = ${args.tenantId}
					and e.source = ${SOURCE}
					and e.entity_type = 'transaction'
			`;
		});

		const legacyIds = mapped.map((r) => String(r.external_id));
		/** @type {Map<string, { amount: number, counterparty_amount: number | null, equivalent_currency: string | null }>} */
		const trackerByLegacy = new Map();

		const chunk = 500;
		for (let i = 0; i < legacyIds.length; i += chunk) {
			const batch = legacyIds.slice(i, i + chunk);
			const rows = await tracker`
				select id::text as id, amount, counterparty_amount, equivalent_currency
				from transactions
				where tenant_id = ${args.trackerTenantId}
					and id::text = any(${batch})
			`;
			for (const r of rows) {
				trackerByLegacy.set(String(r.id), {
					amount: Number(r.amount),
					counterparty_amount:
						r.counterparty_amount != null ? Number(r.counterparty_amount) : null,
					equivalent_currency:
						r.equivalent_currency != null ? String(r.equivalent_currency) : null
				});
			}
		}

		const stats = {
			mode: args.apply ? 'apply' : 'dry-run',
			tenant_id: args.tenantId,
			tenant_base: tenantBase,
			mapped: mapped.length,
			skipped_native_base: 0,
			skipped_no_tracker: 0,
			skipped_no_equivalent: 0,
			skipped_already_set: 0,
			would_update: 0,
			applied: 0
		};

		/** @type {{ id: string, fx: ReturnType<typeof resolveFxSnapshot> }[]} */
		const updates = [];

		for (const row of mapped) {
			const currency = String(row.currency);
			if (currency === tenantBase) {
				stats.skipped_native_base += 1;
				continue;
			}
			const src = trackerByLegacy.get(String(row.external_id));
			if (!src) {
				stats.skipped_no_tracker += 1;
				continue;
			}
			const occurredOn =
				row.occurred_on instanceof Date
					? row.occurred_on.toISOString().slice(0, 10)
					: String(row.occurred_on).slice(0, 10);
			const fx = resolveFxSnapshot({
				currency,
				amountMajor: src.amount,
				occurredOn,
				counterpartyMajor: src.counterparty_amount,
				equivalentCurrency: src.equivalent_currency,
				tenantBase
			});
			if (fx.amount_base == null) {
				stats.skipped_no_equivalent += 1;
				continue;
			}
			if (
				row.amount_base === fx.amount_base &&
				row.base_currency === fx.base_currency &&
				Number(row.fx_rate) === fx.fx_rate &&
				row.fx_dated === fx.fx_dated
			) {
				stats.skipped_already_set += 1;
				continue;
			}
			stats.would_update += 1;
			updates.push({ id: String(row.internal_id), fx });
		}

		console.log(JSON.stringify({ ...stats, sample: updates.slice(0, 3) }, null, 2));

		if (!args.apply) {
			console.log('Dry-run only. Re-run with --apply to UPDATE.');
			return;
		}

		await app.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${args.tenantId}, true)`;
			for (const u of updates) {
				await tx`
					update transactions
					set
						amount_base = ${u.fx.amount_base},
						base_currency = ${u.fx.base_currency},
						fx_rate = ${u.fx.fx_rate},
						fx_dated = ${u.fx.fx_dated},
						updated_at = now()
					where id = ${u.id}
				`;
				stats.applied += 1;
			}
		});

		console.log(JSON.stringify({ applied: stats.applied, would_update: stats.would_update }, null, 2));
	} finally {
		await Promise.all([app.end({ timeout: 5 }), tracker.end({ timeout: 5 })]);
	}
}

if (require.main === module) {
	main().catch((err) => {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	});
}

module.exports = { parseArgs };
