#!/usr/bin/env node
/**
 * Backfill ad_metrics_daily FX snapshots (OPS-02c).
 *
 * One-shot historical rates from Frankfurter v1 (ECB) — NOT a live FX converter,
 * NOT v2 blended rates. Writes spend_base / base_currency / fx_rate / fx_dated once;
 * reports read the snapshot. Sync never converts — only this script (or manual SQL).
 *
 * See docs/legacy-reference/doviz.md and docs/DEPLOY-COOLIFY.md § OPS-02c.
 *
 * Default dry-run (never writes). Pass --apply to UPDATE.
 * Idempotent unless --force: rows with spend_base already set are skipped.
 * Missing rates are skipped and listed — never invented.
 *
 * Usage:
 *   pnpm --filter @verimaya/api ads:fx-backfill -- --tenant-id <uuid>
 *   pnpm --filter @verimaya/api ads:fx-backfill -- --apply --tenant-id <uuid>
 *   pnpm --filter @verimaya/api ads:fx-backfill -- --apply --force --tenant-id <uuid>
 *
 * Coolify (API container, WORKDIR apps/api):
 *   node scripts/backfill-ad-spend-fx.js --tenant-id <uuid>
 *   node scripts/backfill-ad-spend-fx.js --apply --tenant-id <uuid>
 *   node scripts/backfill-ad-spend-fx.js --apply --force --tenant-id <uuid>
 *
 * Env:
 *   DATABASE_URL_APP  Verimaya app role (RLS)
 *   FRANKFURTER_BASE  optional override (default https://api.frankfurter.dev/v1)
 */

const path = require('node:path');
const { config: loadEnv } = require('dotenv');
const postgres = require('postgres');

loadEnv({ path: path.join(__dirname, '..', '.env') });

/** Explicit v1/ECB path — do not use v2 blended rates (rates diverge). */
const DEFAULT_FRANKFURTER = 'https://api.frankfurter.dev/v1';

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
	/** @type {{ apply: boolean, force: boolean, help: boolean, tenantId: string | null, from: string | null, to: string | null }} */
	const out = { apply: false, force: false, help: false, tenantId: null, from: null, to: null };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--') continue;
		if (arg === '--apply') out.apply = true;
		else if (arg === '--force') out.force = true;
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
 * Calendar date only — never Date#toISOString (TZ shift can move the day).
 * @param {unknown} value
 * @returns {string}
 */
function toIsoDate(value) {
	if (typeof value === 'string') {
		const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
		if (m) return m[1];
	}
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		const y = value.getUTCFullYear();
		const mo = String(value.getUTCMonth() + 1).padStart(2, '0');
		const d = String(value.getUTCDate()).padStart(2, '0');
		return `${y}-${mo}-${d}`;
	}
	return String(value).slice(0, 10);
}

/**
 * @param {string} date
 * @param {string} from
 * @param {string} to
 * @param {string} apiBase
 * @returns {Promise<{ rate: number, rateDate: string, url: string } | null>}
 */
