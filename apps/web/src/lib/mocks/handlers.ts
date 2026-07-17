import { http, HttpResponse } from 'msw';
import {
	patientCreateSchema,
	patientUpdateSchema,
	appointmentCreateSchema,
	appointmentUpdateSchema,
	transactionCreateSchema,
	transactionUpdateSchema,
	tenantUpdateSchema,
	type Appointment,
	type Patient,
	type Tenant,
	type Transaction
} from '@verimaya/shared';
import {
	DEMO_TENANT_ID,
	demoUser,
	getStore,
	paginate,
	parseScenario,
	type MockScenario
} from './data';

function scenarioFrom(request: Request): MockScenario {
	const url = new URL(request.url);
	const fromQuery = url.searchParams.get('scenario');
	if (fromQuery) return parseScenario(fromQuery);

	const header = request.headers.get('x-mock-scenario');
	if (header) return parseScenario(header);

	if (typeof sessionStorage !== 'undefined') {
		return parseScenario(sessionStorage.getItem('verimaya:mock-scenario'));
	}
	return 'default';
}

function limitFrom(url: URL): number {
	const n = Number(url.searchParams.get('limit') ?? '25');
	return Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 25;
}

function badRequest(message: string, details?: unknown) {
	return HttpResponse.json(
		{
			error: { code: 'validation_error', message, details },
			request_id: crypto.randomUUID()
		},
		{ status: 400 }
	);
}

function notFound(message: string) {
	return HttpResponse.json(
		{
			error: { code: 'not_found', message },
			request_id: crypto.randomUUID()
		},
		{ status: 404 }
	);
}

function nowIso() {
	return new Date().toISOString();
}

