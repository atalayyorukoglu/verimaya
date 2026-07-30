#!/usr/bin/env node
/**
 * Fixrav Tracker → Verimaya ETL (Faz 8).
 *
 * Default: dry-run (map + summary, no writes).
 * Apply (Adım 28): dictionaries + contacts + patients only.
 *
 * Usage:
 *   pnpm --filter @verimaya/api etl
 *   pnpm --filter @verimaya/api etl -- --fixture ./fixtures/etl-sample.json
 *   pnpm --filter @verimaya/api etl -- --apply --tenant-id <uuid> --fixture ./fixtures/etl-sample.json
 *   TRACKER_DATABASE_URL=... pnpm --filter @verimaya/api etl -- --apply --tenant-id <uuid> --tracker-tenant-id <uuid>
 *
 * Writes use DATABASE_URL_APP (RLS) with SET LOCAL app.current_tenant_id — no bypass.
 */

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { config: loadEnv } = require('dotenv');
const postgres = require('postgres');

loadEnv({ path: path.join(__dirname, '..', '.env') });

const DEFAULT_FIXTURE = path.join(__dirname, '..', 'fixtures', 'etl-sample.json');
const SOURCE = 'legacy_tracker';
const DEFAULT_BATCH = 1000;
const PATIENT_STATUSES = new Set([
	'lead',
	'contacted',
	'qualified',
	'scheduled',
	'arrived',
	'treated',
	'follow_up',
	'closed_won',
	'closed_lost'
]);
const FALLBACK_CONTACT_TYPE = 'Diğer';

/**
 * @typedef {{ id: string | number, type: string, name: string, phone: string | null, email: string | null, notes: string | null, is_internal?: boolean }} SourceContact
 * @typedef {{ id: string | number, full_name: string, phone: string | null, email: string | null, status: string | null, source: string | null, notes: string | null, contact_id: string | number | null }} SourceCase
 * @typedef {{ kind: string, name: string, subcategories: string[] }} SourceFinanceCategory
 * @typedef {{
 *   source?: string,
 *   contact_types?: string[],
 *   appointment_types?: string[],
 *   finance_categories?: SourceFinanceCategory[],
 *   contacts?: SourceContact[],
 *   cases?: SourceCase[],
 *   appointments?: unknown[],
 *   transactions?: unknown[],
 *   files?: unknown[]
 * }} EtlSource
 */

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
	/** @type {{ fixture: string | null, apply: boolean, help: boolean, tenantId: string | null, trackerTenantId: string | null, batchSize: number }} */
	const out = {
		fixture: null,
		apply: false,
		help: false,
		tenantId: null,
		trackerTenantId: null,
		batchSize: DEFAULT_BATCH
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--') continue;
		if (arg === '--apply') out.apply = true;
		else if (arg === '--help' || arg === '-h') out.help = true;
		else if (arg === '--fixture') {
			const next = argv[++i];
			if (!next) throw new Error('--fixture requires a path');
			out.fixture = path.resolve(next);
		} else if (arg.startsWith('--fixture=')) {
			out.fixture = path.resolve(arg.slice('--fixture='.length));
		} else if (arg === '--tenant-id') {
			const next = argv[++i];
			if (!next) throw new Error('--tenant-id requires a uuid');
			out.tenantId = next;
		} else if (arg.startsWith('--tenant-id=')) {
			out.tenantId = arg.slice('--tenant-id='.length);
		} else if (arg === '--tracker-tenant-id') {
			const next = argv[++i];
			if (!next) throw new Error('--tracker-tenant-id requires a uuid');
			out.trackerTenantId = next;
		} else if (arg.startsWith('--tracker-tenant-id=')) {
			out.trackerTenantId = arg.slice('--tracker-tenant-id='.length);
		} else if (arg === '--batch-size') {
			const next = Number(argv[++i]);
			if (!Number.isFinite(next) || next < 1) throw new Error('--batch-size must be >= 1');
			out.batchSize = Math.floor(next);
		}
	}
	return out;
}

