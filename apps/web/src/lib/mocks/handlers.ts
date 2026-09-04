import { http, HttpResponse } from 'msw';
import {
	DEFAULT_INCENTIVE_DOCUMENTS,
	incentiveFileUpdateSchema,
	buildKnowledgeContext,
	emptyKnowledgeSections,
	findKnowledgePii,
	knowledgeSectionsSchema,
	ATTRIBUTION_COVERAGE_THRESHOLD,
	calculateRealRoas,
	appointmentCreateSchema,
	appointmentUpdateSchema,
	appointmentListQuerySchema,
	auditLogListQuerySchema,
	transactionCreateSchema,
	transactionUpdateSchema,
	transactionListQuerySchema,
	tenantUpdateSchema,
	whatsappParseRequestSchema,
	contactFileCreateSchema,
	contactFilePresignSchema,
	contactCaseNoteCreateSchema,
	contactTypeCreateSchema,
	contactTypeUpdateSchema,
	organizationCreateSchema,
	organizationUpdateSchema,
	contactsBulkTypeSchema,
	contactCreateSchema,
	contactUpdateSchema,
	contactListQuerySchema,
	financeCategoryCreateSchema,
	financeCategoryUpdateSchema,
	settingsReorderSchema,
	mergeRecordsSchema,
	userRoleSchema,
	apiKeyCreateSchema,
	webhookSubscriptionCreateSchema,
	aiCorrectionCreateSchema,
	aiCorrectionsReportParamsSchema,
	aggregateAiCorrectionsReport,
	aiAccuracyReportParamsSchema,
	approveDraftsRequestSchema,
	trustScoreSettings,
	userUiPreferencesUpdateSchema,
	whatsappAiPromptUpdateSchema,
	defaultWhatsappAiPrompt,
	buildPermissionMatrixFromOverrides,
	dataDeletePreviewBodySchema,
	dataDeleteExecuteBodySchema,
	expandDataDeleteTables,
	DATA_DELETE_PLAN_TTL_MS,
	permissionMatrixPatchSchema,
	type PermissionOverride,
	whatsappCreateCategorySchema,
	whatsappCreateContactSchema,
	compareByCreatedAtDesc,
	compareByCreatedAtAsc,
	compareByLastNameAsc,
	compareByOccurredOnDesc,
	compareByDueAtAsc,
	DEFAULT_OPERATION_ALERT_THRESHOLDS,
	OPERATION_ALERT_KINDS,
	cloneOperationAlertThresholds,
	defaultOperationAlertThresholds,
	deriveOperationAlertStatus,
	hoursUntil,
	operationAlertCreateSchema,
	operationAlertDueAtIso,
	operationAlertListQuerySchema,
	operationAlertSettingsUpdateSchema,
	operationAlertThresholdsEqual,
	recordUpdateSuggestionListQuerySchema,
	recordUpdateSuggestionParseRequestSchema,
	recordUpdateSuggestionRejectRequestSchema,
	deriveTransactionLabel,
	evaluateTransactionConsistency,
	isContactInfoIncomplete,
	REPORT_CONSISTENCY_ITEMS_LIMIT,
	REPORT_TRANSACTION_DUPLICATES_ITEMS_LIMIT,
	DUPLICATE_SCAN_ROW_CAP,
	previousReportPeriod,
	tenantDayRange,
	toTenantDayKey,
	resolveCollectedAmount,
	transactionAuditDraftSchema,
	type AiCorrection,
	type ApiKey,
	type ApiKeyCreated,
	type Appointment,
	type AppointmentTypeSetting,
	type ApproveDraftsResponse,
	type CommissionEntry,
	type Contact,
	type ContactStatus,
	type ContactType,
	type FinanceCategory,
	type MarketingReport,
	type MembershipUser,
	type OperationAlert,
	type RecordUpdateSuggestion,
	type Organization,
	type ContactCaseNote,
	type ContactFile,
	type ReportCohorts,
	type SupportedCurrency,
	type Tenant,
	type Transaction,
	type TransactionDraft,
	type UntouchedActivitySource,
	type WebhookSubscription,
	COHORT_ATTRIBUTION_NOTE_KEY,
	cohortMonthDiff,
	maturationBucket
} from '@verimaya/shared';
import { amountInBase, paidAmountInBase } from '$lib/money-base';
import { parseWhatsappMessage } from './whatsapp-parse';
import { findContactDuplicateGroups } from './duplicates';
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

function hydrateOperationAlert(alert: OperationAlert, now = new Date()): OperationAlert {
	return {
		...alert,
		hours_left: hoursUntil(alert.due_at, now),
		status: deriveOperationAlertStatus(alert.confirmed_at, alert.due_at, now)
	};
}

function ensureAlertsForAppointment(store: ReturnType<typeof getStore>, appointment: Appointment) {
	const now = nowIso();
	const thresholds = store.operationAlertThresholds;
	for (const kind of OPERATION_ALERT_KINDS) {
		const setting = thresholds[kind];
		if (!setting.enabled) continue;
		const existing = store.operationAlerts.find(
			(a) => a.appointment_id === appointment.id && a.kind === kind
		);
		const thresholdHours = setting.hours;
		const dueAt = operationAlertDueAtIso(appointment.starts_at, thresholdHours);
		if (existing) {
			existing.due_at = dueAt;
			existing.threshold_hours = thresholdHours;
			existing.appointment_starts_at = appointment.starts_at;
			existing.contact_display_name = appointment.contact_display_name;
			existing.updated_at = now;
		} else {
			store.operationAlerts.push(
				hydrateOperationAlert({
					id: crypto.randomUUID(),
					tenant_id: store.tenant.id,
					appointment_id: appointment.id,
					contact_display_name: appointment.contact_display_name,
					appointment_starts_at: appointment.starts_at,
					kind,
					due_at: dueAt,
					threshold_hours: thresholdHours,
					hours_left: 0,
					status: 'upcoming',
					confirmed_at: null,
					confirmed_by: null,
					created_at: now,
					updated_at: now
				})
			);
		}
	}
}

function applyOperationAlertSettings(
	store: ReturnType<typeof getStore>,
	next: ReturnType<typeof defaultOperationAlertThresholds>
) {
	const previous = store.operationAlertThresholds;
	const now = nowIso();
	for (const kind of OPERATION_ALERT_KINDS) {
		const prev = previous[kind];
		const nextSetting = next[kind];
		if (prev.enabled && !nextSetting.enabled) {
			store.operationAlerts = store.operationAlerts.filter(
				(alert) => alert.kind !== kind || alert.confirmed_at
			);
			continue;
		}
		if (!nextSetting.enabled || prev.hours === nextSetting.hours) continue;
		for (const alert of store.operationAlerts) {
			if (alert.kind !== kind || alert.confirmed_at) continue;
			const appointment = store.appointments.find((a) => a.id === alert.appointment_id);
			if (!appointment) continue;
			alert.threshold_hours = nextSetting.hours;
			alert.due_at = operationAlertDueAtIso(appointment.starts_at, nextSetting.hours);
			alert.updated_at = now;
		}
	}
	store.operationAlertThresholds = cloneOperationAlertThresholds(next);
}

function rescheduleAlertsForAppointment(
	store: ReturnType<typeof getStore>,
	appointment: Appointment
) {
	const now = nowIso();
	for (const alert of store.operationAlerts) {
		if (alert.appointment_id !== appointment.id) continue;
		alert.due_at = operationAlertDueAtIso(appointment.starts_at, alert.threshold_hours);
		alert.appointment_starts_at = appointment.starts_at;
		alert.contact_display_name = appointment.contact_display_name;
		alert.updated_at = now;
	}
}

function deriveDisplayName(firstName: string, lastName: string | null | undefined): string {
	return `${firstName}${lastName?.trim() ? ` ${lastName.trim()}` : ''}`.trim();
}

function hastaContacts(store: ReturnType<typeof getStore>): Contact[] {
	return store.contacts.filter((c) => c.contact_type_name === 'Hasta');
}

function appointmentLabel(a: Appointment): string {
	return `${a.starts_at.slice(0, 10)} · ${a.title ?? 'Randevu'}`;
}

