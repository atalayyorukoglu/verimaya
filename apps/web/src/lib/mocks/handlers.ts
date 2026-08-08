import { http, HttpResponse } from 'msw';
import {
	calculateRealRoas,
	patientCreateSchema,
	patientUpdateSchema,
	patientListQuerySchema,
	appointmentCreateSchema,
	appointmentUpdateSchema,
	appointmentListQuerySchema,
	transactionCreateSchema,
	transactionUpdateSchema,
	transactionListQuerySchema,
	tenantUpdateSchema,
	whatsappParseRequestSchema,
	patientFileCreateSchema,
	patientFilePresignSchema,
	patientCaseNoteCreateSchema,
	contactTypeCreateSchema,
	contactCreateSchema,
	contactUpdateSchema,
	contactListQuerySchema,
	financeCategoryCreateSchema,
	financeCategoryUpdateSchema,
	mergeRecordsSchema,
	userRoleSchema,
	apiKeyCreateSchema,
	webhookSubscriptionCreateSchema,
	aiCorrectionCreateSchema,
	approveDraftsRequestSchema,
	trustScoreSettings,
	compareByCreatedAtDesc,
	compareByOccurredOnDesc,
	tenantDayRange,
	toTenantDayKey,
	type AiCorrection,
	type ApiKey,
	type ApiKeyCreated,
	type Appointment,
	type AppointmentTypeSetting,
	type ApproveDraftsResponse,
	type Contact,
	type ContactType,
	type FinanceCategory,
	type MarketingReport,
	type MembershipUser,
	type Patient,
	type PatientCaseNote,
	type PatientFile,
	type Tenant,
	type Transaction,
	type TransactionDraft,
	type WebhookSubscription
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
	if (tx.amount_base != null && tx.base_currency === tenantBase) {
		return tx.amount_base;
	}
	return null;
}

/** Tahsilat in tenant base — mirrors resolvePaidBaseAmount (TRY-simple for demo). */
function paidInBaseMock(tx: Transaction, tenantBase: string): number {
	if (tx.paid_amount == null) return 0;
	if (tx.currency === tenantBase) return tx.paid_amount;
	const base = amountInBaseMock(tx, tenantBase);
	if (base == null || tx.amount <= 0) return 0;
	return Math.round((tx.paid_amount / tx.amount) * base);
}

function sourceLabel(source: string | null | undefined): string {
	const trimmed = (source ?? '').trim();
	return trimmed || 'Bilinmeyen';
}

function patientCreatedDay(iso: string): string {
	return iso.slice(0, 10);
}