/**
 * @param {number} major
 */
function toMinor(major) {
	return Math.round(Number(major) * 100);
}

/**
 * Deterministic placeholder UUID from legacy id (dry-run display only).
 * @param {string} kind
 * @param {string | number} legacyId
 */
function mapId(kind, legacyId) {
	const hex = Buffer.from(`${kind}:${legacyId}`).toString('hex').padEnd(32, '0').slice(0, 32);
	return [
		hex.slice(0, 8),
		hex.slice(8, 12),
		`4${hex.slice(13, 16)}`,
		`a${hex.slice(17, 20)}`,
		hex.slice(20, 32)
	].join('-');
}

function extId(legacyId) {
	return String(legacyId);
}

/**
 * @param {string | null | undefined} status
 */
function normalizePatientStatus(status) {
	const s = (status ?? '').trim().toLowerCase();
	if (PATIENT_STATUSES.has(s)) return s;
	return 'lead';
}

/**
 * @param {string | null | undefined} email
 */
function normalizeEmail(email) {
	if (!email || !String(email).trim()) return null;
	const v = String(email).trim().toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
	return v;
}

/**
 * @param {EtlSource} fixture
 * @param {string} tenantPlaceholder
 */
function mapFixture(fixture, tenantPlaceholder = '<target-tenant-id>') {
	/** @type {Map<string, string>} */
	const contactIdMap = new Map();
	/** @type {Map<string, string>} */
	const patientIdMap = new Map();

	const contacts = (fixture.contacts ?? []).map((c) => {
		const legacy = extId(c.id);
		const id = mapId('contact', legacy);
		contactIdMap.set(legacy, id);
		return {
			legacy_id: legacy,
			external: { source: SOURCE, external_id: legacy },
			verimaya: {
				id,
				tenant_id: tenantPlaceholder,
				contact_type_name: c.type,
				display_name: c.name,
				phone: c.phone,
				email: normalizeEmail(c.email),
				notes: c.notes,
				is_internal: Boolean(c.is_internal)
			}
		};
	});

	const patients = (fixture.cases ?? []).map((c) => {
		const legacy = extId(c.id);
		const id = mapId('patient', legacy);
		patientIdMap.set(legacy, id);
		const contactLegacy = c.contact_id != null ? extId(c.contact_id) : null;
		return {
			legacy_id: legacy,
			external: { source: SOURCE, external_id: legacy },
			verimaya: {
				id,
				tenant_id: tenantPlaceholder,
				full_name: c.full_name,
				phone: c.phone,
				email: normalizeEmail(c.email),
				status: normalizePatientStatus(c.status),
				source: c.source,
				notes: c.notes,
				contact_id: contactLegacy != null ? (contactIdMap.get(contactLegacy) ?? null) : null,
				assigned_user_id: null
			}
		};
	});

	return {
		contact_types: fixture.contact_types ?? [],
		appointment_types: fixture.appointment_types ?? [],
		finance_categories: fixture.finance_categories ?? [],
		contacts,
		patients,
		contactIdMap,
		patientIdMap
	};
}

/**
 * Load anonymized fixture JSON.
 * @param {string} fixturePath
 * @returns {EtlSource}
 */
