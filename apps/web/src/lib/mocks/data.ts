import { faker } from '@faker-js/faker/locale/en';
import type {
	Appointment,
	AuditLog,
	Conversation,
	Message,
	Patient,
	PatientStatus,
	Tenant,
	Transaction,
	MembershipUser,
	UserRole
} from '@verimaya/shared';

export type MockScenario = 'default' | 'empty' | 'large';

export const DEMO_TENANT_ID = '11111111-1111-4111-8111-111111111111';
export const DEMO_USER_ID = '22222222-2222-4222-8222-222222222222';

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
		clinic_name: faker.helpers.maybe(() => 'İstanbul Klinik', { probability: 0.7 }) ?? null,
		hotel_name: faker.helpers.maybe(() => 'Demo Hotel', { probability: 0.4 }) ?? null,
		transfer_note: null,
		notes: null,
		created_at: iso(faker.date.recent({ days: 30 })),
		updated_at: iso(new Date()),
		...overrides
	};
}

function makeTransaction(
	patient: Patient | null,
	overrides: Partial<Transaction> = {}
): Transaction {
	const kind = faker.helpers.arrayElement(['income', 'expense'] as const);
	const amount = faker.number.int({ min: 5_000_00, max: 250_000_00 });
	const status = faker.helpers.arrayElement(['paid', 'partial', 'unpaid'] as const);
	return {
		id: faker.string.uuid(),
		tenant_id: DEMO_TENANT_ID,
		kind,
		title:
			kind === 'income'
				? faker.helpers.arrayElement(['Hasta tahsilatı', 'Depozito', 'Paket ödemesi'])
				: faker.helpers.arrayElement(['Klinik komisyonu', 'Otel ödemesi', 'Transfer']),
		subtitle: patient?.full_name ?? null,
		category: faker.helpers.arrayElement(['Operasyon', 'Konaklama', 'Transfer', 'Pazarlama']),
		occurred_on: iso(faker.date.recent({ days: 60 })).slice(0, 10),
		status,
		invoice_status: faker.helpers.arrayElement(['none', 'issued', 'not_issued'] as const),
		payment_method: faker.helpers.arrayElement(['Havale', 'Nakit', 'Kart', null]),
		amount,
		paid_amount: status === 'paid' ? amount : status === 'partial' ? Math.floor(amount / 2) : null,
		currency: 'TRY',
		patient_id: patient?.id ?? null,
		patient_display_name: patient?.full_name ?? null,
		contact_label: null,
		description: null,
		created_at: iso(faker.date.recent({ days: 60 })),
		updated_at: iso(new Date()),
		...overrides
	};
}

function makeConversation(
	patient: Patient | null,
	overrides: Partial<Conversation> = {}
): Conversation {
	const lastAt = faker.date.recent({ days: 7 });
	return {
		id: faker.string.uuid(),
		tenant_id: DEMO_TENANT_ID,
		patient_id: patient?.id ?? null,
		patient_display_name: patient?.full_name ?? null,
		channel: 'whatsapp',
		external_chat_id: `90${faker.string.numeric(10)}@s.whatsapp.net`,
		contact_name: patient?.full_name ?? faker.person.fullName(),
		contact_phone: patient?.phone ?? `+90${faker.string.numeric(10)}`,
		status: faker.helpers.arrayElement(['open', 'pending', 'resolved'] as const),
		assigned_user_id: DEMO_USER_ID,
		last_message_preview: faker.lorem.sentence({ min: 4, max: 12 }),
		last_message_at: iso(lastAt),
		unread_count: faker.number.int({ min: 0, max: 5 }),
		created_at: iso(faker.date.recent({ days: 30 })),
		updated_at: iso(lastAt),
		...overrides
	};
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
	patients: Patient[];
	appointments: Appointment[];
	transactions: Transaction[];
	conversations: Conversation[];
	messages: Message[];
	members: MembershipUser[];
	auditLogs: AuditLog[];
};

function buildStore(scenario: MockScenario): DemoStore {
	seedFaker(scenario);

	if (scenario === 'empty') {
		return {
			tenant: { ...demoTenant },
			patients: [],
			appointments: [],
			transactions: [],
			conversations: [],
			messages: [],
			members: [{ ...demoUser }],
			auditLogs: []
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

	const appointmentPatients = patients.slice(0, Math.min(40, patients.length));
	const appointments = appointmentPatients.flatMap((p, i) => {
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
	});

	const transactions = patients
		.slice(0, Math.min(60, patients.length))
		.map((p, i) => makeTransaction(i % 5 === 0 ? null : p));

	const conversations = patients
		.slice(0, Math.min(24, patients.length))
		.map((p) => makeConversation(p));

	const messages: Message[] = conversations.flatMap((c) => {
		const n = faker.number.int({ min: 2, max: 6 });
		return Array.from({ length: n }, (_, i) => {
			const sent = new Date(c.last_message_at ?? c.created_at);
			sent.setMinutes(sent.getMinutes() - (n - i) * 12);
			return {
				id: faker.string.uuid(),
				tenant_id: DEMO_TENANT_ID,
				conversation_id: c.id,
				direction: i % 2 === 0 ? ('inbound' as const) : ('outbound' as const),
				status: 'delivered' as const,
				body: faker.lorem.sentences({ min: 1, max: 2 }),
				has_media: false,
				external_message_id: faker.string.alphanumeric(16),
				sent_at: iso(sent),
				created_at: iso(sent)
			};
		});
	});

	const members = makeMembers();
	const auditLogs = makeAuditLogs(members, patients, transactions);

	return {
		tenant: { ...demoTenant },
		patients,
		appointments,
		transactions,
		conversations,
		messages,
		members,
		auditLogs
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