function refreshUsage(store: ReturnType<typeof getStore>) {
	for (const c of store.contacts) {
		let n = 0;
		for (const a of store.appointments) {
			if (a.contact_id === c.id) n += 1;
			if (
				a.clinic_contact_id === c.id ||
				a.hotel_contact_id === c.id ||
				a.transfer_contact_id === c.id ||
				a.doctor_contact_id === c.id
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
		if (c) {
			next.contact_label = c.display_name;
			next.contact_display_name = c.display_name;
		}
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
	return amountInBase(tx, tenantBase as SupportedCurrency);
}

/** Tahsilat in tenant base — mirrors resolvePaidBaseAmount. */
function paidInBaseMock(tx: Transaction, tenantBase: string): number {
	return paidAmountInBase(tx, tenantBase as SupportedCurrency) ?? 0;
}

function sourceLabel(source: string | null | undefined): string {
	const trimmed = (source ?? '').trim();
	return trimmed || 'Bilinmeyen';
}

function contactCreatedDay(iso: string): string {
	return iso.slice(0, 10);
}

export function buildMarketingReport(
	store: ReturnType<typeof getStore>,
	from: string | null,
	to: string | null,
	provider: string | null
): MarketingReport {
	const tenantBase = store.tenant.base_currency;

	let effective_from: string | null = from;
	let effective_to: string | null = to;
	let spendFrom = from;
	let spendTo = to;

	if (!from && !to) {
		let rangeRows = store.adMetricsDaily;
		if (provider === 'meta' || provider === 'google') {
			rangeRows = rangeRows.filter((r) => r.provider === provider);
		}
		const dates = rangeRows.map((r) => r.date).sort();
		if (dates.length === 0) {
			effective_from = null;
			effective_to = null;
			spendFrom = null;
			spendTo = null;
		} else {
			effective_from = dates[0]!;
			effective_to = dates[dates.length - 1]!;
			spendFrom = effective_from;
			spendTo = effective_to;
		}
	}

	let spendRows = store.adMetricsDaily;
	if (spendFrom) spendRows = spendRows.filter((r) => r.date >= spendFrom);
	if (spendTo) spendRows = spendRows.filter((r) => r.date <= spendTo);
	if (provider === 'meta' || provider === 'google') {
		spendRows = spendRows.filter((r) => r.provider === provider);
	}

	/** Mirrors apps/api resolveBaseAmount for ad spend rows. */
	function spendInBase(r: (typeof spendRows)[number]): number | null {
		if (r.currency == null) return null;
		if (r.currency === tenantBase) return r.spend_base ?? r.spend_minor;
		if (r.spend_base != null && r.base_currency === tenantBase) return r.spend_base;
		return null;
	}

	let spendSum = 0;
	let spend_fx_missing = false;
	for (const r of spendRows) {
		const resolved = spendInBase(r);
		if (resolved == null) {
			spend_fx_missing = true;
			continue;
		}
		spendSum += resolved;
	}

	const incomeRows = filterTransactionsByPeriod(store.transactions, spendFrom, spendTo).filter(
		(t) => t.kind === 'income'
	);
	const contactById = new Map(store.contacts.map((c) => [c.id, c]));
	const revenueBySource = new Map<string, number>();
	let revenue_base = 0;
	for (const t of incomeRows) {
		const paid = paidInBaseMock(t, tenantBase);
		revenue_base += paid;
		const contact = t.contact_id ? contactById.get(t.contact_id) : undefined;
		const label = sourceLabel(contact?.source);
		revenueBySource.set(label, (revenueBySource.get(label) ?? 0) + paid);
	}

	const cohortContacts = hastaContacts(store).filter((c) => {
		const day = contactCreatedDay(c.created_at);
		if (spendFrom && day < spendFrom) return false;
		if (spendTo && day > spendTo) return false;
		return true;
	});
	const cohortBySource = new Map<string, { leads: number; treated: number }>();
	let leads_count = 0;
	let treated_count = 0;
	for (const c of cohortContacts) {
		leads_count += 1;
		const isTreated = c.status === 'treated';
		if (isTreated) treated_count += 1;
		const label = sourceLabel(c.source);
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

	const unknownLeads = cohortBySource.get('Bilinmeyen')?.leads ?? 0;
	const attribution_coverage =
		leads_count === 0 ? null : (leads_count - unknownLeads) / leads_count;
	const attribution_missing =
		attribution_coverage != null && attribution_coverage < ATTRIBUTION_COVERAGE_THRESHOLD;

	const period = { from, to, effective_from, effective_to };

	if (spend_fx_missing) {
		return {
			period,
			spend_base: null,
			revenue_base,
			real_roas: null,
			leads_count,
			treated_count,
			cost_per_lead: null,
			cost_per_treated: null,
			spend_fx_missing: true,
			attribution_coverage,
			attribution_missing,
			by_source
		};
	}

	const metrics = calculateRealRoas({
		spendMinor: spendSum,
		revenueMinor: revenue_base,
		leads: leads_count,
		treated: treated_count
	});

	if (attribution_missing) {
		return {
			period,
			spend_base: spendSum,
			revenue_base,
			real_roas: null,
			leads_count,
			treated_count,
			cost_per_lead: null,
			cost_per_treated: null,
			spend_fx_missing: false,
			attribution_coverage,
			attribution_missing: true,
			by_source
		};
	}

	return {
		period,
		spend_base: spendSum,
		revenue_base,
		real_roas: metrics.realRoas,
		leads_count,
		treated_count,
		cost_per_lead: metrics.costPerLead,
		cost_per_treated: metrics.costPerTreated,
		spend_fx_missing: false,
		attribution_coverage,
		attribution_missing: false,
		by_source
	};
}

/** Tarih bazlı kohort — demo store'dan hesaplar (uydurma sabit yok). */
export function buildReportCohorts(
	store: ReturnType<typeof getStore>,
	from: string | null,
	to: string | null,
	contactType: string | null
): ReportCohorts {
	const tenantBase = store.tenant.base_currency as SupportedCurrency;
	const tz = store.tenant.timezone ?? 'Europe/Istanbul';

	const contacts = store.contacts
		.filter((c) => c.tenant_id === store.tenant.id)
		.filter((c) => !contactType || c.contact_type_name === contactType)
		.filter((c) => {
			const day = toTenantDayKey(new Date(c.created_at), tz);
			if (from && day < from) return false;
			if (to && day > to) return false;
			return true;
		});

	const contactMonth = new Map<string, string>();
	const idsByMonth = new Map<string, string[]>();
	for (const c of contacts) {
		const month = toTenantDayKey(new Date(c.created_at), tz).slice(0, 7);
		contactMonth.set(c.id, month);
		const list = idsByMonth.get(month) ?? [];
		list.push(c.id);
		idsByMonth.set(month, list);
	}

	const contactIdSet = new Set(contacts.map((c) => c.id));
	const treatedIds = new Set(
		store.appointments
			.filter((a) => a.status === 'completed' && a.contact_id && contactIdSet.has(a.contact_id))
			.map((a) => a.contact_id as string)
	);

	const spendByMonth = new Map<string, number>();
	for (const r of store.adMetricsDaily) {
		if (from && r.date < from) continue;
		if (to && r.date > to) continue;
		const month = r.date.slice(0, 7);
		let base: number | null = null;
		if (r.currency == null) base = null;
		else if (r.currency === tenantBase) base = r.spend_base ?? r.spend_minor;
		else if (r.spend_base != null && r.base_currency === tenantBase) base = r.spend_base;
		if (base == null) continue;
		spendByMonth.set(month, (spendByMonth.get(month) ?? 0) + base);
	}
	// Sunucuyla aynı kural: satırı olmayan ay "veri yok" (null), satırı olup toplamı
	// sıfır olan ay gerçekten 0.
	const monthsWithSpendData = new Set(
		store.adMetricsDaily
			.filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
			.map((r) => r.date.slice(0, 7))
	);

	type Mat = ReportCohorts['items'][number]['maturation'];
	const emptyMat = (): Mat => ({ m0: 0, m1: 0, m2: 0, m3_plus: 0 });
	const collectedByMonth = new Map<string, number>();
	const matByMonth = new Map<string, Mat>();
	let missing_fx_count = 0;

	for (const tx of store.transactions) {
		if (tx.kind !== 'income') continue;
		if (!tx.contact_id || !contactIdSet.has(tx.contact_id)) continue;
		const month = contactMonth.get(tx.contact_id);
		if (!month) continue;

		const paidBase = paidAmountInBase(tx, tenantBase);
		if (paidBase == null) {
			missing_fx_count += 1;
			continue;
		}
		if (paidBase === 0) continue;

		collectedByMonth.set(month, (collectedByMonth.get(month) ?? 0) + paidBase);
		const mat = matByMonth.get(month) ?? emptyMat();
		mat[maturationBucket(cohortMonthDiff(month, tx.occurred_on))] += paidBase;
		matByMonth.set(month, mat);
	}

	const monthKeys = new Set<string>([
		...idsByMonth.keys(),
		...spendByMonth.keys(),
		...collectedByMonth.keys()
	]);
	if (from && to) {
		let [y, m] = from.slice(0, 7).split('-').map(Number) as [number, number];
		const [ey, em] = to.slice(0, 7).split('-').map(Number) as [number, number];
		while (y < ey || (y === ey && m <= em)) {
			monthKeys.add(`${y}-${String(m).padStart(2, '0')}`);
			m += 1;
			if (m > 12) {
				m = 1;
				y += 1;
			}
		}
	}

	const items = [...monthKeys]
		.sort((a, b) => a.localeCompare(b))
		.map((cohort_month) => {
			const ids = idsByMonth.get(cohort_month) ?? [];
			const spend_base = monthsWithSpendData.has(cohort_month)
				? (spendByMonth.get(cohort_month) ?? 0)
				: null;
			const collected_base = collectedByMonth.get(cohort_month) ?? 0;
			return {
				cohort_month,
				contacts: ids.length,
				treated: ids.filter((id) => treatedIds.has(id)).length,
				spend_base,
				collected_base,
				roas: spend_base == null || spend_base === 0 ? null : collected_base / spend_base,
				maturation: matByMonth.get(cohort_month) ?? emptyMat()
			};
		});

	return {
		period: { from, to },
		note_key: COHORT_ATTRIBUTION_NOTE_KEY,
		missing_fx_count,
		items
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
		coverage_ratio:
			transactionCount === 0 ? 1 : (transactionCount - fxMissingCount) / transactionCount
	};
}

function buildReportContactDistribution(
	store: ReturnType<typeof getStore>,
	from: string | null,
	to: string | null
) {
	let contacts = hastaContacts(store);
	if (from) {
		contacts = contacts.filter((c) => contactCreatedDay(c.created_at) >= from);
	}
	if (to) {
		contacts = contacts.filter((c) => contactCreatedDay(c.created_at) <= to);
	}

	const statusCounts = new Map<string, number>();
	const sourceCounts = new Map<string, number>();
	const mediumCounts = new Map<string, number>();
	for (const c of contacts) {
		if (c.status) {
			statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);
		}
		const source = sourceLabel(c.source);
		sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
		const medium = sourceLabel(c.medium);
		mediumCounts.set(medium, (mediumCounts.get(medium) ?? 0) + 1);
	}

	const by_status = [...statusCounts.entries()]
		.map(([status, count]) => ({
			status: status as ContactStatus,
			count
		}))
		.sort((a, b) => b.count - a.count);
	const by_source = [...sourceCounts.entries()]
		.map(([source, count]) => ({ source, count }))
		.sort((a, b) => b.count - a.count);
	const by_medium = [...mediumCounts.entries()]
		.map(([medium, count]) => ({ medium, count }))
		.sort((a, b) => b.count - a.count);

	return {
		period: { from, to },
		by_status,
		by_source,
		by_medium,
		total: contacts.length
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

	// Hekim kırılımı — doctor_contact_id'nin denormalized bir isim kolonu yok
	// (clinic_name'in aksine); isim her zaman contacts'a bakılarak çözülür.
	const doctorName = (id: string | null) =>
		(id ? store.contacts.find((c) => c.id === id)?.display_name : null) ?? 'Atanmamış';
	const doctorMap = new Map<
		string,
		{
			doctor_contact_id: string | null;
			doctor_name: string;
			total: number;
			completed: number;
			no_show: number;
			cancelled: number;
		}
	>();
	const doctorTypeMap = new Map<
		string,
		{
			doctor_contact_id: string | null;
			doctor_name: string;
			appointment_type: string;
			count: number;
		}
	>();
	for (const a of items) {
		const name = doctorName(a.doctor_contact_id);
		const key = `${a.doctor_contact_id ?? ''}\0${name}`;
		const cur = doctorMap.get(key) ?? {
			doctor_contact_id: a.doctor_contact_id,
			doctor_name: name,
			total: 0,
			completed: 0,
			no_show: 0,
			cancelled: 0
		};
		cur.total += 1;
		if (a.status === 'completed') cur.completed += 1;
		if (a.status === 'no_show') cur.no_show += 1;
		if (a.status === 'cancelled') cur.cancelled += 1;
		doctorMap.set(key, cur);

		const type = (a.appointment_type ?? '').trim() || 'Belirtilmemiş';
		const typeKey = `${key}\0${type}`;
		const curType = doctorTypeMap.get(typeKey) ?? {
			doctor_contact_id: a.doctor_contact_id,
			doctor_name: name,
			appointment_type: type,
			count: 0
		};
		curType.count += 1;
		doctorTypeMap.set(typeKey, curType);
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
		by_doctor: [...doctorMap.values()].sort((a, b) => b.total - a.total),
		by_doctor_type: [...doctorTypeMap.values()].sort((a, b) => b.count - a.count),
		monthly: [...monthMap.entries()]
			.map(([month, count]) => ({ month, count }))
			.sort((a, b) => a.month.localeCompare(b.month))
	};
}

function buildReportConsistency(
	store: ReturnType<typeof getStore>,
	from: string | null,
	to: string | null
) {
	const base = store.tenant.base_currency;
	const rows = filterTransactionsByPeriod(store.transactions, from, to);
	type Item = {
		transaction_id: string;
		title: string;
		occurred_on: string;
		severity: 'warning' | 'error';
		code: string;
		message_key: string;
	};
	const items: Item[] = [];

	for (const t of rows) {
		const responsible = t.responsible_contact_id
			? store.contacts.find((c) => c.id === t.responsible_contact_id)
			: undefined;
		const issues = evaluateTransactionConsistency(
			{
				kind: t.kind,
				category: t.category,
				contact_id: t.contact_id,
				contact_label: t.contact_label,
				case_contact_id: t.case_contact_id,
				responsible_contact_id: t.responsible_contact_id,
				currency: t.currency,
				amount: t.amount,
				paid_amount: t.paid_amount,
				amount_base: t.amount_base,
				status: t.status,
				responsible_is_internal: responsible?.is_internal ?? null
			},
			{ baseCurrency: base }
		);
		const title = deriveTransactionLabel(t);
		for (const issue of issues) {
			items.push({
				transaction_id: t.id,
				title,
				occurred_on: t.occurred_on,
				severity: issue.severity,
				code: issue.code,
				message_key: issue.message_key
			});
		}
	}

	items.sort((a, b) => {
		const sev = (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1);
		if (sev !== 0) return sev;
		const byDate = b.occurred_on.localeCompare(a.occurred_on);
		if (byDate !== 0) return byDate;
		return b.transaction_id.localeCompare(a.transaction_id);
	});

	let error = 0;
	let warning = 0;
	const counts_by_code: Record<string, number> = {};
	for (const item of items) {
		counts_by_code[item.code] = (counts_by_code[item.code] ?? 0) + 1;
		if (item.severity === 'error') error += 1;
		else warning += 1;
	}

	const truncated = error + warning > REPORT_CONSISTENCY_ITEMS_LIMIT;
	return {
		period: { from, to },
		items: truncated ? items.slice(0, REPORT_CONSISTENCY_ITEMS_LIMIT) : items,
		counts: { error, warning },
		counts_by_code,
		truncated
	};
}

function buildReportTransactionDuplicates(
	store: ReturnType<typeof getStore>,
	from: string | null,
	to: string | null
) {
	const rows = filterTransactionsByPeriod(store.transactions, from, to);
	const map = new Map<
		string,
		{
			count: number;
			amount: number;
			currency: string;
			occurred_on: string;
			kind: string;
			title: string;
		}
	>();
	for (const t of rows) {
		const key = `${t.amount}|${t.currency}|${t.occurred_on}|${t.kind}`;
		const title = t.title ?? '—';
		const existing = map.get(key);
		if (existing) {
			existing.count += 1;
			if (title.localeCompare(existing.title) < 0) existing.title = title;
		} else {
			map.set(key, {
				count: 1,
				amount: t.amount,
				currency: t.currency,
				occurred_on: t.occurred_on,
				kind: t.kind,
				title
			});
		}
	}
	const groups = [...map.values()]
		.filter((g) => g.count > 1)
		.sort((a, b) => b.count - a.count || a.occurred_on.localeCompare(b.occurred_on));
	return {
		items: groups.slice(0, REPORT_TRANSACTION_DUPLICATES_ITEMS_LIMIT),
		total_groups: groups.length
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
		const paid = resolveCollectedAmount({
			status: t.status,
			amount: t.amount,
			paidAmount: t.paid_amount
		});
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

function conflict(code: string, message: string) {
	return HttpResponse.json(
		{
			error: { code, message },
			request_id: crypto.randomUUID()
		},
		{ status: 409 }
	);
}

function unprocessable(message: string) {
	return HttpResponse.json(
		{
			error: { code: 'unprocessable_entity', message },
			request_id: crypto.randomUUID()
		},
		{ status: 422 }
	);
}

/** Demo: Meta connected so disconnect UI is exercisable under MSW. */
const mswAdsConnected = new Set<string>(['meta']);

export const handlers = [
	http.get('/v1/me', () => HttpResponse.json(demoUser)),

	http.get('/v1/me/organizations', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json({
			items: store.tenants.map((t) => ({ id: t.id, name: t.name, slug: t.slug }))
		});
	}),

	http.put('/v1/me/preferences', async ({ request }) => {
		const body = await request.json();
		const parsed = userUiPreferencesUpdateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz tercihler', parsed.error.flatten());
		demoUser.preferences = parsed.data;
		return HttpResponse.json(parsed.data);
	}),

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

	http.post('/v1/members', async ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const body = (await request.json()) as {
			email?: string;
			display_name?: string;
			role?: string;
			password?: string;
		};
		const email = body.email?.trim().toLowerCase() ?? '';
		const displayName = body.display_name?.trim() ?? '';
		const role = userRoleSchema.safeParse(body.role ?? 'agent');
		if (!email || !displayName || !role.success || !body.password || body.password.length < 8) {
			return badRequest('Geçersiz üye');
		}
		const existing = store.members.find(
			(m) => m.tenant_id === store.tenant.id && m.email === email
		);
		if (existing) {
			const updated: MembershipUser = {
				...existing,
				display_name: displayName,
				role: role.data
			};
			const idx = store.members.findIndex((m) => m.id === existing.id);
			store.members[idx] = updated;
			return HttpResponse.json(updated);
		}
		const userId = crypto.randomUUID();
		const member: MembershipUser = {
			id: crypto.randomUUID(),
			user_id: userId,
			tenant_id: store.tenant.id,
			email,
			display_name: displayName,
			role: role.data,
			created_at: new Date().toISOString()
		};
		store.members.push(member);
		return HttpResponse.json(member);
	}),

	http.patch('/v1/members/:id', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const body = (await request.json()) as { role?: string; password?: string };
		const idx = store.members.findIndex(
			(m) => m.id === params.id && m.tenant_id === store.tenant.id
		);
		if (idx < 0) return notFound('Üye bulunamadı');
		const current = store.members[idx]!;
		if (current.id === DEMO_USER_ID || current.user_id === DEMO_USER_ID) {
			if (body.password !== undefined) {
				return HttpResponse.json(
					{
						error: {
							code: 'cannot_change_own_password',
							message: 'Use change-password for your own password'
						},
						request_id: 'msw'
					},
					{ status: 403 }
				);
			}
			return HttpResponse.json(
				{
					error: { code: 'cannot_change_own_role', message: 'You cannot change your own role' },
					request_id: 'msw'
				},
				{ status: 403 }
			);
		}
		let nextRole = current.role;
		if (body.role !== undefined) {
			const parsed = userRoleSchema.safeParse(body.role);
			if (!parsed.success) return badRequest('Geçersiz rol');
			if (current.role === 'owner' && parsed.data !== 'owner') {
				const owners = store.members.filter(
					(m) => m.tenant_id === store.tenant.id && m.role === 'owner'
				);
				if (owners.length <= 1) {
					return badRequest('Cannot demote the last owner');
				}
			}
			nextRole = parsed.data;
		}
		if (body.password !== undefined && body.password.length < 8) {
			return badRequest('Geçersiz şifre');
		}
		const updated: MembershipUser = { ...current, role: nextRole };
		store.members[idx] = updated;
		return HttpResponse.json(updated);
	}),

	http.delete('/v1/members/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.members.findIndex(
			(m) => m.id === params.id && m.tenant_id === store.tenant.id
		);
		if (idx < 0) return notFound('Üye bulunamadı');
		const current = store.members[idx]!;
		if (current.id === DEMO_USER_ID || current.user_id === DEMO_USER_ID) {
			return HttpResponse.json(
				{
					error: { code: 'cannot_remove_self', message: 'You cannot remove your own membership' },
					request_id: 'msw'
				},
				{ status: 400 }
			);
		}
		if (current.role === 'owner') {
			const owners = store.members.filter(
				(m) => m.tenant_id === store.tenant.id && m.role === 'owner'
			);
			if (owners.length <= 1) {
				return badRequest('Cannot remove the last owner');
			}
		}
		store.members.splice(idx, 1);
		return HttpResponse.json({ id: current.id, deleted: true });
	}),

	http.post('/v1/members/:id/password-reset', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const member = store.members.find((m) => m.id === params.id && m.tenant_id === store.tenant.id);
		if (!member) return notFound('Üye bulunamadı');
		if (member.id === DEMO_USER_ID || member.user_id === DEMO_USER_ID) {
			return HttpResponse.json(
				{
					error: {
						code: 'cannot_reset_own_password',
						message: 'Use change-password for your own password'
					},
					request_id: 'msw'
				},
				{ status: 403 }
			);
		}
		return HttpResponse.json({ sent: true });
	}),

	http.get('/v1/audit-logs', ({ request }) => {
		const url = new URL(request.url);
		const parsed = parseListQuery(auditLogListQuerySchema, url);
		if (!parsed.success) return parsed.response;
		const store = getStore(scenarioFrom(request));
		let items = [...store.auditLogs];
		const {
			actor_id: actorId,
			action,
			entity_type: entityType,
			created_from: createdFrom,
			created_to: createdTo,
			q
		} = parsed.data;
		if (actorId) items = items.filter((l) => l.actor_id === actorId);
		if (action) items = items.filter((l) => l.action === action);
		if (entityType) items = items.filter((l) => l.entity_type === entityType);
		const tz = store.tenant.timezone;
		if (createdFrom) {
			const { start } = tenantDayRange(createdFrom, tz);
			items = items.filter((l) => l.created_at >= start.toISOString());
		}
		if (createdTo) {
			const { endExclusive } = tenantDayRange(createdTo, tz);
			items = items.filter((l) => l.created_at < endExclusive.toISOString());
		}
		if (q) {
			const needle = q.toLowerCase();
			items = items.filter((l) => l.entity_label?.toLowerCase().includes(needle) ?? false);
		}
		items.sort(compareByCreatedAtDesc);
		return HttpResponse.json(paginate(items, parsed.data.cursor ?? null, parsed.data.limit));
	}),

	http.get('/v1/search', ({ request }) => {
		const url = new URL(request.url);
		const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
		if (q.length < 2) {
			return HttpResponse.json({ contacts: [], appointments: [], transactions: [] });
		}
		const store = getStore(scenarioFrom(request));
		const contacts = hastaContacts(store)
			.filter(
				(c) =>
					c.display_name.toLowerCase().includes(q) ||
					c.first_name.toLowerCase().includes(q) ||
					(c.last_name?.toLowerCase().includes(q) ?? false) ||
					(c.email?.toLowerCase().includes(q) ?? false) ||
					(c.phone?.includes(q) ?? false)
			)
			.slice(0, 8);
		const appointments = store.appointments
			.filter(
				(a) =>
					a.contact_display_name.toLowerCase().includes(q) ||
					(a.title?.toLowerCase().includes(q) ?? false) ||
					(a.appointment_type?.toLowerCase().includes(q) ?? false)
			)
			.slice(0, 6);
		const transactions = store.transactions
			.filter(
				(t) =>
					(t.title?.toLowerCase().includes(q) ?? false) ||
					(t.contact_display_name?.toLowerCase().includes(q) ?? false) ||
					(t.category?.toLowerCase().includes(q) ?? false)
			)
			.slice(0, 6);
		return HttpResponse.json({ contacts, appointments, transactions });
	}),

	http.get('/v1/appointments', ({ request }) => {
		const url = new URL(request.url);
		const parsed = parseListQuery(appointmentListQuerySchema, url);
		if (!parsed.success) return parsed.response;
		const store = getStore(scenarioFrom(request));
		let items = [...store.appointments];
		const {
			contact_id: contactId,
			contact_involves: contactInvolves,
			from,
			to,
			status,
			appointment_type: appointmentType,
			q
		} = parsed.data;
		if (contactId) items = items.filter((a) => a.contact_id === contactId);
		if (contactInvolves) {
			items = items.filter(
				(a) =>
					a.contact_id === contactInvolves ||
					a.clinic_contact_id === contactInvolves ||
					a.hotel_contact_id === contactInvolves ||
					a.transfer_contact_id === contactInvolves ||
					a.doctor_contact_id === contactInvolves
			);
		}
		if (status) items = items.filter((a) => a.status === status);
		if (appointmentType) items = items.filter((a) => a.appointment_type === appointmentType);
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
					a.contact_display_name.toLowerCase().includes(needle) ||
					(a.notes?.toLowerCase().includes(needle) ?? false) ||
					(a.clinic_name?.toLowerCase().includes(needle) ?? false) ||
					(a.hotel_name?.toLowerCase().includes(needle) ?? false)
			);
		}
		// CONTRACT-02: match the real API's order (created_at desc) — the calendar UI
		// re-sorts by starts_at client-side regardless, so this doesn't change behavior.
		items.sort(compareByCreatedAtDesc);

		items = items.map((a) => {
			const c = store.contacts.find((x) => x.id === a.contact_id);
			return {
				...a,
				contact_info_incomplete: isContactInfoIncomplete(c?.phone, c?.email)
			};
		});

		const type_counts: Record<string, number> = {};
		const status_counts: Record<string, number> = {};
		for (const a of items) {
			const typeKey = a.appointment_type ?? '';
			type_counts[typeKey] = (type_counts[typeKey] ?? 0) + 1;
			status_counts[a.status] = (status_counts[a.status] ?? 0) + 1;
		}

		return HttpResponse.json({
			...paginate(items, parsed.data.cursor ?? null, parsed.data.limit),
			type_counts,
			status_counts
		});
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
		const contact = store.contacts.find((c) => c.id === parsed.data.contact_id);
		if (!contact) return badRequest('Kişi bulunamadı');
		const now = nowIso();
		const resolved = resolvePartyNames(store, parsed.data);
		const appointment: Appointment = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			contact_display_name: contact.display_name,
			contact_info_incomplete: isContactInfoIncomplete(contact.phone, contact.email),
			...resolved,
			created_at: now,
			updated_at: now
		} as Appointment;
		store.appointments.push(appointment);
		ensureAlertsForAppointment(store, appointment);
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
		const previousStartsAt = store.appointments[idx].starts_at;
		const nextContactId = parsed.data.contact_id ?? store.appointments[idx].contact_id;
		const contact = store.contacts.find((c) => c.id === nextContactId);
		const resolved = resolvePartyNames(store, parsed.data);
		const updated: Appointment = {
			...store.appointments[idx],
			...resolved,
			contact_display_name: contact?.display_name ?? store.appointments[idx].contact_display_name,
			contact_info_incomplete: isContactInfoIncomplete(contact?.phone, contact?.email),
			updated_at: nowIso()
		};
		store.appointments[idx] = updated;
		if (updated.starts_at !== previousStartsAt) {
			rescheduleAlertsForAppointment(store, updated);
		}
		refreshUsage(store);
		return HttpResponse.json(updated);
	}),

	http.delete('/v1/appointments/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.appointments.findIndex((a) => a.id === params.id);
		if (idx < 0) return notFound('Randevu bulunamadı');
		const id = store.appointments[idx].id;
		store.appointments.splice(idx, 1);
		store.operationAlerts = store.operationAlerts.filter((a) => a.appointment_id !== id);
		refreshUsage(store);
		return HttpResponse.json({ id, deleted: true as const });
	}),

	http.get('/v1/operation-alerts', ({ request }) => {
		const url = new URL(request.url);
		const parsed = parseListQuery(operationAlertListQuerySchema, url);
		if (!parsed.success) return parsed.response;
		const store = getStore(scenarioFrom(request));
		const now = new Date();
		let items = store.operationAlerts
			.filter((a) => a.tenant_id === store.tenant.id)
			.map((a) => hydrateOperationAlert(a, now));
		if (parsed.data.status) {
			items = items.filter((a) => a.status === parsed.data.status);
		}
		if (parsed.data.within_hours != null) {
			const cutoff = now.getTime() + parsed.data.within_hours * 3_600_000;
			items = items.filter((a) => new Date(a.due_at).getTime() <= cutoff);
		}
		items.sort(compareByDueAtAsc);
		return HttpResponse.json(paginate(items, parsed.data.cursor ?? null, parsed.data.limit));
	}),

	http.post('/v1/operation-alerts', async ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const parsed = operationAlertCreateSchema.safeParse(await request.json());
		if (!parsed.success) return badRequest('Geçersiz alarm', parsed.error.flatten());
		const appointment = store.appointments.find((a) => a.id === parsed.data.appointment_id);
		if (!appointment) return notFound('Randevu bulunamadı');
		const dup = store.operationAlerts.find(
			(a) => a.appointment_id === appointment.id && a.kind === parsed.data.kind
		);
		if (dup) return conflict('conflict', 'Operation alert already exists for this kind');
		const setting = store.operationAlertThresholds[parsed.data.kind];
		if (!setting.enabled) return unprocessable('Operation alert kind is disabled');
		const thresholdHours = setting.hours;
		const now = nowIso();
		const created = hydrateOperationAlert({
			id: crypto.randomUUID(),
			tenant_id: store.tenant.id,
			appointment_id: appointment.id,
			contact_display_name: appointment.contact_display_name,
			appointment_starts_at: appointment.starts_at,
			kind: parsed.data.kind,
			due_at: operationAlertDueAtIso(appointment.starts_at, thresholdHours),
			threshold_hours: thresholdHours,
			hours_left: 0,
			status: 'upcoming',
			confirmed_at: null,
			confirmed_by: null,
			created_at: now,
			updated_at: now
		});
		store.operationAlerts.push(created);
		return HttpResponse.json(created, { status: 201 });
	}),

	http.patch('/v1/operation-alerts/:id/confirm', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.operationAlerts.findIndex(
			(a) => a.id === params.id && a.tenant_id === store.tenant.id
		);
		if (idx < 0) return notFound('Alarm bulunamadı');
		const current = store.operationAlerts[idx]!;
		if (!current.confirmed_at) {
			const now = nowIso();
			store.operationAlerts[idx] = {
				...current,
				confirmed_at: now,
				confirmed_by: demoUser.display_name,
				updated_at: now
			};
		}
		return HttpResponse.json(hydrateOperationAlert(store.operationAlerts[idx]!));
	}),

	http.delete('/v1/operation-alerts/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.operationAlerts.findIndex(
			(a) => a.id === params.id && a.tenant_id === store.tenant.id
		);
		if (idx < 0) return notFound('Alarm bulunamadı');
		const id = store.operationAlerts[idx]!.id;
		store.operationAlerts.splice(idx, 1);
		return HttpResponse.json({ id, deleted: true as const });
	}),

	http.get('/v1/record-suggestions', ({ request }) => {
		const url = new URL(request.url);
		const parsed = parseListQuery(recordUpdateSuggestionListQuerySchema, url);
		if (!parsed.success) return parsed.response;
		const store = getStore(scenarioFrom(request));
		let items = store.recordUpdateSuggestions.filter((s) => s.tenant_id === store.tenant.id);
		if (parsed.data.status) {
			items = items.filter((s) => s.status === parsed.data.status);
		}
		items.sort(compareByCreatedAtDesc);
		return HttpResponse.json(paginate(items, parsed.data.cursor ?? null, parsed.data.limit));
	}),

	http.post('/v1/record-suggestions/parse', async ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const parsed = recordUpdateSuggestionParseRequestSchema.safeParse(await request.json());
		if (!parsed.success) return badRequest('Geçersiz mesaj', parsed.error.flatten());
		const message = parsed.data.message.toLocaleLowerCase('tr');
		const isoMatch = parsed.data.message.match(
			/\b(20\d{2}-\d{2}-\d{2})(?:[ T](\d{1,2})(?::(\d{2}))?)?/
		);
		if (!isoMatch) return HttpResponse.json({ items: [], skipped_reason: 'no_date' });

		const target = new Date(
			isoMatch[1] + 'T' + (isoMatch[2] ?? '10') + ':' + (isoMatch[3] ?? '00') + ':00.000Z'
		);
		const candidates = store.appointments.filter((a) => {
			const name = a.contact_display_name.toLocaleLowerCase('tr');
			const parts = name.split(/\s+/).filter((p) => p.length > 2);
			return parts.some((p) => message.includes(p));
		});
		if (candidates.length !== 1) {
			return HttpResponse.json({
				items: [],
				skipped_reason: candidates.length > 1 ? 'ambiguous_contact' : null
			});
		}

		const appointment = candidates[0]!;
		if (appointment.starts_at === target.toISOString()) {
			return HttpResponse.json({ items: [], skipped_reason: 'no_change' });
		}
		const dup = store.recordUpdateSuggestions.find(
			(s) =>
				s.appointment_id === appointment.id &&
				s.field === 'starts_at' &&
				s.status === 'pending' &&
				s.tenant_id === store.tenant.id
		);
		if (dup) return HttpResponse.json({ items: [], skipped_reason: null });

		const now = nowIso();
		const created: RecordUpdateSuggestion = {
			id: crypto.randomUUID(),
			tenant_id: store.tenant.id,
			appointment_id: appointment.id,
			contact_display_name: appointment.contact_display_name,
			field: 'starts_at',
			current_value: appointment.starts_at,
			suggested_value: target.toISOString(),
			source_text: parsed.data.message.slice(0, 4000),
			confidence: 'medium',
			status: 'pending',
			decided_at: null,
			decided_by: null,
			reject_reason: null,
			created_at: now,
			updated_at: now
		};
		store.recordUpdateSuggestions.push(created);
		return HttpResponse.json({ items: [created], skipped_reason: null });
	}),

	http.post('/v1/record-suggestions/:id/approve', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.recordUpdateSuggestions.findIndex(
			(s) => s.id === params.id && s.tenant_id === store.tenant.id && s.status === 'pending'
		);
		if (idx < 0) return notFound('Öneri bulunamadı');
		const suggestion = store.recordUpdateSuggestions[idx]!;
		const apptIdx = store.appointments.findIndex((a) => a.id === suggestion.appointment_id);
		if (apptIdx < 0) return notFound('Randevu bulunamadı');
		if (store.appointments[apptIdx]!.starts_at !== suggestion.current_value) {
			return conflict('conflict', 'Appointment was modified since this suggestion was created');
		}
		const now = nowIso();
		store.appointments[apptIdx] = {
			...store.appointments[apptIdx]!,
			starts_at: suggestion.suggested_value,
			updated_at: now
		};
		rescheduleAlertsForAppointment(store, store.appointments[apptIdx]!);
		store.recordUpdateSuggestions[idx] = {
			...suggestion,
			status: 'approved',
			decided_at: now,
			decided_by: demoUser.display_name,
			updated_at: now
		};
		return HttpResponse.json(store.recordUpdateSuggestions[idx]);
	}),

	http.post('/v1/record-suggestions/:id/reject', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const body = recordUpdateSuggestionRejectRequestSchema.safeParse(await request.json());
		if (!body.success) return badRequest('Geçersiz red', body.error.flatten());
		const idx = store.recordUpdateSuggestions.findIndex(
			(s) => s.id === params.id && s.tenant_id === store.tenant.id && s.status === 'pending'
		);
		if (idx < 0) return notFound('Öneri bulunamadı');
		const now = nowIso();
		store.recordUpdateSuggestions[idx] = {
			...store.recordUpdateSuggestions[idx]!,
			status: 'rejected',
			decided_at: now,
			decided_by: demoUser.display_name,
			reject_reason: body.data.reason?.trim() || null,
			updated_at: now
		};
		return HttpResponse.json(store.recordUpdateSuggestions[idx]);
	}),

	http.post('/v1/transactions/audit-draft', async ({ request }) => {
		const body = await request.json();
		const parsed = transactionAuditDraftSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz taslak', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const responsible = parsed.data.responsible_contact_id
			? store.contacts.find((c) => c.id === parsed.data.responsible_contact_id)
			: undefined;
		const items = evaluateTransactionConsistency(
			{
				...parsed.data,
				responsible_is_internal: responsible?.is_internal ?? null
			},
			{ baseCurrency: store.tenant.base_currency }
		);
		return HttpResponse.json({ items });
	}),

	http.get('/v1/transactions', ({ request }) => {
		const url = new URL(request.url);
		const parsed = parseListQuery(transactionListQuerySchema, url);
		if (!parsed.success) return parsed.response;
		const store = getStore(scenarioFrom(request));
		let items = [...store.transactions];
		const {
			contact_id: contactId,
			case_contact_id: caseContactId,
			from,
			to,
			kind,
			status,
			category,
			q
		} = parsed.data;
		if (contactId) items = items.filter((t) => t.contact_id === contactId);
		if (caseContactId) items = items.filter((t) => t.case_contact_id === caseContactId);
		if (from) items = items.filter((t) => t.occurred_on >= from);
		if (to) items = items.filter((t) => t.occurred_on <= to);
		if (kind) items = items.filter((t) => t.kind === kind);
		if (status) items = items.filter((t) => t.status === status);
		if (category) items = items.filter((t) => t.category === category);
		if (q) {
			const needle = q.toLowerCase();
			items = items.filter(
				(t) =>
					(t.title?.toLowerCase().includes(needle) ?? false) ||
					(t.subtitle?.toLowerCase().includes(needle) ?? false) ||
					(t.category?.toLowerCase().includes(needle) ?? false) ||
					(t.contact_display_name?.toLowerCase().includes(needle) ?? false) ||
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
		const result = buildReportSummary(store, from, to);
		if (url.searchParams.get('compare') === 'previous') {
			const previousWindow = previousReportPeriod(from ?? undefined, to ?? undefined);
			if (previousWindow) {
				return HttpResponse.json({
					...result,
					previous: buildReportSummary(store, previousWindow.from, previousWindow.to)
				});
			}
		}
		return HttpResponse.json(result);
	}),

	http.get('/v1/reports/contact-distribution', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		return HttpResponse.json(buildReportContactDistribution(store, from, to));
	}),

	http.get('/v1/reports/appointment-metrics', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		const result = buildReportAppointmentMetrics(store, from, to);
		if (url.searchParams.get('compare') === 'previous') {
			const previousWindow = previousReportPeriod(from ?? undefined, to ?? undefined);
			if (previousWindow) {
				return HttpResponse.json({
					...result,
					previous: buildReportAppointmentMetrics(store, previousWindow.from, previousWindow.to)
				});
			}
		}
		return HttpResponse.json(result);
	}),

	http.get('/v1/reports/consistency', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		return HttpResponse.json(buildReportConsistency(store, from, to));
	}),

	http.get('/v1/reports/transaction-duplicates', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		return HttpResponse.json(buildReportTransactionDuplicates(store, from, to));
	}),

	http.get('/v1/reports/balances', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json(buildReportBalances(store));
	}),

	http.get('/v1/reports/untouched-contacts', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const days = Number(url.searchParams.get('days') ?? 30);
		const contactType = url.searchParams.get('contact_type');
		const limit = Number(url.searchParams.get('limit') ?? 50);
		const now = Date.now();

		// Sunucudaki türetimin sadeleştirilmiş hâli: son randevu / işlem / kayıt tarihi.
		const rows = store.contacts
			.filter((c) => c.tenant_id === store.tenant.id)
			.filter((c) => !contactType || c.contact_type_name === contactType)
			.map((c) => {
				// Mock store soft-delete tutmuyor; sunucudaki `deleted_at is null`
				// koşulunun karşılığı burada yok — demo verisinde silinmiş kayıt olmuyor.
				const lastAppointment = store.appointments
					.filter((a) => a.contact_id === c.id)
					.map((a) => new Date(a.starts_at).getTime())
					.sort((a, b) => b - a)[0];
				const lastTransaction = store.transactions
					.filter((tx) => tx.contact_id === c.id)
					.map((tx) => new Date(tx.occurred_on).getTime())
					.sort((a, b) => b - a)[0];
				const created = new Date(c.created_at).getTime();
				const candidates: Array<[number, UntouchedActivitySource]> = [[created, 'created']];
				if (lastAppointment !== undefined) candidates.push([lastAppointment, 'appointment']);
				if (lastTransaction !== undefined) candidates.push([lastTransaction, 'transaction']);
				candidates.sort((a, b) => b[0] - a[0]);
				const [lastAt, source] = candidates[0]!;
				return {
					contact_id: c.id,
					display_name: c.display_name,
					contact_type_name: c.contact_type_name,
					phone: c.phone ?? null,
					email: c.email ?? null,
					last_activity_at: new Date(lastAt).toISOString(),
					last_activity_source: source,
					days_since: Math.floor((now - lastAt) / 86_400_000)
				};
			})
			.sort((a, b) => b.days_since - a.days_since);

		// Kovalar sunucudaki gibi eşikten BAĞIMSIZ: eşik 60'a çekilince
		// "30 günü geçen" sayısı değişmemeli.
		const countPast = (d: number) => rows.filter((r) => r.days_since >= d).length;
		const matching = rows.filter((r) => r.days_since >= days);
		return HttpResponse.json({
			buckets: { d30: countPast(30), d60: countPast(60), d90: countPast(90) },
			total: matching.length,
			items: matching.slice(0, limit)
		});
	}),

	http.get('/v1/reports/cohorts', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		const contactType = url.searchParams.get('contact_type');
		return HttpResponse.json(buildReportCohorts(store, from, to, contactType));
	}),

	http.get('/v1/reports/by-category', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		return HttpResponse.json(buildReportByCategory(store, from, to));
	}),

	http.get('/v1/reports/by-responsible', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		const rows = filterTransactionsByPeriod(store.transactions, from, to).filter(
			(t) => t.kind === 'expense'
		);
		const map = new Map<
			string,
			{
				responsible_contact_id: string | null;
				responsible_label: string;
				expense_base: number;
				transaction_count: number;
			}
		>();
		for (const t of rows) {
			const key = t.responsible_contact_id ?? '';
			const contact = t.responsible_contact_id
				? store.contacts.find((c) => c.id === t.responsible_contact_id)
				: null;
			const cur = map.get(key) ?? {
				responsible_contact_id: t.responsible_contact_id,
				responsible_label: contact?.display_name ?? 'Atanmamış',
				expense_base: 0,
				transaction_count: 0
			};
			cur.transaction_count += 1;
			cur.expense_base += t.amount_base ?? t.amount;
			map.set(key, cur);
		}
		return HttpResponse.json({
			period: { from, to },
			items: [...map.values()].sort((a, b) => b.expense_base - a.expense_base)
		});
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
		const syncedAtFor = (provider: 'meta' | 'google') =>
			mswAdsConnected.has(provider) ? new Date().toISOString() : null;
		return HttpResponse.json({
			items: [
				{
					provider: 'meta',
					connected: mswAdsConnected.has('meta'),
					key_version: mswAdsConnected.has('meta') ? 1 : null,
					last_sync_date: lastFor('meta'),
					customer_id: null,
					last_synced_at: syncedAtFor('meta'),
					last_sync_status: mswAdsConnected.has('meta') ? 'success' : null
				},
				{
					provider: 'google',
					connected: mswAdsConnected.has('google'),
					key_version: mswAdsConnected.has('google') ? 1 : null,
					last_sync_date: lastFor('google'),
					customer_id: mswAdsConnected.has('google') ? '5556667777' : null,
					last_synced_at: syncedAtFor('google'),
					last_sync_status: mswAdsConnected.has('google') ? 'success' : null
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
			customer_id: digits || null,
			last_synced_at: null,
			last_sync_status: null
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

	http.post('/v1/integrations/ghl/reconcile', () => {
		return HttpResponse.json(
			{
				status: 'completed',
				mode: 'live',
				lookback_days: 7,
				scanned: 2,
				created: 1,
				updated: 1,
				unchanged: 0,
				skipped: 0,
				diff_count: 2
			},
			{ status: 200 }
		);
	}),

	http.post('/v1/transactions', async ({ request }) => {
		const body = await request.json();
		const parsed = transactionCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz işlem verisi', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const contact = parsed.data.contact_id
			? store.contacts.find((c) => c.id === parsed.data.contact_id)
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
			contact_display_name: contact?.display_name ?? null,
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
		const nextContactId =
			parsed.data.contact_id !== undefined
				? parsed.data.contact_id
				: store.transactions[idx].contact_id;
		const contact = nextContactId ? store.contacts.find((c) => c.id === nextContactId) : null;
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
			contact_display_name:
				nextContactId === null
					? null
					: (contact?.display_name ?? store.transactions[idx].contact_display_name),
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
		const records = parseWhatsappMessage(parsed.data.message, store.contacts);
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
			const records = parseWhatsappMessage(msg.body, store.contacts);
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
		// AI-09: iz sunucudaki taslaktan okunur, istek gövdesinden değil (API ile aynı kural).
		const storedDrafts = item.parsed_records;
		const alignedDrafts =
			storedDrafts && storedDrafts.length === parsed.data.drafts.length ? storedDrafts : null;
		for (const [draftIndex, draft] of parsed.data.drafts.entries()) {
			const contact = draft.contact_id
				? store.contacts.find((c) => c.id === draft.contact_id)
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
				contact_display_name: contact?.display_name ?? draft.contact_display_name ?? null,
				...resolved,
				source_inbound_message_id: item.id,
				source_evidence: alignedDrafts?.[draftIndex]?.evidence ?? null,
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
				contact_id: d.contact_id,
				contact_display_name: d.contact_display_name,
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

	http.post('/v1/whatsapp/create-contact', async ({ request }) => {
		const body = await request.json();
		const parsed = whatsappCreateContactSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz kişi', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const type = store.contactTypes.find((ct) => ct.id === parsed.data.contact_type_id);
		if (!type) return notFound('Kişi türü bulunamadı');
		const now = nowIso();
		const contact: Contact = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			contact_type_id: type.id,
			contact_type_name: type.name,
			title_id: null,
			title_name: null,
			first_name: parsed.data.first_name.trim(),
			last_name: parsed.data.last_name?.trim() || null,
			display_name: deriveDisplayName(parsed.data.first_name, parsed.data.last_name ?? null),
			phone: parsed.data.phone ?? null,
			email: parsed.data.email ?? null,
			notes: null,
			organization_id: null,
			status: null,
			assigned_user_id: null,
			source: null,
			medium: null,
			campaign: null,
			referred_by_contact_id: null,
			is_internal: false,
			usage_count: 0,
			created_at: now,
			updated_at: now
		};
		store.contacts.unshift(contact);
		return HttpResponse.json(contact, { status: 201 });
	}),

	http.post('/v1/whatsapp/create-category', async ({ request }) => {
		const body = await request.json();
		const parsed = whatsappCreateCategorySchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz kategori', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const dup = store.financeCategories.find(
			(c) => c.kind === parsed.data.kind && c.name === parsed.data.name
		);
		if (dup) {
			return HttpResponse.json(
				{
					error: {
						code: 'duplicate_type_name',
						message: 'A finance category with this name already exists'
					}
				},
				{ status: 409 }
			);
		}
		const now = nowIso();
		const maxOrder = store.financeCategories.reduce((m, c) => Math.max(m, c.sort_order), -1);
		const item: FinanceCategory = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			kind: parsed.data.kind,
			name: parsed.data.name,
			sort_order: maxOrder + 1,
			subcategories: [],
			created_at: now,
			updated_at: now
		};
		store.financeCategories.push(item);
		return HttpResponse.json(item, { status: 201 });
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
		const records = parseWhatsappMessage(item.body, store.contacts);
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

	http.get('/v1/whatsapp/corrections-report', ({ request }) => {
		const url = new URL(request.url);
		const parsed = parseListQuery(aiCorrectionsReportParamsSchema, url);
		if (!parsed.success) return parsed.response;
		const store = getStore(scenarioFrom(request));
		const { from, to } = parsed.data;
		let items = store.aiCorrections;
		if (from) {
			items = items.filter((c) => c.created_at.slice(0, 10) >= from);
		}
		if (to) {
			items = items.filter((c) => c.created_at.slice(0, 10) <= to);
		}
		const correctedMessageIds = new Set(items.map((c) => c.inbound_message_id ?? c.id));
		return HttpResponse.json({
			period: { from: from ?? null, to: to ?? null },
			corrected_message_count: correctedMessageIds.size,
			items: aggregateAiCorrectionsReport(items)
		});
	}),

	/**
	 * AI-03 — isabet ölçümü. Mock dünyasında `maya_questions` karşılığı bir store
	 * yok (Maya mock'u soru kaydı tutmuyor) — o bölüm dürüstçe boş döner, uydurma
	 * veri eklenmez. Taslak + öneri bölümleri gerçek store'lardan hesaplanır.
	 */
	http.get('/v1/reports/ai-accuracy', ({ request }) => {
		const url = new URL(request.url);
		const parsed = parseListQuery(aiAccuracyReportParamsSchema, url);
		if (!parsed.success) return parsed.response;
		const store = getStore(scenarioFrom(request));
		const { from, to } = parsed.data;

		let corrections = store.aiCorrections;
		if (from) corrections = corrections.filter((c) => c.created_at.slice(0, 10) >= from);
		if (to) corrections = corrections.filter((c) => c.created_at.slice(0, 10) <= to);
		const correctedIds = new Set(corrections.map((c) => c.inbound_message_id ?? c.id));

		let approvedTx = store.transactions.filter((t) => t.source_inbound_message_id != null);
		if (from) approvedTx = approvedTx.filter((t) => t.created_at.slice(0, 10) >= from);
		if (to) approvedTx = approvedTx.filter((t) => t.created_at.slice(0, 10) <= to);
		const approvedIds = new Set(approvedTx.map((t) => t.source_inbound_message_id));

		let suggestions = store.recordUpdateSuggestions.filter((s) => s.tenant_id === store.tenant.id);
		if (from) suggestions = suggestions.filter((s) => s.created_at.slice(0, 10) >= from);
		if (to) suggestions = suggestions.filter((s) => s.created_at.slice(0, 10) <= to);
		const approved = suggestions.filter((s) => s.status === 'approved').length;
		const rejected = suggestions.filter((s) => s.status === 'rejected').length;
		const pending = suggestions.filter((s) => s.status === 'pending').length;
		const decided = approved + rejected;
		const reasonCounts = new Map<string | null, number>();
		for (const s of suggestions) {
			if (s.status !== 'rejected') continue;
			const key = s.reject_reason ?? null;
			reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
		}

		return HttpResponse.json({
			period: { from: from ?? null, to: to ?? null },
			drafts: {
				approved_message_count: approvedIds.size,
				corrected_message_count: correctedIds.size,
				unchanged_rate: approvedIds.size > 0 ? 1 - correctedIds.size / approvedIds.size : null,
				by_field: aggregateAiCorrectionsReport(corrections)
			},
			suggestions: {
				total: suggestions.length,
				approved,
				rejected,
				pending,
				acceptance_rate: decided > 0 ? approved / decided : null,
				by_field: [{ field: 'starts_at' as const, approved, rejected }],
				reject_reasons: [...reasonCounts.entries()]
					.map(([reason, count]) => ({ reason, count }))
					.sort((a, b) => b.count - a.count)
			},
			maya: {
				total: 0,
				answered: 0,
				unanswered: 0,
				answer_rate: null,
				by_source: [],
				by_tool: [],
				unanswered_samples: []
			}
		});
	}),

	http.get('/v1/contacts/:id/files', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const contact = store.contacts.find((c) => c.id === params.id);
		if (!contact) return notFound('Kişi bulunamadı');
		const items = store.files
			.filter((f) => f.contact_id === params.id)
			.sort((a, b) => b.created_at.localeCompare(a.created_at));
		return HttpResponse.json({ items });
	}),

	http.get('/v1/contacts/:id/case-notes', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const contact = store.contacts.find((c) => c.id === params.id);
		if (!contact) return notFound('Kişi bulunamadı');
		const items = store.caseNotes
			.filter((n) => n.contact_id === params.id)
			.sort((a, b) => a.created_at.localeCompare(b.created_at));
		return HttpResponse.json({ items });
	}),

	http.post('/v1/contacts/:id/case-notes', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const contact = store.contacts.find((c) => c.id === params.id);
		if (!contact) return notFound('Kişi bulunamadı');
		const body = await request.json();
		const parsed = contactCaseNoteCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz not', parsed.error.flatten());
		const note: ContactCaseNote = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			contact_id: contact.id,
			body: parsed.data.body.trim(),
			author_display_name: demoUser.display_name,
			created_at: nowIso()
		};
		store.caseNotes.push(note);
		return HttpResponse.json(note, { status: 201 });
	}),

	http.delete('/v1/contacts/:id/case-notes/:noteId', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.caseNotes.findIndex(
			(n) => n.id === params.noteId && n.contact_id === params.id
		);
		if (idx < 0) return notFound('Not bulunamadı');
		store.caseNotes.splice(idx, 1);
		return new HttpResponse(null, { status: 204 });
	}),

	http.post('/v1/contacts/:id/files/presign', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const contact = store.contacts.find((c) => c.id === params.id);
		if (!contact) return notFound('Kişi bulunamadı');
		const body = await request.json();
		const parsed = contactFilePresignSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz dosya verisi', parsed.error.flatten());

		const fileId = crypto.randomUUID();
		const storage_key = `local://demo/${contact.id}/${fileId}`;
		let appointment_label: string | null = null;
		const appointmentId = parsed.data.appointment_id ?? null;
		if (appointmentId) {
			const appt = store.appointments.find((a) => a.id === appointmentId);
			appointment_label = appt ? appointmentLabel(appt) : null;
		}
		const file: ContactFile = {
			id: fileId,
			tenant_id: contact.tenant_id,
			contact_id: contact.id,
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
				upload_url: `${origin}/v1/contacts/${contact.id}/files/${fileId}/content`,
				storage_key,
				expires_in: 300
			},
			{ status: 201 }
		);
	}),

	http.put('/v1/contacts/:id/files/:fileId/content', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const file = store.files.find((f) => f.id === params.fileId && f.contact_id === params.id);
		if (!file) return notFound('Dosya bulunamadı');
		const buf = Buffer.from(await request.arrayBuffer());
		if (buf.byteLength !== file.size_bytes) {
			return badRequest('Boyut uyuşmuyor');
		}
		return HttpResponse.json({ accepted: true });
	}),

	http.post('/v1/contacts/:id/files/:fileId/confirm', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const file = store.files.find((f) => f.id === params.fileId && f.contact_id === params.id);
		if (!file) return notFound('Dosya bulunamadı');
		file.status = 'ready';
		return HttpResponse.json(file);
	}),

	http.post('/v1/contacts/:id/files', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const contact = store.contacts.find((c) => c.id === params.id);
		if (!contact) return notFound('Kişi bulunamadı');

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
			const parsed = contactFileCreateSchema.safeParse(body);
			if (!parsed.success) return badRequest('Geçersiz dosya verisi', parsed.error.flatten());
			filename = parsed.data.filename;
			mime_type = parsed.data.mime_type ?? mime_type;
			size_bytes = parsed.data.size_bytes ?? 0;
			appointmentId = parsed.data.appointment_id ?? null;
		}

		let appointment_label: string | null = null;
		if (appointmentId) {
			const appt = store.appointments.find(
				(a) => a.id === appointmentId && a.contact_id === contact.id
			);
			if (!appt) return badRequest('Randevu bu kişiye ait değil');
			appointment_label = appointmentLabel(appt);
		}

		const file: ContactFile = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			contact_id: contact.id,
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

	http.get('/v1/contacts/:id/files/:fileId/download', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const file = store.files.find((f) => f.id === params.fileId && f.contact_id === params.id);
		if (!file) return notFound('Dosya bulunamadı');
		return new HttpResponse(`MSW stub: ${file.filename}`, {
			status: 200,
			headers: {
				'Content-Type': file.mime_type || 'application/octet-stream',
				'Content-Disposition': `attachment; filename="${file.filename}"`
			}
		});
	}),

	http.get('/v1/contacts/:id/files/:fileId/preview', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const file = store.files.find((f) => f.id === params.fileId && f.contact_id === params.id);
		if (!file) return notFound('Dosya bulunamadı');
		return new HttpResponse(`MSW stub: ${file.filename}`, {
			status: 200,
			headers: {
				'Content-Type': file.mime_type || 'application/octet-stream',
				'Content-Disposition': `inline; filename="${file.filename}"`
			}
		});
	}),

	http.delete('/v1/contacts/:id/files/:fileId', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.files.findIndex((f) => f.id === params.fileId && f.contact_id === params.id);
		if (idx < 0) return notFound('Dosya bulunamadı');
		const [removed] = store.files.splice(idx, 1);
		return HttpResponse.json({ id: removed!.id, deleted: true as const });
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
		const parsed = contactFileCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz dosya verisi', parsed.error.flatten());

		const file: ContactFile = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			contact_id: appt.contact_id,
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

	// ── Teşvik dosyaları ───────────────────────────────────────────────
	// Sunucudaki kural aynen: deadline_at sunucuda hesaplanır, istemciden alınmaz;
	// ayar değişse bile MEVCUT dosyaların deadline'ı değişmez.
	http.get('/v1/settings/incentive-deadline', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json({
			days: store.incentiveDeadlineDays,
			is_default: store.incentiveDeadlineDays === 180
		});
	}),

	http.put('/v1/settings/incentive-deadline', async ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const body = (await request.json()) as { days?: unknown };
		const days = Number(body.days);
		if (!Number.isInteger(days) || days < 1 || days > 3650) {
			return badRequest('Geçersiz gün sayısı');
		}
		store.incentiveDeadlineDays = days;
		return HttpResponse.json({ days, is_default: days === 180 });
	}),

	http.delete('/v1/settings/incentive-deadline', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		store.incentiveDeadlineDays = 180;
		return HttpResponse.json({ days: 180, is_default: true });
	}),

	http.get('/v1/incentives', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const status = url.searchParams.get('status');
		const dueWithin = url.searchParams.get('due_within_days');
		const today = new Date().toISOString().slice(0, 10);

		let items = store.incentiveFiles
			.filter((f) => f.tenant_id === store.tenant.id)
			.map((f) => ({
				...f,
				days_left: Math.round(
					(new Date(f.deadline_at).getTime() - new Date(today).getTime()) / 86_400_000
				)
			}));
		if (status) items = items.filter((f) => f.status === status);
		if (dueWithin) items = items.filter((f) => f.days_left <= Number(dueWithin));
		items.sort((a, b) => a.deadline_at.localeCompare(b.deadline_at));

		return HttpResponse.json(paginate(items, url.searchParams.get('cursor'), limitFrom(url)));
	}),

	http.post('/v1/incentives', async ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const body = (await request.json()) as {
			contact_id?: string;
			payment_date?: string;
			transaction_id?: string | null;
			note?: string | null;
		};
		const contact = store.contacts.find((c) => c.id === body.contact_id);
		if (!contact || !body.payment_date) return badRequest('Geçersiz teşvik dosyası');

		const deadline = new Date(
			new Date(body.payment_date).getTime() + store.incentiveDeadlineDays * 86_400_000
		)
			.toISOString()
			.slice(0, 10);
		const now = new Date().toISOString();
		const created = {
			id: crypto.randomUUID(),
			tenant_id: store.tenant.id,
			contact_id: contact.id,
			contact_display_name: contact.display_name,
			transaction_id: body.transaction_id ?? null,
			payment_date: body.payment_date,
			deadline_at: deadline,
			days_left: Math.round((new Date(deadline).getTime() - Date.now()) / 86_400_000),
			status: 'open' as const,
			submitted_at: null,
			note: body.note ?? null,
			documents: DEFAULT_INCENTIVE_DOCUMENTS.map((d) => ({ ...d })),
			created_at: now,
			updated_at: now
		};
		store.incentiveFiles.push(created);
		return HttpResponse.json(created, { status: 201 });
	}),

	http.patch('/v1/incentives/:id', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.incentiveFiles.findIndex(
			(f) => f.id === params.id && f.tenant_id === store.tenant.id
		);
		if (idx < 0) return notFound('Teşvik dosyası bulunamadı');
		const parsed = incentiveFileUpdateSchema.safeParse(await request.json());
		if (!parsed.success) {
			return badRequest('Geçersiz teşvik dosyası', parsed.error.flatten());
		}
		const body = parsed.data;
		const current = store.incentiveFiles[idx]!;
		// deadline_at ve payment_date bilinçli olarak güncellenmez — sunucu da izin vermiyor.
		const updated = {
			...current,
			status: body.status ?? current.status,
			submitted_at: body.submitted_at !== undefined ? body.submitted_at : current.submitted_at,
			note: body.note !== undefined ? body.note : current.note,
			documents: body.documents !== undefined ? body.documents : current.documents,
			updated_at: new Date().toISOString()
		};
		store.incentiveFiles[idx] = updated;
		return HttpResponse.json(updated);
	}),

	http.delete('/v1/incentives/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.incentiveFiles.findIndex(
			(f) => f.id === params.id && f.tenant_id === store.tenant.id
		);
		if (idx < 0) return notFound('Teşvik dosyası bulunamadı');
		store.incentiveFiles.splice(idx, 1);
		return HttpResponse.json({ id: params.id, deleted: true });
	}),

	http.get('/v1/commissions', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const status = url.searchParams.get('status');
		const beneficiary = url.searchParams.get('beneficiary_contact_id');
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');

		let items = store.commissionEntries.filter((e) => e.tenant_id === store.tenant.id);
		if (status) items = items.filter((e) => e.status === status);
		if (beneficiary) items = items.filter((e) => e.beneficiary_contact_id === beneficiary);
		if (from) items = items.filter((e) => e.earned_on >= from);
		if (to) items = items.filter((e) => e.earned_on <= to);
		items.sort((a, b) => b.earned_on.localeCompare(a.earned_on) || b.id.localeCompare(a.id));

		return HttpResponse.json(paginate(items, url.searchParams.get('cursor'), limitFrom(url)));
	}),

	http.post('/v1/commissions', async ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const body = (await request.json()) as {
			beneficiary_contact_id?: string;
			case_contact_id?: string | null;
			source_transaction_id?: string | null;
			amount?: number;
			currency?: string;
			amount_base?: number | null;
			base_currency?: string | null;
			fx_rate?: number | null;
			fx_dated?: string | null;
			status?: 'accrued' | 'paid' | 'cancelled';
			earned_on?: string;
			paid_on?: string | null;
			note?: string | null;
		};
		const beneficiary = store.contacts.find((c) => c.id === body.beneficiary_contact_id);
		if (!beneficiary || !body.earned_on || !body.amount || body.amount <= 0) {
			return badRequest('Geçersiz hakediş satırı');
		}
		const caseContact = body.case_contact_id
			? store.contacts.find((c) => c.id === body.case_contact_id)
			: undefined;
		const currency = (body.currency ?? store.tenant.base_currency) as CommissionEntry['currency'];
		const tenantBase = store.tenant.base_currency;
		let amountBase = body.amount_base ?? null;
		let baseCurrency = (body.base_currency ?? null) as CommissionEntry['base_currency'];
		if (amountBase === null && currency === tenantBase) {
			amountBase = body.amount;
			baseCurrency = tenantBase;
		}
		const status = body.status ?? 'accrued';
		let paidOn = body.paid_on ?? null;
		if (status === 'paid' && !paidOn) {
			paidOn = new Date().toISOString().slice(0, 10);
		}
		const now = new Date().toISOString();
		const created: CommissionEntry = {
			id: crypto.randomUUID(),
			tenant_id: store.tenant.id,
			beneficiary_contact_id: beneficiary.id,
			beneficiary_display_name: beneficiary.display_name,
			case_contact_id: caseContact?.id ?? null,
			case_display_name: caseContact?.display_name ?? null,
			source_transaction_id: body.source_transaction_id ?? null,
			amount: body.amount,
			currency,
			amount_base: amountBase,
			base_currency: baseCurrency,
			fx_rate: body.fx_rate ?? null,
			fx_dated: body.fx_dated ?? null,
			status,
			earned_on: body.earned_on,
			paid_on: paidOn,
			note: body.note ?? null,
			created_at: now,
			updated_at: now
		};
		store.commissionEntries.push(created);
		return HttpResponse.json(created, { status: 201 });
	}),

	http.patch('/v1/commissions/:id', async ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.commissionEntries.findIndex(
			(e) => e.id === params.id && e.tenant_id === store.tenant.id
		);
		if (idx < 0) return notFound('Hakediş satırı bulunamadı');
		const body = (await request.json()) as {
			status?: CommissionEntry['status'];
			paid_on?: string | null;
			amount?: number;
			note?: string | null;
		};
		const current = store.commissionEntries[idx]!;
		const nextStatus = body.status ?? current.status;
		let paidOn = 'paid_on' in body ? (body.paid_on ?? null) : current.paid_on;
		if (nextStatus === 'paid' && !paidOn) {
			paidOn = new Date().toISOString().slice(0, 10);
		}
		const nextAmount = body.amount ?? current.amount;
		let amountBase = current.amount_base;
		if (
			body.amount !== undefined &&
			current.currency === store.tenant.base_currency &&
			(current.amount_base == null || current.base_currency === store.tenant.base_currency)
		) {
			amountBase = nextAmount;
		}
		const updated: CommissionEntry = {
			...current,
			status: nextStatus,
			paid_on: paidOn,
			amount: nextAmount,
			amount_base: amountBase,
			note: 'note' in body ? (body.note ?? null) : current.note,
			updated_at: new Date().toISOString()
		};
		store.commissionEntries[idx] = updated;
		return HttpResponse.json(updated);
	}),

	http.delete('/v1/commissions/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const idx = store.commissionEntries.findIndex(
			(e) => e.id === params.id && e.tenant_id === store.tenant.id
		);
		if (idx < 0) return notFound('Hakediş satırı bulunamadı');
		store.commissionEntries.splice(idx, 1);
		return HttpResponse.json({ id: params.id, deleted: true });
	}),

	http.get('/v1/reports/commission-summary', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const tenantBase = store.tenant.base_currency;
		const map = new Map<
			string,
			{
				beneficiary_contact_id: string;
				beneficiary_display_name: string;
				accrued_base: number;
				paid_base: number;
				entry_count: number;
			}
		>();
		let missingFxCount = 0;

		for (const entry of store.commissionEntries) {
			if (entry.tenant_id !== store.tenant.id) continue;
			if (entry.status === 'cancelled') continue;

			let base: number | null = null;
			if (entry.currency === tenantBase) {
				base = entry.amount_base ?? entry.amount;
			} else if (entry.amount_base != null && entry.base_currency === tenantBase) {
				base = entry.amount_base;
			}

			const cur = map.get(entry.beneficiary_contact_id) ?? {
				beneficiary_contact_id: entry.beneficiary_contact_id,
				beneficiary_display_name: entry.beneficiary_display_name,
				accrued_base: 0,
				paid_base: 0,
				entry_count: 0
			};
			cur.entry_count += 1;
			// Sunucuyla aynı kural: ödenen satır da "hak edilen"e girer, yoksa
			// open_base = accrued - paid aynı tutarı iki kez düşer.
			if (base == null) {
				missingFxCount += 1;
			} else {
				cur.accrued_base += base;
				if (entry.status === 'paid') cur.paid_base += base;
			}
			map.set(entry.beneficiary_contact_id, cur);
		}

		const items = [...map.values()]
			.map((row) => ({
				...row,
				open_base: row.accrued_base - row.paid_base
			}))
			.filter((row) => row.open_base !== 0)
			.sort((a, b) => Math.abs(b.open_base) - Math.abs(a.open_base));

		return HttpResponse.json({ items, missing_fx_count: missingFxCount });
	}),

	// Maya — bilgi bankasından cevap. Sunucudaki kural aynen: uydurma yok.
	http.post('/v1/maya/ask', async ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const body = (await request.json()) as { question?: string };
		const question = (body.question ?? '').trim();
		const context = buildKnowledgeContext(store.knowledge);

		if (context == null) {
			return HttpResponse.json({
				answer: '',
				grounded: false,
				used_sections: [],
				knowledge_empty: true,
				heuristic: true
			});
		}

		const words = question
			.toLocaleLowerCase('tr')
			.split(/[^\p{L}\p{N}]+/u)
			.filter((w) => w.length >= 4);
		const lines = context.split('\n').filter((l) => l.trim().length > 0);
		const hits = lines.filter((l) => {
			const lower = l.toLocaleLowerCase('tr');
			return words.some((w) => lower.includes(w));
		});

		if (hits.length === 0) {
			return HttpResponse.json({
				answer: '',
				grounded: false,
				used_sections: [],
				knowledge_empty: false,
				heuristic: true
			});
		}
		return HttpResponse.json({
			answer: hits.slice(0, 4).join('\n'),
			grounded: true,
			used_sections: ['services'],
			knowledge_empty: false,
			heuristic: true
		});
	}),

	// ── Bilgi bankası (AI-01) ─────────────────────────────────────────
	http.get('/v1/settings/knowledge', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json({
			sections: store.knowledge,
			is_default: buildKnowledgeContext(store.knowledge) == null,
			updated_at: null,
			updated_by: null,
			pii_warnings: findKnowledgePii(store.knowledge)
		});
	}),

	http.get('/v1/settings/knowledge/revisions', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json({ items: store.knowledgeRevisions });
	}),

	http.put('/v1/settings/knowledge', async ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const body = (await request.json()) as { sections?: unknown };
		const parsed = knowledgeSectionsSchema.safeParse(body.sections);
		if (!parsed.success) return badRequest('Geçersiz bilgi bankası');
		store.knowledge = parsed.data;
		store.knowledgeRevisions = [
			{
				id: crypto.randomUUID(),
				sections: parsed.data,
				changed_by: 'Demo Kullanıcı',
				created_at: new Date().toISOString()
			},
			...store.knowledgeRevisions
		];
		return HttpResponse.json({
			sections: store.knowledge,
			is_default: buildKnowledgeContext(store.knowledge) == null,
			updated_at: new Date().toISOString(),
			updated_by: 'Demo Kullanıcı',
			pii_warnings: findKnowledgePii(store.knowledge)
		});
	}),

	http.delete('/v1/settings/knowledge', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		store.knowledge = emptyKnowledgeSections();
		return HttpResponse.json({
			sections: store.knowledge,
			is_default: true,
			updated_at: null,
			updated_by: null,
			pii_warnings: []
		});
	}),

	http.get('/v1/settings/operation-alerts', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json({
			thresholds: store.operationAlertThresholds,
			is_default: operationAlertThresholdsEqual(
				store.operationAlertThresholds,
				DEFAULT_OPERATION_ALERT_THRESHOLDS
			)
		});
	}),

	http.put('/v1/settings/operation-alerts', async ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const parsed = operationAlertSettingsUpdateSchema.safeParse(await request.json());
		if (!parsed.success)
			return badRequest('Geçersiz operasyon alarmı ayarı', parsed.error.flatten());
		applyOperationAlertSettings(store, parsed.data.thresholds);
		return HttpResponse.json({
			thresholds: store.operationAlertThresholds,
			is_default: operationAlertThresholdsEqual(
				store.operationAlertThresholds,
				DEFAULT_OPERATION_ALERT_THRESHOLDS
			)
		});
	}),

	http.get('/v1/settings/ai-prompt', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json(store.aiPrompt ?? defaultWhatsappAiPrompt());
	}),

	http.put('/v1/settings/ai-prompt', async ({ request }) => {
		const body = await request.json();
		const parsed = whatsappAiPromptUpdateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz AI prompt', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		store.aiPrompt = {
			text: parsed.data.text,
			is_default: false,
			updated_by: 'Demo User',
			updated_at: new Date().toISOString()
		};
		return HttpResponse.json(store.aiPrompt);
	}),

	http.delete('/v1/settings/ai-prompt', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		store.aiPrompt = defaultWhatsappAiPrompt();
		return HttpResponse.json(store.aiPrompt);
	}),

	http.post('/v1/settings/data-delete/preview', async ({ request }) => {
		if (demoUser.role !== 'owner') {
			return HttpResponse.json(
				{ error: { code: 'owner_required', message: 'Only owner' }, request_id: 'msw' },
				{ status: 403 }
			);
		}
		const body = await request.json();
		const parsed = dataDeletePreviewBodySchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz kapsam', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const tables = expandDataDeleteTables(parsed.data.scopes);
		const counts = tables.map((table) => {
			let count = 0;
			if (table === 'transactions') count = store.transactions.length;
			else if (table === 'appointments') count = store.appointments.length;
			else if (table === 'contacts') count = store.contacts.length;
			else if (table === 'files') count = store.files.length;
			else if (table === 'case_notes') count = store.caseNotes?.length ?? 0;
			return { table, count };
		});
		const exp = Date.now() + DATA_DELETE_PLAN_TTL_MS;
		return HttpResponse.json({
			plan_token: `msw-data-delete:${parsed.data.scopes.join(',')}:${exp}`,
			expires_at: new Date(exp).toISOString(),
			organization_name: store.tenant.name,
			scopes: parsed.data.scopes,
			counts,
			total_rows: counts.reduce((s, c) => s + c.count, 0)
		});
	}),

	http.post('/v1/settings/data-delete/execute', async ({ request }) => {
		if (demoUser.role !== 'owner') {
			return HttpResponse.json(
				{ error: { code: 'owner_required', message: 'Only owner' }, request_id: 'msw' },
				{ status: 403 }
			);
		}
		const body = await request.json();
		const parsed = dataDeleteExecuteBodySchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz silme isteği', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		if (parsed.data.confirm_organization_name.trim() !== store.tenant.name.trim()) {
			return HttpResponse.json(
				{
					error: {
						code: 'confirm_organization_name_mismatch',
						message: 'Organization name mismatch'
					},
					request_id: 'msw'
				},
				{ status: 400 }
			);
		}
		if (!parsed.data.plan_token.startsWith('msw-data-delete:')) {
			return HttpResponse.json(
				{ error: { code: 'invalid_plan_token', message: 'Invalid token' }, request_id: 'msw' },
				{ status: 400 }
			);
		}
		const scopePart = parsed.data.plan_token.split(':')[1] ?? '';
		const scopes = scopePart.split(',').filter(Boolean) as Array<
			'transactions' | 'appointments' | 'contacts' | 'files'
		>;
		const tables = expandDataDeleteTables(scopes);
		const deleted = tables.map((table) => {
			let count = 0;
			if (table === 'transactions') {
				count = store.transactions.length;
				store.transactions = [];
			} else if (table === 'appointments') {
				count = store.appointments.length;
				store.appointments = [];
			} else if (table === 'contacts') {
				count = store.contacts.length;
				store.contacts = [];
			} else if (table === 'files') {
				count = store.files.length;
				store.files = [];
			} else if (table === 'case_notes' && store.caseNotes) {
				count = store.caseNotes.length;
				store.caseNotes = [];
			}
			return { table, count };
		});
		return HttpResponse.json({
			scopes,
			deleted,
			total_deleted: deleted.reduce((s, c) => s + c.count, 0)
		});
	}),

	http.get('/v1/settings/permissions', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json(buildPermissionMatrixFromOverrides(store.permissionOverrides));
	}),

	http.patch('/v1/settings/permissions', async ({ request }) => {
		const body = await request.json();
		const parsed = permissionMatrixPatchSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz izin matrisi', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const next = new Map<string, PermissionOverride>(
			store.permissionOverrides.map((o) => [`${o.role}:${o.resource}:${o.action}`, o])
		);
		for (const change of parsed.data.changes) {
			const key = `${change.role}:${change.resource}:${change.action}`;
			if (change.allowed === false) {
				next.set(key, {
					role: change.role,
					resource: change.resource,
					action: change.action,
					allowed: false
				});
			} else {
				next.delete(key);
			}
		}
		store.permissionOverrides = [...next.values()];
		return HttpResponse.json(buildPermissionMatrixFromOverrides(store.permissionOverrides));
	}),

	http.get('/v1/settings/contact-types', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const items = [...store.contactTypes].sort((a, b) => a.sort_order - b.sort_order);
		return HttpResponse.json({ items });
	}),

	http.put('/v1/settings/contact-types/reorder', async ({ request }) => {
		const body = await request.json();
		const parsed = settingsReorderSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz sıralama', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		let updated = 0;
		for (const item of parsed.data.items) {
			const row = store.contactTypes.find((t) => t.id === item.id);
			if (!row) continue;
			row.sort_order = item.sort_order;
			updated += 1;
		}
		return HttpResponse.json({ updated });
	}),

	http.post('/v1/settings/contact-types', async ({ request }) => {
		const body = await request.json();
		const parsed = contactTypeCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz tür', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const name = parsed.data.name.trim();
		if (store.contactTypes.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
			return conflict('duplicate_type_name', 'A contact type with this name already exists');
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

	http.patch('/v1/settings/contact-types/:id', async ({ params, request }) => {
		const body = await request.json();
		const parsed = contactTypeUpdateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz tür', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const idx = store.contactTypes.findIndex((t) => t.id === params.id);
		if (idx < 0) return notFound('Tür bulunamadı');
		const name = parsed.data.name.trim();
		if (
			store.contactTypes.some(
				(t) => t.id !== params.id && t.name.toLowerCase() === name.toLowerCase()
			)
		) {
			return conflict('duplicate_type_name', 'A contact type with this name already exists');
		}
		store.contactTypes[idx] = { ...store.contactTypes[idx], name };
		for (const c of store.contacts) {
			if (c.contact_type_id === params.id) c.contact_type_name = name;
		}
		return HttpResponse.json(store.contactTypes[idx]);
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

	http.get('/v1/settings/organizations', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const items = [...store.organizations].sort((a, b) => a.name.localeCompare(b.name));
		return HttpResponse.json({ items });
	}),

	http.post('/v1/settings/organizations', async ({ request }) => {
		const body = await request.json();
		const parsed = organizationCreateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz firma', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const name = parsed.data.name.trim();
		if (store.organizations.some((o) => o.name.toLowerCase() === name.toLowerCase())) {
			return conflict('duplicate_type_name', 'An organization with this name already exists');
		}
		const now = nowIso();
		const item: Organization = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			name,
			created_at: now,
			updated_at: now
		};
		store.organizations.push(item);
		return HttpResponse.json(item, { status: 201 });
	}),

	http.patch('/v1/settings/organizations/:id', async ({ params, request }) => {
		const body = await request.json();
		const parsed = organizationUpdateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz firma', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const idx = store.organizations.findIndex((o) => o.id === params.id);
		if (idx < 0) return notFound('Firma bulunamadı');
		const name = parsed.data.name.trim();
		if (
			store.organizations.some(
				(o) => o.id !== params.id && o.name.toLowerCase() === name.toLowerCase()
			)
		) {
			return conflict('duplicate_type_name', 'An organization with this name already exists');
		}
		store.organizations[idx] = {
			...store.organizations[idx],
			name,
			updated_at: nowIso()
		};
		return HttpResponse.json(store.organizations[idx]);
	}),

	http.delete('/v1/settings/organizations/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const inUse = store.contacts.some((c) => c.organization_id === params.id);
		if (inUse) return badRequest('Firma kullanımda — önce kişileri taşıyın');
		const idx = store.organizations.findIndex((o) => o.id === params.id);
		if (idx < 0) return notFound('Firma bulunamadı');
		store.organizations.splice(idx, 1);
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
					c.first_name.toLowerCase().includes(q) ||
					(c.last_name?.toLowerCase().includes(q) ?? false) ||
					(c.email?.toLowerCase().includes(q) ?? false) ||
					(c.phone?.includes(q) ?? false)
			);
		}
		const typeId = parsed.data.type_id;
		if (typeId) items = items.filter((c) => c.contact_type_id === typeId);
		// CONTRACT-02: phonebook order (last_name ASC NULLS LAST, first_name, id).
		items.sort(compareByLastNameAsc);
		return HttpResponse.json(paginate(items, parsed.data.cursor ?? null, parsed.data.limit));
	}),

	http.get('/v1/contacts/duplicate-groups', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		refreshUsage(store);
		const sorted = [...store.contacts].sort(compareByCreatedAtAsc);
		const truncated = sorted.length > DUPLICATE_SCAN_ROW_CAP;
		const scanned = truncated ? sorted.slice(0, DUPLICATE_SCAN_ROW_CAP) : sorted;
		return HttpResponse.json({
			items: findContactDuplicateGroups(scanned),
			truncated,
			scanned_count: scanned.length
		});
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
			if (!keep.source && src.source) keep.source = src.source;
			if (!keep.medium && src.medium) keep.medium = src.medium;
			if (!keep.is_internal && src.is_internal) keep.is_internal = true;
		}
		keep.updated_at = nowIso();

		const drop = new Set(merge_ids);
		for (const t of store.transactions) {
			if (t.contact_id && drop.has(t.contact_id)) {
				t.contact_id = keep_id;
				t.contact_label = keep.display_name;
				t.contact_display_name = keep.display_name;
			}
		}
		for (const a of store.appointments) {
			if (a.contact_id && drop.has(a.contact_id)) {
				a.contact_id = keep_id;
				a.contact_display_name = keep.display_name;
			}
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
			if (a.doctor_contact_id && drop.has(a.doctor_contact_id)) {
				a.doctor_contact_id = keep_id;
			}
		}
		for (const f of store.files) {
			if (drop.has(f.contact_id)) f.contact_id = keep_id;
		}
		for (const n of store.caseNotes) {
			if (drop.has(n.contact_id)) n.contact_id = keep_id;
		}
		store.contacts = store.contacts.filter((c) => !drop.has(c.id));
		refreshUsage(store);
		return HttpResponse.json(keep);
	}),

	http.patch('/v1/contacts/bulk-type', async ({ request }) => {
		const body = await request.json();
		const parsed = contactsBulkTypeSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz toplu tür atama', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const type = store.contactTypes.find((t) => t.id === parsed.data.contact_type_id);
		if (!type) return notFound('Tür bulunamadı');
		let updated = 0;
		const idSet = new Set(parsed.data.contact_ids);
		for (const c of store.contacts) {
			if (!idSet.has(c.id)) continue;
			c.contact_type_id = type.id;
			c.contact_type_name = type.name;
			c.updated_at = nowIso();
			updated += 1;
		}
		return HttpResponse.json({ updated });
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
		const firstName = parsed.data.first_name.trim();
		const lastName = parsed.data.last_name?.trim() || null;
		const contact: Contact = {
			id: crypto.randomUUID(),
			tenant_id: DEMO_TENANT_ID,
			contact_type_id: type.id,
			contact_type_name: type.name,
			title_id: null,
			title_name: null,
			first_name: firstName,
			last_name: lastName,
			display_name: deriveDisplayName(firstName, lastName),
			phone: parsed.data.phone?.trim() || null,
			email: parsed.data.email?.trim() || null,
			notes: parsed.data.notes?.trim() || null,
			organization_id: parsed.data.organization_id ?? null,
			status: parsed.data.status ?? null,
			assigned_user_id: parsed.data.assigned_user_id ?? null,
			source: parsed.data.source ?? null,
			medium: parsed.data.medium ?? null,
			campaign: parsed.data.campaign ?? null,
			referred_by_contact_id: parsed.data.referred_by_contact_id ?? null,
			is_internal: parsed.data.is_internal ?? false,
			usage_count: 0,
			created_at: now,
			updated_at: now
		};
		store.contacts.unshift(contact);
		return HttpResponse.json(contact, { status: 201 });
	}),

	http.patch('/v1/contacts/:id', async ({ params, request }) => {
		const body = await request.json();
		const parsed = contactUpdateSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz kişi', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		const idx = store.contacts.findIndex((c) => c.id === params.id);
		if (idx < 0) return notFound('Kişi bulunamadı');
		const existing = store.contacts[idx];
		let typeName = existing.contact_type_name;
		let typeId = existing.contact_type_id;
		if (parsed.data.contact_type_id) {
			const type = store.contactTypes.find((t) => t.id === parsed.data.contact_type_id);
			if (!type) return badRequest('Tür bulunamadı');
			typeId = type.id;
			typeName = type.name;
		}
		const firstName =
			parsed.data.first_name !== undefined ? parsed.data.first_name.trim() : existing.first_name;
		const lastName =
			parsed.data.last_name !== undefined
				? parsed.data.last_name?.trim() || null
				: existing.last_name;
		const updated: Contact = {
			...existing,
			contact_type_id: typeId,
			contact_type_name: typeName,
			first_name: firstName,
			last_name: lastName,
			display_name: deriveDisplayName(firstName, lastName),
			phone: parsed.data.phone !== undefined ? parsed.data.phone?.trim() || null : existing.phone,
			email: parsed.data.email !== undefined ? parsed.data.email?.trim() || null : existing.email,
			notes: parsed.data.notes !== undefined ? parsed.data.notes?.trim() || null : existing.notes,
			organization_id:
				parsed.data.organization_id !== undefined
					? parsed.data.organization_id
					: existing.organization_id,
			status: parsed.data.status !== undefined ? parsed.data.status : existing.status,
			assigned_user_id:
				parsed.data.assigned_user_id !== undefined
					? parsed.data.assigned_user_id
					: existing.assigned_user_id,
			source: parsed.data.source !== undefined ? parsed.data.source : existing.source,
			medium: parsed.data.medium !== undefined ? parsed.data.medium : existing.medium,
			campaign: parsed.data.campaign !== undefined ? parsed.data.campaign : existing.campaign,
			referred_by_contact_id:
				parsed.data.referred_by_contact_id !== undefined
					? parsed.data.referred_by_contact_id
					: existing.referred_by_contact_id,
			is_internal: parsed.data.is_internal ?? existing.is_internal,
			updated_at: nowIso()
		};
		store.contacts[idx] = updated;
		for (const t of store.transactions) {
			if (t.contact_id === updated.id) {
				t.contact_label = updated.display_name;
				t.contact_display_name = updated.display_name;
			}
		}
		for (const a of store.appointments) {
			if (a.contact_id === updated.id) a.contact_display_name = updated.display_name;
			if (a.clinic_contact_id === updated.id) a.clinic_name = updated.display_name;
			if (a.hotel_contact_id === updated.id) a.hotel_name = updated.display_name;
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
		return HttpResponse.json({ id, deleted: true as const });
	}),

	http.get('/v1/contacts/:id/finance-summary', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const contact = store.contacts.find((c) => c.id === params.id);
		if (!contact) return notFound('Kişi bulunamadı');
		const tenantBase = store.tenant.base_currency;
		const rows = store.transactions.filter((t) => t.contact_id === contact.id);
		let incomeBase = 0;
		let expenseBase = 0;
		let paidBase = 0;
		let outstandingBase = 0;
		for (const row of rows) {
			const base = amountInBaseMock(row, tenantBase);
			if (base == null) continue;
			if (row.kind === 'income') {
				incomeBase += base;
				const paid = paidInBaseMock(row, tenantBase);
				paidBase += paid;
				outstandingBase += Math.max(0, base - paid);
			} else {
				expenseBase += base;
			}
		}
		return HttpResponse.json({
			income_base: incomeBase,
			expense_base: expenseBase,
			net_base: incomeBase - expenseBase,
			paid_base: paidBase,
			outstanding_base: outstandingBase,
			transaction_count: rows.length
		});
	}),

	http.post('/v1/contacts/:id/auto-link-transactions', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const contact = store.contacts.find((c) => c.id === params.id);
		if (!contact) return notFound('Kişi bulunamadı');
		let updated = 0;
		const now = nowIso();
		for (const t of store.transactions) {
			if (t.contact_id != null) continue;
			if ((t.contact_label ?? '').trim() !== contact.display_name) continue;
			t.contact_id = contact.id;
			t.contact_label = contact.display_name;
			t.contact_display_name = contact.display_name;
			t.updated_at = now;
			updated += 1;
		}
		refreshUsage(store);
		return HttpResponse.json({ updated });
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

	http.put('/v1/settings/finance-categories/reorder', async ({ request }) => {
		const body = await request.json();
		const parsed = settingsReorderSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz sıralama', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		let updated = 0;
		const now = nowIso();
		for (const item of parsed.data.items) {
			const row = store.financeCategories.find((c) => c.id === item.id);
			if (!row) continue;
			row.sort_order = item.sort_order;
			row.updated_at = now;
			updated += 1;
		}
		return HttpResponse.json({ updated });
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

	http.put('/v1/settings/appointment-types/reorder', async ({ request }) => {
		const body = await request.json();
		const parsed = settingsReorderSchema.safeParse(body);
		if (!parsed.success) return badRequest('Geçersiz sıralama', parsed.error.flatten());
		const store = getStore(scenarioFrom(request));
		let updated = 0;
		for (const item of parsed.data.items) {
			const row = store.appointmentTypes.find((t) => t.id === item.id);
			if (!row) continue;
			row.sort_order = item.sort_order;
			updated += 1;
		}
		return HttpResponse.json({ updated });
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

	http.get('/v1/platform/tenants', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		return HttpResponse.json({
			items: store.tenants.map((t) => ({ ...t, deleted_at: null }))
		});
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
			timezone: 'Europe/Istanbul',
			data_retention_until: null,
			created_at: now
		};
		store.tenants.push(tenant);
		if (body.grant_self_admin !== false) {
			store.members.push({
				id: crypto.randomUUID(),
				user_id: DEMO_USER_ID,
				email: demoUser.email,
				display_name: demoUser.display_name,
				created_at: now,
				tenant_id: tenant.id,
				role: 'owner'
			});
		}
		return HttpResponse.json(tenant, { status: 201 });
	}),

	http.post('/v1/platform/tenants', async ({ request }) => {
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
			timezone: 'Europe/Istanbul',
			data_retention_until: null,
			created_at: now
		};
		store.tenants.push(tenant);
		if (body.grant_self_admin !== false) {
			store.members.push({
				id: crypto.randomUUID(),
				user_id: DEMO_USER_ID,
				email: demoUser.email,
				display_name: demoUser.display_name,
				created_at: now,
				tenant_id: tenant.id,
				role: 'owner'
			});
		}
		return HttpResponse.json({ ...tenant, deleted_at: null }, { status: 201 });
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

	http.patch('/v1/platform/tenants/:id', async ({ params, request }) => {
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
		return HttpResponse.json({ ...store.tenants[idx], deleted_at: null });
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

	http.delete('/v1/platform/tenants/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		if (params.id === DEMO_TENANT_ID) {
			return badRequest('Demo ana tenant silinemez');
		}
		const idx = store.tenants.findIndex((t) => t.id === params.id);
		if (idx < 0) return notFound('Organizasyon bulunamadı');
		// Soft-delete semantics in mock: remove from working list (keeps demo simple).
		store.tenants.splice(idx, 1);
		store.members = store.members.filter((m) => m.tenant_id !== params.id);
		if (store.tenant.id === params.id) {
			store.tenant = { ...demoTenant };
		}
		return HttpResponse.json({ id: params.id, deleted_at: nowIso() });
	}),

	http.get('/v1/dev/tenants/:id/users', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		if (!store.tenants.some((t) => t.id === params.id)) return notFound('Organizasyon bulunamadı');
		const items = store.members.filter((m) => m.tenant_id === params.id);
		return HttpResponse.json({ items });
	}),

	http.get('/v1/platform/tenants/:id/members', ({ params, request }) => {
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

		const userId = crypto.randomUUID();
		const user: MembershipUser = {
			id: crypto.randomUUID(),
			user_id: userId,
			email,
			display_name,
			created_at: nowIso(),
			tenant_id: params.id as string,
			role: roleParsed.data
		};
		store.members.push(user);
		return HttpResponse.json(user, { status: 201 });
	}),

	http.post('/v1/platform/tenants/:id/members', async ({ params, request }) => {
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

		const userId = crypto.randomUUID();
		const user: MembershipUser = {
			id: crypto.randomUUID(),
			user_id: userId,
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
			(m) => m.user_id === params.userId && m.tenant_id === params.tenantId
		);
		if (idx < 0) return notFound('Üye bulunamadı');
		store.members.splice(idx, 1);
		return new HttpResponse(null, { status: 204 });
	}),

	http.get('/v1/csp-reports', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		const items = [...store.cspReports].sort((a, b) => {
			if (b.count !== a.count) return b.count - a.count;
			return b.last_seen_at.localeCompare(a.last_seen_at);
		});
		return HttpResponse.json({ items });
	}),

	http.post('/v1/csp-reports', () => new HttpResponse(null, { status: 204 })),

	http.delete('/v1/csp-reports', ({ request }) => {
		const store = getStore(scenarioFrom(request));
		store.cspReports = [];
		return HttpResponse.json({ deleted: true });
	}),

	http.delete('/v1/platform/tenants/:tenantId/members/:userId', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		if (params.userId === DEMO_USER_ID) {
			return badRequest('Kendi üyeliğini bu ekrandan kaldıramazsın');
		}
		const idx = store.members.findIndex(
			(m) => m.user_id === params.userId && m.tenant_id === params.tenantId
		);
		if (idx < 0) return notFound('Üye bulunamadı');
		store.members.splice(idx, 1);
		return HttpResponse.json({ id: params.userId, deleted: true });
	})
];
