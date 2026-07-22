import { faker } from '@faker-js/faker/locale/en';
import type {
	AiCorrection,
	AdMetric,
	ApiKey,
	Appointment,
	AppointmentTypeSetting,
	AuditLog,
	Contact,
	ContactType,
	FinanceCategory,
	InboundMessage,
	Patient,
	PatientCaseNote,
	PatientFile,
	PatientStatus,
	Tenant,
	Transaction,
	MembershipUser,
	UserRole,
	WebhookSubscription
} from '@verimaya/shared';

export type MockScenario = 'default' | 'empty' | 'large';

export const DEMO_TENANT_ID = '11111111-1111-4111-8111-111111111111';
export const DEMO_USER_ID = '22222222-2222-4222-8222-222222222222';
/** Fixed demo patient — searchable as "Atalay" */
export const ATALAY_PATIENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ATALAY_CONTACT_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
export const CONTACT_DEMO_HOTEL_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
export const CONTACT_MUJDAT_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3';
export const CONTACT_SEHMUZ_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
export const CONTACT_VEGA_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd5';
export const CONTACT_KLINIK_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd6';
export const CONTACT_TRANSFER_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd7';
export const CONTACT_INTERNAL_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd8';
/** Intentional duplicates for /kisiler/cift-kayit demo */
export const CONTACT_DUP_HOTEL_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddd10';
export const CONTACT_DUP_ATALAY_EMAIL_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddd11';
export const CONTACT_DUP_ATALAY_NAME_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddd12';
/** Same phone as Atalay — /hastalar/cift-kayit demo */
export const ATALAY_DUP_PATIENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

export const demoTenant: Tenant = {
	id: DEMO_TENANT_ID,
	name: 'Demo Klinik',
	slug: 'demo-klinik',
	base_currency: 'TRY',
	patients_section_label: 'Hastalar',
	created_at: '2026-01-15T10:00:00.000Z'
};

export const demoUser: MembershipUser = {
	id: DEMO_USER_ID,
	email: 'demo@verimaya.app',
	display_name: 'Demo Kullanıcı',
	created_at: '2026-01-15T10:00:00.000Z',
	tenant_id: DEMO_TENANT_ID,
	role: 'owner'
};

const STATUSES: PatientStatus[] = [
	'lead',
	'contacted',
	'qualified',
	'scheduled',
	'arrived',
	'treated',
	'follow_up',
	'closed_won',
	'closed_lost'
];

const SOURCES = ['Meta Ads', 'Google Ads', 'WhatsApp', 'Referans', 'GHL', 'Website'];

const LONG_NAME = 'Aleksandra-Maria Katarzyna von Habsburg-Lorraine-Wojciechowski-Papadopoulos';

function seedFaker(scenario: MockScenario) {
	faker.seed(scenario === 'large' ? 42_001 : 42);
}

function iso(d: Date): string {
	return d.toISOString();
}

function makePatient(overrides: Partial<Patient> = {}): Patient {
	const created = faker.date.recent({ days: 90 });
	const first = faker.person.firstName();
	const last = faker.person.lastName();
	return {
		id: faker.string.uuid(),
		tenant_id: DEMO_TENANT_ID,
		full_name: `${first} ${last}`,
		phone:
			faker.helpers.maybe(() => `+90${faker.string.numeric(10)}`, {
				probability: 0.85
			}) ?? null,
		email:
			faker.helpers.maybe(() => faker.internet.email({ firstName: first, lastName: last }), {
				probability: 0.7
			}) ?? null,
		status: faker.helpers.arrayElement(STATUSES),
		source: faker.helpers.arrayElement(SOURCES),
		notes: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.4 }) ?? null,
		assigned_user_id: faker.helpers.maybe(() => DEMO_USER_ID, { probability: 0.6 }) ?? null,
		contact_id: null,
		created_at: iso(created),
		updated_at: iso(faker.date.between({ from: created, to: new Date() })),
		...overrides
	};
}

function makeAppointment(patient: Patient, overrides: Partial<Appointment> = {}): Appointment {
	const starts = faker.date.soon({ days: 14 });
	const ends = new Date(starts.getTime() + 90 * 60_000);
	return {
		id: faker.string.uuid(),
		tenant_id: DEMO_TENANT_ID,
		patient_id: patient.id,
		patient_display_name: patient.full_name,
		title: faker.helpers.arrayElement([
			'Saç ekimi konsultasyonu',
			'Diş implant muayenesi',
			'Kontrol randevusu',
			'Tedavi günü'
		]),
		appointment_type: faker.helpers.arrayElement(['Konsültasyon', 'Tedavi', 'Kontrol', 'Transfer']),
		status: faker.helpers.arrayElement(['scheduled', 'confirmed', 'completed', 'cancelled']),
		starts_at: iso(starts),
		ends_at: iso(ends),
		clinic_name: faker.helpers.maybe(() => 'Klinik Ortak', { probability: 0.7 }) ?? null,
		hotel_name: faker.helpers.maybe(() => 'Demo Hotel', { probability: 0.4 }) ?? null,
		transfer_note: null,
		clinic_contact_id: null,
		hotel_contact_id: null,
		transfer_contact_id: null,
		notes: null,
		created_at: iso(faker.date.recent({ days: 30 })),
		updated_at: iso(new Date()),
		...overrides
	};
}

const SUBCATEGORIES: Record<string, string[]> = {
	Operasyon: ['Saç ekimi', 'İmplant', 'Konsültasyon', 'Genel'],
	Konaklama: ['Otel', 'Extra gece', 'Erken check-in'],
	Transfer: ['Havalimanı', 'Şehir içi', 'Şehirler arası'],
	Pazarlama: ['Meta Ads', 'Google Ads', 'Ajans']
};