async function fetchFrankfurterRate(date, from, to, apiBase) {
	const url = `${apiBase.replace(/\/$/, '')}/${date}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
	const res = await fetch(url, { redirect: 'follow' });
	if (!res.ok) {
		return null;
	}
	/** @type {{ date?: string, rates?: Record<string, number> }} */
	const body = await res.json();
	const rate = body.rates?.[to];
	if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
		return null;
	}
	const rateDate = body.date ? toIsoDate(body.date) : date;
	return { rate, rateDate, url: res.url || url };
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log(`Usage: node scripts/backfill-ad-spend-fx.js [options]
  --tenant-id <uuid>   Verimaya tenant (required)
  --from YYYY-MM-DD    optional lower bound on ad_metrics_daily.date
  --to YYYY-MM-DD      optional upper bound
  --dry-run            (default) report only — never writes
  --apply              UPDATE spend_base / base_currency / fx_rate / fx_dated
  --force              with --apply: overwrite rows that already have spend_base

Env: DATABASE_URL_APP (or DATABASE_URL)
Optional: FRANKFURTER_BASE (default ${DEFAULT_FRANKFURTER})

Rate source is Frankfurter v1/ECB only. Ads sync does not write spend_base.`);
		process.exit(0);
	}

	if (!args.tenantId) {
		console.error('--tenant-id is required');
		process.exit(1);
	}
	if (args.force && !args.apply) {
		console.error('--force requires --apply (dry-run never writes)');
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
					and currency is not null
					and currency <> ${tenantBase}
					${args.force ? tx`` : tx`and spend_base is null`}
					${args.from ? tx`and date >= ${args.from}` : tx``}
					${args.to ? tx`and date <= ${args.to}` : tx``}
				order by date, provider, campaign_id
			`;
		});

		/** @type {Map<string, { rate: number, rateDate: string, url: string } | null>} */
		const rateByDate = new Map();
		/** @type {string[]} */
		const missingRateDates = [];
		/** @type {Set<string>} */
		const missingSeen = new Set();
		/** @type {{ cache_key: string, rate: number, rate_date: string, url: string }[]} */
		const rateAudit = [];

		const uniqueDates = [...new Set(rows.map((r) => toIsoDate(r.date)))].sort();

		for (const date of uniqueDates) {
			const currencies = [
				...new Set(
					rows.filter((r) => toIsoDate(r.date) === date).map((r) => String(r.currency))
				)
			];
			for (const currency of currencies) {
				const cacheKey = `${date}|${currency}|${tenantBase}`;
				if (rateByDate.has(cacheKey)) continue;
				const fetched = await fetchFrankfurterRate(date, currency, tenantBase, apiBase);
				rateByDate.set(cacheKey, fetched);
				if (!fetched) {
					if (!missingSeen.has(cacheKey)) {
						missingSeen.add(cacheKey);
						missingRateDates.push(cacheKey);
					}
				} else {
					rateAudit.push({
						cache_key: cacheKey,
						rate: fetched.rate,
						rate_date: fetched.rateDate,
						url: fetched.url
					});
				}
				await new Promise((r) => setTimeout(r, 50));
			}
		}

		const stats = {
			mode: args.apply ? (args.force ? 'apply+force' : 'apply') : 'dry-run',
			rate_source: apiBase,
			tenant_id: args.tenantId,
			tenant_base: tenantBase,
			candidates: rows.length,
			unique_dates: uniqueDates.length,
			skipped_no_rate: 0,
			skipped_unchanged: 0,
			would_update: 0,
			applied: 0,
			missing_rate_keys: missingRateDates,
			rate_audit_sample: rateAudit.slice(0, 8)
		};

		/** @type {{ id: string, date: string, currency: string, spend_minor: number, spend_base: number, fx_rate: number, fx_dated: string, previous_spend_base: number | null, previous_fx_rate: number | null }[]} */
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
			const prevBase = row.spend_base == null ? null : Number(row.spend_base);
			const prevRate = row.fx_rate == null ? null : Number(row.fx_rate);
			if (
				args.force &&
				prevBase === spendBase &&
				prevRate === fx.rate &&
				String(row.base_currency) === tenantBase &&
				toIsoDate(row.fx_dated) === fx.rateDate
			) {
				stats.skipped_unchanged += 1;
				continue;
			}
			stats.would_update += 1;
			updates.push({
				id: String(row.id),
				date,
				currency,
				spend_minor: spendMinor,
				spend_base: spendBase,
				fx_rate: fx.rate,
				fx_dated: fx.rateDate,
				previous_spend_base: prevBase,
				previous_fx_rate: prevRate
			});
		}

		const plannedSpendBaseSum = updates.reduce((s, u) => s + u.spend_base, 0);

		console.log(
			JSON.stringify(
				{
					...stats,
					planned_spend_base_sum: plannedSpendBaseSum,
					sample: updates.slice(0, 5)
				},
				null,
				2
			)
		);

		if (!args.apply) {
			console.log('Dry-run only (no DB writes). Re-run with --apply to UPDATE.');
			return;
		}

		await app.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${args.tenantId}, true)`;
			for (const u of updates) {
				if (args.force) {
					await tx`
						update ad_metrics_daily
						set
							spend_base = ${u.spend_base},
							base_currency = ${tenantBase},
							fx_rate = ${u.fx_rate},
							fx_dated = ${u.fx_dated}
						where id = ${u.id}
					`;
				} else {
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
				}
				stats.applied += 1;
			}
		});

		console.log(
			JSON.stringify(
				{
					applied: stats.applied,
					would_update: stats.would_update,
					skipped_no_rate: stats.skipped_no_rate,
					skipped_unchanged: stats.skipped_unchanged,
					planned_spend_base_sum: plannedSpendBaseSum,
					rate_source: apiBase,
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

module.exports = { parseArgs, fetchFrankfurterRate, toIsoDate, DEFAULT_FRANKFURTER };
