#!/usr/bin/env node
/**
 * Backfill ad_metrics_daily FX snapshots (OPS-02c).
 *
 * One-shot historical rates from Frankfurter (ECB) — NOT a live FX converter.
 * Writes spend_base / base_currency / fx_rate / fx_dated once; reports read the snapshot.
 * See docs/legacy-reference/doviz.md (snapshot model) and DEPLOY-COOLIFY.md.
 *
 * Default dry-run. Pass --apply to UPDATE.
 * Idempotent: rows with spend_base already set are skipped.
 * Missing rates are skipped and listed — never invented.
 *
 * Usage:
 *   pnpm --filter @verimaya/api ads:fx-backfill -- --tenant-id <uuid>
 *   pnpm --filter @verimaya/api ads:fx-backfill -- --apply --tenant-id <uuid>
 *
 * Coolify (API container):
 *   node scripts/backfill-ad-spend-fx.js --tenant-id <uuid>
 *   node scripts/backfill-ad-spend-fx.js --apply --tenant-id <uuid>
 *
 * Env:
 *   DATABASE_URL_APP  Verimaya app role (RLS)
 *   FRANKFURTER_BASE  optional override (default https://api.frankfurter.app)
 */

const path = require('node:path');
const { config: loadEnv } = require('dotenv');
const postgres = require('postgres');

loadEnv({ path: path.join(__dirname, '..', '.env') });

const DEFAULT_FRANKFURTER = 'https://api.frankfurter.app';

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
	/** @type {{ apply: boolean, help: boolean, tenantId: string | null, from: string | null, to: string | null }} */
	const out = { apply: false, help: false, tenantId: null, from: null, to: null };
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
		else if (arg === '--from') {
			const next = argv[++i];
			if (!next) throw new Error('--from requires YYYY-MM-DD');
			out.from = next;
		} else if (arg.startsWith('--from=')) out.from = arg.slice('--from='.length);
		else if (arg === '--to') {
			const next = argv[++i];
			if (!next) throw new Error('--to requires YYYY-MM-DD');
			out.to = next;
		} else if (arg.startsWith('--to=')) out.to = arg.slice('--to='.length);
	}
	return out;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toIsoDate(value) {
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	return String(value).slice(0, 10);
}

/**
 * @param {string} date
 * @param {string} from
 * @param {string} to
 * @param {string} apiBase
 * @returns {Promise<{ rate: number, rateDate: string } | null>}
 */