function buildMarketingReport(
	store: ReturnType<typeof getStore>,
	from: string | null,
	to: string | null,
	provider: string | null
): MarketingReport {
	const tenantBase = store.tenant.base_currency;

	let spendRows = store.adMetricsDaily;
	if (from) spendRows = spendRows.filter((r) => r.date >= from);
	if (to) spendRows = spendRows.filter((r) => r.date <= to);
	if (provider === 'meta' || provider === 'google') {
		spendRows = spendRows.filter((r) => r.provider === provider);
	}
	const spend_base = spendRows.reduce((sum, r) => sum + r.spend_minor, 0);

	const incomeRows = filterTransactionsByPeriod(store.transactions, from, to).filter(
		(t) => t.kind === 'income'
	);
	const patientById = new Map(store.patients.map((p) => [p.id, p]));
	const revenueBySource = new Map<string, number>();
	let revenue_base = 0;
	for (const t of incomeRows) {
		const paid = paidInBaseMock(t, tenantBase);
		revenue_base += paid;
		const patient = t.patient_id ? patientById.get(t.patient_id) : undefined;
		const label = sourceLabel(patient?.source);
		revenueBySource.set(label, (revenueBySource.get(label) ?? 0) + paid);
	}

	const cohortPatients = store.patients.filter((p) => {
		const day = patientCreatedDay(p.created_at);
		if (from && day < from) return false;
		if (to && day > to) return false;
		return true;
	});
	const cohortBySource = new Map<string, { leads: number; treated: number }>();
	let leads_count = 0;
	let treated_count = 0;
	for (const p of cohortPatients) {
		leads_count += 1;
		const isTreated = p.status === 'treated';
		if (isTreated) treated_count += 1;
		const label = sourceLabel(p.source);
		const cur = cohortBySource.get(label) ?? { leads: 0, treated: 0 };
		cur.leads += 1;
		if (isTreated) cur.treated += 1;
		cohortBySource.set(label, cur);
	}

	const sourceKeys = new Set([...revenueBySource.keys(), ...cohortBySource.keys()]);
	const by_source = [...sourceKeys]
		.map((source) => {
			const cohort = cohortBySource.get(source);
			return {
				source,
				leads: cohort?.leads ?? 0,
				treated: cohort?.treated ?? 0,
				revenue_base: revenueBySource.get(source) ?? 0
			};
		})
		.sort(
			(a, b) =>
				Math.abs(b.leads) +
				Math.abs(b.treated) +
				Math.abs(b.revenue_base) -
				(Math.abs(a.leads) + Math.abs(a.treated) + Math.abs(a.revenue_base))
		);

	const metrics = calculateRealRoas({
		spendMinor: spend_base,
		revenueMinor: revenue_base,
		leads: leads_count,
		treated: treated_count
	});

	return {
		period: { from, to },
		spend_base,
		revenue_base,
		real_roas: metrics.realRoas,
		leads_count,
		treated_count,
		cost_per_lead: metrics.costPerLead,
		cost_per_treated: metrics.costPerTreated,
		by_source
	};
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
	let pendingBase = 0;
	let fxMissingCount = 0;
	const fxMissingByCurrency = new Map<string, number>();
	for (const t of rows) {
		const amount = amountInBaseMock(t, base);
		if (amount == null) {
			fxMissingCount += 1;
			fxMissingByCurrency.set(t.currency, (fxMissingByCurrency.get(t.currency) ?? 0) + t.amount);
			continue;
		}
		if (t.kind === 'income') {
			incomeBase += amount;
			pendingBase += Math.max(0, amount - paidInBaseMock(t, base));
		} else {
			expenseBase += amount;
		}
	}
	const transactionCount = rows.length;
	return {
		period: { from, to },
		income_base: incomeBase,
		expense_base: expenseBase,
		net_base: incomeBase - expenseBase,
		pending_base: pendingBase,
		transaction_count: transactionCount,
		fx_missing_count: fxMissingCount,
		fx_missing_amount_by_currency: [...fxMissingByCurrency.entries()]
			.map(([currency, amount_minor]) => ({ currency, amount_minor }))
			.sort((a, b) => a.currency.localeCompare(b.currency)),
		coverage_ratio: transactionCount === 0 ? 1 : (transactionCount - fxMissingCount) / transactionCount
	};
}

function buildReportPatientDistribution(
	store: ReturnType<typeof getStore>,
	from: string | null,
	to: string | null
) {
	let patients = store.patients;
	if (from) {
		patients = patients.filter((p) => patientCreatedDay(p.created_at) >= from);
	}
	if (to) {
		patients = patients.filter((p) => patientCreatedDay(p.created_at) <= to);
	}

	const statusCounts = new Map<string, number>();
	const sourceCounts = new Map<string, number>();
	for (const p of patients) {
		statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1);
		const label = sourceLabel(p.source);
		sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + 1);
	}

	const by_status = [...statusCounts.entries()]
		.map(([status, count]) => ({ status, count }))
		.sort((a, b) => b.count - a.count);
	const by_source = [...sourceCounts.entries()]
		.map(([source, count]) => ({ source, count }))
		.sort((a, b) => b.count - a.count);

	return {
		period: { from, to },
		by_status,
		by_source,
		total: patients.length
	};
}

function buildReportAppointmentMetrics(
	store: ReturnType<typeof getStore>,
	from: string | null,
	to: string | null
) {
	const tz = store.tenant.timezone;
	let items = [...store.appointments];
	if (from) {
		const { start } = tenantDayRange(from, tz);
		items = items.filter((a) => a.starts_at >= start.toISOString());
	}
	if (to) {
		const { endExclusive } = tenantDayRange(to, tz);
		items = items.filter((a) => a.starts_at < endExclusive.toISOString());
	}

	const total = items.length;
	const rate = (n: number) => (total === 0 ? 0 : n / total);
	const completed = items.filter((a) => a.status === 'completed').length;
	const noShow = items.filter((a) => a.status === 'no_show').length;
	const cancelled = items.filter((a) => a.status === 'cancelled').length;

	const clinicMap = new Map<
		string,
		{ clinic_contact_id: string | null; clinic_name: string; count: number; completed: number }
	>();
	for (const a of items) {
		const clinic_name = (a.clinic_name ?? '').trim() || 'Atanmamış';
		const key = `${a.clinic_contact_id ?? ''}\0${clinic_name}`;
		const cur = clinicMap.get(key) ?? {
			clinic_contact_id: a.clinic_contact_id,
			clinic_name,
			count: 0,
			completed: 0
		};
		cur.count += 1;
		if (a.status === 'completed') cur.completed += 1;
		clinicMap.set(key, cur);
	}

	const typeMap = new Map<string, number>();
	for (const a of items) {
		const label = (a.appointment_type ?? '').trim() || 'Belirtilmemiş';
		typeMap.set(label, (typeMap.get(label) ?? 0) + 1);
	}

	const monthMap = new Map<string, number>();
	for (const a of items) {
		const month = toTenantDayKey(new Date(a.starts_at), tz).slice(0, 7);
		monthMap.set(month, (monthMap.get(month) ?? 0) + 1);
	}

	return {
		period: { from, to },
		total,
		completion_rate: rate(completed),
		no_show_rate: rate(noShow),
		cancellation_rate: rate(cancelled),
		by_clinic: [...clinicMap.values()]
			.map((c) => ({
				clinic_contact_id: c.clinic_contact_id,
				clinic_name: c.clinic_name,
				count: c.count,
				completion_rate: c.count === 0 ? 0 : c.completed / c.count
			}))
			.sort((a, b) => b.count - a.count),
		by_appointment_type: [...typeMap.entries()]
			.map(([appointment_type, count]) => ({
				appointment_type,
				count,
				ratio: rate(count)
			}))
			.sort((a, b) => b.count - a.count),
		monthly: [...monthMap.entries()]
			.map(([month, count]) => ({ month, count }))
			.sort((a, b) => a.month.localeCompare(b.month))
	};
}

