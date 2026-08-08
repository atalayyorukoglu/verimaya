#!/usr/bin/env node
/**
 * Seed a second demo tenant, "Demo Tek Ay Klinik", fully populated for ONE
 * calendar month (default: previous calendar month). One month keeps every
 * Raporlar number hand-checkable — this is a tracking/verification fixture,
 * not a data dump.
 *
 * Modelled on reset-tenant-data.js + backfill-ad-spend-fx.js (dry-run default,
 * --apply to write, JSON summary, DATABASE_URL_APP, postgres client).
 *
 * Deterministic: UUID v5-style ids from slug keys; amounts from fixed tables /
 * index formulas; mulberry32 only for day-of-month picks. Re-runs with the
 * same --month produce identical numbers. TRY→GBP uses a fixed demo FX rate
 * (not live Frankfurter) so totals never drift.
 *
 * Usage:
 *   pnpm --filter @verimaya/api demo:seed-month
 *   pnpm --filter @verimaya/api demo:seed-month -- --month 2026-07
 *   pnpm --filter @verimaya/api demo:seed-month -- --apply --owner-email you@example.com
 *   pnpm --filter @verimaya/api demo:seed-month -- --apply --force --owner-email you@example.com
 *
 * Coolify (API container, WORKDIR apps/api):
 *   node scripts/seed-demo-month.js
 *   node scripts/seed-demo-month.js --apply --owner-email you@example.com
 *   node scripts/seed-demo-month.js --apply --force --owner-email you@example.com --month 2026-07
 *
 * Env:
 *   DATABASE_URL_APP  Verimaya app role (RLS)
 */

const crypto = require('node:crypto');
const path = require('node:path');
const { config: loadEnv } = require('dotenv');
const postgres = require('postgres');
const { DELETE_ORDER, deletePerTable } = require('./reset-tenant-data.js');

loadEnv({ path: path.join(__dirname, '..', '.env') });

const TENANT_NAME = 'Demo Tek Ay Klinik';
const TENANT_SLUG = 'demo-tek-ay-klinik';
const BASE_CURRENCY = 'GBP';
const TIMEZONE = 'Europe/Istanbul';
/** Fixed demo rate: 1 TRY (major) = FX_TRY_TO_GBP GBP (major). Hand-checkable. */
const FX_TRY_TO_GBP = 0.0235;
/**
 * Mirror of PATIENT_SOURCE_PRESETS in packages/shared/src/patient.ts —
 * display labels stored as-is for marketing report grouping.
 */
const PATIENT_SOURCE_PRESETS = ['Meta', 'Google', 'WhatsApp', 'Tavsiye', 'Organik'];

const CONTACT_TYPE_NAMES = ['Otel', 'Transfer', 'Klinik', 'Çalışan'];

/** @type {{ kind: 'income' | 'expense', name: string, subcategories: string[] }[]} */
const FINANCE_CATEGORIES = [
	{ kind: 'income', name: 'Operasyon', subcategories: ['Saç ekimi', 'İmplant', 'Konsültasyon', 'Genel'] },
	{ kind: 'income', name: 'Diğer Gelirler', subcategories: ['Depozito', 'İade'] },
	{ kind: 'expense', name: 'Konaklama', subcategories: ['Otel', 'Extra gece', 'Erken check-in'] },
	{ kind: 'expense', name: 'Transfer', subcategories: ['Havalimanı', 'Şehir içi'] },
	{ kind: 'expense', name: 'Klinik Komisyon', subcategories: ['Saç ekimi', 'İmplant', 'Genel'] },
	{ kind: 'expense', name: 'Maaş', subcategories: ['Operasyon', 'Danışmanlık', 'Sürücü'] },
	{ kind: 'expense', name: 'Pazarlama', subcategories: ['Meta Ads', 'Google Ads', 'Ajans'] },
	{ kind: 'expense', name: 'Malzeme', subcategories: ['Klinik', 'Ofis'] }
];

