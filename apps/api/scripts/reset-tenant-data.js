#!/usr/bin/env node
/**
 * Hard-delete one tenant's ETL-imported operational data so `etl.js --apply`
 * can re-import cleanly (OPS / ETL re-seed).
 *
 * WHY: ETL is append-only — rows already mapped in `external_ids` are skipped.
 * There is no --force / update mode. Re-running ETL on a populated tenant
 * silently inserts nothing. This script wipes the importable surface first.
 *
 * IN SCOPE (hard DELETE, FK-safe order, single transaction):
 *   external_ids, case_notes, files, transactions, appointments, patients,
 *   contacts, contact_types, finance_categories
 *
 * DELIBERATELY NOT deleted (login / config / non-ETL):
 *   tenants, tenant_settings, tenant_credentials, tenant_provider_identities,
 *   members / users / sessions / organization, api_keys, webhook_subscriptions,
 *   ad_metrics_daily, inbound_messages, ai_corrections, audit_logs,
 *   idempotency_keys, jobs / integration_events / outbox_events,
 *   appointment_types (table), scorecard_*, karne_*, demo_notes
 *
 * Soft-deleted rows are included — soft deletes would still block ETL via
 * lingering `external_ids` mappings.
 *
 * Default dry-run (never writes). --apply alone is not enough: also require
 * --confirm <tenant-slug> matching `tenants.slug` exactly.
 *
 * Usage:
 *   pnpm --filter @verimaya/api etl:reset -- --tenant-id <uuid>
 *   pnpm --filter @verimaya/api etl:reset -- --apply --confirm <slug> --tenant-id <uuid>
 *
 * Coolify (API container, WORKDIR apps/api):
 *   node scripts/reset-tenant-data.js --tenant-id <uuid>
 *   node scripts/reset-tenant-data.js --apply --confirm <slug> --tenant-id <uuid>
 *
 * Intended sequence after reset:
 *   etl --apply → etl:verify
 *
 * Env:
 *   DATABASE_URL_APP  Verimaya app role (RLS)
 */

const path = require('node:path');
const { config: loadEnv } = require('dotenv');
const postgres = require('postgres');

loadEnv({ path: path.join(__dirname, '..', '.env') });

/**
 * FK-safe delete order: children before parents.
 * - external_ids: no entity FK, but clears the ETL skip map first
 * - case_notes / files → patients (files also → appointments)
 * - transactions / appointments → patients + contacts
 * - patients → contacts
 * - contacts → contact_types (ON DELETE RESTRICT)
 * - contact_types / finance_categories: ETL dictionaries last
 * @type {readonly string[]}
 */
const DELETE_ORDER = Object.freeze([
	'external_ids',
	'case_notes',
	'files',
	'transactions',
	'appointments',
	'patients',
	'contacts',
	'contact_types',
	'finance_categories'
]);

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
	/** @type {{ apply: boolean, help: boolean, tenantId: string | null, confirm: string | null }} */
	const out = { apply: false, help: false, tenantId: null, confirm: null };
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
		else if (arg === '--confirm') {
			const next = argv[++i];
			if (!next) throw new Error('--confirm requires the tenant slug');
			out.confirm = next;
		} else if (arg.startsWith('--confirm=')) out.confirm = arg.slice('--confirm='.length);
	}
	return out;
}

/**
 * @param {import('postgres').Sql} sql
 * @param {string} tenantId
 * @returns {Promise<Record<string, number>>}
 */
async function countPerTable(sql, tenantId) {
	/** @type {Record<string, number>} */
	const counts = {};
	for (const table of DELETE_ORDER) {
		const [row] = await sql.unsafe(
			`select count(*)::int as n from ${table} where tenant_id = $1`,
			[tenantId]
		);
		counts[table] = Number(row?.n ?? 0);
	}
	return counts;
}

/**
 * @param {import('postgres').Sql} sql
 * @param {string} tenantId
 * @returns {Promise<Record<string, number>>}
 */
async function deletePerTable(sql, tenantId) {
	/** @type {Record<string, number>} */
	const deleted = {};
	for (const table of DELETE_ORDER) {
		const result = await sql.unsafe(`delete from ${table} where tenant_id = $1`, [tenantId]);
		deleted[table] = Number(result.count ?? 0);
	}
	return deleted;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log(`Usage: node scripts/reset-tenant-data.js [options]
  --tenant-id <uuid>     Verimaya tenant (required)
  --dry-run              (default) print per-table counts — never writes
  --apply                hard-DELETE operational rows (requires --confirm)
  --confirm <slug>       must equal tenants.slug exactly (required with --apply)

In scope: ${DELETE_ORDER.join(', ')}
Not deleted: tenants, settings, credentials, members/users, api_keys, ads, queues, …

Env: DATABASE_URL_APP (or DATABASE_URL)`);
		process.exit(0);
	}

	if (!args.tenantId) {
		console.error('--tenant-id is required');
		process.exit(1);
	}
	if (args.apply && !args.confirm) {
		console.error('--apply requires --confirm <tenant-slug> (must match tenants.slug)');
		process.exit(1);
	}

	const appUrl = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
	if (!appUrl) {
		console.error('DATABASE_URL_APP (or DATABASE_URL) is required');
		process.exit(1);
	}

	const app = postgres(appUrl, { max: 2 });

	try {
		const [tenant] = await app`
			select id, name, slug from tenants where id = ${args.tenantId} limit 1
		`;
		if (!tenant) {
			console.error(`Tenant not found: ${args.tenantId}`);
			process.exit(1);
		}

		const tenantName = String(tenant.name);
		const tenantSlug = String(tenant.slug);
		console.log(`Tenant: ${tenantName} (slug=${tenantSlug}, id=${args.tenantId})`);

		if (args.apply && args.confirm !== tenantSlug) {
			console.error(
				`--confirm mismatch: got ${JSON.stringify(args.confirm)}, expected slug ${JSON.stringify(tenantSlug)} — aborting, no rows deleted`
			);
			process.exit(1);
		}

		const before = await app.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${args.tenantId}, true)`;
			return countPerTable(tx, args.tenantId);
		});

		const beforeTotal = Object.values(before).reduce((s, n) => s + n, 0);

		console.log(
			JSON.stringify(
				{
					mode: args.apply ? 'apply' : 'dry-run',
					tenant_id: args.tenantId,
					tenant_name: tenantName,
					tenant_slug: tenantSlug,
					delete_order: [...DELETE_ORDER],
					would_delete: before,
					would_delete_total: beforeTotal
				},
				null,
				2
			)
		);

		if (!args.apply) {
			console.log(
				'Dry-run only (no DB writes). Re-run with --apply --confirm <tenant-slug> to DELETE.'
			);
			return;
		}

		const deleted = await app.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${args.tenantId}, true)`;
			return deletePerTable(tx, args.tenantId);
		});

		const after = await app.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${args.tenantId}, true)`;
			return countPerTable(tx, args.tenantId);
		});

		const deletedTotal = Object.values(deleted).reduce((s, n) => s + n, 0);
		const afterTotal = Object.values(after).reduce((s, n) => s + n, 0);

		console.log(
			JSON.stringify(
				{
					mode: 'apply',
					tenant_id: args.tenantId,
					tenant_name: tenantName,
					tenant_slug: tenantSlug,
					deleted,
					deleted_total: deletedTotal,
					remaining: after,
					remaining_total: afterTotal
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

module.exports = { parseArgs, DELETE_ORDER };