function pickSubtitle(category: string | null): string | null {
	if (!category) return null;
	const options = SUBCATEGORIES[category];
	if (!options?.length) return 'Genel';
	return faker.helpers.arrayElement(options);
}

function makeTransaction(
	patient: Patient | null,
	overrides: Partial<Transaction> = {}
): Transaction {
	const kind = faker.helpers.arrayElement(['income', 'expense'] as const);
	const amount = faker.number.int({ min: 5_000_00, max: 250_000_00 });
	const status = faker.helpers.arrayElement(['paid', 'partial', 'unpaid'] as const);
	const category =
		overrides.category !== undefined
			? overrides.category
			: faker.helpers.arrayElement(['Operasyon', 'Konaklama', 'Transfer', 'Pazarlama']);
	const subtitle = overrides.subtitle !== undefined ? overrides.subtitle : pickSubtitle(category);
	return {
		id: faker.string.uuid(),
		tenant_id: DEMO_TENANT_ID,
		kind,
		title:
			kind === 'income'
				? faker.helpers.arrayElement(['Hasta tahsilatı', 'Depozito', 'Paket ödemesi'])
				: faker.helpers.arrayElement(['Klinik komisyonu', 'Otel ödemesi', 'Transfer']),
		subtitle,
		category,
		occurred_on: iso(faker.date.recent({ days: 100 })).slice(0, 10),
		status,
		invoice_status: faker.helpers.arrayElement(['none', 'issued', 'not_issued'] as const),
		payment_method: faker.helpers.arrayElement(['Havale', 'Nakit', 'Kart', null]),
		amount,
		paid_amount: status === 'paid' ? amount : status === 'partial' ? Math.floor(amount / 2) : null,
		currency: 'TRY',
		amount_base: amount,
		base_currency: 'TRY',
		fx_rate: 1,
		fx_dated: null,
		patient_id: patient?.id ?? null,
		patient_display_name: patient?.full_name ?? null,
		contact_id: null,
		contact_label:
			kind === 'expense'
				? (faker.helpers.maybe(
						() =>
							faker.helpers.arrayElement([
								'Müjdat Bey',
								'Sehmuz Bey',
								'Vega Lab',
								'Demo Hotel',
								'Klinik Ortak'
							]),
						{ probability: 0.45 }
					) ?? null)
				: (faker.helpers.maybe(
						() => faker.helpers.arrayElement(['Müjdat Bey', 'Sehmuz Bey', 'Klinik Ortak']),
						{ probability: 0.2 }
					) ?? null),
		description: null,
		created_at: iso(faker.date.recent({ days: 60 })),
		updated_at: iso(new Date()),
		...overrides
	};
}

const INBOUND_SEEDS: Omit<InboundMessage, 'id' | 'tenant_id' | 'created_at'>[] = [
	{
		chat_name: 'Fixrav Finans',
		sender: '120363143271144447@g.us',
		body: 'Biliyorlar söylemiştim',
		has_media: false,
		media_path: null,
		status: 'new',
		parsed_records: null,
		parse_error: null
	},
	{
		chat_name: 'Fixrav Finans',
		sender: '120363143271144447@g.us',
		body: "Vega Lab'a 1150 euro Müjdat bey tarafından odeme yapildi.",
		has_media: false,
		media_path: null,
		status: 'new',
		parsed_records: null,
		parse_error: null
	},
	{
		chat_name: 'Fixrav Finans',
		sender: '120363143271144447@g.us',
		body: 'Bunu buraya not düşmeyi unuttum. Sehmuz beye verilen eurolardan 1 tanesi yırtılmış.',
		has_media: false,
		media_path: null,
		status: 'parsed',
		parsed_records: null,
		parse_error: null
	},
	{
		chat_name: 'Fixrav Finans',
		sender: '120363143271144447@g.us',
		body: null,
		has_media: true,
		media_path: '/demo/receipt.jpg',
		status: 'new',
		parsed_records: null,
		parse_error: null
	},
	{
		chat_name: 'Fixrav Finans',
		sender: '120363143271144447@g.us',
		body: 'Sandra 2900 GBP 2. vizit ödemesi + 450 GBP t-base ücretleri alındı. Toplamda 3.350 GBP kart ile ödeme alındı.',
		has_media: false,
		media_path: null,
		status: 'new',
		parsed_records: null,
		parse_error: null
	}
];

