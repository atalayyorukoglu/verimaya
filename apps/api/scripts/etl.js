#!/usr/bin/env node
/**
 * Fixrav Tracker → Verimaya ETL (Faz 8).
 *
 * Default: dry-run (map + summary, no writes).
 * --apply: Adım 28 (dictionaries + contacts + patients) + Adım 29
 *   (appointments + transactions + files meta + case_notes).
 *
 * Usage:
 *   pnpm --filter @verimaya/api etl
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
const FALLBACK_CONTACT_TYPE = 'Diğer';
const SUPPORTED_CURRENCIES = new Set(['TRY', 'GBP', 'EUR', 'USD']);
const PATIENT_STATUSES = new Set(['scheduled', 'arrived', 'treated', 'follow_up', 'cancelled']);
const LEGACY_PATIENT_STATUS_MAP = {
	lead: 'scheduled',
	contacted: 'scheduled',
	qualified: 'scheduled',
	scheduled: 'scheduled',
	arrived: 'arrived',
	treated: 'treated',
	follow_up: 'follow_up',
	closed_won: 'treated',
	closed_lost: 'cancelled'
};
const APPOINTMENT_STATUS_MAP = {
	'randevu ayarlanıyor': 'scheduled',
	planlandı: 'confirmed',
	tamamlandı: 'completed',
	iptal: 'cancelled',
	gelmedi: 'no_show',
	scheduled: 'scheduled',
	confirmed: 'confirmed',
	in_progress: 'in_progress',
	completed: 'completed',
	cancelled: 'cancelled',
	no_show: 'no_show'
};

/**
 * @typedef {{ id: string | number, type: string, name: string, phone: string | null, email: string | null, notes: string | null, is_internal?: boolean }} SourceContact
 * @typedef {{ id: string | number, full_name: string, phone: string | null, email: string | null, status: string | null, source: string | null, notes: string | null, contact_id: string | number | null }} SourceCase
 * @typedef {{ kind: string, name: string, subcategories: string[] }} SourceFinanceCategory
 * @typedef {{ id: string | number, case_id: string | number | null, contact_id?: string | number | null, title?: string | null, type?: string | null, status?: string | null, starts_at: string, ends_at?: string | null, clinic_name?: string | null, hotel_name?: string | null, transfer_note?: string | null, notes?: string | null, clinic_contact_id?: string | number | null, hotel_contact_id?: string | number | null, transfer_contact_id?: string | number | null }} SourceAppointment
 * @typedef {{ id: string | number, case_id?: string | number | null, kind: string, title: string, subtitle?: string | null, category?: string | null, occurred_on: string, status: string, invoice_status?: string, payment_method?: string | null, amount_major?: number, amount?: number, currency: string, paid_amount_major?: number | null, paid_amount?: number | null, contact_id?: string | number | null, contact_label?: string | null, description?: string | null, counterparty_amount?: number | null, equivalent_currency?: string | null }} SourceTransaction
 * @typedef {{ id: string | number, case_id: string | number | null, appointment_id?: string | number | null, filename: string, mime_type?: string | null, size_bytes?: number | null }} SourceFile
 * @typedef {{ id: string | number, case_id: string | number, body: string, author_display_name?: string | null }} SourceCaseNote
 * @typedef {{
 *   source?: string,
 *   contact_types?: string[],
 *   appointment_types?: string[],
 *   finance_categories?: SourceFinanceCategory[],
 *   contacts?: SourceContact[],
 *   cases?: SourceCase[],
 *   appointments?: SourceAppointment[],
 *   transactions?: SourceTransaction[],
 *   files?: SourceFile[],
 *   case_notes?: SourceCaseNote[]
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
 * Tracker major-unit amounts → Verimaya minor-unit integers.
 * @param {number} major
 */
function toMinor(major) {
	return Math.round(Number(major) * 100);
}

/**
 * Immutable FX snapshot from Tracker counterparty_* (never live rates).
 * Native-currency rows leave all four fields null — resolver uses amount.
 *
 * @param {{
 *   currency: string,
 *   amountMajor: number,
 *   occurredOn: string,
 *   counterpartyMajor: number | null | undefined,
 *   equivalentCurrency: string | null | undefined,
 *   tenantBase: string
 * }} input
 * @returns {{ amount_base: number | null, base_currency: string | null, fx_rate: number | null, fx_dated: string | null }}
 */
