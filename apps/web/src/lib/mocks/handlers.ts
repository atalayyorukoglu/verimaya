import { http, HttpResponse } from 'msw';
import {
	patientCreateSchema,
	patientUpdateSchema,
	appointmentCreateSchema,
	appointmentUpdateSchema,
	transactionCreateSchema,
	transactionUpdateSchema,
	tenantUpdateSchema,
	whatsappParseRequestSchema,
	patientFileCreateSchema,
	patientCaseNoteCreateSchema,
	contactTypeCreateSchema,
	contactCreateSchema,
	contactUpdateSchema,
	financeCategoryCreateSchema,
	financeCategoryUpdateSchema,
	mergeRecordsSchema,
	userRoleSchema,
	type Appointment,
	type AppointmentTypeSetting,
	type Contact,
	type ContactType,
	type FinanceCategory,
	type MembershipUser,
	type Patient,
	type PatientCaseNote,
	type PatientFile,
	type Tenant,
	type Transaction,
	type TransactionDraft
} from '@verimaya/shared';
import { parseWhatsappMessage } from './whatsapp-parse';
import { findContactDuplicateGroups, findPatientDuplicateGroups } from './duplicates';
import {
	DEMO_TENANT_ID,
	DEMO_USER_ID,
	demoTenant,
	demoUser,
	getStore,
	paginate,
	parseScenario,
	type MockScenario
} from './data';

function nowIso() {
	return new Date().toISOString();
}

function appointmentLabel(a: Appointment): string {
	return `${a.starts_at.slice(0, 10)} · ${a.title ?? 'Randevu'}`;
}

function refreshUsage(store: ReturnType<typeof getStore>) {
	for (const c of store.contacts) {
		let n = 0;
		for (const a of store.appointments) {
			if (
				a.clinic_contact_id === c.id ||
				a.hotel_contact_id === c.id ||
				a.transfer_contact_id === c.id
			) {
				n += 1;
			}
		}
		for (const t of store.transactions) {
			if (t.contact_id === c.id) n += 1;
		}
		c.usage_count = n;
	}
}

function resolvePartyNames<T extends Partial<Appointment>>(
	store: ReturnType<typeof getStore>,
	data: T
): T {
	const next = { ...data };
	if (next.clinic_contact_id) {
		const c = store.contacts.find((x) => x.id === next.clinic_contact_id);
		if (c) next.clinic_name = c.display_name;
	}
	if (next.hotel_contact_id) {
		const c = store.contacts.find((x) => x.id === next.hotel_contact_id);
		if (c) next.hotel_name = c.display_name;
	}
	return next;
}

function resolveTxContact<T extends Partial<Transaction>>(
	store: ReturnType<typeof getStore>,
	data: T
): T {
	const next = { ...data };
	if (next.contact_id) {
		const c = store.contacts.find((x) => x.id === next.contact_id);
		if (c) next.contact_label = c.display_name;
	}
	return next;
}

function normalizeTxFx(
	store: ReturnType<typeof getStore>,
	data: Partial<Transaction>
): Partial<Transaction> {
	const base = store.tenant.base_currency;
	const currency = data.currency ?? 'TRY';
	const amount = data.amount;
	if (currency === base && amount != null) {
		return {
			...data,
			currency,
			amount_base: data.amount_base ?? amount,
			base_currency: base,
			fx_rate: data.fx_rate ?? 1,
			fx_dated: data.fx_dated ?? data.occurred_on ?? null
		};
	}
	return {
		...data,
		currency,
		base_currency: data.base_currency ?? base
	};
}

function amountInBaseMock(tx: Transaction, tenantBase: string): number | null {
	if (tx.currency === tenantBase) {
		return tx.amount_base ?? tx.amount;
	}
	if (tx.amount_base != null) {
		return tx.amount_base;
	}
	return null;
}

function filterTransactionsByPeriod(
	items: Transaction[],
	from: string | null,
	to: string | null
): Transaction[] {
	let filtered = items;
	if (from) filtered = filtered.filter((t) => t.occurred_on >= from);
	if (to) filtered = filtered.filter((t) => t.occurred_on <= to);
	return filtered;
}