export const handlers = [
	http.get('/v1/me', () => HttpResponse.json(demoUser)),

	http.get('/v1/tenants/current', ({ request }) =>
		HttpResponse.json(getStore(scenarioFrom(request)).tenant)
	),

	http.patch('/v1/tenants/current', async ({ request }) => {
		const body = await request.json();
		const parsed = tenantUpdateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz tenant verisi', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const updated: Tenant = { ...store.tenant, ...parsed.data };
		store.tenant = updated;
		return HttpResponse.json(updated);
	}),

	http.get('/v1/members', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json(
			paginate(store.members, url.searchParams.get('cursor'), limitFrom(url))
		);
	}),

	http.get('/v1/audit-logs', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json(
			paginate(store.auditLogs, url.searchParams.get('cursor'), limitFrom(url))
		);
	}),

	http.get('/v1/search', ({ request }) => {
		const url = new URL(request.url);
		const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
		if (q.length < 2) {
			return HttpResponse.json({ patients: [], appointments: [], transactions: [] });
		}
		const store = getStore(scenarioFrom(request));
		const patients = store.patients
			.filter(
				(p) =>
					p.full_name.toLowerCase().includes(q) ||
					(p.email?.toLowerCase().includes(q) ?? false) ||
					(p.phone?.includes(q) ?? false)
			)
			.slice(0, 8);
		const appointments = store.appointments
			.filter(
				(a) =>
					a.patient_display_name.toLowerCase().includes(q) ||
					(a.title?.toLowerCase().includes(q) ?? false) ||
					(a.appointment_type?.toLowerCase().includes(q) ?? false)
			)
			.slice(0, 6);
		const transactions = store.transactions
			.filter(
				(t) =>
					t.title.toLowerCase().includes(q) ||
					(t.patient_display_name?.toLowerCase().includes(q) ?? false) ||
					(t.category?.toLowerCase().includes(q) ?? false)
			)
			.slice(0, 6);
		return HttpResponse.json({ patients, appointments, transactions });
	}),

	http.get('/v1/patients', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
		let items = store.patients;
		if (q) {
			items = items.filter(
				(p) =>
					p.full_name.toLowerCase().includes(q) ||
					(p.email?.toLowerCase().includes(q) ?? false) ||
					(p.phone?.includes(q) ?? false)
			);
		}
		return HttpResponse.json(paginate(items, url.searchParams.get('cursor'), limitFrom(url)));
	}),

	http.get('/v1/patients/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const patient = store.patients.find((p) => p.id === params.id);
		if (!patient) return notFound('Hasta bulunamadı');
		return HttpResponse.json(patient);
	}),

	http.post('/v1/patients', async ({ request }) => {
		const body = await request.json();
		const parsed = patientCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz hasta verisi', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const now = nowIso();
		const patient: Patient = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			...parsed.data,
			created_at: now,
			updated_at: now
		};
		store.patients.unshift(patient);
		return HttpResponse.json(patient, { status: 201 });
	}),

	http.patch('/v1/patients/:id', async ({ params, request }) => {
		const body = await request.json();
		const parsed = patientUpdateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz hasta verisi', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const idx = store.patients.findIndex((p) => p.id === params.id);
		if (idx < 0) return notFound('Hasta bulunamadı');
		const updated: Patient = {
			...store.patients[idx],
			...parsed.data,
			updated_at: nowIso()
		};
		store.patients[idx] = updated;
		for (const a of store.appointments) {
			if (a.patient_id === updated.id) a.patient_display_name = updated.full_name;
		}
		for (const t of store.transactions) {
			if (t.patient_id === updated.id) t.patient_display_name = updated.full_name;
		}
		return HttpResponse.json(updated);
	}),

	http.get('/v1/appointments', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		let items = [...store.appointments];
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		if (from) items = items.filter((a) => a.starts_at >= from);
		if (to) items = items.filter((a) => a.starts_at <= to);
		items.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
		return HttpResponse.json(paginate(items, url.searchParams.get('cursor'), limitFrom(url)));
	}),

	http.get('/v1/appointments/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const item = store.appointments.find((a) => a.id === params.id);
		if (!item) return notFound('Randevu bulunamadı');
		return HttpResponse.json(item);
	}),

	http.post('/v1/appointments', async ({ request }) => {
		const body = await request.json();
		const parsed = appointmentCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz randevu verisi', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const patient = store.patients.find((p) => p.id === parsed.data.patient_id);
		if (!patient) return badRequest('Hasta bulunamadı');
		const now = nowIso();
		const appointment: Appointment = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			patient_display_name: patient.full_name,
			...parsed.data,
			created_at: now,
			updated_at: now
		};
		store.appointments.push(appointment);
		return HttpResponse.json(appointment, { status: 201 });
	}),

	http.patch('/v1/appointments/:id', async ({ params, request }) => {
		const body = await request.json();
		const parsed = appointmentUpdateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz randevu verisi', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const idx = store.appointments.findIndex((a) => a.id === params.id);
		if (idx < 0) return notFound('Randevu bulunamadı');
		const nextPatientId = parsed.data.patient_id ?? store.appointments[idx].patient_id;
		const patient = store.patients.find((p) => p.id === nextPatientId);
		const updated: Appointment = {
			...store.appointments[idx],
			...parsed.data,
			patient_display_name: patient?.full_name ?? store.appointments[idx].patient_display_name,
			updated_at: nowIso()
		};
		store.appointments[idx] = updated;
		return HttpResponse.json(updated);
	}),

	http.get('/v1/transactions', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const sorted = [...store.transactions].sort((a, b) =>
			b.occurred_on.localeCompare(a.occurred_on)
		);
		return HttpResponse.json(paginate(sorted, url.searchParams.get('cursor'), limitFrom(url)));
	}),

	http.get('/v1/transactions/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const item = store.transactions.find((t) => t.id === params.id);
		if (!item) return notFound('İşlem bulunamadı');
		return HttpResponse.json(item);
	}),

	http.post('/v1/transactions', async ({ request }) => {
		const body = await request.json();
		const parsed = transactionCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz işlem verisi', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const patient = parsed.data.patient_id
			? store.patients.find((p) => p.id === parsed.data.patient_id)
			: null;
		const now = nowIso();
		const transaction: Transaction = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			patient_display_name: patient?.full_name ?? null,
			...parsed.data,
			created_at: now,
			updated_at: now
		};
		store.transactions.unshift(transaction);
		return HttpResponse.json(transaction, { status: 201 });
	}),

	http.patch('/v1/transactions/:id', async ({ params, request }) => {
		const body = await request.json();
		const parsed = transactionUpdateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz işlem verisi', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const idx = store.transactions.findIndex((t) => t.id === params.id);
		if (idx < 0) return notFound('İşlem bulunamadı');
		const nextPatientId =
			parsed.data.patient_id !== undefined
				? parsed.data.patient_id
				: store.transactions[idx].patient_id;
		const patient = nextPatientId ? store.patients.find((p) => p.id === nextPatientId) : null;
		const updated: Transaction = {
			...store.transactions[idx],
			...parsed.data,
			patient_display_name:
				nextPatientId === null
					? null
					: (patient?.full_name ?? store.transactions[idx].patient_display_name),
			updated_at: nowIso()
		};
		store.transactions[idx] = updated;
		return HttpResponse.json(updated);
	}),

	http.get('/v1/conversations', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const sorted = [...store.conversations].sort((a, b) =>
			(b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')
		);
		return HttpResponse.json(paginate(sorted, url.searchParams.get('cursor'), limitFrom(url)));
	}),

	http.get('/v1/conversations/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const item = store.conversations.find((c) => c.id === params.id);
		if (!item) return notFound('Konuşma bulunamadı');
		return HttpResponse.json(item);
	}),

	http.get('/v1/conversations/:id/messages', ({ params, request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const messages = store.messages
			.filter((m) => m.conversation_id === params.id)
			.sort((a, b) => a.sent_at.localeCompare(b.sent_at));
		return HttpResponse.json(paginate(messages, url.searchParams.get('cursor'), limitFrom(url)));
	})
];