function resolveFxSnapshot(input) {
	const currency = String(input.currency ?? 'TRY').trim().toUpperCase();
	const tenantBase = String(input.tenantBase ?? 'TRY').trim().toUpperCase();
	if (currency === tenantBase) {
		return { amount_base: null, base_currency: null, fx_rate: null, fx_dated: null };
	}
	const eq = String(input.equivalentCurrency ?? '')
		.trim()
		.toUpperCase();
	const cp = input.counterpartyMajor;
	if (
		eq === tenantBase &&
		cp != null &&
		Number.isFinite(Number(cp)) &&
		Number(cp) > 0 &&
		Number.isFinite(input.amountMajor) &&
		input.amountMajor > 0
	) {
		const cpNum = Number(cp);
		return {
			amount_base: toMinor(cpNum),
			base_currency: tenantBase,
			fx_rate: cpNum / input.amountMajor,
			fx_dated: input.occurredOn
		};
	}
	return { amount_base: null, base_currency: null, fx_rate: null, fx_dated: null };
}

/**
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
	if (s in LEGACY_PATIENT_STATUS_MAP) return LEGACY_PATIENT_STATUS_MAP[s];
	return 'scheduled';
}

/**
 * @param {string | null | undefined} status
 */
function normalizeAppointmentStatus(status) {
	const key = (status ?? '').trim().toLowerCase();
	return APPOINTMENT_STATUS_MAP[key] ?? 'scheduled';
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
 * @param {string | null | undefined} currency
 * @returns {{ currency: string, coerced: boolean }}
 */
function normalizeCurrency(currency) {
	const c = String(currency ?? 'TRY').trim().toUpperCase();
	if (SUPPORTED_CURRENCIES.has(c)) return { currency: c, coerced: false };
	return { currency: 'TRY', coerced: true };
}

/**
 * @param {SourceTransaction} t
 */
function transactionMajorAmount(t) {
	if (t.amount_major != null) return Number(t.amount_major);
	if (t.amount != null) return Number(t.amount);
	return NaN;
}

/**
 * @param {SourceTransaction} t
 */
function transactionPaidMajor(t) {
	if (t.paid_amount_major != null) return Number(t.paid_amount_major);
	if (t.paid_amount != null) return Number(t.paid_amount);
	return null;
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
	/** @type {Map<string, string>} */
	const appointmentIdMap = new Map();

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
			_contact_legacy: contactLegacy,
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

	/** Tracker often leaves appointments.case_id null and links via contact_id → cases.contact_id. */
	const contactToCaseLegacy = new Map();
	for (const p of patients) {
		if (p._contact_legacy && !contactToCaseLegacy.has(p._contact_legacy)) {
			contactToCaseLegacy.set(p._contact_legacy, p.legacy_id);
		}
	}

	const appointments = (fixture.appointments ?? []).map((a) => {
		const legacy = extId(a.id);
		const id = mapId('appointment', legacy);
		appointmentIdMap.set(legacy, id);
		const contactLegacy = a.contact_id != null ? extId(a.contact_id) : null;
		let caseLegacy = a.case_id != null ? extId(a.case_id) : null;
		if (!caseLegacy && contactLegacy) {
			caseLegacy = contactToCaseLegacy.get(contactLegacy) ?? null;
		}
		const patientPlaceholder = caseLegacy != null ? (patientIdMap.get(caseLegacy) ?? null) : null;
		const patient = patients.find((p) => p.legacy_id === caseLegacy);
		return {
			legacy_id: legacy,
			_case_legacy: caseLegacy,
			_contact_legacy: contactLegacy,
			_clinic_contact_legacy: a.clinic_contact_id != null ? extId(a.clinic_contact_id) : null,
			_hotel_contact_legacy: a.hotel_contact_id != null ? extId(a.hotel_contact_id) : null,
			_transfer_contact_legacy:
				a.transfer_contact_id != null ? extId(a.transfer_contact_id) : null,
			external: { source: SOURCE, external_id: legacy },
			verimaya: {
				id,
				tenant_id: tenantPlaceholder,
				patient_id: patientPlaceholder,
				patient_display_name: patient?.verimaya.full_name ?? 'Unknown',
				title: a.title ?? a.type ?? 'Randevu',
				appointment_type: a.type ?? null,
				status: normalizeAppointmentStatus(a.status),
				starts_at: a.starts_at,
				ends_at: a.ends_at ?? null,
				clinic_name: a.clinic_name ?? null,
				hotel_name: a.hotel_name ?? null,
				transfer_note: a.transfer_note ?? null,
				notes: a.notes ?? null
			}
		};
	});

	const appointmentToCaseLegacy = new Map();
	for (const item of appointments) {
		if (item._case_legacy) appointmentToCaseLegacy.set(item.legacy_id, item._case_legacy);
	}

	const transactions = (fixture.transactions ?? []).map((t) => {
		const legacy = extId(t.id);
		const caseLegacy = t.case_id != null ? extId(t.case_id) : null;
		const contactLegacy = t.contact_id != null ? extId(t.contact_id) : null;
		const major = transactionMajorAmount(t);
		const paidMajor = transactionPaidMajor(t);
		const { currency, coerced } = normalizeCurrency(t.currency);
		const patient = patients.find((p) => p.legacy_id === caseLegacy);
		const counterpartyMajor =
			t.counterparty_amount != null && Number.isFinite(Number(t.counterparty_amount))
				? Number(t.counterparty_amount)
				: null;
		const equivalentCurrency =
			t.equivalent_currency != null ? String(t.equivalent_currency).trim().toUpperCase() : null;
		return {
			legacy_id: legacy,
			_case_legacy: caseLegacy,
			_contact_legacy: contactLegacy,
			_currency_coerced: coerced,
			_amount_major: Number.isFinite(major) ? major : null,
			_counterparty_major: counterpartyMajor,
			_equivalent_currency: equivalentCurrency,
			external: { source: SOURCE, external_id: legacy },
			verimaya: {
				id: mapId('transaction', legacy),
				tenant_id: tenantPlaceholder,
				kind: t.kind,
				title: (t.title && String(t.title).trim()) || 'İşlem',
				subtitle: t.subtitle ?? null,
				category: t.category ?? null,
				occurred_on: t.occurred_on,
				status: t.status,
				invoice_status: t.invoice_status ?? 'none',
				payment_method: t.payment_method ?? null,
				amount: Number.isFinite(major) ? toMinor(major) : null,
				paid_amount: paidMajor == null || !Number.isFinite(paidMajor) ? null : toMinor(paidMajor),
				currency,
				patient_id: caseLegacy != null ? (patientIdMap.get(caseLegacy) ?? null) : null,
				patient_display_name: patient?.verimaya.full_name ?? null,
				contact_id: contactLegacy != null ? (contactIdMap.get(contactLegacy) ?? null) : null,
				contact_label: t.contact_label ?? null,
				description: t.description ?? null
			}
		};
	});

	const files = (fixture.files ?? []).map((f) => {
		const legacy = extId(f.id);
		const apptLegacy = f.appointment_id != null ? extId(f.appointment_id) : null;
		let caseLegacy = f.case_id != null ? extId(f.case_id) : null;
		if (!caseLegacy && apptLegacy) {
			caseLegacy = appointmentToCaseLegacy.get(apptLegacy) ?? null;
		}
		return {
			legacy_id: legacy,
			_case_legacy: caseLegacy,
			_appointment_legacy: apptLegacy,
			external: { source: SOURCE, external_id: legacy },
			verimaya: {
				id: mapId('file', legacy),
				tenant_id: tenantPlaceholder,
				patient_id: caseLegacy != null ? (patientIdMap.get(caseLegacy) ?? null) : null,
				appointment_id:
					apptLegacy != null ? (appointmentIdMap.get(apptLegacy) ?? null) : null,
				filename: f.filename,
				mime_type: f.mime_type || 'application/octet-stream',
				size_bytes: f.size_bytes != null ? Number(f.size_bytes) : 0,
				status: 'pending',
				storage_key: 'local://pending'
			}
		};
	});

	const caseNotes = (fixture.case_notes ?? []).map((n) => {
		const legacy = extId(n.id);
		const caseLegacy = extId(n.case_id);
		return {
			legacy_id: legacy,
			_case_legacy: caseLegacy,
			external: { source: SOURCE, external_id: legacy },
			verimaya: {
				id: mapId('case_note', legacy),
				tenant_id: tenantPlaceholder,
				patient_id: patientIdMap.get(caseLegacy) ?? null,
				body: n.body,
				author_display_name: n.author_display_name?.trim() || 'ETL import'
			}
		};
	});

	return {
		contact_types: fixture.contact_types ?? [],
		appointment_types: fixture.appointment_types ?? [],
		finance_categories: fixture.finance_categories ?? [],
		contacts,
		patients,
		appointments,
		transactions,
		files,
		case_notes: caseNotes,
		contactIdMap,
		patientIdMap,
		appointmentIdMap
	};
}

/**
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
			select id, full_name, phone, notes, contact_id, extra
			from cases
			where tenant_id = ${trackerTenantId}
			order by created_at
		`;
		const appointments = await sql`
			select
				a.id,
				a.case_id,
				a.contact_id,
				a.starts_at,
				a.ends_at,
				a.notes,
				a.clinic_note,
				a.hotel_note,
				a.transfer_note,
				a.clinic_contact_id,
				a.hotel_contact_id,
				a.transfer_contact_id,
				at.name as type_name,
				ast.name as status_name,
				cc.first_name as clinic_first,
				cc.last_name as clinic_last,
				hc.first_name as hotel_first,
				hc.last_name as hotel_last
			from appointments a
			left join appointment_types at on at.id = a.appointment_type_id
			left join appointment_statuses ast on ast.id = a.appointment_status_id
			left join contacts cc on cc.id = a.clinic_contact_id
			left join contacts hc on hc.id = a.hotel_contact_id
			where a.tenant_id = ${trackerTenantId}
			order by a.starts_at
		`;
		const transactions = await sql`
			select
				id, case_id, kind, title, subtitle, category, occurred_on, status,
				invoice_status, payment_method, amount, paid_amount, currency,
				counterparty_amount, equivalent_currency,
				contact_id, contact_label, description
			from transactions
			where tenant_id = ${trackerTenantId}
			order by occurred_on, created_at
		`;
		const files = await sql`
			select id, case_id, appointment_id, filename, mime_type
			from case_files
			where tenant_id = ${trackerTenantId}
			order by uploaded_at
		`;

		/** @type {SourceCaseNote[]} */
		const caseNotes = [];
		for (const c of cases) {
			if (c.notes && String(c.notes).trim()) {
				caseNotes.push({
					id: `case-notes:${c.id}`,
					case_id: String(c.id),
					body: String(c.notes),
					author_display_name: 'Legacy case notes'
				});
			}
		}

		return {
			source: 'tracker-db',
			contact_types: contactTypes.map((r) => String(r.name)),
			appointment_types: appointmentTypes.map((r) => String(r.name)),
			finance_categories: financeRows.map((r) => ({
				kind: String(r.kind),
				name: String(r.name),
				subcategories: Array.isArray(r.subcategories) ? r.subcategories.map(String) : []
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
			}),
			appointments: appointments.map((a) => ({
				id: String(a.id),
				case_id: a.case_id != null ? String(a.case_id) : null,
				contact_id: a.contact_id != null ? String(a.contact_id) : null,
				title: a.type_name != null ? String(a.type_name) : 'Randevu',
				type: a.type_name != null ? String(a.type_name) : null,
				status: a.status_name != null ? String(a.status_name) : null,
				starts_at: new Date(a.starts_at).toISOString(),
				ends_at: a.ends_at ? new Date(a.ends_at).toISOString() : null,
				clinic_name:
					a.clinic_first || a.clinic_last
						? `${a.clinic_first ?? ''} ${a.clinic_last ?? ''}`.trim()
						: null,
				hotel_name:
					a.hotel_first || a.hotel_last
						? `${a.hotel_first ?? ''} ${a.hotel_last ?? ''}`.trim()
						: null,
				transfer_note: a.transfer_note != null ? String(a.transfer_note) : null,
				notes: [a.notes, a.clinic_note, a.hotel_note].filter(Boolean).join('\n') || null,
				clinic_contact_id: a.clinic_contact_id != null ? String(a.clinic_contact_id) : null,
				hotel_contact_id: a.hotel_contact_id != null ? String(a.hotel_contact_id) : null,
				transfer_contact_id:
					a.transfer_contact_id != null ? String(a.transfer_contact_id) : null
			})),
			transactions: transactions.map((t) => ({
				id: String(t.id),
				case_id: t.case_id != null ? String(t.case_id) : null,
				kind: String(t.kind),
				title: String(t.title),
				subtitle: t.subtitle != null ? String(t.subtitle) : null,
				category: t.category != null ? String(t.category) : null,
				occurred_on: String(t.occurred_on),
				status: String(t.status),
				invoice_status: t.invoice_status != null ? String(t.invoice_status) : 'none',
				payment_method: t.payment_method != null ? String(t.payment_method) : null,
				amount: Number(t.amount),
				paid_amount: t.paid_amount != null ? Number(t.paid_amount) : null,
				currency: String(t.currency ?? 'TRY'),
				counterparty_amount:
					t.counterparty_amount != null ? Number(t.counterparty_amount) : null,
				equivalent_currency:
					t.equivalent_currency != null ? String(t.equivalent_currency) : null,
				contact_id: t.contact_id != null ? String(t.contact_id) : null,
				contact_label: t.contact_label != null ? String(t.contact_label) : null,
				description: t.description != null ? String(t.description) : null
			})),
			files: files.map((f) => ({
				id: String(f.id),
				case_id: f.case_id != null ? String(f.case_id) : null,
				appointment_id: f.appointment_id != null ? String(f.appointment_id) : null,
				filename: String(f.filename),
				mime_type: f.mime_type != null ? String(f.mime_type) : 'application/octet-stream',
				size_bytes: 0
			})),
			case_notes: caseNotes
		};
	} finally {
		await sql.end({ timeout: 5 });
	}
}