function makeInboundMessages(): InboundMessage[] {
	const now = Date.now();
	return INBOUND_SEEDS.map((seed, i) => ({
		id: faker.string.uuid(),
		tenant_id: DEMO_TENANT_ID,
		...seed,
		created_at: iso(new Date(now - i * 45 * 60_000))
	})).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

const TEAM: { name: string; role: UserRole }[] = [
	{ name: 'Demo Kullanıcı', role: 'owner' },
	{ name: 'Elif Yılmaz', role: 'admin' },
	{ name: 'Mert Kaya', role: 'manager' },
	{ name: 'Zeynep Demir', role: 'agent' },
	{ name: 'Can Aksoy', role: 'agent' },
	{ name: 'Selin Arslan', role: 'finance' }
];

function makeMembers(): MembershipUser[] {
	return TEAM.map((m, i) => ({
		id: i === 0 ? DEMO_USER_ID : faker.string.uuid(),
		email:
			i === 0
				? 'demo@verimaya.app'
				: `${m.name.toLowerCase().replace(/[^a-z]+/g, '.')}@verimaya.app`,
		display_name: m.name,
		created_at: iso(faker.date.past({ years: 1 })),
		tenant_id: DEMO_TENANT_ID,
		role: m.role
	}));
}

function makeAuditLogs(
	members: MembershipUser[],
	patients: Patient[],
	transactions: Transaction[]
): AuditLog[] {
	const logs: AuditLog[] = [];
	const n = 60;
	for (let i = 0; i < n; i++) {
		const actor = faker.helpers.arrayElement(members);
		const roll = faker.number.int({ min: 0, max: 9 });
		let entity_type: AuditLog['entity_type'];
		let entity_label: string | null;
		let action: AuditLog['action'];

		if (roll < 4 && patients.length > 0) {
			entity_type = 'patient';
			entity_label = faker.helpers.arrayElement(patients).full_name;
			action = faker.helpers.arrayElement(['create', 'update'] as const);
		} else if (roll < 7 && transactions.length > 0) {
			entity_type = 'transaction';
			entity_label = faker.helpers.arrayElement(transactions).title;
			action = faker.helpers.arrayElement(['create', 'update', 'delete'] as const);
		} else if (roll < 9) {
			entity_type = 'appointment';
			entity_label = patients.length > 0 ? faker.helpers.arrayElement(patients).full_name : null;
			action = faker.helpers.arrayElement(['create', 'update'] as const);
		} else {
			entity_type = 'user';
			entity_label = actor.display_name;
			action = 'login';
		}

		logs.push({
			id: faker.string.uuid(),
			tenant_id: DEMO_TENANT_ID,
			actor_id: actor.id,
			actor_display_name: actor.display_name,
			action,
			entity_type,
			entity_label,
			created_at: iso(faker.date.recent({ days: 21 }))
		});
	}
	return logs.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export type DemoStore = {
	tenant: Tenant;
	/** All orgs for developer panel (includes current). */
	tenants: Tenant[];
	patients: Patient[];
	appointments: Appointment[];
	transactions: Transaction[];
	/** Daily ad spend rows (demo fixture for Gerçek ROAS). */
	adMetricsDaily: AdMetric[];
	inboundMessages: InboundMessage[];
	files: PatientFile[];
	caseNotes: PatientCaseNote[];
	contactTypes: ContactType[];
	contacts: Contact[];
	financeCategories: FinanceCategory[];
	appointmentTypes: AppointmentTypeSetting[];
	members: MembershipUser[];
	auditLogs: AuditLog[];
	apiKeys: ApiKey[];
	webhookSubscriptions: WebhookSubscription[];
	aiCorrections: AiCorrection[];
};

function slugify(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 48) || 'org'
	);
}

function makeExtraTenants(): Tenant[] {
	const seeds = [
		{ id: '33333333-3333-4333-8333-333333333333', name: 'Gee Smile', slug: 'gee-smile' },
		{ id: '44444444-4444-4444-8444-444444444444', name: 'OrbisMed Clinics', slug: 'orbismed' }
	];
	return seeds.map((s) => ({
		id: s.id,
		name: s.name,
		slug: s.slug,
		base_currency: 'TRY' as const,
		patients_section_label: 'Hastalar',
		created_at: iso(faker.date.past({ years: 1 }))
	}));
}

function makeDevMembers(tenants: Tenant[]): MembershipUser[] {
	const primary = makeMembers();
	const extras: MembershipUser[] = [];
	for (const t of tenants) {
		if (t.id === DEMO_TENANT_ID) continue;
		extras.push(
			{
				id: faker.string.uuid(),
				email: 'demo@verimaya.app',
				display_name: 'Demo Kullanıcı',
				created_at: iso(faker.date.past({ years: 1 })),
				tenant_id: t.id,
				role: 'owner'
			},
			{
				id: faker.string.uuid(),
				email: `ops@${t.slug}.demo`,
				display_name: 'Operasyon',
				created_at: iso(faker.date.past({ years: 1 })),
				tenant_id: t.id,
				role: 'agent'
			},
			{
				id: faker.string.uuid(),
				email: `finance@${t.slug}.demo`,
				display_name: 'Finans',
				created_at: iso(faker.date.past({ years: 1 })),
				tenant_id: t.id,
				role: 'finance'
			}
		);
	}
	return [...primary, ...extras];
}

function makeContactTypes(): ContactType[] {
	const now = iso(new Date());
	const names = ['Otel', 'Transfer', 'Klinik', 'Hasta', 'Laboratuvar', 'Diğer', 'İç personel'];
	return names.map((name, i) => ({
		id: `eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee${i + 1}`,
		tenant_id: DEMO_TENANT_ID,
		name,
		sort_order: i,
		created_at: now
	}));
}

function typeByName(types: ContactType[], name: string): ContactType {
	const t = types.find((x) => x.name === name);
	if (!t) throw new Error(`Missing contact type ${name}`);
	return t;
}