async function fetchFrankfurterRate(date, from, to, apiBase) {
	const url = `${apiBase.replace(/\/$/, '')}/${date}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
	const res = await fetch(url);
	if (!res.ok) {
		return null;
	}
	/** @type {{ date?: string, rates?: Record<string, number> }} */
	const body = await res.json();
	const rate = body.rates?.[to];
	if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
		return null;
	}
	const rateDate = body.date ? String(body.date).slice(0, 10) : date;
	return { rate, rateDate };
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log(`Usage: node scripts/backfill-ad-spend-fx.js [options]
  --tenant-id <uuid>   Verimaya tenant (required)
  --from YYYY-MM-DD    optional lower bound on ad_metrics_daily.date
  --to YYYY-MM-DD      optional upper bound
  --dry-run            (default) report only
  --apply              UPDATE spend_base / base_currency / fx_rate / fx_dated

Env: DATABASE_URL_APP (or DATABASE_URL)
Optional: FRANKFURTER_BASE (default ${DEFAULT_FRANKFURTER})

Frankfurter returns the last ECB publish date for weekends/holidays; we use that
rate and set fx_dated to the returned rate date (not inventing mid-weekend prices).
True fetch/parse failures are skipped and listed.`);
		process.exit(0);
	}

	if (!args.tenantId) {
		console.error('--tenant-id is required');
		process.exit(1);
	}

	const appUrl = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
	if (!appUrl) {
		console.error('DATABASE_URL_APP (or DATABASE_URL) is required');
		process.exit(1);
	}

	const apiBase = process.env.FRANKFURTER_BASE?.trim() || DEFAULT_FRANKFURTER;
	const app = postgres(appUrl, { max: 2 });

	try {
		const [tenant] = await app`
			select id, base_currency from tenants where id = ${args.tenantId} limit 1
		`;
		if (!tenant) {
			console.error(`Tenant not found: ${args.tenantId}`);
			process.exit(1);
		}
		const tenantBase = String(tenant.base_currency ?? 'TRY');

		const rows = await app.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${args.tenantId}, true)`;
			return tx`
				select
					id,
					date,
					currency,
					spend_minor,
					spend_base,
					base_currency,
					fx_rate,
					fx_dated,
					provider,
					campaign_id
				from ad_metrics_daily
				where tenant_id = ${args.tenantId}
					and spend_base is null
					and currency is not null
					and currency <> ${tenantBase}
					${args.from ? tx`and date >= ${args.from}` : tx``}
					${args.to ? tx`and date <= ${args.to}` : tx``}
				order by date, provider, campaign_id
			`;
		});

		/** @type {Map<string, { rate: number, rateDate: string } | null>} */
		const rateByDate = new Map();
		/** @type {string[]} */
		const missingRateDates = [];
		/** @type {Set<string>} */
		const missingSeen = new Set();

		const uniqueDates = [
			...new Set(rows.map((r) => toIsoDate(r.date)))
		].sort();

		for (const date of uniqueDates) {
			const currencies = [
				...new Set(
					rows
						.filter((r) => toIsoDate(r.date) === date)
						.map((r) => String(r.currency))
				)
			];
			for (const currency of currencies) {
				const cacheKey = `${date}|${currency}|${tenantBase}`;
				if (rateByDate.has(cacheKey)) continue;
				const fetched = await fetchFrankfurterRate(date, currency, tenantBase, apiBase);
				rateByDate.set(cacheKey, fetched);
				if (!fetched && !missingSeen.has(cacheKey)) {
					missingSeen.add(cacheKey);
					missingRateDates.push(cacheKey);
				}
				// Be polite to the public API
				await new Promise((r) => setTimeout(r, 50));
			}
		}

		const stats = {
			mode: args.apply ? 'apply' : 'dry-run',
			tenant_id: args.tenantId,
			tenant_base: tenantBase,
			candidates: rows.length,
			unique_dates: uniqueDates.length,
			skipped_no_rate: 0,
			would_update: 0,
			applied: 0,
			missing_rate_keys: missingRateDates
		};

		/** @type {{ id: string, date: string, currency: string, spend_minor: number, spend_base: number, fx_rate: number, fx_dated: string }[]} */
		const updates = [];

		for (const row of rows) {
			const date = toIsoDate(row.date);
			const currency = String(row.currency);
			const cacheKey = `${date}|${currency}|${tenantBase}`;
			const fx = rateByDate.get(cacheKey);
			if (!fx) {
				stats.skipped_no_rate += 1;
				continue;
			}
			const spendMinor = Number(row.spend_minor);
			const spendBase = Math.round(spendMinor * fx.rate);
			stats.would_update += 1;
			updates.push({
				id: String(row.id),
				date,
				currency,
				spend_minor: spendMinor,
				spend_base: spendBase,
				fx_rate: fx.rate,
				fx_dated: fx.rateDate
			});
		}

		console.log(
			JSON.stringify(
				{
					...stats,
					sample: updates.slice(0, 5)
				},
				null,
				2
			)
		);

		if (!args.apply) {
			console.log('Dry-run only. Re-run with --apply to UPDATE.');
			return;
		}

		await app.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${args.tenantId}, true)`;
			for (const u of updates) {
				await tx`
					update ad_metrics_daily
					set
						spend_base = ${u.spend_base},
						base_currency = ${tenantBase},
						fx_rate = ${u.fx_rate},
						fx_dated = ${u.fx_dated}
					where id = ${u.id}
						and spend_base is null
				`;
				stats.applied += 1;
			}
		});

		console.log(
			JSON.stringify(
				{
					applied: stats.applied,
					would_update: stats.would_update,
					skipped_no_rate: stats.skipped_no_rate,
					missing_rate_keys: stats.missing_rate_keys
				},
				null,
				2
			)
		);
	} finally {
		await app.end({ timeout: 5 });
	}
}

if (require.main === module) {
	main().catch((err) => {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	});
}

module.exports = { parseArgs, fetchFrankfurterRate, toIsoDate };
