#!/usr/bin/env node
/**
 * Migrate legacy GHL notes markers (`ghl_contact_id=<id>`) into `external_ids`
 * (source=ghl, entity_type=patient). Does NOT delete markers from notes (safe rollback).
 *
 * Default dry-run. Pass --apply to insert missing external_ids rows.
 *
 * Usage:
 *   pnpm --filter @verimaya/api ghl:migrate-markers
 *   pnpm --filter @verimaya/api ghl:migrate-markers -- --apply
 *
 * Requires DATABASE_URL (owner / BYPASSRLS — not verimaya_app).
 */

const path = require('node:path');
const { config: loadEnv } = require('dotenv');
const postgres = require('postgres');

loadEnv({ path: path.join(__dirname, '..', '.env') });

const MARKER_RE = /ghl_contact_id=([A-Za-z0-9._:-]{1,128})/;

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
	/** @type {{ apply: boolean, help: boolean }} */
	const out = { apply: false, help: false };
	for (const arg of argv) {
		if (arg === '--') continue;
		if (arg === '--apply') out.apply = true;
		else if (arg === '--dry-run') out.apply = false;
		else if (arg === '--help' || arg === '-h') out.help = true;
	}
	return out;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log(`Usage: node scripts/migrate-ghl-markers.js [--dry-run|--apply]
  --dry-run  (default) count markers and missing external_ids
  --apply    insert missing external_ids rows (idempotent)`);
		process.exit(0);
	}

	const databaseUrl = process.env.DATABASE_URL?.trim();
	if (!databaseUrl) {
		console.error('DATABASE_URL is required (owner role, not verimaya_app)');
		process.exit(1);
	}

	const sql = postgres(databaseUrl, { max: 1 });
	try {
		const rows = await sql`
			select id, tenant_id, notes
			from patients
			where deleted_at is null
			  and source = 'ghl'
			  and notes ilike '%ghl_contact_id=%'
		`;

		/** @type {{ patientId: string, tenantId: string, externalId: string }[]} */
		const parsed = [];
		for (const row of rows) {
			const notes = typeof row.notes === 'string' ? row.notes : '';
			const match = notes.match(MARKER_RE);
			if (!match) continue;
			parsed.push({
				patientId: row.id,
				tenantId: row.tenant_id,
				externalId: match[1]
			});
		}

		let already = 0;
		let missing = 0;
		/** @type {typeof parsed} */
		const toInsert = [];
		for (const item of parsed) {
			const [hit] = await sql`
				select id from external_ids
				where tenant_id = ${item.tenantId}
				  and source = 'ghl'
				  and entity_type = 'patient'
				  and external_id = ${item.externalId}
				limit 1
			`;
			if (hit) {
				already += 1;
			} else {
				missing += 1;
				toInsert.push(item);
			}
		}

		console.log(
			JSON.stringify(
				{
					mode: args.apply ? 'apply' : 'dry-run',
					patientsWithMarker: rows.length,
					parsedMarkers: parsed.length,
					alreadyMapped: already,
					missingExternalIds: missing
				},
				null,
				2
			)
		);

		if (!args.apply) {
			console.log('Dry-run only. Re-run with --apply to insert.');
			return;
		}

		let inserted = 0;
		for (const item of toInsert) {
			await sql`
				insert into external_ids (tenant_id, source, entity_type, external_id, internal_id)
				values (${item.tenantId}, 'ghl', 'patient', ${item.externalId}, ${item.patientId})
				on conflict (tenant_id, source, entity_type, external_id) do nothing
			`;
			inserted += 1;
		}
		console.log(JSON.stringify({ inserted }, null, 2));
	} finally {
		await sql.end({ timeout: 5 });
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