function makeDemoContacts(types: ContactType[]): Contact[] {
	const now = iso(new Date());
	const row = (
		id: string,
		typeName: string,
		display_name: string,
		extra: Partial<Contact> = {}
	): Contact => {
		const t = typeByName(types, typeName);
		return {
			id,
			tenant_id: DEMO_TENANT_ID,
			contact_type_id: t.id,
			contact_type_name: t.name,
			display_name,
			phone: null,
			email: null,
			notes: null,
			is_internal: false,
			usage_count: 0,
			created_at: now,
			updated_at: now,
			...extra
		};
	};

	return [
		row(ATALAY_CONTACT_ID, 'Hasta', 'Atalay Demir', {
			phone: '+905551112233',
			email: 'atalay.demir@example.com',
			notes: 'Hasta dizini kaydı — Case ile bağlı.'
		}),
		row(CONTACT_DEMO_HOTEL_ID, 'Otel', 'Demo Hotel', {
			phone: '+902121112233',
			notes: 'Anlaşma: kahvaltı dahil, geç check-out +200€.'
		}),
		row(CONTACT_MUJDAT_ID, 'Diğer', 'Müjdat Bey', {
			phone: '+905321112233',
			notes: 'P2P / ara ödemeler.'
		}),
		row(CONTACT_SEHMUZ_ID, 'Diğer', 'Sehmuz Bey'),
		row(CONTACT_VEGA_ID, 'Laboratuvar', 'Vega Lab', {
			email: 'ops@vega.demo'
		}),
		row(CONTACT_KLINIK_ID, 'Klinik', 'Klinik Ortak', {
			phone: '+902129998877',
			notes: 'Partner klinik — komisyon %15.'
		}),
		row(CONTACT_TRANSFER_ID, 'Transfer', 'Havaalanı Transfer', {
			phone: '+905559990011'
		}),
		row(CONTACT_INTERNAL_ID, 'İç personel', 'Demo Kullanıcı', {
			email: 'demo@verimaya.app',
			is_internal: true
		}),
		// Duplicate seeds — phone / email / name matches for scan demo
		row(CONTACT_DUP_HOTEL_ID, 'Otel', 'Demo Hotel (eski kayıt)', {
			phone: '0212 111 22 33',
			notes: 'Çift kayıt demosu — aynı telefon (normalize).'
		}),
		row(CONTACT_DUP_ATALAY_EMAIL_ID, 'Hasta', 'A. Demir', {
			email: 'atalay.demir@example.com',
			phone: null,
			notes: 'Çift kayıt demosu — aynı e-posta.'
		}),
		row(CONTACT_DUP_ATALAY_NAME_ID, 'Hasta', 'Atalay Demir', {
			phone: '0555 111 22 33',
			email: null,
			notes: 'Çift kayıt demosu — aynı ad (normalize).'
		})
	];
}

function refreshContactUsage(
	contacts: Contact[],
	appointments: Appointment[],
	transactions: Transaction[]
) {
	for (const c of contacts) {
		let n = 0;
		for (const a of appointments) {
			if (
				a.clinic_contact_id === c.id ||
				a.hotel_contact_id === c.id ||
				a.transfer_contact_id === c.id
			) {
				n += 1;
			}
		}
		for (const t of transactions) {
			if (t.contact_id === c.id) n += 1;
		}
		c.usage_count = n;
	}
}

function linkDirectoryRefs(
	contacts: Contact[],
	appointments: Appointment[],
	transactions: Transaction[],
	patients: Patient[]
) {
	const byName = new Map(contacts.map((c) => [c.display_name, c]));

	for (const t of transactions) {
		if (t.contact_id) continue;
		const label = t.contact_label?.trim();
		if (!label) continue;
		const c = byName.get(label);
		if (c) {
			t.contact_id = c.id;
			t.contact_label = c.display_name;
		}
	}

	for (const a of appointments) {
		if (!a.clinic_contact_id && a.clinic_name) {
			const c = byName.get(a.clinic_name);
			if (c) {
				a.clinic_contact_id = c.id;
				a.clinic_name = c.display_name;
			}
		}
		if (!a.hotel_contact_id && a.hotel_name) {
			const c = byName.get(a.hotel_name);
			if (c) {
				a.hotel_contact_id = c.id;
				a.hotel_name = c.display_name;
			}
		}
	}

	for (const p of patients) {
		if (p.contact_id) continue;
		const c = byName.get(p.full_name);
		if (c && c.contact_type_name === 'Hasta') {
			p.contact_id = c.id;
		}
	}

	refreshContactUsage(contacts, appointments, transactions);
}

function makeFinanceCategories(): FinanceCategory[] {
	const now = iso(new Date());
	const seeds: { kind: 'income' | 'expense'; name: string; subs: string[] }[] = [
		{ kind: 'income', name: 'Operasyon', subs: ['Saç ekimi', 'İmplant', 'Konsültasyon', 'Genel'] },
		{ kind: 'expense', name: 'Operasyon', subs: ['Saç ekimi', 'İmplant', 'Konsültasyon', 'Genel'] },
		{ kind: 'expense', name: 'Konaklama', subs: ['Otel', 'Extra gece', 'Erken check-in'] },
		{ kind: 'expense', name: 'Transfer', subs: ['Havalimanı', 'Şehir içi', 'Şehirler arası'] },
		{ kind: 'expense', name: 'Pazarlama', subs: ['Meta Ads', 'Google Ads', 'Ajans'] },
		{ kind: 'income', name: 'Diğer', subs: ['Genel'] }
	];
	return seeds.map((s, i) => ({
		id: faker.string.uuid(),
		tenant_id: DEMO_TENANT_ID,
		kind: s.kind,
		name: s.name,
		sort_order: i,
		subcategories: s.subs,
		created_at: now,
		updated_at: now
	}));
}

function makeAppointmentTypes(): AppointmentTypeSetting[] {
	return ['Konsültasyon', 'Tedavi', 'Kontrol', 'Transfer'].map((name, i) => ({
		id: faker.string.uuid(),
		tenant_id: DEMO_TENANT_ID,
		name,
		sort_order: i
	}));
}