/**
 * @param {import('postgres').Sql} sql
 * @param {string} tenantId
 * @param {(tx: import('postgres').Sql) => Promise<T>} fn
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
 */
async function loadExternalMaps(sql, tenantId) {
	/** @type {Map<string, string>} */
	const contactMap = new Map();
	/** @type {Map<string, string>} */
	const patientMap = new Map();
	/** @type {Map<string, string>} */
	const appointmentMap = new Map();
	/** @type {Map<string, string>} */
	const patientNames = new Map();

	await withTenant(sql, tenantId, async (tx) => {
		const rows = await tx`
			select entity_type, external_id, internal_id
			from external_ids
			where tenant_id = ${tenantId} and source = ${SOURCE}
		`;
		for (const row of rows) {
			const ext = String(row.external_id);
			const internal = String(row.internal_id);
			if (row.entity_type === 'contact') contactMap.set(ext, internal);
			else if (row.entity_type === 'patient') patientMap.set(ext, internal);
			else if (row.entity_type === 'appointment') appointmentMap.set(ext, internal);
		}
		const patients = await tx`select id, full_name from patients where tenant_id = ${tenantId}`;
		for (const p of patients) {
			patientNames.set(String(p.id), String(p.full_name));
		}
	});

	return { contactMap, patientMap, appointmentMap, patientNames };
}