/** @type {{ type: string, displayName: string, phone: string, email: string, isInternal: boolean }[]} */
const CONTACT_DEFS = [
	{ type: 'Otel', displayName: 'Grand Blue Hotel', phone: '+90 212 555 0101', email: 'rezervasyon@grandblue.example', isInternal: false },
	{ type: 'Otel', displayName: 'Sapphire Suites', phone: '+90 212 555 0102', email: 'info@sapphiresuites.example', isInternal: false },
	{ type: 'Otel', displayName: 'Boğaziçi Inn', phone: '+90 212 555 0103', email: 'frontdesk@bogaziciinn.example', isInternal: false },
	{ type: 'Transfer', displayName: 'Havaş VIP Transfer', phone: '+90 216 555 0201', email: 'vip@havastransfer.example', isInternal: false },
	{ type: 'Transfer', displayName: 'Atlas Shuttle', phone: '+90 216 555 0202', email: 'ops@atlasshuttle.example', isInternal: false },
	{ type: 'Klinik', displayName: 'İstanbul Hair Clinic', phone: '+90 212 555 0301', email: 'ops@istanbulhair.example', isInternal: false },
	{ type: 'Klinik', displayName: 'Smile Dental Studio', phone: '+90 212 555 0302', email: 'info@smiledental.example', isInternal: false },
	{ type: 'Klinik', displayName: 'Estetik Nova', phone: '+90 212 555 0303', email: 'klinik@estetiknova.example', isInternal: false },
	{ type: 'Çalışan', displayName: 'Ayşe Yılmaz', phone: '+90 532 555 0401', email: 'ayse.yilmaz@demo.example', isInternal: true },
	{ type: 'Çalışan', displayName: 'Mehmet Demir', phone: '+90 532 555 0402', email: 'mehmet.demir@demo.example', isInternal: true },
	{ type: 'Çalışan', displayName: 'Elif Kaya', phone: '+90 532 555 0403', email: 'elif.kaya@demo.example', isInternal: true },
	{ type: 'Çalışan', displayName: 'Can Öztürk', phone: '+90 532 555 0404', email: 'can.ozturk@demo.example', isInternal: true }
];

const PATIENT_NAMES = [
	'James Wilson', 'Emma Thompson', 'Oliver Brown', 'Sophia Taylor', 'Noah Anderson',
	'Ava Johnson', 'Liam Martinez', 'Isabella Garcia', 'Mason Rodriguez', 'Mia Lopez',
	'Ethan Clark', 'Charlotte Lewis', 'Lucas Walker', 'Amelia Hall', 'Harper Allen',
	'Benjamin Young', 'Evelyn King', 'Alexander Wright', 'Abigail Scott', 'Henry Green',
	'Emily Baker', 'Jack Adams', 'Elizabeth Nelson', 'Sebastian Carter', 'Sofia Mitchell',
	'Daniel Perez', 'Grace Roberts', 'Matthew Turner', 'Chloe Phillips', 'Joseph Campbell',
	'Lily Parker', 'Samuel Evans', 'Ella Edwards', 'David Collins', 'Scarlett Stewart',
	'Josephine Morris', 'Owen Rogers', 'Layla Reed', 'Wyatt Cook', 'Zoe Morgan'
];

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
	/** @type {{ apply: boolean, force: boolean, help: boolean, month: string | null, ownerEmail: string | null }} */
	const out = { apply: false, force: false, help: false, month: null, ownerEmail: null };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--') continue;
		if (arg === '--apply') out.apply = true;
		else if (arg === '--force') out.force = true;
		else if (arg === '--dry-run') out.apply = false;
		else if (arg === '--help' || arg === '-h') out.help = true;
		else if (arg === '--month') {
			const next = argv[++i];
			if (!next) throw new Error('--month requires YYYY-MM');
			out.month = next;
		} else if (arg.startsWith('--month=')) out.month = arg.slice('--month='.length);
		else if (arg === '--owner-email') {
			const next = argv[++i];
			if (!next) throw new Error('--owner-email requires an email');
			out.ownerEmail = next;
		} else if (arg.startsWith('--owner-email=')) {
			out.ownerEmail = arg.slice('--owner-email='.length);
		}
	}
	return out;
}

/**
 * UUID v5-style (SHA-256 truncated) — stable across runs for the same key.
 * @param {string} key
 * @returns {string}
 */