function buildReportBalances(store: ReturnType<typeof getStore>) {
	const map = new Map<
		string,
		{
			contact_id: string;
			contact_label: string;
			currency: string;
			open_amount: number;
			collected_amount: number;
			transaction_count: number;
		}
	>();

	for (const t of store.transactions) {
		if (!t.contact_id) continue;
		const key = `${t.contact_id}\0${t.currency}`;
		const paid = t.paid_amount ?? 0;
		const sign = t.kind === 'income' ? 1 : -1;
		const openDelta = sign * (t.amount - paid);
		const collectedDelta = sign * paid;
		const label = (t.contact_label ?? '').trim() || 'Bilinmeyen';

		const cur = map.get(key) ?? {
			contact_id: t.contact_id,
			contact_label: label,
			currency: t.currency,
			open_amount: 0,
			collected_amount: 0,
			transaction_count: 0
		};
		cur.open_amount += openDelta;
		cur.collected_amount += collectedDelta;
		cur.transaction_count += 1;
		map.set(key, cur);
	}

	const items = [...map.values()]
		.filter((row) => row.open_amount !== 0 || row.collected_amount !== 0)
		.sort((a, b) => Math.abs(b.open_amount) - Math.abs(a.open_amount));

	return { items };
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

type QuerySchema<T> = {
	safeParse: (
		data: unknown
	) => { success: true; data: T } | { success: false; error: { flatten: () => unknown } };
};

/**
 * CONTRACT-01 (Faz 2.1): validate a list endpoint's query string against the same
 * shared schema the real API uses, so MSW and the API reject/accept the exact same
 * filters (CONTRACT-02 parity). `scenario` is a mock-only testing knob (see
 * `scenarioFrom`), not part of the real API contract, so it's stripped before
 * validation instead of being rejected as an unknown parameter.
 */
function parseListQuery<T>(
	schema: QuerySchema<T>,
	url: URL
): { success: true; data: T } | { success: false; response: ReturnType<typeof badRequest> } {
	const raw: Record<string, string> = Object.fromEntries(url.searchParams.entries());
	delete raw.scenario;
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		return { success: false, response: badRequest('Geçersiz filtre', parsed.error.flatten()) };
	}
	return { success: true, data: parsed.data };
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

/** Demo: Meta connected so disconnect UI is exercisable under MSW. */
const mswAdsConnected = new Set<string>(['meta']);

export const handlers = [
	http.get('/v1/me', () => HttpResponse.json(demoUser)),

	http.get('/v1/tenants/current', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json({
			...store.tenant,
			base_currency_locked: store.transactions.length > 0
		});
	}),

	http.patch('/v1/tenants/current', async ({ request }) => {
		const body = await request.json();
		const parsed = tenantUpdateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz tenant verisi', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		if (
			parsed.data.base_currency != null &&
			parsed.data.base_currency !== store.tenant.base_currency &&
			store.transactions.length > 0
		) {
			return HttpResponse.json(
				{
					error: {
						code: 'base_currency_locked',
						message: 'Base currency is locked after the first transaction'
					},
					request_id: 'msw-base-currency-locked'
				},
				{ status: 409 }
			);
		}
		const updated: Tenant = {
			...store.tenant,
			...parsed.data,
			base_currency_locked: store.transactions.length > 0
		};
		store.tenant = updated;
		return HttpResponse.json(updated);
	}),

	http.get('/v1/members', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const items = store.members.filter((m) => m.tenant_id === store.tenant.id);
		return HttpResponse.json(paginate(items, url.searchParams.get('cursor'), limitFrom(url)));
	}),

	http.patch('/v1/members/:id', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const body = (await request.json()) as { role?: string };
		const parsed = userRoleSchema.safeParse(body.role);
		if (!parsed.success) return badRequest('Geçersiz rol');
		const idx = store.members.findIndex(
			(m) => m.id === params.id && m.tenant_id === store.tenant.id
		);
		if (idx < 0) return notFound('Üye bulunamadı');
		const current = store.members[idx]!;
		if (current.id === DEMO_USER_ID) {
			return HttpResponse.json(
				{
					error: { code: 'cannot_change_own_role', message: 'You cannot change your own role' },
					request_id: 'msw'
				},
				{ status: 403 }
			);
		}
		if (current.role === 'owner' && parsed.data !== 'owner') {
			const owners = store.members.filter(
				(m) => m.tenant_id === store.tenant.id && m.role === 'owner'
			);
			if (owners.length <= 1) {
				return badRequest('Cannot demote the last owner');
			}
		}
		const updated: MembershipUser = { ...current, role: parsed.data };
		store.members[idx] = updated;
		return HttpResponse.json(updated);
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
		const parsed = parseListQuery(patientListQuerySchema, url);
		if (!parsed.success) return parsed.response;
		const store = getStore(scenarioFrom(request));
		const q = (parsed.data.q ?? '').trim().toLowerCase();
		let items = store.patients;
		if (q) {
			items = items.filter(
				(p) =>
					p.full_name.toLowerCase().includes(q) ||
					(p.email?.toLowerCase().includes(q) ?? false) ||
					(p.phone?.includes(q) ?? false)
			);
		}
		// CONTRACT-02: newly created patients are unshifted, so insertion order already
		// matches created_at desc — sort explicitly anyway so this doesn't silently rot.
		items = [...items].sort(compareByCreatedAtDesc);
		return HttpResponse.json(paginate(items, parsed.data.cursor ?? null, parsed.data.limit));
	}),

	http.get('/v1/patients/duplicate-groups', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const busy = new Set<string>();
		for (const a of store.appointments) {
			if (a.patient_id) busy.add(a.patient_id);
		}
		for (const t of store.transactions) {
			if (t.patient_id) busy.add(t.patient_id);
		}
		const empty = store.patients.filter((p) => !busy.has(p.id));
		return HttpResponse.json({ items: findPatientDuplicateGroups(empty) });
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

		const involved = [keep_id, ...merge_ids];
		const hasRecords = involved.some(
			(id) =>
				store.appointments.some((a) => a.patient_id === id) ||
				store.transactions.some((t) => t.patient_id === id)
		);
		if (hasRecords) {
			return HttpResponse.json(
				{
					error: {
						code: 'patient_has_records',
						message:
							'Cannot complete empty-file merge: a file has appointments or transactions'
					}
				},
				{ status: 409 }
			);
		}

		const contactIds = [keep, ...sources]
			.map((p) => p?.contact_id ?? null)
			.filter((id): id is string => id != null);
		if (new Set(contactIds).size > 1) {
			return HttpResponse.json(
				{
					error: {
						code: 'patient_contact_mismatch',
						message:
							'Cannot complete empty-file merge: files link to different contacts'
					}
				},
				{ status: 409 }
			);
		}

		for (const src of sources) {
			if (!src) continue;
			if (!keep.phone && src.phone) keep.phone = src.phone;
			if (!keep.email && src.email) keep.email = src.email;
			if (!keep.notes && src.notes) keep.notes = src.notes;
			if (!keep.source && src.source) keep.source = src.source;
			if (!keep.contact_id && src.contact_id) keep.contact_id = src.contact_id;
		}
		keep.updated_at = nowIso();

		const drop = new Set(merge_ids);
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

	http.delete('/v1/patients/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.patients.findIndex((p) => p.id === params.id);
		if (idx < 0) return notFound('Hasta bulunamadı');
		const id = store.patients[idx].id;
		store.patients.splice(idx, 1);
		return HttpResponse.json({ id, deleted: true as const });
	}),

	http.get('/v1/appointments', ({ request }) => {
		const url = new URL(request.url);
		const parsed = parseListQuery(appointmentListQuerySchema, url);
		if (!parsed.success) return parsed.response;
		const store = getStore(scenarioFrom(request));
		let items = [...store.appointments];
		const { patient_id: patientId, from, to, status, q } = parsed.data;
		if (patientId) items = items.filter((a) => a.patient_id === patientId);
		if (status) items = items.filter((a) => a.status === status);
		const tz = store.tenant.timezone;
		if (from) {
			const { start } = tenantDayRange(from, tz);
			items = items.filter((a) => a.starts_at >= start.toISOString());
		}
		if (to) {
			const { endExclusive } = tenantDayRange(to, tz);
			items = items.filter((a) => a.starts_at < endExclusive.toISOString());
		}
		if (q) {
			const needle = q.toLowerCase();
			items = items.filter(
				(a) =>
					a.patient_display_name.toLowerCase().includes(needle) ||
					(a.notes?.toLowerCase().includes(needle) ?? false) ||
					(a.clinic_name?.toLowerCase().includes(needle) ?? false) ||
					(a.hotel_name?.toLowerCase().includes(needle) ?? false)
			);
		}
		// CONTRACT-02: match the real API's order (created_at desc) — the calendar UI
		// re-sorts by starts_at client-side regardless, so this doesn't change behavior.
		items.sort(compareByCreatedAtDesc);
		return HttpResponse.json(paginate(items, parsed.data.cursor ?? null, parsed.data.limit));
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

	http.delete('/v1/appointments/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.appointments.findIndex((a) => a.id === params.id);
		if (idx < 0) return notFound('Randevu bulunamadı');
		const id = store.appointments[idx].id;
		store.appointments.splice(idx, 1);
		refreshUsage(store);
		return HttpResponse.json({ id, deleted: true as const });
	}),

	http.get('/v1/transactions', ({ request }) => {
		const url = new URL(request.url);
		const parsed = parseListQuery(transactionListQuerySchema, url);
		if (!parsed.success) return parsed.response;
		const store = getStore(scenarioFrom(request));
		let items = [...store.transactions];
		const {
			patient_id: patientId,
			contact_id: contactId,
			from,
			to,
			kind,
			status,
			category,
			q
		} = parsed.data;
		if (patientId) items = items.filter((t) => t.patient_id === patientId);
		if (contactId) items = items.filter((t) => t.contact_id === contactId);
		if (from) items = items.filter((t) => t.occurred_on >= from);
		if (to) items = items.filter((t) => t.occurred_on <= to);
		if (kind) items = items.filter((t) => t.kind === kind);
		if (status) items = items.filter((t) => t.status === status);
		if (category) items = items.filter((t) => t.category === category);
		if (q) {
			const needle = q.toLowerCase();
			items = items.filter(
				(t) =>
					t.title.toLowerCase().includes(needle) ||
					(t.subtitle?.toLowerCase().includes(needle) ?? false) ||
					(t.category?.toLowerCase().includes(needle) ?? false) ||
					(t.patient_display_name?.toLowerCase().includes(needle) ?? false) ||
					(t.contact_label?.toLowerCase().includes(needle) ?? false) ||
					(t.description?.toLowerCase().includes(needle) ?? false)
			);
		}
		// CONTRACT-02 exception: API orders transactions by occurred_on desc, id desc.
		const sorted = items.sort(compareByOccurredOnDesc);
		return HttpResponse.json(paginate(sorted, parsed.data.cursor ?? null, parsed.data.limit));
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

	http.get('/v1/reports/patient-distribution', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		return HttpResponse.json(buildReportPatientDistribution(store, from, to));
	}),

	http.get('/v1/reports/appointment-metrics', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		return HttpResponse.json(buildReportAppointmentMetrics(store, from, to));
	}),

	http.get('/v1/reports/balances', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json(buildReportBalances(store));
	}),

	http.get('/v1/reports/by-category', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		return HttpResponse.json(buildReportByCategory(store, from, to));
	}),

	http.get('/v1/reports/marketing', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		const provider = url.searchParams.get('provider');
		return HttpResponse.json(buildMarketingReport(store, from, to, provider));
	}),

	http.get('/v1/integrations/ads/status', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const lastFor = (provider: 'meta' | 'google') => {
			const dates = store.adMetricsDaily
				.filter((r) => r.provider === provider)
				.map((r) => r.date)
				.sort();
			return dates.at(-1) ?? null;
		};
		return HttpResponse.json({
			items: [
				{
					provider: 'meta',
					connected: mswAdsConnected.has('meta'),
					key_version: mswAdsConnected.has('meta') ? 1 : null,
					last_sync_date: lastFor('meta'),
					customer_id: null
				},
				{
					provider: 'google',
					connected: mswAdsConnected.has('google'),
					key_version: mswAdsConnected.has('google') ? 1 : null,
					last_sync_date: lastFor('google'),
					customer_id: mswAdsConnected.has('google') ? '5556667777' : null
				}
			]
		});
	}),

	http.patch('/v1/integrations/ads/google/customer-id', async ({ request }) => {
		const body = (await request.json()) as { customer_id?: string };
		const digits = String(body.customer_id ?? '').replace(/\D/g, '');
		return HttpResponse.json({
			provider: 'google',
			connected: true,
			key_version: 1,
			last_sync_date: null,
			customer_id: digits || null
		});
	}),

	http.delete('/v1/integrations/ads/:provider', ({ params }) => {
		const provider = String(params.provider);
		if (provider === 'meta' || provider === 'google') {
			mswAdsConnected.delete(provider);
		}
		return new HttpResponse(null, { status: 204 });
	}),

	http.post('/v1/ad-metrics/sync', () => {
		return HttpResponse.json({ mode: 'oauth', upserted: 3 });
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

	http.delete('/v1/transactions/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.transactions.findIndex((t) => t.id === params.id);
		if (idx < 0) return notFound('İşlem bulunamadı');
		const id = store.transactions[idx].id;
		store.transactions.splice(idx, 1);
		refreshUsage(store);
		return HttpResponse.json({ id, deleted: true as const });
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

	http.post('/v1/whatsapp/inbox/:id/approve-drafts', async ({ params, request }) => {
		const body = await request.json();
		const parsed = approveDraftsRequestSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz onay', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const item = store.inboundMessages.find((m) => m.id === params.id);
		if (!item) return notFound('Mesaj bulunamadı');

		const idemKey = request.headers.get('Idempotency-Key')?.trim();
		if (idemKey) {
			const cache = (store as { _approveDraftsIdem?: Map<string, ApproveDraftsResponse> })
				._approveDraftsIdem;
			const map = cache ?? new Map<string, ApproveDraftsResponse>();
			(store as { _approveDraftsIdem?: Map<string, ApproveDraftsResponse> })._approveDraftsIdem =
				map;
			const hit = map.get(idemKey);
			if (hit) return HttpResponse.json(hit, { status: 201 });
		}

		const base = store.tenant.base_currency;
		const created: Transaction[] = [];
		for (const draft of parsed.data.drafts) {
			const patient = draft.patient_id
				? store.patients.find((p) => p.id === draft.patient_id)
				: null;
			const now = nowIso();
			const resolved = normalizeTxFx(
				store,
				resolveTxContact(store, {
					kind: draft.kind,
					title: draft.title.trim(),
					subtitle: null,
					category: draft.category ?? null,
					occurred_on: draft.occurred_on,
					status: draft.status,
					invoice_status: 'none' as const,
					payment_method: draft.payment_method ?? null,
					amount: draft.amount,
					paid_amount: draft.paid_amount,
					currency: draft.currency,
					patient_id: draft.patient_id ?? null,
					contact_id: draft.contact_id ?? null,
					contact_label: draft.contact_label ?? null,
					amount_base: draft.amount_base,
					base_currency: base,
					fx_rate: draft.fx_rate,
					fx_dated: draft.occurred_on,
					description: draft.description ?? null
				})
			);
			const transaction = {
				id: crypto.randomUUID(),
				tenant_id: DEMO_TENANT_ID,
				patient_display_name: patient?.full_name ?? null,
				...resolved,
				created_at: now,
				updated_at: now
			} as Transaction;
			store.transactions.unshift(transaction);
			created.push(transaction);
		}

		let correctionId: string | null = null;
		if (parsed.data.original_parsed && parsed.data.original_parsed.length > 0) {
			const corrected = parsed.data.drafts.map((d) => ({
				kind: d.kind,
				amount: d.amount,
				currency: d.currency,
				counterparty_amount: d.counterparty_amount,
				title: d.title,
				category: d.category,
				subcategory: d.subcategory,
				patient_id: d.patient_id,
				patient_display_name: d.patient_display_name,
				contact_label: d.contact_label,
				occurred_on: d.occurred_on,
				payment_method: d.payment_method,
				description: d.description
			}));
			if (JSON.stringify(parsed.data.original_parsed) !== JSON.stringify(corrected)) {
				const correction: AiCorrection = {
					id: crypto.randomUUID(),
					tenant_id: store.tenant.id,
					inbound_message_id: item.id,
					original_parsed: parsed.data.original_parsed,
					corrected,
					created_by: DEMO_USER_ID,
					created_at: nowIso()
				};
				store.aiCorrections.unshift(correction);
				correctionId = correction.id;
			}
		}

		item.status = 'approved';
		refreshUsage(store);
		const response: ApproveDraftsResponse = {
			id: item.id,
			status: 'approved',
			transactions: created,
			correction_id: correctionId
		};
		if (idemKey) {
			const map = (store as { _approveDraftsIdem?: Map<string, ApproveDraftsResponse> })
				._approveDraftsIdem!;
			map.set(idemKey, response);
		}
		return HttpResponse.json(response, { status: 201 });
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

	http.post('/v1/whatsapp/corrections', async ({ request }) => {
		const body = await request.json();
		const parsed = aiCorrectionCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz düzeltme', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const correction: AiCorrection = {
			id: crypto.randomUUID(),
			tenant_id: store.tenant.id,
			inbound_message_id: parsed.data.inbound_message_id ?? null,
			original_parsed: parsed.data.original_parsed,
			corrected: parsed.data.corrected,
			created_by: DEMO_USER_ID,
			created_at: nowIso()
		};
		store.aiCorrections.unshift(correction);
		return HttpResponse.json(correction, { status: 201 });
	}),

	http.get('/v1/whatsapp/corrections', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json(
			paginate(store.aiCorrections, url.searchParams.get('cursor'), limitFrom(url))
		);
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

	http.post('/v1/patients/:id/files/presign', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const patient = store.patients.find((p) => p.id === params.id);
		if (!patient) return notFound('Hasta bulunamadı');
		const body = await request.json();
		const parsed = patientFilePresignSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz dosya verisi', parsed.error.flatten());

		const fileId = crypto.randomUUID();
		const storage_key = `local://demo/${patient.id}/${fileId}`;
		let appointment_label: string | null = null;
		const appointmentId = parsed.data.appointment_id ?? null;
		if (appointmentId) {
			const appt = store.appointments.find((a) => a.id === appointmentId);
			appointment_label = appt ? appointmentLabel(appt) : null;
		}
		const file: PatientFile = {
			id: fileId,
			tenant_id: patient.tenant_id,
			patient_id: patient.id,
			appointment_id: appointmentId,
			appointment_label,
			filename: parsed.data.filename,
			mime_type: parsed.data.mime_type,
			size_bytes: parsed.data.size_bytes,
			status: 'pending',
			uploaded_by_display_name: demoUser.display_name,
			created_at: nowIso()
		};
		store.files.unshift(file);
		const origin = new URL(request.url).origin;
		return HttpResponse.json(
			{
				file_id: fileId,
				upload_url: `${origin}/v1/patients/${patient.id}/files/${fileId}/content`,
				storage_key,
				expires_in: 300
			},
			{ status: 201 }
		);
	}),

	http.put('/v1/patients/:id/files/:fileId/content', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const file = store.files.find((f) => f.id === params.fileId && f.patient_id === params.id);
		if (!file) return notFound('Dosya bulunamadı');
		const buf = Buffer.from(await request.arrayBuffer());
		if (buf.byteLength !== file.size_bytes) {
			return badRequest('Boyut uyuşmuyor');
		}
		return HttpResponse.json({ accepted: true });
	}),

	http.post('/v1/patients/:id/files/:fileId/confirm', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const file = store.files.find((f) => f.id === params.fileId && f.patient_id === params.id);
		if (!file) return notFound('Dosya bulunamadı');
		file.status = 'ready';
		return HttpResponse.json(file);
	}),

	http.post('/v1/patients/:id/files', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const patient = store.patients.find((p) => p.id === params.id);
		if (!patient) return notFound('Hasta bulunamadı');

		const contentType = request.headers.get('content-type') ?? '';
		let filename = 'upload.bin';
		let mime_type = 'application/octet-stream';
		let size_bytes: number;
		let appointmentId: string | null = null;

		if (contentType.includes('multipart/form-data')) {
			const form = await request.formData();
			const uploaded = form.get('file');
			if (!(uploaded instanceof File)) return badRequest('Expected multipart file field');
			filename = uploaded.name || filename;
			mime_type = uploaded.type || mime_type;
			size_bytes = uploaded.size;
			const apptRaw = form.get('appointment_id');
			appointmentId = typeof apptRaw === 'string' && apptRaw.length > 0 ? apptRaw : null;
		} else {
			const body = await request.json();
			const parsed = patientFileCreateSchema.safeParse(body);
			if (!parsed.success) return badRequest('Geçersiz dosya verisi', parsed.error.flatten());
			filename = parsed.data.filename;
			mime_type = parsed.data.mime_type ?? mime_type;
			size_bytes = parsed.data.size_bytes ?? 0;
			appointmentId = parsed.data.appointment_id ?? null;
		}

		let appointment_label: string | null = null;
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
			filename,
			mime_type,
			size_bytes,
			status: 'ready',
			uploaded_by_display_name: demoUser.display_name,
			created_at: nowIso()
		};
		store.files.unshift(file);
		return HttpResponse.json(file, { status: 201 });
	}),

	http.get('/v1/patients/:id/files/:fileId/download', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const file = store.files.find((f) => f.id === params.fileId && f.patient_id === params.id);
		if (!file) return notFound('Dosya bulunamadı');
		return new HttpResponse(`MSW stub: ${file.filename}`, {
			status: 200,
			headers: {
				'Content-Type': file.mime_type || 'application/octet-stream',
				'Content-Disposition': `attachment; filename="${file.filename}"`
			}
		});
	}),

	http.delete('/v1/patients/:id/files/:fileId', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.files.findIndex((f) => f.id === params.fileId && f.patient_id === params.id);
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
			status: 'ready',
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

	http.get('/v1/settings/trust-score', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json(store.trustScore);
	}),

	http.put('/v1/settings/trust-score', async ({ request }) => {
		const body = await request.json();
		const parsed = trustScoreSettings.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz trust score', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		store.trustScore = parsed.data;
		return HttpResponse.json(store.trustScore);
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
		const parsed = parseListQuery(contactListQuerySchema, url);
		if (!parsed.success) return parsed.response;
		const store = getStore(scenarioFrom(request));
		let items = [...store.contacts];
		const q = parsed.data.q?.trim().toLowerCase();
		if (q) {
			items = items.filter(
				(c) =>
					c.display_name.toLowerCase().includes(q) ||
					(c.email?.toLowerCase().includes(q) ?? false) ||
					(c.phone?.includes(q) ?? false)
			);
		}
		const typeId = parsed.data.type_id;
		if (typeId) items = items.filter((c) => c.contact_type_id === typeId);
		// CONTRACT-02: the real API orders by created_at desc, not display_name — the
		// contacts list page doesn't re-sort client-side, so this was a real MSW/API drift.
		items.sort(compareByCreatedAtDesc);
		return HttpResponse.json(paginate(items, parsed.data.cursor ?? null, parsed.data.limit));
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
				status: 'scheduled',
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
		const id = store.contacts[idx].id;
		store.contacts.splice(idx, 1);
		for (const p of store.patients) {
			if (p.contact_id === id) p.contact_id = null;
		}
		return HttpResponse.json({ id, deleted: true as const });
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

	http.get('/v1/api-keys', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const items = store.apiKeys.filter((k) => k.revoked_at == null);
		return HttpResponse.json({ items });
	}),

	http.post('/v1/api-keys', async ({ request }) => {
		const body = await request.json();
		const parsed = apiKeyCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz anahtar', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const item: ApiKey = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			name: parsed.data.name,
			key_prefix: `vk_${crypto.randomUUID().slice(0, 8)}`,
			scopes: parsed.data.scopes,
			created_at: nowIso(),
			// AUDIT-03 (Faz 8): ApiKey shape now has last_used_at + expires_at. The mock
			// returns NULL for both — mirrors what the API returns for a brand-new
			// key before its first use, and lets the UI render without crashing.
			last_used_at: null,
			expires_at: null,
			revoked_at: null
		};
		store.apiKeys.push(item);
		const created: ApiKeyCreated = { ...item, key: `${item.key_prefix}_${crypto.randomUUID()}` };
		return HttpResponse.json(created, { status: 201 });
	}),

	http.delete('/v1/api-keys/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const item = store.apiKeys.find((k) => k.id === params.id && k.revoked_at == null);
		if (!item) return notFound('Anahtar bulunamadı');
		item.revoked_at = nowIso();
		return HttpResponse.json(item);
	}),

	http.get('/v1/webhook-subscriptions', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json({ items: store.webhookSubscriptions });
	}),

	http.post('/v1/webhook-subscriptions', async ({ request }) => {
		const body = await request.json();
		const parsed = webhookSubscriptionCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz webhook aboneliği', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const item: WebhookSubscription = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			url: parsed.data.url,
			event_types: parsed.data.event_types,
			active: true,
			created_at: nowIso()
		};
		store.webhookSubscriptions.push(item);
		return HttpResponse.json(item, { status: 201 });
	}),

	http.delete('/v1/webhook-subscriptions/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.webhookSubscriptions.findIndex((w) => w.id === params.id);
		if (idx < 0) return notFound('Abonelik bulunamadı');
		store.webhookSubscriptions.splice(idx, 1);
		return HttpResponse.json({ id: params.id });
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
		const baseSlug =
			name
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
			base_currency_locked: false,
			patients_section_label: 'Hastalar',
			timezone: 'Europe/Istanbul',
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