/**
 * @param {ReturnType<typeof mapFixture>} mapped
 * @param {EtlSource} source
 */
function attachContactLegacy(mapped, source) {
	const byLegacy = new Map((source.cases ?? []).map((c) => [extId(c.id), c]));
	for (const p of mapped.patients) {
		const src = byLegacy.get(p.legacy_id);
		p._contact_legacy = src?.contact_id != null ? extId(src.contact_id) : null;
	}
	return mapped;
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

	/** @type {Map<string, string>} */
	const typeByName = new Map();
	/** @type {Map<string, string>} */
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
			if (existing) stats.appointment_types.skipped++;
			else {
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
						${internalId}, ${tenantId}, ${typeId}, ${resolvedTypeName},
						${displayName}, ${item.verimaya.phone}, ${item.verimaya.email},
						${item.verimaya.notes}, ${Boolean(item.verimaya.is_internal)}, 0
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

				const contactLegacy = item._contact_legacy ?? null;
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
						${internalId}, ${tenantId}, ${fullName}, ${item.verimaya.phone},
						${item.verimaya.email}, ${item.verimaya.status}, ${item.verimaya.source},
						${item.verimaya.notes}, ${contactId}
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
 * Adım 29 — appointments, transactions, files, case_notes.
 * @param {import('postgres').Sql} sql
 * @param {string} tenantId
 * @param {ReturnType<typeof mapFixture>} mapped
 * @param {number} batchSize
 */
async function applyLayer2(sql, tenantId, mapped, batchSize) {
	const stats = {
		appointments: { inserted: 0, skipped: 0 },
		transactions: { inserted: 0, skipped: 0 },
		files: { inserted: 0, skipped: 0 },
		case_notes: { inserted: 0, skipped: 0 },
		errors: /** @type {string[]} */ ([])
	};

	const { contactMap, patientMap, appointmentMap, patientNames } = await loadExternalMaps(
		sql,
		tenantId
	);

	let tenantBase = 'TRY';
	await withTenant(sql, tenantId, async (tx) => {
		const [row] = await tx`
			select base_currency from tenants where id = ${tenantId} limit 1
		`;
		if (row?.base_currency) tenantBase = String(row.base_currency);
	});

	for (let i = 0; i < mapped.appointments.length; i += batchSize) {
		const batch = mapped.appointments.slice(i, i + batchSize);
		await withTenant(sql, tenantId, async (tx) => {
			for (const item of batch) {
				const legacy = item.legacy_id;
				const existing = await findMappedInternal(tx, tenantId, 'appointment', legacy);
				if (existing) {
					appointmentMap.set(legacy, existing);
					stats.appointments.skipped++;
					continue;
				}

				const caseLegacy = item._case_legacy;
				if (!caseLegacy) {
					stats.errors.push(
						`appointment ${legacy}: missing case_id/contact→case — skipped`
					);
					continue;
				}
				const patientId = patientMap.get(caseLegacy);
				if (!patientId) {
					stats.errors.push(
						`appointment ${legacy}: patient for case ${caseLegacy} not found — skipped`
					);
					continue;
				}
				if (!item.verimaya.starts_at) {
					stats.errors.push(`appointment ${legacy}: missing starts_at — skipped`);
					continue;
				}

				const clinicContactId = item._clinic_contact_legacy
					? (contactMap.get(item._clinic_contact_legacy) ?? null)
					: null;
				const hotelContactId = item._hotel_contact_legacy
					? (contactMap.get(item._hotel_contact_legacy) ?? null)
					: null;
				const transferContactId = item._transfer_contact_legacy
					? (contactMap.get(item._transfer_contact_legacy) ?? null)
					: null;

				const internalId = randomUUID();
				await tx`
					insert into appointments (
						id, tenant_id, patient_id, patient_display_name, title, appointment_type,
						status, starts_at, ends_at, clinic_name, hotel_name, transfer_note,
						clinic_contact_id, hotel_contact_id, transfer_contact_id, notes
					) values (
						${internalId},
						${tenantId},
						${patientId},
						${patientNames.get(patientId) ?? item.verimaya.patient_display_name},
						${item.verimaya.title},
						${item.verimaya.appointment_type},
						${item.verimaya.status},
						${item.verimaya.starts_at},
						${item.verimaya.ends_at},
						${item.verimaya.clinic_name},
						${item.verimaya.hotel_name},
						${item.verimaya.transfer_note},
						${clinicContactId},
						${hotelContactId},
						${transferContactId},
						${item.verimaya.notes}
					)
				`;
				await insertExternal(tx, tenantId, 'appointment', legacy, internalId);
				appointmentMap.set(legacy, internalId);
				stats.appointments.inserted++;
			}
		});
		console.log(
			`[etl] appointments batch ${Math.min(i + batch.length, mapped.appointments.length)}/${mapped.appointments.length} (+${stats.appointments.inserted} / ~${stats.appointments.skipped})`
		);
	}

	for (let i = 0; i < mapped.transactions.length; i += batchSize) {
		const batch = mapped.transactions.slice(i, i + batchSize);
		await withTenant(sql, tenantId, async (tx) => {
			for (const item of batch) {
				const legacy = item.legacy_id;
				const existing = await findMappedInternal(tx, tenantId, 'transaction', legacy);
				if (existing) {
					stats.transactions.skipped++;
					continue;
				}

				if (item.verimaya.amount == null || !Number.isFinite(item.verimaya.amount)) {
					stats.errors.push(`transaction ${legacy}: invalid amount — skipped`);
					continue;
				}
				if (item._currency_coerced) {
					stats.errors.push(
						`transaction ${legacy}: unsupported currency coerced to TRY`
					);
				}

				const patientId = item._case_legacy
					? (patientMap.get(item._case_legacy) ?? null)
					: null;
				const contactId = item._contact_legacy
					? (contactMap.get(item._contact_legacy) ?? null)
					: null;
				if (item._case_legacy && !patientId) {
					stats.errors.push(
						`transaction ${legacy}: patient for case ${item._case_legacy} not found — patient_id null`
					);
				}
				if (item._contact_legacy && !contactId) {
					stats.errors.push(
						`transaction ${legacy}: contact ${item._contact_legacy} not found — contact_id null`
					);
				}

				const internalId = randomUUID();
				const amountMajor =
					item._amount_major != null
						? item._amount_major
						: item.verimaya.amount != null
							? item.verimaya.amount / 100
							: NaN;
				const fx = resolveFxSnapshot({
					currency: item.verimaya.currency,
					amountMajor,
					occurredOn: item.verimaya.occurred_on,
					counterpartyMajor: item._counterparty_major,
					equivalentCurrency: item._equivalent_currency,
					tenantBase
				});
				await tx`
					insert into transactions (
						id, tenant_id, kind, title, subtitle, category, occurred_on, status,
						invoice_status, payment_method, amount, paid_amount, currency,
						amount_base, base_currency, fx_rate, fx_dated,
						patient_id, patient_display_name, contact_id, contact_label, description
					) values (
						${internalId},
						${tenantId},
						${item.verimaya.kind},
						${item.verimaya.title},
						${item.verimaya.subtitle},
						${item.verimaya.category},
						${item.verimaya.occurred_on},
						${item.verimaya.status},
						${item.verimaya.invoice_status},
						${item.verimaya.payment_method},
						${item.verimaya.amount},
						${item.verimaya.paid_amount},
						${item.verimaya.currency},
						${fx.amount_base},
						${fx.base_currency},
						${fx.fx_rate},
						${fx.fx_dated},
						${patientId},
						${patientId ? (patientNames.get(patientId) ?? null) : null},
						${contactId},
						${item.verimaya.contact_label},
						${item.verimaya.description}
					)
				`;
				await insertExternal(tx, tenantId, 'transaction', legacy, internalId);
				stats.transactions.inserted++;
			}
		});
		console.log(
			`[etl] transactions batch ${Math.min(i + batch.length, mapped.transactions.length)}/${mapped.transactions.length} (+${stats.transactions.inserted} / ~${stats.transactions.skipped})`
		);
	}

	for (let i = 0; i < mapped.files.length; i += batchSize) {
		const batch = mapped.files.slice(i, i + batchSize);
		await withTenant(sql, tenantId, async (tx) => {
			for (const item of batch) {
				const legacy = item.legacy_id;
				const existing = await findMappedInternal(tx, tenantId, 'file', legacy);
				if (existing) {
					stats.files.skipped++;
					continue;
				}

				if (!item._case_legacy) {
					stats.errors.push(`file ${legacy}: missing case_id — skipped`);
					continue;
				}
				const patientId = patientMap.get(item._case_legacy);
				if (!patientId) {
					stats.errors.push(
						`file ${legacy}: patient for case ${item._case_legacy} not found — skipped`
					);
					continue;
				}
				const filename = String(item.verimaya.filename || '').trim();
				if (!filename) {
					stats.errors.push(`file ${legacy}: empty filename — skipped`);
					continue;
				}

				const appointmentId = item._appointment_legacy
					? (appointmentMap.get(item._appointment_legacy) ?? null)
					: null;
				if (item._appointment_legacy && !appointmentId) {
					stats.errors.push(
						`file ${legacy}: appointment ${item._appointment_legacy} not mapped — appointment_id null`
					);
				}

				const internalId = randomUUID();
				await tx`
					insert into files (
						id, tenant_id, patient_id, appointment_id, filename, mime_type,
						size_bytes, status, storage_key
					) values (
						${internalId},
						${tenantId},
						${patientId},
						${appointmentId},
						${filename},
						${item.verimaya.mime_type || 'application/octet-stream'},
						${Number.isFinite(item.verimaya.size_bytes) ? item.verimaya.size_bytes : 0},
						'pending',
						'local://pending'
					)
				`;
				await insertExternal(tx, tenantId, 'file', legacy, internalId);
				stats.files.inserted++;
			}
		});
		console.log(
			`[etl] files batch ${Math.min(i + batch.length, mapped.files.length)}/${mapped.files.length} (+${stats.files.inserted} / ~${stats.files.skipped})`
		);
	}

	for (let i = 0; i < mapped.case_notes.length; i += batchSize) {
		const batch = mapped.case_notes.slice(i, i + batchSize);
		await withTenant(sql, tenantId, async (tx) => {
			for (const item of batch) {
				const legacy = item.legacy_id;
				const existing = await findMappedInternal(tx, tenantId, 'case_note', legacy);
				if (existing) {
					stats.case_notes.skipped++;
					continue;
				}

				const patientId = patientMap.get(item._case_legacy);
				if (!patientId) {
					stats.errors.push(
						`case_note ${legacy}: patient for case ${item._case_legacy} not found — skipped`
					);
					continue;
				}
				const body = String(item.verimaya.body || '').trim();
				if (!body) {
					stats.errors.push(`case_note ${legacy}: empty body — skipped`);
					continue;
				}

				const internalId = randomUUID();
				await tx`
					insert into case_notes (id, tenant_id, patient_id, body, author_display_name)
					values (
						${internalId},
						${tenantId},
						${patientId},
						${body},
						${item.verimaya.author_display_name || 'ETL import'}
					)
				`;
				await insertExternal(tx, tenantId, 'case_note', legacy, internalId);
				stats.case_notes.inserted++;
			}
		});
		console.log(
			`[etl] case_notes batch ${Math.min(i + batch.length, mapped.case_notes.length)}/${mapped.case_notes.length} (+${stats.case_notes.inserted} / ~${stats.case_notes.skipped})`
		);
	}

	return stats;
}

/**
 * @param {import('postgres').Sql} sql
 * @param {string} tenantId
 * @param {ReturnType<typeof mapFixture>} mapped
 * @param {number} batchSize
 */
async function applyAll(sql, tenantId, mapped, batchSize) {
	const layer1 = await applyLayer1(sql, tenantId, mapped, batchSize);
	const layer2 = await applyLayer2(sql, tenantId, mapped, batchSize);
	return {
		...layer1,
		...layer2,
		errors: [...layer1.errors, ...layer2.errors]
	};
}

function printHelp() {
	console.log(`Usage: pnpm --filter @verimaya/api etl -- [options]

Options:
  --fixture <path>           Tracker-shaped JSON (default: fixtures/etl-sample.json)
  --apply                    Write layer 1+2 (Adım 28–29)
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

	const mapped = attachContactLegacy(
		mapFixture(source, args.tenantId ?? '<target-tenant-id>'),
		source
	);

	const summary = {
		mode: args.apply ? 'apply' : 'dry-run',
		source: sourceLabel,
		origin: source.source ?? null,
		counts: {
			contact_types: mapped.contact_types.length,
			finance_categories: mapped.finance_categories.length,
			appointment_types: mapped.appointment_types.length,
			contacts: mapped.contacts.length,
			patients: mapped.patients.length,
			appointments: mapped.appointments.length,
			transactions: mapped.transactions.length,
			files: mapped.files.length,
			case_notes: mapped.case_notes.length
		},
		tenant_id: args.tenantId ?? '<target-tenant-id>',
		layer: 'Adım 28–29: dictionaries + contacts/patients + appointments/transactions/files/notes',
		money_note: 'amount_major|amount → minor (*100)'
	};

	console.log('=== ETL summary ===');
	console.log(JSON.stringify(summary, null, 2));
	console.log('\n=== Sample ===');
	console.log(
		JSON.stringify(
			{
				contact: mapped.contacts[0] ?? null,
				patient: mapped.patients[0] ?? null,
				appointment: mapped.appointments[0] ?? null,
				transaction: mapped.transactions[0] ?? null,
				file: mapped.files[0] ?? null,
				case_note: mapped.case_notes[0] ?? null
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

		const stats = await applyAll(sql, args.tenantId, mapped, args.batchSize);
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
	applyLayer2,
	applyAll,
	attachContactLegacy,
	toMinor,
	resolveFxSnapshot,
	normalizeAppointmentStatus,
	SOURCE,
	DEFAULT_FIXTURE
};

if (require.main === module) {
	main().catch((err) => {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	});
}