function loadFixtureFile(fixturePath) {
	if (!fs.existsSync(fixturePath)) {
		throw new Error(`Fixture not found: ${fixturePath}`);
	}
	return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

/**
 * Pull layer-1 rows from a live Tracker DB (read-only).
 * @param {string} trackerUrl
 * @param {string} trackerTenantId
 * @returns {Promise<EtlSource>}
 */
async function loadFromTracker(trackerUrl, trackerTenantId) {
	const sql = postgres(trackerUrl, { max: 2 });
	try {
		const contactTypes = await sql`
			select name from contact_types
			where tenant_id = ${trackerTenantId}
			order by sort_order, name
		`;
		const appointmentTypes = await sql`
			select name from appointment_types
			where tenant_id = ${trackerTenantId}
			order by sort_order, name
		`;
		const financeRows = await sql`
			select
				fc.kind,
				fc.name,
				coalesce(
					(
						select json_agg(fs.name order by fs.sort_order, fs.name)
						from finance_subcategories fs
						where fs.category_id = fc.id
					),
					'[]'::json
				) as subcategories
			from finance_categories fc
			where fc.tenant_id = ${trackerTenantId}
			order by fc.sort_order, fc.name
		`;
		const contacts = await sql`
			select
				c.id,
				ct.name as type,
				trim(both from concat_ws(' ', c.first_name, c.last_name)) as name,
				c.phone,
				c.email,
				c.notes,
				c.is_internal
			from contacts c
			join contact_types ct on ct.id = c.contact_type_id
			where c.tenant_id = ${trackerTenantId}
			order by c.created_at
		`;
		const cases = await sql`
			select
				id,
				full_name,
				phone,
				notes,
				contact_id,
				extra
			from cases
			where tenant_id = ${trackerTenantId}
			order by created_at
		`;

		return {
			source: 'tracker-db',
			contact_types: contactTypes.map((r) => String(r.name)),
			appointment_types: appointmentTypes.map((r) => String(r.name)),
			finance_categories: financeRows.map((r) => ({
				kind: String(r.kind),
				name: String(r.name),
				subcategories: Array.isArray(r.subcategories)
					? r.subcategories.map(String)
					: []
			})),
			contacts: contacts.map((r) => ({
				id: String(r.id),
				type: String(r.type),
				name: String(r.name || 'Adsız'),
				phone: r.phone != null ? String(r.phone) : null,
				email: r.email != null ? String(r.email) : null,
				notes: r.notes != null ? String(r.notes) : null,
				is_internal: Boolean(r.is_internal)
			})),
			cases: cases.map((r) => {
				const extra =
					r.extra && typeof r.extra === 'object' && !Array.isArray(r.extra)
						? /** @type {Record<string, unknown>} */ (r.extra)
						: {};
				return {
					id: String(r.id),
					full_name: String(r.full_name),
					phone: r.phone != null ? String(r.phone) : null,
					email: extra.email != null ? String(extra.email) : null,
					status: extra.status != null ? String(extra.status) : null,
					source: extra.source != null ? String(extra.source) : null,
					notes: r.notes != null ? String(r.notes) : null,
					contact_id: r.contact_id != null ? String(r.contact_id) : null
				};
			})
		};
	} finally {
		await sql.end({ timeout: 5 });
	}
}

/**
 * @param {import('postgres').Sql} sql
 * @param {string} tenantId
 * @param {() => Promise<T>} fn
 * @template T
 */
async function withTenant(sql, tenantId, fn) {
	return sql.begin(async (tx) => {
		await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
		return fn(tx);
	});
}

/**
 * @param {import('postgres').Sql} tx
 * @param {string} tenantId
 * @param {string} entityType
 * @param {string} externalId
 */
async function findMappedInternal(tx, tenantId, entityType, externalId) {
	const [row] = await tx`
		select internal_id
		from external_ids
		where tenant_id = ${tenantId}
			and source = ${SOURCE}
			and entity_type = ${entityType}
			and external_id = ${externalId}
		limit 1
	`;
	return row?.internal_id ? String(row.internal_id) : null;
}

/**
 * @param {import('postgres').Sql} tx
 * @param {string} tenantId
 * @param {string} entityType
 * @param {string} externalId
 * @param {string} internalId
 */
async function insertExternal(tx, tenantId, entityType, externalId, internalId) {
	await tx`
		insert into external_ids (tenant_id, source, entity_type, external_id, internal_id)
		values (${tenantId}, ${SOURCE}, ${entityType}, ${externalId}, ${internalId})
		on conflict (tenant_id, source, entity_type, external_id) do nothing
	`;
}

/**
 * @param {import('postgres').Sql} sql
 * @param {string} tenantId
 * @param {ReturnType<typeof mapFixture>} mapped
 * @param {number} batchSize
 */
async function applyLayer1(sql, tenantId, mapped, batchSize) {
	const stats = {
		contact_types: { inserted: 0, skipped: 0 },
		finance_categories: { inserted: 0, skipped: 0 },
		appointment_types: { inserted: 0, skipped: 0 },
		contacts: { inserted: 0, skipped: 0 },
		patients: { inserted: 0, skipped: 0 },
		errors: /** @type {string[]} */ ([])
	};

	/** @type {Map<string, string>} nameLower → uuid */
	const typeByName = new Map();
	/** @type {Map<string, string>} legacy contact → verimaya uuid */
	const contactMap = new Map();

	await withTenant(sql, tenantId, async (tx) => {
		const existingTypes = await tx`
			select id, name from contact_types where tenant_id = ${tenantId}
		`;
		for (const row of existingTypes) {
			typeByName.set(String(row.name).toLowerCase(), String(row.id));
		}

		const typeNames =
			mapped.contact_types.length > 0
				? mapped.contact_types
				: [...new Set(mapped.contacts.map((c) => c.verimaya.contact_type_name).filter(Boolean))];

		let sortOrder = existingTypes.length;
		for (const name of typeNames) {
			const key = String(name).trim();
			if (!key) continue;
			const lower = key.toLowerCase();
			if (typeByName.has(lower)) {
				stats.contact_types.skipped++;
				continue;
			}
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantId}, ${key}, ${sortOrder})
				returning id
			`;
			typeByName.set(lower, String(row.id));
			sortOrder++;
			stats.contact_types.inserted++;
		}

		if (!typeByName.has(FALLBACK_CONTACT_TYPE.toLowerCase())) {
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantId}, ${FALLBACK_CONTACT_TYPE}, ${sortOrder})
				returning id
			`;
			typeByName.set(FALLBACK_CONTACT_TYPE.toLowerCase(), String(row.id));
			stats.contact_types.inserted++;
		}

		for (const cat of mapped.finance_categories) {
			const kind = String(cat.kind);
			const name = String(cat.name);
			const subs = Array.isArray(cat.subcategories) ? cat.subcategories.map(String) : [];
			const inserted = await tx.unsafe(
				`insert into finance_categories (tenant_id, kind, name, sort_order, subcategories)
				 values ($1, $2, $3, 0, $4::jsonb)
				 on conflict (tenant_id, kind, name) do nothing
				 returning id`,
				[tenantId, kind, name, JSON.stringify(subs)]
			);
			if (inserted.length > 0) stats.finance_categories.inserted++;
			else stats.finance_categories.skipped++;
		}

		if (mapped.appointment_types.length > 0) {
			const [existing] = await tx`
				select value from tenant_settings
				where tenant_id = ${tenantId} and key = 'etl.appointment_types'
				limit 1
			`;
			if (existing) {
				stats.appointment_types.skipped++;
			} else {
				await tx.unsafe(
					`insert into tenant_settings (tenant_id, key, value)
					 values ($1, 'etl.appointment_types', $2::jsonb)`,
					[tenantId, JSON.stringify(mapped.appointment_types)]
				);
				stats.appointment_types.inserted++;
			}
		}
	});

	console.log(
		`[etl] dictionaries done types +${stats.contact_types.inserted}/~${stats.contact_types.skipped} finance +${stats.finance_categories.inserted}/~${stats.finance_categories.skipped}`
	);

	for (let i = 0; i < mapped.contacts.length; i += batchSize) {
		const batch = mapped.contacts.slice(i, i + batchSize);
		await withTenant(sql, tenantId, async (tx) => {
			for (const item of batch) {
				const legacy = item.legacy_id;
				const existing = await findMappedInternal(tx, tenantId, 'contact', legacy);
				if (existing) {
					contactMap.set(legacy, existing);
					stats.contacts.skipped++;
					continue;
				}

				const typeName = String(item.verimaya.contact_type_name || FALLBACK_CONTACT_TYPE);
				const resolvedTypeName = typeByName.has(typeName.toLowerCase())
					? typeName
					: FALLBACK_CONTACT_TYPE;
				const typeId = typeByName.get(resolvedTypeName.toLowerCase());
				if (resolvedTypeName !== typeName) {
					stats.errors.push(`contact ${legacy}: unknown type ${typeName} → ${FALLBACK_CONTACT_TYPE}`);
				}
				if (!typeId) {
					stats.errors.push(`contact ${legacy}: no fallback type`);
					continue;
				}

				const displayName = String(item.verimaya.display_name || '').trim() || 'Adsız';
				const internalId = randomUUID();
				await tx`
					insert into contacts (
						id, tenant_id, contact_type_id, contact_type_name,
						display_name, phone, email, notes, is_internal, usage_count
					) values (
						${internalId},
						${tenantId},
						${typeId},
						${resolvedTypeName},
						${displayName},
						${item.verimaya.phone},
						${item.verimaya.email},
						${item.verimaya.notes},
						${Boolean(item.verimaya.is_internal)},
						0
					)
				`;
				await insertExternal(tx, tenantId, 'contact', legacy, internalId);
				contactMap.set(legacy, internalId);
				stats.contacts.inserted++;
			}
		});
		console.log(
			`[etl] contacts batch ${Math.min(i + batch.length, mapped.contacts.length)}/${mapped.contacts.length} (+${stats.contacts.inserted} / ~${stats.contacts.skipped})`
		);
	}

	for (let i = 0; i < mapped.patients.length; i += batchSize) {
		const batch = mapped.patients.slice(i, i + batchSize);
		await withTenant(sql, tenantId, async (tx) => {
			for (const item of batch) {
				const legacy = item.legacy_id;
				const existing = await findMappedInternal(tx, tenantId, 'patient', legacy);
				if (existing) {
					stats.patients.skipped++;
					continue;
				}

				const fullName = String(item.verimaya.full_name || '').trim();
				if (!fullName) {
					stats.errors.push(`patient ${legacy}: empty full_name — skipped`);
					continue;
				}

				const contactLegacy =
					/** @type {{ _contact_legacy?: string | null }} */ (item)._contact_legacy ?? null;
				const contactId =
					contactLegacy != null ? (contactMap.get(contactLegacy) ?? null) : null;
				if (contactLegacy != null && contactId == null) {
					stats.errors.push(
						`patient ${legacy}: contact ${contactLegacy} not mapped — contact_id null`
					);
				}

				const internalId = randomUUID();
				await tx`
					insert into patients (
						id, tenant_id, full_name, phone, email, status, source, notes, contact_id
					) values (
						${internalId},
						${tenantId},
						${fullName},
						${item.verimaya.phone},
						${item.verimaya.email},
						${item.verimaya.status},
						${item.verimaya.source},
						${item.verimaya.notes},
						${contactId}
					)
				`;
				await insertExternal(tx, tenantId, 'patient', legacy, internalId);
				stats.patients.inserted++;
			}
		});
		console.log(
			`[etl] patients batch ${Math.min(i + batch.length, mapped.patients.length)}/${mapped.patients.length} (+${stats.patients.inserted} / ~${stats.patients.skipped})`
		);
	}

	return stats;
}