function makeApiKeys(): ApiKey[] {
	return [
		{
			id: faker.string.uuid(),
			tenant_id: DEMO_TENANT_ID,
			name: 'n8n entegrasyonu',
			key_prefix: 'vk_demo123',
			scopes: ['read', 'write'],
			created_at: iso(faker.date.recent({ days: 30 })),
			revoked_at: null
		}
	];
}

function makeWebhookSubscriptions(): WebhookSubscription[] {
	return [
		{
			id: faker.string.uuid(),
			tenant_id: DEMO_TENANT_ID,
			url: 'https://n8n.example.com/webhook/verimaya-demo',
			event_types: ['transaction.created', 'patient.created'],
			active: true,
			created_at: iso(faker.date.recent({ days: 20 }))
		}
	];
}

function daysAgo(days: number, hour = 10): Date {
	const d = new Date();
	d.setDate(d.getDate() - days);
	d.setHours(hour, 0, 0, 0);
	return d;
}

function isoDayLocal(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Demo ad spend for Gerçek ROAS — ~30 gün, meta/google karışık.
 * Toplam harcama birkaç bin ₺ (kuruş minor).
 */
function makeAdMetricsDaily(): AdMetric[] {
	const rows: AdMetric[] = [];
	const campaigns = [
		{ provider: 'meta' as const, campaign_id: 'meta-leadgen-tr' },
		{ provider: 'meta' as const, campaign_id: 'meta-retarget' },
		{ provider: 'google' as const, campaign_id: 'google-search-brand' }
	];
	// Deterministic-ish spends so "Bu ay" totals look realistic (~4–6 bin ₺).
	const spendPattern = [
		42_500, 38_000, 55_000, 29_500, 61_000, 47_200, 33_800, 52_400, 44_100, 36_700, 58_900,
		41_200, 49_600, 27_300, 53_000
	];

	for (let i = 0; i < spendPattern.length; i++) {
		const day = daysAgo(i * 2 + 1);
		const camp = campaigns[i % campaigns.length]!;
		const spend = spendPattern[i]!;
		rows.push({
			id: faker.string.uuid(),
			tenant_id: DEMO_TENANT_ID,
			provider: camp.provider,
			date: isoDayLocal(day),
			campaign_id: camp.campaign_id,
			spend_minor: spend,
			impressions: Math.round(spend / 8) + 200,
			clicks: Math.round(spend / 900) + 12
		});
	}
	return rows;
}

function makeAtalaySeed(): {
	patient: Patient;
	appointments: Appointment[];
	transactions: Transaction[];
	files: PatientFile[];
	caseNotes: PatientCaseNote[];
} {
	const patient = makePatient({
		id: ATALAY_PATIENT_ID,
		full_name: 'Atalay Demir',
		phone: '+905551112233',
		email: 'atalay.demir@example.com',
		status: 'follow_up',
		source: 'WhatsApp',
		notes: 'Demo hasta — 5 ziyaret + dosya/finans özeti için sabit kayıt.',
		assigned_user_id: DEMO_USER_ID,
		contact_id: ATALAY_CONTACT_ID,
		created_at: iso(daysAgo(120, 9)),
		updated_at: iso(daysAgo(3, 14))
	});

	const visitSpecs: {
		id: string;
		offsetDays: number;
		title: string;
		type: string;
		status: Appointment['status'];
		hour: number;
	}[] = [
		{
			id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			offsetDays: -95,
			title: 'İlk konsültasyon',
			type: 'Konsültasyon',
			status: 'completed',
			hour: 11
		},
		{
			id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
			offsetDays: -70,
			title: 'Tedavi günü',
			type: 'Tedavi',
			status: 'completed',
			hour: 9
		},
		{
			id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
			offsetDays: -40,
			title: '1. kontrol',
			type: 'Kontrol',
			status: 'completed',
			hour: 14
		},
		{
			id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4',
			offsetDays: -12,
			title: '2. kontrol',
			type: 'Kontrol',
			status: 'completed',
			hour: 10
		},
		{
			id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5',
			offsetDays: 5,
			title: 'Takip randevusu',
			type: 'Kontrol',
			status: 'confirmed',
			hour: 15
		}
	];

	const appointments = visitSpecs.map((v) => {
		const start =
			v.offsetDays <= 0
				? daysAgo(-v.offsetDays, v.hour)
				: (() => {
						const d = new Date();
						d.setDate(d.getDate() + v.offsetDays);
						d.setHours(v.hour, 0, 0, 0);
						return d;
					})();
		const end = new Date(start.getTime() + 90 * 60_000);
		return makeAppointment(patient, {
			id: v.id,
			title: v.title,
			appointment_type: v.type,
			status: v.status,
			starts_at: iso(start),
			ends_at: iso(end),
			clinic_name: 'Klinik Ortak',
			hotel_name: v.type === 'Tedavi' ? 'Demo Hotel' : null,
			clinic_contact_id: CONTACT_KLINIK_ID,
			hotel_contact_id: v.type === 'Tedavi' ? CONTACT_DEMO_HOTEL_ID : null,
			transfer_contact_id: v.type === 'Tedavi' ? CONTACT_TRANSFER_ID : null,
			transfer_note: v.type === 'Tedavi' ? '08:30 havalimanı → otel → klinik' : null,
			notes: v.status === 'completed' ? 'Ziyaret tamamlandı.' : 'Planlı takip.',
			created_at: iso(new Date(start.getTime() - 3 * 86400_000)),
			updated_at: iso(start)
		});
	});

	const apptLabel = (a: Appointment) => `${a.starts_at.slice(0, 10)} · ${a.title ?? 'Randevu'}`;

	const transactions: Transaction[] = [
		makeTransaction(patient, {
			kind: 'income',
			title: 'Depozito',
			category: 'Operasyon',
			subtitle: 'Saç ekimi',
			amount: 15_000_00,
			paid_amount: 15_000_00,
			status: 'paid',
			currency: 'TRY',
			occurred_on: daysAgo(94).toISOString().slice(0, 10),
			payment_method: 'Havale'
		}),
		makeTransaction(patient, {
			kind: 'income',
			title: 'Paket ödemesi',
			category: 'Operasyon',
			subtitle: 'Saç ekimi',
			amount: 85_000_00,
			paid_amount: 85_000_00,
			status: 'paid',
			currency: 'TRY',
			occurred_on: daysAgo(70).toISOString().slice(0, 10),
			payment_method: 'Kart'
		}),
		makeTransaction(patient, {
			kind: 'expense',
			title: 'Klinik komisyonu',
			category: 'Operasyon',
			subtitle: 'Saç ekimi',
			amount: 12_000_00,
			paid_amount: 12_000_00,
			status: 'paid',
			currency: 'TRY',
			contact_label: 'Klinik Ortak',
			occurred_on: daysAgo(69).toISOString().slice(0, 10)
		}),
		makeTransaction(patient, {
			kind: 'expense',
			title: 'Otel ödemesi',
			category: 'Konaklama',
			subtitle: 'Otel',
			amount: 4_500_00,
			paid_amount: 4_500_00,
			status: 'paid',
			currency: 'TRY',
			contact_label: 'Demo Hotel',
			occurred_on: daysAgo(70).toISOString().slice(0, 10)
		}),
		makeTransaction(patient, {
			kind: 'expense',
			title: 'Transfer',
			category: 'Transfer',
			subtitle: 'Havalimanı',
			amount: 1_800_00,
			paid_amount: 1_800_00,
			status: 'paid',
			currency: 'TRY',
			contact_label: 'Müjdat Bey',
			occurred_on: daysAgo(70).toISOString().slice(0, 10)
		}),
		makeTransaction(patient, {
			kind: 'income',
			title: 'Kontrol ücreti',
			category: 'Operasyon',
			subtitle: 'Konsültasyon',
			amount: 2_500_00,
			paid_amount: 1_000_00,
			status: 'partial',
			currency: 'TRY',
			occurred_on: daysAgo(12).toISOString().slice(0, 10),
			payment_method: 'Nakit'
		})
	];

	const fileSeeds: {
		appointmentIndex: number;
		filename: string;
		mime: string;
		size: number;
		ago: number;
	}[] = [
		{
			appointmentIndex: 0,
			filename: '2025-04-16 - Atalay Demir - pasaport.pdf',
			mime: 'application/pdf',
			size: 420_000,
			ago: 95
		},
		{
			appointmentIndex: 0,
			filename: '2025-04-16 - Atalay Demir - onam-formu.pdf',
			mime: 'application/pdf',
			size: 180_000,
			ago: 95
		},
		{
			appointmentIndex: 1,
			filename: '2025-05-11 - Atalay Demir - once-foto-1.jpg',
			mime: 'image/jpeg',
			size: 2_100_000,
			ago: 70
		},
		{
			appointmentIndex: 1,
			filename: '2025-05-11 - Atalay Demir - once-foto-2.jpg',
			mime: 'image/jpeg',
			size: 1_850_000,
			ago: 70
		},
		{
			appointmentIndex: 1,
			filename: '2025-05-11 - Atalay Demir - klinik-fatura.pdf',
			mime: 'application/pdf',
			size: 95_000,
			ago: 69
		},
		{
			appointmentIndex: 2,
			filename: '2025-06-10 - Atalay Demir - kontrol-notu.pdf',
			mime: 'application/pdf',
			size: 64_000,
			ago: 40
		},
		{
			appointmentIndex: 3,
			filename: '2025-07-08 - Atalay Demir - sonra-foto.jpg',
			mime: 'image/jpeg',
			size: 2_400_000,
			ago: 12
		}
	];

	const files: PatientFile[] = fileSeeds.map((f) => {
		const appointment = appointments[f.appointmentIndex]!;
		return {
			id: faker.string.uuid(),
			tenant_id: DEMO_TENANT_ID,
			patient_id: patient.id,
			appointment_id: appointment.id,
			appointment_label: apptLabel(appointment),
			filename: f.filename,
			mime_type: f.mime,
			size_bytes: f.size,
			uploaded_by_display_name: demoUser.display_name,
			created_at: iso(daysAgo(f.ago, 16))
		};
	});

	const caseNotes: PatientCaseNote[] = [
		{
			id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
			tenant_id: DEMO_TENANT_ID,
			patient_id: patient.id,
			body: 'İlk görüşme: saç ekimi + donör bölge değerlendirmesi. İngilizce konuşuyor.',
			author_display_name: 'Demo Kullanıcı',
			created_at: iso(daysAgo(95, 12))
		},
		{
			id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
			tenant_id: DEMO_TENANT_ID,
			patient_id: patient.id,
			body: 'Tedavi günü: otel transfer 08:30. Klinik’te 2 saat kaldı, sorun yok.',
			author_display_name: 'Operasyon',
			created_at: iso(daysAgo(70, 18))
		},
		{
			id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
			tenant_id: DEMO_TENANT_ID,
			patient_id: patient.id,
			body: '1. kontrol iyi. Şampuan prosedürü anlatıldı. Takip randevusu planlandı.',
			author_display_name: 'Demo Kullanıcı',
			created_at: iso(daysAgo(40, 15))
		}
	];

	return { patient, appointments, transactions, files, caseNotes };
}

function buildStore(scenario: MockScenario): DemoStore {
	seedFaker(scenario);

	if (scenario === 'empty') {
		return {
			tenant: { ...demoTenant },
			tenants: [{ ...demoTenant }],
			patients: [],
			appointments: [],
			transactions: [],
			adMetricsDaily: [],
			inboundMessages: [],
			files: [],
			caseNotes: [],
			contactTypes: [],
			contacts: [],
			financeCategories: [],
			appointmentTypes: [],
			members: [{ ...demoUser }],
			auditLogs: [],
			apiKeys: [],
			webhookSubscriptions: [],
			aiCorrections: []
		};
	}

	const count = scenario === 'large' ? 500 : 48;
	const patients = Array.from({ length: count }, () => makePatient());

	// Edge case: very long display name near the top of the list
	patients[1] = makePatient({
		full_name: LONG_NAME,
		status: 'qualified',
		source: 'WhatsApp',
		notes: 'Uzun isim uç durumu — tablo/kart kırılımını test eder.'
	});

	const atalay = makeAtalaySeed();
	patients[0] = atalay.patient;
	patients.push(
		makePatient({
			id: ATALAY_DUP_PATIENT_ID,
			full_name: 'Atalay Demir',
			phone: '0555 111 22 33',
			email: null,
			status: 'lead',
			source: 'GHL',
			notes: 'Çift kayıt demosu — aynı telefon / aynı ad.',
			assigned_user_id: null,
			contact_id: null,
			created_at: iso(daysAgo(30, 11)),
			updated_at: iso(daysAgo(5, 9))
		})
	);

	const appointmentPatients = patients.slice(1, Math.min(40, patients.length));
	const appointments = [
		...atalay.appointments,
		...appointmentPatients.flatMap((p, i) => {
			if (i % 3 === 0) return [];
			const appt = makeAppointment(p);
			// Ensure a few are "today" for dashboard
			if (i < 5) {
				const start = new Date();
				start.setHours(9 + i, 0, 0, 0);
				const end = new Date(start.getTime() + 90 * 60_000);
				appt.starts_at = iso(start);
				appt.ends_at = iso(end);
				appt.status = i % 2 === 0 ? 'confirmed' : 'scheduled';
			}
			return [appt];
		})
	];

	const transactions = [
		...atalay.transactions,
		...patients
			.slice(1, Math.min(60, patients.length))
			.map((p, i) => makeTransaction(i % 5 === 0 ? null : p))
	];
	// Consistency demo seeds (intentionally incomplete / inconsistent)
	transactions.unshift(
		makeTransaction(patients[0] ?? null, {
			kind: 'income',
			title: 'Hasta tahsilatı',
			category: null,
			contact_label: null,
			status: 'partial',
			amount: 12_500_00,
			paid_amount: 5_000_00
		}),
		makeTransaction(null, {
			kind: 'income',
			title: 'Depozito — hasta seçilmemiş',
			category: 'Operasyon',
			patient_id: null,
			patient_display_name: null,
			amount: 8_000_00,
			status: 'paid',
			paid_amount: 8_000_00
		}),
		makeTransaction(patients[2] ?? patients[0] ?? null, {
			kind: 'expense',
			title: 'Klinik komisyonu',
			category: 'Operasyon',
			contact_label: null,
			amount: 3_200_00,
			status: 'paid',
			paid_amount: 3_200_00
		}),
		makeTransaction(null, {
			kind: 'expense',
			title: 'Otel ödemesi',
			category: 'Konaklama',
			contact_label: 'Demo Hotel',
			status: 'paid',
			paid_amount: null,
			amount: 4_500_00
		})
	);

	// P2P-style contact movements (clear nets for demo) + FX snapshots
	transactions.unshift(
		makeTransaction(null, {
			kind: 'expense',
			title: 'Vega Lab ödemesi',
			category: 'Operasyon',
			contact_label: 'Vega Lab',
			currency: 'EUR',
			amount: 115_000,
			amount_base: 4_140_000,
			base_currency: 'TRY',
			fx_rate: 36,
			fx_dated: iso(new Date()).slice(0, 10),
			status: 'paid',
			paid_amount: 115_000,
			occurred_on: iso(new Date()).slice(0, 10)
		}),
		makeTransaction(null, {
			kind: 'expense',
			title: 'Müjdat — avans',
			category: 'Transfer',
			contact_label: 'Müjdat Bey',
			currency: 'GBP',
			amount: 500_000,
			amount_base: 21_500_000,
			base_currency: 'TRY',
			fx_rate: 43,
			fx_dated: iso(new Date()).slice(0, 10),
			status: 'paid',
			paid_amount: 500_000
		}),
		makeTransaction(null, {
			kind: 'income',
			title: 'Müjdat — iade',
			category: 'Transfer',
			contact_label: 'Müjdat Bey',
			currency: 'GBP',
			amount: 150_000,
			amount_base: 6_450_000,
			base_currency: 'TRY',
			fx_rate: 43,
			fx_dated: iso(new Date()).slice(0, 10),
			status: 'paid',
			paid_amount: 150_000
		}),
		makeTransaction(patients[0] ?? null, {
			kind: 'income',
			title: 'Hasta tahsilatı (GBP)',
			category: 'Operasyon',
			subtitle: 'Saç ekimi',
			currency: 'GBP',
			amount: 2_900_00,
			amount_base: 124_700_00,
			base_currency: 'TRY',
			fx_rate: 43,
			fx_dated: iso(new Date()).slice(0, 10),
			status: 'paid',
			paid_amount: 2_900_00
		}),
		makeTransaction(patients[0] ?? null, {
			kind: 'income',
			title: 'Hasta tahsilatı (EUR) — kur eksik demo',
			category: 'Operasyon',
			subtitle: 'Konsültasyon',
			currency: 'EUR',
			amount: 450_00,
			amount_base: null,
			base_currency: null,
			status: 'paid',
			paid_amount: 450_00
		}),
		makeTransaction(null, {
			kind: 'expense',
			title: 'Sehmuz — nakit',
			category: 'Transfer',
			contact_label: 'Sehmuz Bey',
			currency: 'EUR',
			amount: 200_000,
			amount_base: 7_200_000,
			base_currency: 'TRY',
			fx_rate: 36,
			fx_dated: iso(new Date()).slice(0, 10),
			status: 'paid',
			paid_amount: 200_000
		}),
		makeTransaction(null, {
			kind: 'income',
			title: 'Sehmuz — geri ödeme',
			category: 'Transfer',
			contact_label: 'Sehmuz Bey',
			currency: 'EUR',
			amount: 50_000,
			amount_base: 1_800_000,
			base_currency: 'TRY',
			fx_rate: 36,
			fx_dated: iso(new Date()).slice(0, 10),
			status: 'paid',
			paid_amount: 50_000
		}),
		makeTransaction(null, {
			kind: 'expense',
			title: 'Klinik Ortak — pay',
			category: 'Transfer',
			contact_label: 'Klinik Ortak',
			currency: 'TRY',
			amount: 25_000_00,
			amount_base: 25_000_00,
			base_currency: 'TRY',
			fx_rate: 1,
			status: 'paid',
			paid_amount: 25_000_00
		}),
		makeTransaction(null, {
			kind: 'income',
			title: 'Klinik Ortak — tahsilat',
			category: 'Transfer',
			contact_label: 'Klinik Ortak',
			currency: 'TRY',
			amount: 10_000_00,
			amount_base: 10_000_00,
			base_currency: 'TRY',
			fx_rate: 1,
			status: 'paid',
			paid_amount: 10_000_00
		})
	);

	const inboundMessages = makeInboundMessages();

	const extraTenants = makeExtraTenants();
	const tenants = [{ ...demoTenant }, ...extraTenants];
	const members = makeDevMembers(tenants);
	const auditLogs = makeAuditLogs(
		members.filter((m) => m.tenant_id === DEMO_TENANT_ID),
		patients,
		transactions
	);

	// Bias dates so "Bu ay" / "Geçen ay" period filters always have demo data
	const now = new Date();
	const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
	const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);
	const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
	transactions.forEach((t, i) => {
		if (i % 3 === 0) {
			t.occurred_on = `${thisMonth}-${String(Math.min(28, 5 + (i % 20))).padStart(2, '0')}`;
		} else if (i % 3 === 1) {
			t.occurred_on = `${lastMonth}-${String(Math.min(28, 3 + (i % 22))).padStart(2, '0')}`;
		}
		if (!t.subtitle && t.category) {
			t.subtitle = pickSubtitle(t.category);
		}
		if (t.currency === 'TRY' && t.amount_base == null) {
			t.amount_base = t.amount;
			t.base_currency = 'TRY';
			t.fx_rate = 1;
		}
	});

	const contactTypes = makeContactTypes();
	const contacts = makeDemoContacts(contactTypes);
	linkDirectoryRefs(contacts, appointments, transactions, patients);

	return {
		tenant: { ...demoTenant },
		tenants,
		patients,
		appointments,
		transactions,
		adMetricsDaily: makeAdMetricsDaily(),
		inboundMessages,
		files: atalay.files,
		caseNotes: [
			...atalay.caseNotes,
			...patients.slice(1, 8).flatMap((p) => {
				if (faker.number.float() > 0.55) return [];
				return [
					{
						id: faker.string.uuid(),
						tenant_id: DEMO_TENANT_ID,
						patient_id: p.id,
						body: faker.lorem.sentence(),
						author_display_name: demoUser.display_name,
						created_at: iso(faker.date.recent({ days: 30 }))
					} satisfies PatientCaseNote
				];
			})
		],
		contactTypes,
		contacts,
		financeCategories: makeFinanceCategories(),
		appointmentTypes: makeAppointmentTypes(),
		members,
		auditLogs,
		apiKeys: makeApiKeys(),
		webhookSubscriptions: makeWebhookSubscriptions(),
		aiCorrections: []
	};
}

const cache = new Map<MockScenario, DemoStore>();

export function getStore(scenario: MockScenario = 'default'): DemoStore {
	let store = cache.get(scenario);
	if (!store) {
		store = buildStore(scenario);
		cache.set(scenario, store);
	}
	return store;
}

export function parseScenario(value: string | null): MockScenario {
	if (value === 'empty' || value === 'large' || value === 'default') return value;
	return 'default';
}

export function paginate<T>(
	items: T[],
	cursor: string | null,
	limit: number
): { items: T[]; next_cursor: string | null } {
	const start = cursor ? Number.parseInt(cursor, 10) : 0;
	const safeStart = Number.isFinite(start) && start >= 0 ? start : 0;
	const slice = items.slice(safeStart, safeStart + limit);
	const next = safeStart + limit;
	return {
		items: slice,
		next_cursor: next < items.length ? String(next) : null
	};
}