function uuidFromKey(key) {
	const hash = crypto.createHash('sha256').update(`verimaya:demo-tek-ay:${key}`).digest();
	const bytes = Buffer.from(hash.subarray(0, 16));
	bytes[6] = (bytes[6] & 0x0f) | 0x50;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const h = bytes.toString('hex');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * Mulberry32 — used only for day-index picks, never for money.
 * @param {number} seed
 */
function mulberry32(seed) {
	let t = seed >>> 0;
	return function next() {
		t = (t + 0x6d2b79f5) >>> 0;
		let r = Math.imul(t ^ (t >>> 15), 1 | t);
		r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * @param {string} s
 * @returns {number}
 */
function seedFromString(s) {
	const h = crypto.createHash('sha256').update(s).digest();
	return h.readUInt32BE(0);
}

/**
 * Previous calendar month relative to `now`, or parse YYYY-MM.
 * @param {string | null} override
 * @param {Date} [now]
 */
function resolveMonth(override, now = new Date()) {
	let year;
	let month; // 1-12
	if (override) {
		const m = override.trim().match(/^(\d{4})-(\d{2})$/);
		if (!m) throw new Error(`--month must be YYYY-MM, got ${JSON.stringify(override)}`);
		year = Number(m[1]);
		month = Number(m[2]);
		if (month < 1 || month > 12) throw new Error(`--month month out of range: ${override}`);
	} else {
		// Calendar previous month in local date parts (script host TZ). Day-of-month
		// does not matter — we only need year/month of "last month".
		const y = now.getFullYear();
		const mo = now.getMonth(); // 0-11 current
		if (mo === 0) {
			year = y - 1;
			month = 12;
		} else {
			year = y;
			month = mo; // getMonth() of current is already "previous" 1-based when treated as month number
		}
	}
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
	/** @type {string[]} */
	const days = [];
	for (let d = 1; d <= daysInMonth; d++) {
		days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
	}
	const ym = `${year}-${String(month).padStart(2, '0')}`;
	return {
		year,
		month,
		ym,
		from: days[0],
		to: days[days.length - 1],
		daysInMonth,
		days
	};
}

/**
 * Istanbul wall-clock instant as ISO string (Turkey permanent UTC+3).
 * @param {string} isoDate YYYY-MM-DD
 * @param {number} hour
 * @param {number} minute
 */
function istanbulTs(isoDate, hour, minute) {
	const hh = String(hour).padStart(2, '0');
	const mm = String(minute).padStart(2, '0');
	return `${isoDate}T${hh}:${mm}:00+03:00`;
}

/** Inline resolveBaseAmount (apps/api/src/common/finance-base.ts). */
function resolveBaseAmount(row, tenantBase) {
	if (row.currency == null || row.currency === '') return null;
	if (row.currency === tenantBase) {
		return row.amount_base ?? row.amount;
	}
	if (row.amount_base != null && row.base_currency === tenantBase) {
		return row.amount_base;
	}
	return null;
}

/** Inline resolveCollectedAmount + resolvePaidBaseAmount. */
function resolvePaidBaseAmount(row, tenantBase) {
	const base = resolveBaseAmount(row, tenantBase);
	if (base == null) return null;
	let paid;
	if (row.status === 'unpaid') paid = 0;
	else if (row.status === 'partial') paid = row.paid_amount ?? 0;
	else paid = row.paid_amount ?? row.amount;
	if (row.amount <= 0) return 0;
	if (row.currency === tenantBase) return paid;
	return Math.round((paid / row.amount) * base);
}

/**
 * @param {number} tryMinor
 * @param {string} fxDated
 */
function tryToGbpSnapshot(tryMinor, fxDated) {
	return {
		amount_base: Math.round(tryMinor * FX_TRY_TO_GBP),
		base_currency: BASE_CURRENCY,
		fx_rate: FX_TRY_TO_GBP,
		fx_dated: fxDated
	};
}

/**
 * Build the entire fixture in memory (no DB). Pure + deterministic.
 * @param {{ ym: string, from: string, to: string, days: string[], daysInMonth: number }} month
 * @param {string} tenantId
 */
function buildPlan(month, tenantId) {
	const rng = mulberry32(seedFromString(`${TENANT_SLUG}|${month.ym}`));
	const pickDay = () => month.days[Math.floor(rng() * month.days.length)];

	/** @type {Record<string, string>} */
	const contactTypeIds = {};
	for (const name of CONTACT_TYPE_NAMES) {
		contactTypeIds[name] = uuidFromKey(`contact-type:${name}`);
	}

	const contactTypes = CONTACT_TYPE_NAMES.map((name, i) => ({
		id: contactTypeIds[name],
		tenant_id: tenantId,
		name,
		sort_order: i
	}));

	const financeCategories = FINANCE_CATEGORIES.map((c, i) => ({
		id: uuidFromKey(`finance-cat:${c.kind}:${c.name}`),
		tenant_id: tenantId,
		kind: c.kind,
		name: c.name,
		sort_order: i,
		subcategories: c.subcategories
	}));

	const contacts = CONTACT_DEFS.map((c, i) => ({
		id: uuidFromKey(`contact:${i}:${c.displayName}`),
		tenant_id: tenantId,
		contact_type_id: contactTypeIds[c.type],
		contact_type_name: c.type,
		display_name: c.displayName,
		phone: c.phone,
		email: c.email,
		notes: null,
		is_internal: c.isInternal,
		usage_count: 0
	}));

	const hotels = contacts.filter((c) => c.contact_type_name === 'Otel');
	const transfers = contacts.filter((c) => c.contact_type_name === 'Transfer');
	const clinics = contacts.filter((c) => c.contact_type_name === 'Klinik');
	const employees = contacts.filter((c) => c.contact_type_name === 'Çalışan');

	// Sources: 36 known + 4 null → coverage 0.90 (> 0.8 threshold, not 100%).
	/** @type {(string | null)[]} */
	const sources = [];
	for (let i = 0; i < 8; i++) sources.push('Meta');
	for (let i = 0; i < 8; i++) sources.push('Google');
	for (let i = 0; i < 8; i++) sources.push('WhatsApp');
	for (let i = 0; i < 6; i++) sources.push('Tavsiye');
	for (let i = 0; i < 6; i++) sources.push('Organik');
	for (let i = 0; i < 4; i++) sources.push(null);
	if (sources.length !== 40) throw new Error(`expected 40 sources, got ${sources.length}`);

	const patientStatuses = [
		...Array(22).fill('treated'),
		...Array(6).fill('follow_up'),
		...Array(5).fill('arrived'),
		...Array(4).fill('scheduled'),
		...Array(3).fill('cancelled')
	];
	if (patientStatuses.length !== 40) throw new Error('patient status mix must be 40');

	const patients = PATIENT_NAMES.map((fullName, i) => {
		const day = month.days[i % month.daysInMonth];
		const hour = 9 + (i % 8);
		const created = istanbulTs(day, hour, (i * 7) % 60);
		return {
			id: uuidFromKey(`patient:${i}`),
			tenant_id: tenantId,
			full_name: fullName,
			phone: `+44 7700 90${String(1000 + i).slice(-4)}`,
			email: `${fullName.toLowerCase().replace(/\s+/g, '.')}@demo-patient.example`,
			status: patientStatuses[i],
			source: sources[i],
			notes: i % 7 === 0 ? 'Tek ay demo hasta' : null,
			assigned_user_id: null,
			contact_id: null,
			created_at: created,
			updated_at: created
		};
	});

	// 60 appointments: 48 completed, 6 no_show (10%), 4 cancelled, 2 scheduled.
	const apptStatuses = [
		...Array(48).fill('completed'),
		...Array(6).fill('no_show'),
		...Array(4).fill('cancelled'),
		...Array(2).fill('scheduled')
	];
	if (apptStatuses.length !== 60) throw new Error('appointment status mix must be 60');

	const appointments = apptStatuses.map((status, i) => {
		const patient = patients[i % patients.length];
		const clinic = clinics[i % clinics.length];
		const hotel = hotels[i % hotels.length];
		const transfer = transfers[i % transfers.length];
		const day = month.days[(i * 3) % month.daysInMonth];
		const hour = 8 + (i % 9);
		const starts = istanbulTs(day, hour, 0);
		const ends = istanbulTs(day, hour + 1, 0);
		return {
			id: uuidFromKey(`appointment:${i}`),
			tenant_id: tenantId,
			patient_id: patient.id,
			patient_display_name: patient.full_name,
			title: i % 3 === 0 ? 'Konsültasyon' : i % 3 === 1 ? 'Tedavi' : 'Kontrol',
			appointment_type: i % 3 === 0 ? 'Konsültasyon' : i % 3 === 1 ? 'Tedavi' : 'Kontrol',
			status,
			starts_at: starts,
			ends_at: ends,
			clinic_name: clinic.display_name,
			hotel_name: hotel.display_name,
			transfer_note: `${transfer.display_name} — IST/SAW pickup`,
			clinic_contact_id: clinic.id,
			hotel_contact_id: hotel.id,
			transfer_contact_id: transfer.id,
			notes: null,
			created_at: starts,
			updated_at: starts
		};
	});

	/** @type {object[]} */
	const transactions = [];

	// —— 70 income rows linked to patients ——
	for (let i = 0; i < 70; i++) {
		const patient = patients[i % patients.length];
		const day = pickDay();
		const useTry = i % 5 === 0; // 14 TRY, 56 GBP
		const status = i % 10 === 0 ? 'unpaid' : i % 10 === 1 || i % 10 === 2 ? 'partial' : 'paid';
		const amount = useTry
			? 2_500_000 + (i % 10) * 250_000 // TRY kuruş
			: 180_000 + (i % 20) * 12_000; // GBP pence (£1800+)
		const paid_amount =
			status === 'partial' ? Math.round(amount * 0.4) : null;
		const fx = useTry ? tryToGbpSnapshot(amount, day) : {
			amount_base: amount,
			base_currency: BASE_CURRENCY,
			fx_rate: 1,
			fx_dated: day
		};
		const sub =
			FINANCE_CATEGORIES[0].subcategories[i % FINANCE_CATEGORIES[0].subcategories.length];
		transactions.push({
			id: uuidFromKey(`tx:income:${i}`),
			tenant_id: tenantId,
			kind: 'income',
			title: `${patient.full_name} — ${sub}`,
			subtitle: sub,
			category: 'Operasyon',
			occurred_on: day,
			status,
			invoice_status: 'none',
			payment_method: status === 'unpaid' ? null : i % 2 === 0 ? 'card' : 'transfer',
			amount,
			paid_amount,
			currency: useTry ? 'TRY' : 'GBP',
			amount_base: fx.amount_base,
			base_currency: fx.base_currency,
			fx_rate: fx.fx_rate,
			fx_dated: fx.fx_dated,
			patient_id: patient.id,
			patient_display_name: patient.full_name,
			contact_id: null,
			contact_label: null,
			description: null
		});
	}

	// —— 50 expense rows linked to hotel / transfer / employee contacts ——
	for (let i = 0; i < 50; i++) {
		const day = pickDay();
		const bucket = i % 3; // 0 hotel, 1 transfer, 2 employee
		const contact =
			bucket === 0
				? hotels[i % hotels.length]
				: bucket === 1
					? transfers[i % transfers.length]
					: employees[i % employees.length];
		const category =
			bucket === 0 ? 'Konaklama' : bucket === 1 ? 'Transfer' : 'Maaş';
		const useTry = i % 4 === 0; // 13 TRY, 37 GBP
		const status = i % 8 === 0 ? 'unpaid' : i % 8 === 1 ? 'partial' : 'paid';
		const amount = useTry
			? 800_000 + (i % 8) * 100_000
			: 45_000 + (i % 15) * 5_000;
		const paid_amount =
			status === 'partial' ? Math.round(amount * 0.5) : null;
		const fx = useTry ? tryToGbpSnapshot(amount, day) : {
			amount_base: amount,
			base_currency: BASE_CURRENCY,
			fx_rate: 1,
			fx_dated: day
		};
		transactions.push({
			id: uuidFromKey(`tx:expense:${i}`),
			tenant_id: tenantId,
			kind: 'expense',
			title: `${category} — ${contact.display_name}`,
			subtitle: category,
			category,
			occurred_on: day,
			status,
			invoice_status: 'none',
			payment_method: status === 'unpaid' ? null : 'transfer',
			amount,
			paid_amount,
			currency: useTry ? 'TRY' : 'GBP',
			amount_base: fx.amount_base,
			base_currency: fx.base_currency,
			fx_rate: fx.fx_rate,
			fx_dated: fx.fx_dated,
			patient_id: null,
			patient_display_name: null,
			contact_id: contact.id,
			contact_label: contact.display_name,
			description: null
		});
	}

	if (transactions.length !== 120) {
		throw new Error(`expected 120 transactions, got ${transactions.length}`);
	}

	/** @type {object[]} */
	const adMetrics = [];
	for (let d = 0; d < month.daysInMonth; d++) {
		const date = month.days[d];
		for (const provider of /** @type {const} */ (['google', 'meta'])) {
			const spendTry =
				provider === 'google'
					? 1_200_000 + d * 18_000 // kuruş / day
					: 1_600_000 + d * 22_000;
			const snap = tryToGbpSnapshot(spendTry, date);
			const impressions = provider === 'google' ? 4_000 + d * 80 : 6_500 + d * 120;
			const clicks = provider === 'google' ? 120 + d * 3 : 180 + d * 4;
			adMetrics.push({
				id: uuidFromKey(`ad:${provider}:${date}`),
				tenant_id: tenantId,
				provider,
				date,
				campaign_id: provider === 'google' ? 'demo-google-campaign' : 'demo-meta-campaign',
				spend_minor: spendTry,
				currency: 'TRY',
				spend_base: snap.amount_base,
				base_currency: snap.base_currency,
				fx_rate: snap.fx_rate,
				fx_dated: snap.fx_dated,
				impressions,
				clicks
			});
		}
	}

	// —— beklenen (expected) totals for Raporlar eyeballing ——
	let income_base = 0;
	let expense_base = 0;
	let collected_base = 0;
	for (const row of transactions) {
		const base = resolveBaseAmount(
			{
				amount: row.amount,
				amount_base: row.amount_base,
				base_currency: row.base_currency,
				currency: row.currency
			},
			BASE_CURRENCY
		);
		if (base == null) throw new Error(`FX missing for transaction ${row.id}`);
		if (row.kind === 'income') {
			income_base += base;
			const paid = resolvePaidBaseAmount(
				{
					amount: row.amount,
					amount_base: row.amount_base,
					base_currency: row.base_currency,
					currency: row.currency,
					status: row.status,
					paid_amount: row.paid_amount
				},
				BASE_CURRENCY
			);
			collected_base += paid ?? 0;
		} else {
			expense_base += base;
		}
	}

	let spend_base = 0;
	for (const row of adMetrics) {
		const base = resolveBaseAmount(
			{
				amount: row.spend_minor,
				amount_base: row.spend_base,
				base_currency: row.base_currency,
				currency: row.currency
			},
			BASE_CURRENCY
		);
		if (base == null) throw new Error(`FX missing for ad ${row.id}`);
		spend_base += base;
	}

	const completed = appointments.filter((a) => a.status === 'completed').length;
	const noShow = appointments.filter((a) => a.status === 'no_show').length;
	const cancelled = appointments.filter((a) => a.status === 'cancelled').length;
	const scheduled = appointments.filter((a) => a.status === 'scheduled').length;
	const withSource = patients.filter((p) => p.source != null && p.source !== '').length;
	const real_roas = spend_base > 0 ? collected_base / spend_base : null;

	const beklenen = {
		period: { from: month.from, to: month.to, ym: month.ym },
		patients: {
			total: patients.length,
			with_source: withSource,
			attribution_coverage: withSource / patients.length
		},
		appointments: {
			total: appointments.length,
			completed,
			no_show: noShow,
			cancelled,
			scheduled,
			completion_rate: completed / appointments.length,
			no_show_rate: noShow / appointments.length
		},
		finance_gbp_base: {
			income_base,
			expense_base,
			net_base: income_base - expense_base,
			collected_base,
			transaction_count: transactions.length
		},
		ads_gbp_base: {
			spend_base,
			days: month.daysInMonth,
			rows: adMetrics.length
		},
		/** Gerçek ROAS = tahsilat (collected_base) ÷ reklam harcaması (spend_base) */
		real_roas,
		fx: {
			try_to_gbp: FX_TRY_TO_GBP,
			note: 'Fixed demo rate — not Frankfurter. Every TRY row carries amount_base/spend_base + snapshot.'
		}
	};

	return {
		contactTypes,
		financeCategories,
		contacts,
		patients,
		appointments,
		transactions,
		adMetrics,
		insert_counts: {
			contact_types: contactTypes.length,
			finance_categories: financeCategories.length,
			contacts: contacts.length,
			patients: patients.length,
			appointments: appointments.length,
			transactions: transactions.length,
			ad_metrics_daily: adMetrics.length
		},
		beklenen
	};
}

/**
 * @param {import('postgres').Sql} sql
 * @param {ReturnType<typeof buildPlan>} plan
 * @param {string} tenantId
 */
async function insertPlan(sql, plan, tenantId) {
	await sql`select set_config('app.current_tenant_id', ${tenantId}, true)`;

	for (const row of plan.contactTypes) {
		await sql`
			insert into contact_types (id, tenant_id, name, sort_order)
			values (${row.id}, ${row.tenant_id}, ${row.name}, ${row.sort_order})
		`;
	}
	for (const row of plan.financeCategories) {
		await sql.unsafe(
			`insert into finance_categories (id, tenant_id, kind, name, sort_order, subcategories)
			 values ($1, $2, $3, $4, $5, $6::jsonb)`,
			[
				row.id,
				row.tenant_id,
				row.kind,
				row.name,
				row.sort_order,
				JSON.stringify(row.subcategories)
			]
		);
	}
	for (const row of plan.contacts) {
		await sql`
			insert into contacts (
				id, tenant_id, contact_type_id, contact_type_name, display_name,
				phone, email, notes, is_internal, usage_count
			) values (
				${row.id}, ${row.tenant_id}, ${row.contact_type_id}, ${row.contact_type_name},
				${row.display_name}, ${row.phone}, ${row.email}, ${row.notes},
				${row.is_internal}, ${row.usage_count}
			)
		`;
	}
	for (const row of plan.patients) {
		await sql`
			insert into patients (
				id, tenant_id, full_name, phone, email, status, source, notes,
				assigned_user_id, contact_id, created_at, updated_at
			) values (
				${row.id}, ${row.tenant_id}, ${row.full_name}, ${row.phone}, ${row.email},
				${row.status}, ${row.source}, ${row.notes}, ${row.assigned_user_id},
				${row.contact_id}, ${row.created_at}, ${row.updated_at}
			)
		`;
	}
	for (const row of plan.appointments) {
		await sql`
			insert into appointments (
				id, tenant_id, patient_id, patient_display_name, title, appointment_type,
				status, starts_at, ends_at, clinic_name, hotel_name, transfer_note,
				clinic_contact_id, hotel_contact_id, transfer_contact_id, notes,
				created_at, updated_at
			) values (
				${row.id}, ${row.tenant_id}, ${row.patient_id}, ${row.patient_display_name},
				${row.title}, ${row.appointment_type}, ${row.status},
				${row.starts_at}, ${row.ends_at}, ${row.clinic_name}, ${row.hotel_name},
				${row.transfer_note}, ${row.clinic_contact_id}, ${row.hotel_contact_id},
				${row.transfer_contact_id}, ${row.notes}, ${row.created_at}, ${row.updated_at}
			)
		`;
	}
	for (const row of plan.transactions) {
		await sql`
			insert into transactions (
				id, tenant_id, kind, title, subtitle, category, occurred_on, status,
				invoice_status, payment_method, amount, paid_amount, currency,
				amount_base, base_currency, fx_rate, fx_dated,
				patient_id, patient_display_name, contact_id, contact_label, description
			) values (
				${row.id}, ${row.tenant_id}, ${row.kind}, ${row.title}, ${row.subtitle},
				${row.category}, ${row.occurred_on}, ${row.status}, ${row.invoice_status},
				${row.payment_method}, ${row.amount}, ${row.paid_amount}, ${row.currency},
				${row.amount_base}, ${row.base_currency}, ${row.fx_rate}, ${row.fx_dated},
				${row.patient_id}, ${row.patient_display_name}, ${row.contact_id},
				${row.contact_label}, ${row.description}
			)
		`;
	}
	for (const row of plan.adMetrics) {
		await sql`
			insert into ad_metrics_daily (
				id, tenant_id, provider, date, campaign_id, spend_minor, currency,
				spend_base, base_currency, fx_rate, fx_dated, impressions, clicks
			) values (
				${row.id}, ${row.tenant_id}, ${row.provider}, ${row.date}, ${row.campaign_id},
				${row.spend_minor}, ${row.currency}, ${row.spend_base}, ${row.base_currency},
				${row.fx_rate}, ${row.fx_dated}, ${row.impressions}, ${row.clicks}
			)
		`;
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log(`Usage: node scripts/seed-demo-month.js [options]
  --month YYYY-MM       override calendar month (default: previous month)
  --owner-email <email> member.role=owner for that user (required for panel access)
  --dry-run             (default) print beklenen + insert counts — never writes
  --apply               write tenant + data in one transaction
  --force               with --apply: wipe existing demo tenant data then re-seed

Tenant: "${TENANT_NAME}" (slug=${TENANT_SLUG}, base=${BASE_CURRENCY}, tz=${TIMEZONE})
Deterministic UUID from slug; FX TRY→GBP fixed at ${FX_TRY_TO_GBP}.

Env: DATABASE_URL_APP (or DATABASE_URL)`);
		process.exit(0);
	}

	if (args.force && !args.apply) {
		console.error('--force requires --apply (dry-run never writes)');
		process.exit(1);
	}

	let month;
	try {
		month = resolveMonth(args.month);
	} catch (err) {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	}

	const tenantId = uuidFromKey(`tenant:${TENANT_SLUG}`);
	const plan = buildPlan(month, tenantId);

	const appUrl = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
	if (!appUrl) {
		console.error('DATABASE_URL_APP (or DATABASE_URL) is required');
		process.exit(1);
	}

	const app = postgres(appUrl, { max: 2 });

	try {
		/** @type {{ id: string, email: string } | null} */
		let ownerUser = null;
		if (args.ownerEmail) {
			const [user] = await app`
				select id, email from "user" where lower(email) = lower(${args.ownerEmail}) limit 1
			`;
			if (!user) {
				console.error(
					`--owner-email not found in user table: ${JSON.stringify(args.ownerEmail)} — aborting, no rows written`
				);
				process.exit(1);
			}
			ownerUser = { id: String(user.id), email: String(user.email) };
		}

		const [existing] = await app`
			select id, name, slug from tenants where id = ${tenantId} or slug = ${TENANT_SLUG} limit 1
		`;

		if (existing && String(existing.id) !== tenantId) {
			console.error(
				`Slug ${JSON.stringify(TENANT_SLUG)} is taken by a different tenant id ${existing.id} (expected deterministic ${tenantId}) — aborting, no rows written`
			);
			process.exit(1);
		}

		if (existing && !args.force && args.apply) {
			console.error(
				`Tenant already exists (id=${existing.id}, slug=${existing.slug}). Re-run with --force to wipe operational data + ad_metrics_daily and re-seed — aborting, no rows written`
			);
			process.exit(1);
		}
		if (existing && !args.force && !args.apply) {
			console.error(
				`WARN: tenant already exists (id=${existing.id}, slug=${existing.slug}). Dry-run only — --apply will abort unless --force.`
			);
		}

		/** @type {string[]} */
		const warnings = [];
		if (!args.ownerEmail) {
			warnings.push(
				'NO --owner-email: tenant will be INVISIBLE in the panel (no member row). Pass --owner-email <email>.'
			);
		}

		const summary = {
			mode: args.apply ? (args.force ? 'apply+force' : 'apply') : 'dry-run',
			tenant: {
				id: tenantId,
				name: TENANT_NAME,
				slug: TENANT_SLUG,
				base_currency: BASE_CURRENCY,
				timezone: TIMEZONE,
				exists: Boolean(existing),
				force: args.force
			},
			owner: ownerUser
				? { user_id: ownerUser.id, email: ownerUser.email, role: 'owner' }
				: null,
			warnings,
			delete_order_on_force: [...DELETE_ORDER, 'ad_metrics_daily'],
			insert_counts: plan.insert_counts,
			beklenen: plan.beklenen
		};

		console.log(JSON.stringify(summary, null, 2));

		if (!args.apply) {
			console.log(
				'Dry-run only (no DB writes). Re-run with --apply [--force] [--owner-email <email>] to INSERT.'
			);
			return;
		}

		await app.begin(async (tx) => {
			if (existing && args.force) {
				await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
				// Ads are outside DELETE_ORDER (etl:reset keeps them); this fixture must refresh them.
				await tx`delete from ad_metrics_daily where tenant_id = ${tenantId}`;
				await deletePerTable(tx, tenantId);
			}

			if (!existing) {
				await tx`
					insert into organization (id, name, slug, created_at)
					values (${tenantId}, ${TENANT_NAME}, ${TENANT_SLUG}, now())
				`;
				await tx`
					insert into tenants (id, name, slug, base_currency, timezone)
					values (${tenantId}, ${TENANT_NAME}, ${TENANT_SLUG}, ${BASE_CURRENCY}, ${TIMEZONE})
				`;
			}

			await insertPlan(tx, plan, tenantId);

			if (ownerUser) {
				const [mem] = await tx`
					select id from member
					where organization_id = ${tenantId} and user_id = ${ownerUser.id}
					limit 1
				`;
				if (!mem) {
					const memberId = uuidFromKey(`member:${tenantId}:${ownerUser.id}`);
					await tx`
						insert into member (id, organization_id, user_id, role, created_at)
						values (${memberId}, ${tenantId}, ${ownerUser.id}, 'owner', now())
					`;
				}
			}
		});

		console.log(
			JSON.stringify(
				{
					mode: args.force ? 'apply+force' : 'apply',
					tenant_id: tenantId,
					slug: TENANT_SLUG,
					owner_email: ownerUser?.email ?? null,
					insert_counts: plan.insert_counts,
					beklenen: plan.beklenen
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

module.exports = {
	parseArgs,
	resolveMonth,
	buildPlan,
	uuidFromKey,
	TENANT_SLUG,
	TENANT_NAME,
	FX_TRY_TO_GBP,
	PATIENT_SOURCE_PRESETS
};