/**
 * Enrich mapped patients with legacy contact id for apply FK resolution.
 * @param {ReturnType<typeof mapFixture>} mapped
 * @param {EtlSource} source
 */
function attachContactLegacy(mapped, source) {
	const byLegacy = new Map((source.cases ?? []).map((c) => [extId(c.id), c]));
	for (const p of mapped.patients) {
		const src = byLegacy.get(p.legacy_id);
		/** @type {{ _contact_legacy?: string | null }} */ (p)._contact_legacy =
			src?.contact_id != null ? extId(src.contact_id) : null;
	}
	return mapped;
}

function printHelp() {
	console.log(`Usage: pnpm --filter @verimaya/api etl -- [options]

Options:
  --fixture <path>           Tracker-shaped JSON (default: fixtures/etl-sample.json)
  --apply                    Write dictionaries + contacts + patients (Adım 28)
  --tenant-id <uuid>         Required with --apply (Verimaya tenant)
  --tracker-tenant-id <uuid> With TRACKER_DATABASE_URL: pull live Tracker rows
  --batch-size <n>           Default ${DEFAULT_BATCH}
  --help

Env:
  DATABASE_URL_APP           Verimaya app role (RLS) — required for --apply
  TRACKER_DATABASE_URL       Optional live Tracker Postgres (read-only)
`);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		printHelp();
		process.exit(0);
	}

	/** @type {EtlSource} */
	let source;
	let sourceLabel;

	if (process.env.TRACKER_DATABASE_URL && args.trackerTenantId) {
		source = await loadFromTracker(process.env.TRACKER_DATABASE_URL, args.trackerTenantId);
		sourceLabel = `tracker:${args.trackerTenantId}`;
	} else {
		const fixturePath = args.fixture ?? DEFAULT_FIXTURE;
		source = loadFixtureFile(fixturePath);
		sourceLabel = fixturePath;
	}

	const mapped = attachContactLegacy(mapFixture(source, args.tenantId ?? '<target-tenant-id>'), source);

	const summary = {
		mode: args.apply ? 'apply' : 'dry-run',
		source: sourceLabel,
		origin: source.source ?? null,
		counts: {
			contact_types: mapped.contact_types.length,
			finance_categories: mapped.finance_categories.length,
			appointment_types: mapped.appointment_types.length,
			contacts: mapped.contacts.length,
			patients: mapped.patients.length
		},
		tenant_id: args.tenantId ?? '<target-tenant-id>',
		layer: 'Adım 28: dictionaries + contacts + patients'
	};

	console.log('=== ETL summary ===');
	console.log(JSON.stringify(summary, null, 2));
	console.log('\n=== Sample (first contact / patient) ===');
	console.log(
		JSON.stringify(
			{
				contact: mapped.contacts[0] ?? null,
				patient: mapped.patients[0] ?? null
			},
			null,
			2
		)
	);

	if (!args.apply) {
		console.log('\nDry-run OK (no database writes). Pass --apply --tenant-id <uuid> to write.');
		return;
	}

	if (!args.tenantId) {
		console.error('--apply requires --tenant-id <uuid>');
		process.exit(1);
	}

	const databaseUrl = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error('Missing DATABASE_URL_APP or DATABASE_URL');
		process.exit(1);
	}

	const sql = postgres(databaseUrl, { max: 5 });
	try {
		const [tenant] = await sql`select id from tenants where id = ${args.tenantId} limit 1`;
		if (!tenant) {
			console.error(`Tenant not found: ${args.tenantId}`);
			process.exit(1);
		}

		const stats = await applyLayer1(sql, args.tenantId, mapped, args.batchSize);
		console.log('\n=== Apply result ===');
		console.log(JSON.stringify(stats, null, 2));

		if (stats.errors.length > 0) {
			console.error(`\nCompleted with ${stats.errors.length} warnings/errors (see stats.errors).`);
		}
	} finally {
		await sql.end({ timeout: 5 });
	}
}

module.exports = {
	parseArgs,
	mapFixture,
	loadFixtureFile,
	loadFromTracker,
	applyLayer1,
	attachContactLegacy,
	toMinor,
	SOURCE,
	DEFAULT_FIXTURE
};

if (require.main === module) {
	main().catch((err) => {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	});
}