function buildReportSummary(
	store: ReturnType<typeof getStore>,
	from: string | null,
	to: string | null
) {
	const base = store.tenant.base_currency;
	const rows = filterTransactionsByPeriod(store.transactions, from, to);
	let incomeBase = 0;
	let expenseBase = 0;
	for (const t of rows) {
		const amount = amountInBaseMock(t, base);
		if (amount == null) continue;
		if (t.kind === 'income') incomeBase += amount;
		else expenseBase += amount;
	}
	return {
		period: { from, to },
		income_base: incomeBase,
		expense_base: expenseBase,
		net_base: incomeBase - expenseBase,
		transaction_count: rows.length
	};
}

function buildReportByCategory(
	store: ReturnType<typeof getStore>,
	from: string | null,
	to: string | null
) {
	const base = store.tenant.base_currency;
	const rows = filterTransactionsByPeriod(store.transactions, from, to);
	const map = new Map<
		string,
		{ income_base: number; expense_base: number; transaction_count: number }
	>();
	for (const t of rows) {
		const label = (t.category || 'Kategorisiz').trim() || 'Kategorisiz';
		const cur = map.get(label) ?? { income_base: 0, expense_base: 0, transaction_count: 0 };
		cur.transaction_count += 1;
		const amount = amountInBaseMock(t, base);
		if (amount != null) {
			if (t.kind === 'income') cur.income_base += amount;
			else cur.expense_base += amount;
		}
		map.set(label, cur);
	}
	const items = [...map.entries()]
		.map(([category_name, v]) => ({
			category_name,
			income_base: v.income_base,
			expense_base: v.expense_base,
			net_base: v.income_base - v.expense_base,
			transaction_count: v.transaction_count
		}))
		.sort((a, b) => Math.abs(b.net_base) - Math.abs(a.net_base));
	return { period: { from, to }, items };
}

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
		const items = store.members.filter((m) => m.tenant_id === store.tenant.id);
		return HttpResponse.json(paginate(items, url.searchParams.get('cursor'), limitFrom(url)));
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

	http.get('/v1/patients/duplicate-groups', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json({ items: findPatientDuplicateGroups(store.patients) });
	}),

	http.post('/v1/patients/merge', async ({ request }) => {
		const body = await request.json();
		const parsed = mergeRecordsSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz birleştirme', parsed.error.flatten());
		const { keep_id, merge_ids } = parsed.data;
		if (merge_ids.includes(keep_id)) return badRequest('keep_id birleştirilecek listede olamaz');
		const store = getStore(scenarioFrom(request));
		const keep = store.patients.find((p) => p.id === keep_id);
		if (!keep) return notFound('Hedef hasta bulunamadı');
		const sources = merge_ids.map((id) => store.patients.find((p) => p.id === id));
		if (sources.some((p) => !p)) return notFound('Birleştirilecek hasta bulunamadı');

		for (const src of sources) {
			if (!src) continue;
			if (!keep.phone && src.phone) keep.phone = src.phone;
			if (!keep.email && src.email) keep.email = src.email;
			if (!keep.notes && src.notes) keep.notes = src.notes;
			if (!keep.contact_id && src.contact_id) keep.contact_id = src.contact_id;
			if (!keep.source && src.source) keep.source = src.source;
		}
		keep.updated_at = nowIso();

		const drop = new Set(merge_ids);
		for (const a of store.appointments) {
			if (a.patient_id && drop.has(a.patient_id)) {
				a.patient_id = keep_id;
				a.patient_display_name = keep.full_name;
			}
		}
		for (const t of store.transactions) {
			if (t.patient_id && drop.has(t.patient_id)) {
				t.patient_id = keep_id;
				t.patient_display_name = keep.full_name;
			}
		}
		for (const f of store.files) {
			if (drop.has(f.patient_id)) f.patient_id = keep_id;
		}
		for (const n of store.caseNotes) {
			if (drop.has(n.patient_id)) n.patient_id = keep_id;
		}
		store.patients = store.patients.filter((p) => !drop.has(p.id));
		return HttpResponse.json(keep);
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
		const patientId = url.searchParams.get('patient_id');
		if (patientId) items = items.filter((a) => a.patient_id === patientId);
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
		const resolved = resolvePartyNames(store, parsed.data);
		const appointment: Appointment = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			patient_display_name: patient.full_name,
			...resolved,
			created_at: now,
			updated_at: now
		} as Appointment;
		store.appointments.push(appointment);
		refreshUsage(store);
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
		const resolved = resolvePartyNames(store, parsed.data);
		const updated: Appointment = {
			...store.appointments[idx],
			...resolved,
			patient_display_name: patient?.full_name ?? store.appointments[idx].patient_display_name,
			updated_at: nowIso()
		};
		store.appointments[idx] = updated;
		refreshUsage(store);
		return HttpResponse.json(updated);
	}),

	http.get('/v1/transactions', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		let items = [...store.transactions];
		const patientId = url.searchParams.get('patient_id');
		if (patientId) items = items.filter((t) => t.patient_id === patientId);
		const contactId = url.searchParams.get('contact_id');
		if (contactId) items = items.filter((t) => t.contact_id === contactId);
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		if (from) items = items.filter((t) => t.occurred_on >= from);
		if (to) items = items.filter((t) => t.occurred_on <= to);
		const sorted = items.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
		return HttpResponse.json(paginate(sorted, url.searchParams.get('cursor'), limitFrom(url)));
	}),

	http.get('/v1/transactions/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const item = store.transactions.find((t) => t.id === params.id);
		if (!item) return notFound('İşlem bulunamadı');
		return HttpResponse.json(item);
	}),

	http.get('/v1/reports/summary', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		return HttpResponse.json(buildReportSummary(store, from, to));
	}),

	http.get('/v1/reports/by-category', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		return HttpResponse.json(buildReportByCategory(store, from, to));
	}),

	http.post('/v1/transactions', async ({ request }) => {
		const body = await request.json();
		const parsed = transactionCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz işlem verisi', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const patient = parsed.data.patient_id
			? store.patients.find((p) => p.id === parsed.data.patient_id)
			: null;
		const base = store.tenant.base_currency;
		const currency = parsed.data.currency ?? 'TRY';
		if (currency !== base && (parsed.data.amount_base == null || parsed.data.amount_base <= 0)) {
			return badRequest(
				`Yabancı para (${currency}) için baz tutar (${base}) zorunlu — amount_base girin`
			);
		}
		const now = nowIso();
		const resolved = normalizeTxFx(store, resolveTxContact(store, parsed.data));
		const transaction: Transaction = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			patient_display_name: patient?.full_name ?? null,
			...resolved,
			created_at: now,
			updated_at: now
		} as Transaction;
		store.transactions.unshift(transaction);
		refreshUsage(store);
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
		const merged = { ...store.transactions[idx], ...parsed.data };
		const base = store.tenant.base_currency;
		const currency = merged.currency ?? 'TRY';
		if (currency !== base && (merged.amount_base == null || merged.amount_base <= 0)) {
			return badRequest(
				`Yabancı para (${currency}) için baz tutar (${base}) zorunlu — amount_base girin`
			);
		}
		const resolved = normalizeTxFx(store, resolveTxContact(store, parsed.data));
		const updated: Transaction = {
			...store.transactions[idx],
			...resolved,
			patient_display_name:
				nextPatientId === null
					? null
					: (patient?.full_name ?? store.transactions[idx].patient_display_name),
			updated_at: nowIso()
		};
		store.transactions[idx] = updated;
		refreshUsage(store);
		return HttpResponse.json(updated);
	}),

	http.post('/v1/whatsapp/parse', async ({ request }) => {
		const body = await request.json();
		const parsed = whatsappParseRequestSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz mesaj', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const records = parseWhatsappMessage(parsed.data.message, store.patients);
		return HttpResponse.json({ records });
	}),

	http.get('/v1/whatsapp/inbox', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const messages = store.inboundMessages
			.filter((m) => m.status === 'new' || m.status === 'parsed')
			.sort((a, b) => b.created_at.localeCompare(a.created_at));
		return HttpResponse.json({ messages });
	}),

	http.get('/v1/whatsapp/inbox/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const item = store.inboundMessages.find((m) => m.id === params.id);
		if (!item) return notFound('Mesaj bulunamadı');
		return HttpResponse.json(item);
	}),

	http.post('/v1/whatsapp/inbox/process', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		let processed = 0;
		let parsed = 0;
		let error = 0;
		for (const msg of store.inboundMessages) {
			if (msg.status !== 'new' || !msg.body?.trim()) continue;
			processed++;
			const records = parseWhatsappMessage(msg.body, store.patients);
			if (records.length === 0) {
				msg.parse_error = 'Ayrıştırılamadı';
				msg.status = 'parsed';
				error++;
			} else {
				msg.parsed_records = records;
				msg.parse_error = null;
				msg.status = 'parsed';
				parsed++;
			}
		}
		return HttpResponse.json({ processed, parsed, error });
	}),

	http.post('/v1/whatsapp/inbox/:id/ignore', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const item = store.inboundMessages.find((m) => m.id === params.id);
		if (!item) return notFound('Mesaj bulunamadı');
		item.status = 'ignored';
		return HttpResponse.json({ success: true, id: item.id, status: item.status });
	}),

	http.post('/v1/whatsapp/inbox/:id/approve', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const item = store.inboundMessages.find((m) => m.id === params.id);
		if (!item) return notFound('Mesaj bulunamadı');
		item.status = 'approved';
		return HttpResponse.json({ success: true, id: item.id, status: item.status });
	}),

	http.post('/v1/whatsapp/inbox/:id/parse', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const item = store.inboundMessages.find((m) => m.id === params.id);
		if (!item) return notFound('Mesaj bulunamadı');
		if (!item.body?.trim()) {
			item.parse_error = 'Medya mesajı — metin yok';
			item.status = 'parsed';
			return HttpResponse.json({ records: [] as TransactionDraft[] });
		}
		const records = parseWhatsappMessage(item.body, store.patients);
		item.parsed_records = records;
		item.parse_error = records.length === 0 ? 'Ayrıştırılamadı' : null;
		item.status = 'parsed';
		return HttpResponse.json({ records });
	}),

	http.get('/v1/patients/:id/files', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const patient = store.patients.find((p) => p.id === params.id);
		if (!patient) return notFound('Hasta bulunamadı');
		const items = store.files
			.filter((f) => f.patient_id === params.id)
			.sort((a, b) => b.created_at.localeCompare(a.created_at));
		return HttpResponse.json({ items });
	}),

	http.get('/v1/patients/:id/case-notes', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const patient = store.patients.find((p) => p.id === params.id);
		if (!patient) return notFound('Hasta bulunamadı');
		const items = store.caseNotes
			.filter((n) => n.patient_id === params.id)
			.sort((a, b) => a.created_at.localeCompare(b.created_at));
		return HttpResponse.json({ items });
	}),

	http.post('/v1/patients/:id/case-notes', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const patient = store.patients.find((p) => p.id === params.id);
		if (!patient) return notFound('Hasta bulunamadı');
		const body = await request.json();
		const parsed = patientCaseNoteCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz not', parsed.error.flatten());
		const note: PatientCaseNote = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			patient_id: patient.id,
			body: parsed.data.body.trim(),
			author_display_name: demoUser.display_name,
			created_at: nowIso()
		};
		store.caseNotes.push(note);
		return HttpResponse.json(note, { status: 201 });
	}),

	http.delete('/v1/patients/:id/case-notes/:noteId', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.caseNotes.findIndex(
			(n) => n.id === params.noteId && n.patient_id === params.id
		);
		if (idx < 0) return notFound('Not bulunamadı');
		store.caseNotes.splice(idx, 1);
		return new HttpResponse(null, { status: 204 });
	}),

	http.post('/v1/patients/:id/files', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const patient = store.patients.find((p) => p.id === params.id);
		if (!patient) return notFound('Hasta bulunamadı');
		const body = await request.json();
		const parsed = patientFileCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz dosya verisi', parsed.error.flatten());

		let appointment_label: string | null = null;
		const appointmentId = parsed.data.appointment_id ?? null;
		if (appointmentId) {
			const appt = store.appointments.find(
				(a) => a.id === appointmentId && a.patient_id === patient.id
			);
			if (!appt) return badRequest('Randevu bu hastaya ait değil');
			appointment_label = appointmentLabel(appt);
		}

		const file: PatientFile = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			patient_id: patient.id,
			appointment_id: appointmentId,
			appointment_label,
			filename: parsed.data.filename,
			mime_type: parsed.data.mime_type ?? 'application/octet-stream',
			size_bytes: parsed.data.size_bytes ?? 0,
			uploaded_by_display_name: demoUser.display_name,
			created_at: nowIso()
		};
		store.files.unshift(file);
		return HttpResponse.json(file, { status: 201 });
	}),

	http.delete('/v1/patients/:id/files/:fileId', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.files.findIndex(
			(f) => f.id === params.fileId && f.patient_id === params.id
		);
		if (idx < 0) return notFound('Dosya bulunamadı');
		store.files.splice(idx, 1);
		return new HttpResponse(null, { status: 204 });
	}),

	http.get('/v1/appointments/:id/files', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const appt = store.appointments.find((a) => a.id === params.id);
		if (!appt) return notFound('Randevu bulunamadı');
		const items = store.files
			.filter((f) => f.appointment_id === params.id)
			.sort((a, b) => b.created_at.localeCompare(a.created_at));
		return HttpResponse.json({ items });
	}),

	http.post('/v1/appointments/:id/files', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const appt = store.appointments.find((a) => a.id === params.id);
		if (!appt) return notFound('Randevu bulunamadı');
		const body = await request.json();
		const parsed = patientFileCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz dosya verisi', parsed.error.flatten());

		const file: PatientFile = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			patient_id: appt.patient_id,
			appointment_id: appt.id,
			appointment_label: appointmentLabel(appt),
			filename: parsed.data.filename,
			mime_type: parsed.data.mime_type ?? 'application/octet-stream',
			size_bytes: parsed.data.size_bytes ?? 0,
			uploaded_by_display_name: demoUser.display_name,
			created_at: nowIso()
		};
		store.files.unshift(file);
		return HttpResponse.json(file, { status: 201 });
	}),

	http.delete('/v1/appointments/:id/files/:fileId', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.files.findIndex(
			(f) => f.id === params.fileId && f.appointment_id === params.id
		);
		if (idx < 0) return notFound('Dosya bulunamadı');
		store.files.splice(idx, 1);
		return new HttpResponse(null, { status: 204 });
	}),

	http.get('/v1/settings/finance-categories', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const items = [...store.financeCategories].sort((a, b) => a.sort_order - b.sort_order);
		return HttpResponse.json({ items });
	}),

	http.get('/v1/settings/contact-types', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const items = [...store.contactTypes].sort((a, b) => a.sort_order - b.sort_order);
		return HttpResponse.json({ items });
	}),

	http.post('/v1/settings/contact-types', async ({ request }) => {
		const body = await request.json();
		const parsed = contactTypeCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz tür', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const name = parsed.data.name.trim();
		if (store.contactTypes.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
			return badRequest('Bu tür zaten var');
		}
		const maxOrder = store.contactTypes.reduce((m, c) => Math.max(m, c.sort_order), -1);
		const item: ContactType = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			name,
			sort_order: maxOrder + 1,
			created_at: nowIso()
		};
		store.contactTypes.push(item);
		return HttpResponse.json(item, { status: 201 });
	}),

	http.delete('/v1/settings/contact-types/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const inUse = store.contacts.some((c) => c.contact_type_id === params.id);
		if (inUse) return badRequest('Tür kullanımda — önce kişileri taşıyın');
		const idx = store.contactTypes.findIndex((t) => t.id === params.id);
		if (idx < 0) return notFound('Tür bulunamadı');
		store.contactTypes.splice(idx, 1);
		return new HttpResponse(null, { status: 204 });
	}),

	http.get('/v1/contacts', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		let items = [...store.contacts];
		const q = url.searchParams.get('q')?.trim().toLowerCase();
		if (q) {
			items = items.filter(
				(c) =>
					c.display_name.toLowerCase().includes(q) ||
					(c.email?.toLowerCase().includes(q) ?? false) ||
					(c.phone?.includes(q) ?? false)
			);
		}
		const typeId = url.searchParams.get('type_id');
		if (typeId) items = items.filter((c) => c.contact_type_id === typeId);
		items.sort((a, b) => a.display_name.localeCompare(b.display_name, 'tr'));
		return HttpResponse.json(paginate(items, url.searchParams.get('cursor'), limitFrom(url)));
	}),

	http.get('/v1/contacts/duplicate-groups', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		refreshUsage(store);
		return HttpResponse.json({ items: findContactDuplicateGroups(store.contacts) });
	}),

	http.post('/v1/contacts/merge', async ({ request }) => {
		const body = await request.json();
		const parsed = mergeRecordsSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz birleştirme', parsed.error.flatten());
		const { keep_id, merge_ids } = parsed.data;
		if (merge_ids.includes(keep_id)) return badRequest('keep_id birleştirilecek listede olamaz');
		const store = getStore(scenarioFrom(request));
		const keep = store.contacts.find((c) => c.id === keep_id);
		if (!keep) return notFound('Hedef kişi bulunamadı');
		const sources = merge_ids.map((id) => store.contacts.find((c) => c.id === id));
		if (sources.some((c) => !c)) return notFound('Birleştirilecek kişi bulunamadı');

		for (const src of sources) {
			if (!src) continue;
			if (!keep.phone && src.phone) keep.phone = src.phone;
			if (!keep.email && src.email) keep.email = src.email;
			if (!keep.notes && src.notes) keep.notes = src.notes;
			if (!keep.is_internal && src.is_internal) keep.is_internal = true;
		}
		keep.updated_at = nowIso();

		const drop = new Set(merge_ids);
		for (const t of store.transactions) {
			if (t.contact_id && drop.has(t.contact_id)) {
				t.contact_id = keep_id;
				t.contact_label = keep.display_name;
			}
		}
		for (const a of store.appointments) {
			if (a.clinic_contact_id && drop.has(a.clinic_contact_id)) {
				a.clinic_contact_id = keep_id;
				a.clinic_name = keep.display_name;
			}
			if (a.hotel_contact_id && drop.has(a.hotel_contact_id)) {
				a.hotel_contact_id = keep_id;
				a.hotel_name = keep.display_name;
			}
			if (a.transfer_contact_id && drop.has(a.transfer_contact_id)) {
				a.transfer_contact_id = keep_id;
			}
		}
		for (const p of store.patients) {
			if (p.contact_id && drop.has(p.contact_id)) p.contact_id = keep_id;
		}
		store.contacts = store.contacts.filter((c) => !drop.has(c.id));
		refreshUsage(store);
		return HttpResponse.json(keep);
	}),

	http.get('/v1/contacts/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		refreshUsage(store);
		const item = store.contacts.find((c) => c.id === params.id);
		if (!item) return notFound('Kişi bulunamadı');
		return HttpResponse.json(item);
	}),

	http.post('/v1/contacts', async ({ request }) => {
		const body = await request.json();
		const parsed = contactCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz kişi', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const type = store.contactTypes.find((t) => t.id === parsed.data.contact_type_id);
		if (!type) return badRequest('Tür bulunamadı');
		const now = nowIso();
		const contact: Contact = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			contact_type_id: type.id,
			contact_type_name: type.name,
			display_name: parsed.data.display_name.trim(),
			phone: parsed.data.phone?.trim() || null,
			email: parsed.data.email?.trim() || null,
			notes: parsed.data.notes?.trim() || null,
			is_internal: parsed.data.is_internal ?? false,
			usage_count: 0,
			created_at: now,
			updated_at: now
		};
		store.contacts.unshift(contact);

		if (type.name.toLowerCase() === 'hasta') {
			const patient: Patient = {
				id: crypto.randomUUID(),
				tenant_id: DEMO_TENANT_ID,
				full_name: contact.display_name,
				phone: contact.phone,
				email: contact.email,
				status: 'lead',
				source: 'Kişiler',
				notes: null,
				assigned_user_id: null,
				contact_id: contact.id,
				created_at: now,
				updated_at: now
			};
			store.patients.unshift(patient);
		}

		return HttpResponse.json(contact, { status: 201 });
	}),

	http.patch('/v1/contacts/:id', async ({ params, request }) => {
		const body = await request.json();
		const parsed = contactUpdateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz kişi', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const idx = store.contacts.findIndex((c) => c.id === params.id);
		if (idx < 0) return notFound('Kişi bulunamadı');
		let typeName = store.contacts[idx].contact_type_name;
		let typeId = store.contacts[idx].contact_type_id;
		if (parsed.data.contact_type_id) {
			const type = store.contactTypes.find((t) => t.id === parsed.data.contact_type_id);
			if (!type) return badRequest('Tür bulunamadı');
			typeId = type.id;
			typeName = type.name;
		}
		const updated: Contact = {
			...store.contacts[idx],
			contact_type_id: typeId,
			contact_type_name: typeName,
			display_name: parsed.data.display_name?.trim() ?? store.contacts[idx].display_name,
			phone:
				parsed.data.phone !== undefined
					? parsed.data.phone?.trim() || null
					: store.contacts[idx].phone,
			email:
				parsed.data.email !== undefined
					? parsed.data.email?.trim() || null
					: store.contacts[idx].email,
			notes:
				parsed.data.notes !== undefined
					? parsed.data.notes?.trim() || null
					: store.contacts[idx].notes,
			is_internal: parsed.data.is_internal ?? store.contacts[idx].is_internal,
			updated_at: nowIso()
		};
		store.contacts[idx] = updated;
		for (const t of store.transactions) {
			if (t.contact_id === updated.id) t.contact_label = updated.display_name;
		}
		for (const a of store.appointments) {
			if (a.clinic_contact_id === updated.id) a.clinic_name = updated.display_name;
			if (a.hotel_contact_id === updated.id) a.hotel_name = updated.display_name;
		}
		for (const p of store.patients) {
			if (p.contact_id === updated.id) {
				p.full_name = updated.display_name;
				p.phone = updated.phone;
				p.email = updated.email;
				p.updated_at = nowIso();
			}
		}
		refreshUsage(store);
		return HttpResponse.json(updated);
	}),

	http.delete('/v1/contacts/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		refreshUsage(store);
		const idx = store.contacts.findIndex((c) => c.id === params.id);
		if (idx < 0) return notFound('Kişi bulunamadı');
		if (store.contacts[idx].usage_count > 0) {
			return badRequest('Kişi kullanımda — işlem/randevu bağlantılarını kaldırın');
		}
		const contactId = store.contacts[idx].id;
		store.contacts.splice(idx, 1);
		for (const p of store.patients) {
			if (p.contact_id === contactId) p.contact_id = null;
		}
		return new HttpResponse(null, { status: 204 });
	}),

	http.post('/v1/settings/finance-categories', async ({ request }) => {
		const body = await request.json();
		const parsed = financeCategoryCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz kategori', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const now = nowIso();
		const maxOrder = store.financeCategories.reduce((m, c) => Math.max(m, c.sort_order), -1);
		const item: FinanceCategory = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			kind: parsed.data.kind,
			name: parsed.data.name,
			sort_order: maxOrder + 1,
			subcategories: parsed.data.subcategories ?? [],
			created_at: now,
			updated_at: now
		};
		store.financeCategories.push(item);
		return HttpResponse.json(item, { status: 201 });
	}),

	http.patch('/v1/settings/finance-categories/:id', async ({ params, request }) => {
		const body = await request.json();
		const parsed = financeCategoryUpdateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz kategori', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const idx = store.financeCategories.findIndex((c) => c.id === params.id);
		if (idx < 0) return notFound('Kategori bulunamadı');
		const updated: FinanceCategory = {
			...store.financeCategories[idx],
			...parsed.data,
			updated_at: nowIso()
		};
		store.financeCategories[idx] = updated;
		return HttpResponse.json(updated);
	}),

	http.delete('/v1/settings/finance-categories/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.financeCategories.findIndex((c) => c.id === params.id);
		if (idx < 0) return notFound('Kategori bulunamadı');
		store.financeCategories.splice(idx, 1);
		return new HttpResponse(null, { status: 204 });
	}),

	http.get('/v1/settings/appointment-types', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const items = [...store.appointmentTypes].sort((a, b) => a.sort_order - b.sort_order);
		return HttpResponse.json({ items });
	}),

	http.post('/v1/settings/appointment-types', async ({ request }) => {
		const body = (await request.json()) as { name?: string };
		const name = body.name?.trim();
		if (!name) return badRequest('İsim gerekli');
		const store = getStore(scenarioFrom(request));
		const maxOrder = store.appointmentTypes.reduce((m, t) => Math.max(m, t.sort_order), -1);
		const item: AppointmentTypeSetting = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			name,
			sort_order: maxOrder + 1
		};
		store.appointmentTypes.push(item);
		return HttpResponse.json(item, { status: 201 });
	}),

	http.delete('/v1/settings/appointment-types/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.appointmentTypes.findIndex((t) => t.id === params.id);
		if (idx < 0) return notFound('Tip bulunamadı');
		store.appointmentTypes.splice(idx, 1);
		return new HttpResponse(null, { status: 204 });
	}),

	http.get('/v1/dev/tenants', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json({ items: store.tenants });
	}),

	http.post('/v1/dev/tenants', async ({ request }) => {
		const body = (await request.json()) as { name?: string; grant_self_admin?: boolean };
		const name = body.name?.trim();
		if (!name) return badRequest('İsim gerekli');
		const store = getStore(scenarioFrom(request));
		const baseSlug = name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 40) || 'org';
		let slug = baseSlug;
		let n = 2;
		while (store.tenants.some((t) => t.slug === slug)) {
			slug = `${baseSlug}-${n++}`;
		}
		const now = nowIso();
		const tenant: Tenant = {
			id: crypto.randomUUID(),
			name,
			slug,
			base_currency: 'TRY',
			patients_section_label: 'Hastalar',
			created_at: now
		};
		store.tenants.push(tenant);
		if (body.grant_self_admin !== false) {
			store.members.push({
				id: crypto.randomUUID(),
				email: demoUser.email,
				display_name: demoUser.display_name,
				created_at: now,
				tenant_id: tenant.id,
				role: 'owner'
			});
		}
		return HttpResponse.json(tenant, { status: 201 });
	}),

	http.patch('/v1/dev/tenants/:id', async ({ params, request }) => {
		const body = (await request.json()) as { name?: string };
		const name = body.name?.trim();
		if (!name) return badRequest('İsim gerekli');
		const store = getStore(scenarioFrom(request));
		const idx = store.tenants.findIndex((t) => t.id === params.id);
		if (idx < 0) return notFound('Organizasyon bulunamadı');
		store.tenants[idx] = { ...store.tenants[idx], name };
		if (store.tenant.id === params.id) {
			store.tenant = { ...store.tenant, name };
		}
		return HttpResponse.json(store.tenants[idx]);
	}),

	http.delete('/v1/dev/tenants/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		if (params.id === DEMO_TENANT_ID) {
			return badRequest('Demo ana tenant silinemez');
		}
		const idx = store.tenants.findIndex((t) => t.id === params.id);
		if (idx < 0) return notFound('Organizasyon bulunamadı');
		store.tenants.splice(idx, 1);
		store.members = store.members.filter((m) => m.tenant_id !== params.id);
		if (store.tenant.id === params.id) {
			store.tenant = { ...demoTenant };
		}
		return new HttpResponse(null, { status: 204 });
	}),

	http.get('/v1/dev/tenants/:id/users', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		if (!store.tenants.some((t) => t.id === params.id)) return notFound('Organizasyon bulunamadı');
		const items = store.members.filter((m) => m.tenant_id === params.id);
		return HttpResponse.json({ items });
	}),

	http.post('/v1/dev/tenants/:id/users', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		if (!store.tenants.some((t) => t.id === params.id)) return notFound('Organizasyon bulunamadı');
		const body = (await request.json()) as {
			email?: string;
			password?: string;
			display_name?: string;
			role?: string;
		};
		const email = body.email?.trim().toLowerCase();
		const display_name = body.display_name?.trim();
		const password = body.password ?? '';
		const roleParsed = userRoleSchema.safeParse(body.role ?? 'agent');
		if (!email || !display_name) return badRequest('E-posta ve ad gerekli');
		if (password.length < 8) return badRequest('Şifre en az 8 karakter');
		if (!roleParsed.success) return badRequest('Geçersiz rol');

		const existing = store.members.find((m) => m.tenant_id === params.id && m.email === email);
		if (existing) {
			existing.display_name = display_name;
			existing.role = roleParsed.data;
			return HttpResponse.json(existing);
		}

		const user: MembershipUser = {
			id: crypto.randomUUID(),
			email,
			display_name,
			created_at: nowIso(),
			tenant_id: params.id as string,
			role: roleParsed.data
		};
		store.members.push(user);
		return HttpResponse.json(user, { status: 201 });
	}),

	http.delete('/v1/dev/tenants/:tenantId/users/:userId', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		if (params.userId === DEMO_USER_ID) {
			return badRequest('Kendi üyeliğini bu ekrandan kaldıramazsın');
		}
		const idx = store.members.findIndex(
			(m) => m.id === params.userId && m.tenant_id === params.tenantId
		);
		if (idx < 0) return notFound('Üye bulunamadı');
		store.members.splice(idx, 1);
		return new HttpResponse(null, { status: 204 });
	})
];
