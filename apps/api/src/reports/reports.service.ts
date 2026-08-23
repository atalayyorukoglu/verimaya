import { Injectable } from '@nestjs/common';
import {
	and,
	count,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
	tenantDayRange,
	toTenantDayKey,
	ATTRIBUTION_COVERAGE_THRESHOLD,
	calculateRealRoas,
	cohortMonthDiff,
	maturationBucket,
	COHORT_ATTRIBUTION_NOTE_KEY,
	deriveTransactionLabel,
	evaluateTransactionConsistency,
	REPORT_CONSISTENCY_ITEMS_LIMIT,
	REPORT_TRANSACTION_DUPLICATES_ITEMS_LIMIT,
	resolveCollectedAmount,
	type MarketingReport,
	type MarketingReportParams,
	type MarketingSourceRow,
	type ReportAppointmentMetrics,
	type ReportBalances,
	type ReportBalanceRow,
	type ReportByCategory,
	type ReportByCategoryDetail,
	type ReportByCategoryDetailParams,
	type ReportByResponsible,
	type ReportCohorts,
	type ReportCohortsParams,
	type ReportCohortRow,
	type ReportConsistency,
	type ReportConsistencyItem,
	type ReportMonthly,
	type ReportContactDistribution,
	type ReportPeriodParams,
	type ReportSummary,
	type ReportTransactionDuplicates,
	type ReportTransactionDuplicatesParams,
	type ReportUntouchedContacts,
	type ReportUntouchedContactRow,
	type ReportUntouchedContactsParams,
	type ReportReferrals,
	type ReportReferralRow,
	type UntouchedActivitySource
} from '@verimaya/shared';
import { resolveBaseAmount, resolvePaidBaseAmount } from '../common/finance-base';
import { adMetricsDaily, appointments, contacts, tenants, transactions, user } from '../db/schema';
import { TenantContextService } from '../tenant/tenant-context.service';

/** Referans veren tarafı — kendine referans veren `contacts` satırıyla ayrı alias gerekir. */
const referrerContacts = alias(contacts, 'reports_referrer');

type TenantDb = Parameters<Parameters<TenantContextService['withTenant']>[1]>[0]['db'];

type TxRow = {
	kind: string;
	status: string;
	category: string | null;
	subtitle: string | null;
	occurredOn: string;
	amount: number;
	amountBase: number | null;
	baseCurrency: string | null;
	paidAmount: number | null;
	currency: string;
};

type IncomeWithSourceRow = {
	kind: string;
	status: string;
	amount: number;
	amountBase: number | null;
	baseCurrency: string | null;
	paidAmount: number | null;
	currency: string;
	source: string | null;
};

function signedMinor(kind: string, amount: number): number {
	return kind === 'income' ? amount : -amount;
}

type PatientCohortRow = {
	source: string | null;
	status: string | null;
};

type PatientDistributionRow = {
	status: string | null;
	source: string | null;
	medium: string | null;
};

function categoryLabel(category: string | null): string {
	const trimmed = (category ?? '').trim();
	return trimmed || 'Kategorisiz';
}

function subtitleLabel(subtitle: string | null): string {
	const trimmed = (subtitle ?? '').trim();
	return trimmed || 'Genel';
}

function sourceLabel(source: string | null | undefined): string {
	const trimmed = (source ?? '').trim();
	return trimmed || 'Bilinmeyen';
}

function rate(part: number, total: number): number {
	return total === 0 ? 0 : part / total;
}

/** Inclusive `YYYY-MM` range. */
function eachYearMonth(fromMonth: string, toMonth: string): string[] {
	const out: string[] = [];
	let [y, m] = fromMonth.split('-').map(Number) as [number, number];
	const [ey, em] = toMonth.split('-').map(Number) as [number, number];
	while (y < ey || (y === ey && m <= em)) {
		out.push(`${y}-${String(m).padStart(2, '0')}`);
		m += 1;
		if (m > 12) {
			m = 1;
			y += 1;
		}
	}
	return out;
}

/**
 * AUDIT-01 (Faz 8): date boundaries now honor the tenant's timezone via `tenantDayRange`
 * from `@verimaya/shared`. The legacy `startOfDayUtc` / `dayAfterUtc` were hard-coded UTC
 * and produced wrong day buckets for non-Istanbul tenants (Opus denetimi §[MEDIUM]
 * "reports.service.ts computes report date boundaries in UTC, not tenant timezone").
 */
async function dayRange(
	db: TenantDb,
	tenantId: string,
	isoDate: string
): Promise<{ start: Date; endExclusive: Date }> {
	return tenantDayRange(isoDate, await getTenantTz(db, tenantId));
}

async function getTenantTz(db: TenantDb, tenantId: string): Promise<string> {
	const [row] = await db
		.select({ timezone: tenants.timezone })
		.from(tenants)
		.where(eq(tenants.id, tenantId))
		.limit(1);
	return row?.timezone ?? 'Europe/Istanbul';
}

@Injectable()
export class ReportsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async summary(tenantId: string, params: ReportPeriodParams): Promise<ReportSummary> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const tenantBase = await this.getTenantBase(db, tenantId);
			const rows = await this.fetchTransactions(db, params);

			let incomeBase = 0;
			let expenseBase = 0;
			let pendingBase = 0;
			let fxMissingCount = 0;
			const fxMissingByCurrency = new Map<string, number>();

			for (const row of rows) {
				const base = resolveBaseAmount(row, tenantBase);
				if (base == null) {
					fxMissingCount += 1;
					fxMissingByCurrency.set(
						row.currency,
						(fxMissingByCurrency.get(row.currency) ?? 0) + row.amount
					);
					continue;
				}
				if (row.kind === 'income') {
					incomeBase += base;
					const paidBase = resolvePaidBaseAmount(row, tenantBase) ?? 0;
					pendingBase += Math.max(0, base - paidBase);
				} else {
					expenseBase += base;
				}
			}

			const transactionCount = rows.length;
			const coverageRatio =
				transactionCount === 0 ? 1 : (transactionCount - fxMissingCount) / transactionCount;

			return {
				period: { from: params.from ?? null, to: params.to ?? null },
				income_base: incomeBase,
				expense_base: expenseBase,
				net_base: incomeBase - expenseBase,
				pending_base: pendingBase,
				transaction_count: transactionCount,
				fx_missing_count: fxMissingCount,
				fx_missing_amount_by_currency: [...fxMissingByCurrency.entries()]
					.map(([currency, amount_minor]) => ({
						currency: currency as ReportSummary['fx_missing_amount_by_currency'][number]['currency'],
						amount_minor
					}))
					.sort((a, b) => a.currency.localeCompare(b.currency)),
				coverage_ratio: coverageRatio
			};
		});
	}

	async contactDistribution(
		tenantId: string,
		params: ReportPeriodParams
	): Promise<ReportContactDistribution> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await this.fetchPatientsForPeriod(db, tenantId, params);

			const statusCounts = new Map<string, number>();
			const sourceCounts = new Map<string, number>();
			const mediumCounts = new Map<string, number>();

			for (const row of rows) {
				if (row.status) {
					statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
				}
				const label = sourceLabel(row.source);
				sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + 1);
				const medium = sourceLabel(row.medium);
				mediumCounts.set(medium, (mediumCounts.get(medium) ?? 0) + 1);
			}

			const by_status = [...statusCounts.entries()]
				.map(([status, count]) => ({
					status: status as ReportContactDistribution['by_status'][number]['status'],
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
				period: { from: params.from ?? null, to: params.to ?? null },
				by_status,
				by_source,
				by_medium,
				total: rows.length
			};
		});
	}

	/**
	 * GAP-07: appointment ops metrics. Aggregation is SQL GROUP BY / FILTER only —
	 * never pull raw appointment rows for client-side counting (legacy raporlar.md).
	 * Day/month buckets honor tenant timezone via tenantDayRange + AT TIME ZONE.
	 */
	async appointmentMetrics(
		tenantId: string,
		params: ReportPeriodParams
	): Promise<ReportAppointmentMetrics> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const conditions: SQL[] = [isNull(appointments.deletedAt)];
			if (params.from) {
				const { start } = await dayRange(db, tenantId, params.from);
				conditions.push(gte(appointments.startsAt, start));
			}
			if (params.to) {
				const { endExclusive } = await dayRange(db, tenantId, params.to);
				conditions.push(lt(appointments.startsAt, endExclusive));
			}
			const where = and(...conditions);
			const timezone = await getTenantTz(db, tenantId);

			const [statusRow] = await db
				.select({
					total: count(),
					completed: sql<number>`count(*) filter (where ${appointments.status} = 'completed')`,
					noShow: sql<number>`count(*) filter (where ${appointments.status} = 'no_show')`,
					cancelled: sql<number>`count(*) filter (where ${appointments.status} = 'cancelled')`
				})
				.from(appointments)
				.where(where);

			const total = Number(statusRow?.total ?? 0);
			const completed = Number(statusRow?.completed ?? 0);
			const noShow = Number(statusRow?.noShow ?? 0);
			const cancelled = Number(statusRow?.cancelled ?? 0);

			const clinicNameExpr = sql<string>`coalesce(nullif(trim("appointments"."clinic_name"), ''), 'Atanmamış')`;
			const clinicRows = await db
				.select({
					clinicContactId: appointments.clinicContactId,
					clinicName: clinicNameExpr,
					count: count(),
					completed: sql<number>`count(*) filter (where ${appointments.status} = 'completed')`
				})
				.from(appointments)
				.where(where)
				.groupBy(appointments.clinicContactId, clinicNameExpr)
				.orderBy(sql`count(*) desc`);

			const typeExpr = sql<string>`coalesce(nullif(trim("appointments"."appointment_type"), ''), 'Belirtilmemiş')`;
			const typeRows = await db
				.select({
					appointmentType: typeExpr,
					count: count()
				})
				.from(appointments)
				.where(where)
				.groupBy(typeExpr)
				.orderBy(sql`count(*) desc`);

			// Hekim kırılımı (Karar 1(b)): appointments.doctor_contact_id has no denormalized
			// name (unlike clinic_name) — the label always comes from the joined contact.
			const doctorNameExpr = sql<string>`coalesce(nullif(trim("contacts"."display_name"), ''), 'Atanmamış')`;
			const doctorRows = await db
				.select({
					doctorContactId: appointments.doctorContactId,
					doctorName: doctorNameExpr,
					total: count(),
					completed: sql<number>`count(*) filter (where ${appointments.status} = 'completed')`,
					noShow: sql<number>`count(*) filter (where ${appointments.status} = 'no_show')`,
					cancelled: sql<number>`count(*) filter (where ${appointments.status} = 'cancelled')`
				})
				.from(appointments)
				.leftJoin(contacts, eq(appointments.doctorContactId, contacts.id))
				.where(where)
				.groupBy(appointments.doctorContactId, doctorNameExpr)
				.orderBy(sql`count(*) desc`);

			// Hekim × randevu tipi çapraz sayımı — 'RPT' sunucuya gömülmez, ham sayım döner
			// (bkz. docs/2026-08-23-maya-icgoru-sorulari.md § Karar 2). Oran istemcide hesaplanır.
			const doctorTypeRows = await db
				.select({
					doctorContactId: appointments.doctorContactId,
					doctorName: doctorNameExpr,
					appointmentType: typeExpr,
					count: count()
				})
				.from(appointments)
				.leftJoin(contacts, eq(appointments.doctorContactId, contacts.id))
				.where(where)
				.groupBy(appointments.doctorContactId, doctorNameExpr, typeExpr)
				.orderBy(sql`count(*) desc`);

			// Embed timezone as a literal so SELECT/GROUP BY SQL text matches (drizzle
			// otherwise binds the column differently across clauses → PG 42803).
			const tzLiteral = timezone.replace(/'/g, "''");
			const monthExpr = sql<string>`to_char("appointments"."starts_at" AT TIME ZONE '${sql.raw(tzLiteral)}', 'YYYY-MM')`;
			const monthRows = await db
				.select({
					month: monthExpr,
					count: count()
				})
				.from(appointments)
				.where(where)
				.groupBy(monthExpr)
				.orderBy(monthExpr);

			return {
				period: { from: params.from ?? null, to: params.to ?? null },
				total,
				completion_rate: rate(completed, total),
				no_show_rate: rate(noShow, total),
				cancellation_rate: rate(cancelled, total),
				by_clinic: clinicRows.map((row) => {
					const n = Number(row.count);
					return {
						clinic_contact_id: row.clinicContactId,
						clinic_name: row.clinicName,
						count: n,
						completion_rate: rate(Number(row.completed), n)
					};
				}),
				by_appointment_type: typeRows.map((row) => {
					const n = Number(row.count);
					return {
						appointment_type: row.appointmentType,
						count: n,
						ratio: rate(n, total)
					};
				}),
				by_doctor: doctorRows.map((row) => ({
					doctor_contact_id: row.doctorContactId,
					doctor_name: row.doctorName,
					total: Number(row.total),
					completed: Number(row.completed),
					no_show: Number(row.noShow),
					cancelled: Number(row.cancelled)
				})),
				by_doctor_type: doctorTypeRows.map((row) => ({
					doctor_contact_id: row.doctorContactId,
					doctor_name: row.doctorName,
					appointment_type: row.appointmentType,
					count: Number(row.count)
				})),
				monthly: monthRows.map((row) => ({
					month: row.month,
					count: Number(row.count)
				}))
			};
		});
	}

	/** G-04: full-period audit using the same shared rules as unsaved transaction drafts. */
	async consistency(
		tenantId: string,
		params: ReportPeriodParams
	): Promise<ReportConsistency> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const tenantBase = await this.getTenantBase(db, tenantId);
			const period: SQL[] = [isNull(transactions.deletedAt)];
			if (params.from) period.push(gte(transactions.occurredOn, params.from));
			if (params.to) period.push(lte(transactions.occurredOn, params.to));
			const counts_by_code: ReportConsistency['counts_by_code'] = {};
			const allItems: Array<ReportConsistencyItem & { occurredOn: string }> = [];
			const rows = await db
				.select({
					id: transactions.id,
					title: transactions.title,
					subtitle: transactions.subtitle,
					category: transactions.category,
					occurredOn: transactions.occurredOn,
					kind: transactions.kind,
					status: transactions.status,
					amount: transactions.amount,
					amountBase: transactions.amountBase,
					currency: transactions.currency,
					paidAmount: transactions.paidAmount,
					contactId: transactions.contactId,
					contactLabel: transactions.contactLabel,
					contactDisplayName: transactions.contactDisplayName,
					responsibleContactId: transactions.responsibleContactId,
					responsibleIsInternal: contacts.isInternal,
					description: transactions.description
				})
				.from(transactions)
				.leftJoin(contacts, eq(transactions.responsibleContactId, contacts.id))
				.where(and(...period));

			for (const row of rows) {
				const issues = evaluateTransactionConsistency(
					{
						kind: row.kind,
						category: row.category,
						contact_id: row.contactId,
						contact_label: row.contactLabel,
						responsible_contact_id: row.responsibleContactId,
						currency: row.currency,
						amount: row.amount,
						amount_base: row.amountBase,
						paid_amount: row.paidAmount,
						status: row.status,
						responsible_is_internal: row.responsibleIsInternal
					},
					{ baseCurrency: tenantBase }
				);
				const title = deriveTransactionLabel({
					title: row.title,
					subtitle: row.subtitle,
					category: row.category,
					contact_display_name: row.contactDisplayName,
					contact_label: row.contactLabel,
					description: row.description
				});

				for (const issue of issues) {
					counts_by_code[issue.code] = (counts_by_code[issue.code] ?? 0) + 1;
					allItems.push({
						transaction_id: row.id,
						title,
						occurred_on: String(row.occurredOn).slice(0, 10),
						severity: issue.severity,
						code: issue.code,
						message_key: issue.message_key,
						occurredOn: row.occurredOn
					});
				}
			}

			const items = allItems
				.sort(
					(a, b) =>
						(a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1) ||
						b.occurredOn.localeCompare(a.occurredOn) ||
						b.transaction_id.localeCompare(a.transaction_id)
				)
				.slice(0, REPORT_CONSISTENCY_ITEMS_LIMIT)
				.map(({ occurredOn: _, ...item }) => item);
			const error = allItems.filter((item) => item.severity === 'error').length;
			const warning = allItems.length - error;

			return {
				period: { from: params.from ?? null, to: params.to ?? null },
				items,
				counts: { error, warning },
				counts_by_code,
				truncated: error + warning > items.length
			};
		});
	}

	/**
	 * GAP-F09-14: duplicate-suspicion groups — amount + currency + occurred_on + kind.
	 * Aggregation is SQL GROUP BY / HAVING over the full period (no client page cap).
	 * Items are capped; `total_groups` is the uncapped group count.
	 */
	async transactionDuplicates(
		tenantId: string,
		params: ReportTransactionDuplicatesParams
	): Promise<ReportTransactionDuplicates> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const period: SQL[] = [isNull(transactions.deletedAt)];
			if (params.from) period.push(gte(transactions.occurredOn, params.from));
			if (params.to) period.push(lte(transactions.occurredOn, params.to));
			const periodWhere = and(...period)!;

			const groups = await db
				.select({
					amount: transactions.amount,
					currency: transactions.currency,
					occurredOn: transactions.occurredOn,
					kind: transactions.kind,
					count: sql<number>`count(*)::int`,
					title: sql<string>`min(${transactions.title})`
				})
				.from(transactions)
				.where(periodWhere)
				.groupBy(
					transactions.amount,
					transactions.currency,
					transactions.occurredOn,
					transactions.kind
				)
				.having(sql`count(*) > 1`)
				.orderBy(sql`count(*) DESC`);

			const total_groups = groups.length;
			const items = groups.slice(0, REPORT_TRANSACTION_DUPLICATES_ITEMS_LIMIT).map((row) => {
				// Drizzle types `occurredOn` as string; runtime may still be Date from the driver.
				const rawOccurred: unknown = row.occurredOn;
				const occurred =
					rawOccurred instanceof Date
						? rawOccurred.toISOString().slice(0, 10)
						: String(rawOccurred).slice(0, 10);
				return {
					count: Number(row.count),
					amount: row.amount,
					currency: row.currency as ReportTransactionDuplicates['items'][number]['currency'],
					occurred_on: occurred,
					kind: row.kind as ReportTransactionDuplicates['items'][number]['kind'],
					title: String(row.title)
				};
			});

			return { items, total_groups };
		});
	}

	async balances(tenantId: string): Promise<ReportBalances> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await db
				.select({
					contactId: transactions.contactId,
					contactLabel: transactions.contactLabel,
					contactDisplayName: contacts.displayName,
					kind: transactions.kind,
					status: transactions.status,
					amount: transactions.amount,
					paidAmount: transactions.paidAmount,
					currency: transactions.currency
				})
				.from(transactions)
				.leftJoin(contacts, eq(transactions.contactId, contacts.id))
				.where(
					and(
						isNotNull(transactions.contactId),
						isNull(transactions.deletedAt),
						// Policy B: contact is the row subject — soft-deleted contacts leave the ledger.
						isNull(contacts.deletedAt)
					)
				);

			const map = new Map<
				string,
				{
					contact_id: string;
					contact_label: string;
					currency: ReportBalanceRow['currency'];
					open_amount: number;
					collected_amount: number;
					transaction_count: number;
				}
			>();

			for (const row of rows) {
				if (!row.contactId) continue;
				const contactId = row.contactId;
				const currency = row.currency as ReportBalanceRow['currency'];
				const key = `${contactId}\0${currency}`;
				const paid = resolveCollectedAmount({
					status: row.status,
					amount: row.amount,
					paidAmount: row.paidAmount
				});
				const openDelta = signedMinor(row.kind, row.amount - paid);
				const collectedDelta = signedMinor(row.kind, paid);

				const label =
					(row.contactLabel ?? '').trim() ||
					(row.contactDisplayName ?? '').trim() ||
					'Bilinmeyen';

				const cur = map.get(key) ?? {
					contact_id: contactId,
					contact_label: label,
					currency,
					open_amount: 0,
					collected_amount: 0,
					transaction_count: 0
				};
				cur.open_amount += openDelta;
				cur.collected_amount += collectedDelta;
				cur.transaction_count += 1;
				if (!cur.contact_label && label) cur.contact_label = label;
				map.set(key, cur);
			}

			const items = [...map.values()]
				.filter((row) => row.open_amount !== 0)
				.sort((a, b) => Math.abs(b.open_amount) - Math.abs(a.open_amount));

			return { items };
		});
	}

	async byCategory(tenantId: string, params: ReportPeriodParams): Promise<ReportByCategory> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const tenantBase = await this.getTenantBase(db, tenantId);
			const rows = await this.fetchTransactions(db, params);

			const map = new Map<
				string,
				{ income_base: number; expense_base: number; transaction_count: number }
			>();

			for (const row of rows) {
				const label = categoryLabel(row.category);
				const cur = map.get(label) ?? {
					income_base: 0,
					expense_base: 0,
					transaction_count: 0
				};
				cur.transaction_count += 1;

				const base = resolveBaseAmount(row, tenantBase);
				if (base != null) {
					if (row.kind === 'income') cur.income_base += base;
					else cur.expense_base += base;
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

			return {
				period: { from: params.from ?? null, to: params.to ?? null },
				items
			};
		});
	}

	async byCategoryDetail(
		tenantId: string,
		params: ReportByCategoryDetailParams
	): Promise<ReportByCategoryDetail> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const tenantBase = await this.getTenantBase(db, tenantId);
			const rows = await this.fetchTransactions(db, params);
			const category = params.category.trim();

			const map = new Map<
				string,
				{ income_base: number; expense_base: number; transaction_count: number }
			>();

			for (const row of rows) {
				if (categoryLabel(row.category) !== category) continue;

				const label = subtitleLabel(row.subtitle);
				const cur = map.get(label) ?? {
					income_base: 0,
					expense_base: 0,
					transaction_count: 0
				};
				cur.transaction_count += 1;

				const base = resolveBaseAmount(row, tenantBase);
				if (base != null) {
					if (row.kind === 'income') cur.income_base += base;
					else cur.expense_base += base;
				}
				map.set(label, cur);
			}

			const items = [...map.entries()]
				.map(([subtitle_name, v]) => ({
					subtitle_name,
					income_base: v.income_base,
					expense_base: v.expense_base,
					net_base: v.income_base - v.expense_base,
					transaction_count: v.transaction_count
				}))
				.sort((a, b) => Math.abs(b.net_base) - Math.abs(a.net_base));

			return {
				period: { from: params.from ?? null, to: params.to ?? null },
				category,
				items
			};
		});
	}

	async byResponsible(
		tenantId: string,
		params: ReportPeriodParams
	): Promise<ReportByResponsible> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const tenantBase = await this.getTenantBase(db, tenantId);
			const conditions = [isNull(transactions.deletedAt), eq(transactions.kind, 'expense')];
			if (params.from) conditions.push(gte(transactions.occurredOn, params.from));
			if (params.to) conditions.push(lte(transactions.occurredOn, params.to));

			const rows = await db
				.select({
					responsibleContactId: transactions.responsibleContactId,
					amount: transactions.amount,
					amountBase: transactions.amountBase,
					baseCurrency: transactions.baseCurrency,
					currency: transactions.currency,
					displayName: contacts.displayName
				})
				.from(transactions)
				.leftJoin(contacts, eq(transactions.responsibleContactId, contacts.id))
				.where(and(...conditions));

			const map = new Map<
				string,
				{
					responsible_contact_id: string | null;
					responsible_label: string;
					expense_base: number;
					transaction_count: number;
				}
			>();

			for (const row of rows) {
				const key = row.responsibleContactId ?? '';
				const label =
					row.responsibleContactId == null
						? 'Atanmamış'
						: row.displayName?.trim() || row.responsibleContactId;
				const cur = map.get(key) ?? {
					responsible_contact_id: row.responsibleContactId,
					responsible_label: label,
					expense_base: 0,
					transaction_count: 0
				};
				cur.transaction_count += 1;
				const base = resolveBaseAmount(
					{
						amount: row.amount,
						amountBase: row.amountBase,
						baseCurrency: row.baseCurrency,
						currency: row.currency
					},
					tenantBase
				);
				if (base != null) cur.expense_base += base;
				map.set(key, cur);
			}

			const items = [...map.values()].sort((a, b) => b.expense_base - a.expense_base);

			return {
				period: { from: params.from ?? null, to: params.to ?? null },
				items
			};
		});
	}

	async monthly(tenantId: string, params: ReportPeriodParams): Promise<ReportMonthly> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const tenantBase = await this.getTenantBase(db, tenantId);
			const rows = await this.fetchTransactions(db, params);

			const map = new Map<
				string,
				{ income_base: number; expense_base: number; transaction_count: number }
			>();

			for (const row of rows) {
				const month = row.occurredOn.slice(0, 7);
				const cur = map.get(month) ?? {
					income_base: 0,
					expense_base: 0,
					transaction_count: 0
				};
				cur.transaction_count += 1;

				const base = resolveBaseAmount(row, tenantBase);
				if (base != null) {
					if (row.kind === 'income') cur.income_base += base;
					else cur.expense_base += base;
				}
				map.set(month, cur);
			}

			const items = [...map.entries()]
				.map(([month, v]) => ({
					month,
					income_base: v.income_base,
					expense_base: v.expense_base,
					net_base: v.income_base - v.expense_base,
					transaction_count: v.transaction_count
				}))
				.sort((a, b) => a.month.localeCompare(b.month));

			return {
				period: { from: params.from ?? null, to: params.to ?? null },
				items
			};
		});
	}

	/**
	 * Real ROAS report: ad spend vs tahsilat (paid income) + file/treated cohort by source.
	 * Revenue denominator = TAHSİLAT (resolveCollectedAmount → tenant base), not invoice amount.
	 * Spend uses the same resolveBaseAmount FX snapshot rules as transactions (OPS-02c).
	 *
	 * When from/to are omitted, spend + tahsilat + cohort use ad_metrics_daily MIN/MAX
	 * dates as the effective window (provider-scoped). Empty ad metrics → no date
	 * filter, spend_base 0, ratio metrics null via calculateRealRoas.
	 */
	async marketing(tenantId: string, params: MarketingReportParams): Promise<MarketingReport> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const tenantBase = await this.getTenantBase(db, tenantId);
			const { windowParams, effective_from, effective_to } = await this.resolveMarketingWindow(
				db,
				params
			);

			const { spend_base, spend_fx_missing } = await this.sumAdSpend(
				db,
				windowParams,
				tenantBase
			);
			const { revenue_base, revenueBySource } = await this.sumTahsilatBySource(
				db,
				windowParams,
				tenantBase
			);
			const { leads_count, treated_count, cohortBySource } = await this.patientCohortBySource(
				db,
				tenantId,
				windowParams
			);

			const sourceKeys = new Set([...revenueBySource.keys(), ...cohortBySource.keys()]);
			const by_source: MarketingSourceRow[] = [...sourceKeys]
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

			// Coverage from the same cohort map — no extra round trip.
			const unknownLeads = cohortBySource.get('Bilinmeyen')?.leads ?? 0;
			const attribution_coverage =
				leads_count === 0 ? null : (leads_count - unknownLeads) / leads_count;
			const attribution_missing =
				attribution_coverage != null &&
				attribution_coverage < ATTRIBUTION_COVERAGE_THRESHOLD;

			const period = {
				from: params.from ?? null,
				to: params.to ?? null,
				effective_from,
				effective_to
			};

			// Do not publish ROAS/CPL when any spend row lacks convertible FX.
			if (spend_fx_missing || spend_base == null) {
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
				spendMinor: spend_base,
				revenueMinor: revenue_base,
				leads: leads_count,
				treated: treated_count
			});

			if (attribution_missing) {
				return {
					period,
					spend_base,
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
				spend_base,
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
		});
	}

	private async getTenantBase(db: TenantDb, tenantId: string): Promise<string> {
		const [tenant] = await db
			.select({ baseCurrency: tenants.baseCurrency })
			.from(tenants)
			.where(eq(tenants.id, tenantId))
			.limit(1);
		return tenant?.baseCurrency ?? 'TRY';
	}

	private async fetchTransactions(db: TenantDb, params: ReportPeriodParams): Promise<TxRow[]> {
		const conditions = [isNull(transactions.deletedAt)];
		if (params.from) {
			conditions.push(gte(transactions.occurredOn, params.from));
		}
		if (params.to) {
			conditions.push(lte(transactions.occurredOn, params.to));
		}

		return db
			.select({
				kind: transactions.kind,
				status: transactions.status,
				category: transactions.category,
				subtitle: transactions.subtitle,
				occurredOn: transactions.occurredOn,
				amount: transactions.amount,
				amountBase: transactions.amountBase,
				baseCurrency: transactions.baseCurrency,
				paidAmount: transactions.paidAmount,
				currency: transactions.currency
			})
			.from(transactions)
			.where(and(...conditions));
	}

	private async fetchPatientsForPeriod(
		db: TenantDb,
		tenantId: string,
		params: ReportPeriodParams
	): Promise<PatientDistributionRow[]> {
		const conditions = [
			isNull(contacts.deletedAt),
			eq(contacts.contactTypeName, 'Hasta')
		];
		if (params.from) {
			const { start } = await dayRange(db, tenantId, params.from);
			conditions.push(gte(contacts.createdAt, start));
		}
		if (params.to) {
			const { endExclusive } = await dayRange(db, tenantId, params.to);
			conditions.push(lt(contacts.createdAt, endExclusive));
		}

		return db
			.select({
				status: contacts.status,
				source: contacts.source,
				medium: contacts.medium
			})
			.from(contacts)
			.where(and(...conditions));
	}

	/**
	 * Resolve the effective spend/tahsilat window.
	 * Explicit from/to → used as-is. Omitted → ad_metrics MIN/MAX (provider-scoped).
	 * Empty ad metrics on all-time → no date filter; effective_* null.
	 */
	private async resolveMarketingWindow(
		db: TenantDb,
		params: MarketingReportParams
	): Promise<{
		windowParams: MarketingReportParams;
		effective_from: string | null;
		effective_to: string | null;
	}> {
		if (params.from || params.to) {
			return {
				windowParams: params,
				effective_from: params.from ?? null,
				effective_to: params.to ?? null
			};
		}

		const conditions = this.adMetricsConditions({ provider: params.provider });
		const [row] = await db
			.select({
				minDate: sql<string | null>`min(${adMetricsDaily.date})`,
				maxDate: sql<string | null>`max(${adMetricsDaily.date})`
			})
			.from(adMetricsDaily)
			.where(conditions.length ? and(...conditions) : undefined);

		const minDate = row?.minDate ?? null;
		const maxDate = row?.maxDate ?? null;
		if (!minDate || !maxDate) {
			return {
				windowParams: params,
				effective_from: null,
				effective_to: null
			};
		}

		return {
			windowParams: { ...params, from: minDate, to: maxDate },
			effective_from: minDate,
			effective_to: maxDate
		};
	}

	/** Shared where fragments for ad_metrics_daily (date + optional provider). */
	private adMetricsConditions(params: MarketingReportParams): SQL[] {
		const conditions: SQL[] = [];
		if (params.from) {
			conditions.push(gte(adMetricsDaily.date, params.from));
		}
		if (params.to) {
			conditions.push(lte(adMetricsDaily.date, params.to));
		}
		if (params.provider) {
			conditions.push(eq(adMetricsDaily.provider, params.provider));
		}
		return conditions;
	}

	/**
	 * Ad spend in tenant base via resolveBaseAmount (FX-01 / OPS-02c).
	 * Any row that cannot be converted sets spend_fx_missing — caller must not show ROAS.
	 */
	private async sumAdSpend(
		db: TenantDb,
		params: MarketingReportParams,
		tenantBase: string
	): Promise<{ spend_base: number | null; spend_fx_missing: boolean }> {
		const conditions = this.adMetricsConditions(params);

		const rows = await db
			.select({
				spendMinor: adMetricsDaily.spendMinor,
				spendBase: adMetricsDaily.spendBase,
				baseCurrency: adMetricsDaily.baseCurrency,
				currency: adMetricsDaily.currency
			})
			.from(adMetricsDaily)
			.where(conditions.length ? and(...conditions) : undefined);

		let spend_base = 0;
		let spend_fx_missing = false;

		for (const row of rows) {
			const base = resolveBaseAmount(
				{
					amount: row.spendMinor,
					amountBase: row.spendBase,
					baseCurrency: row.baseCurrency,
					currency: row.currency
				},
				tenantBase
			);
			if (base == null) {
				spend_fx_missing = true;
				continue;
			}
			spend_base += base;
		}

		if (spend_fx_missing) {
			return { spend_base: null, spend_fx_missing: true };
		}
		return { spend_base, spend_fx_missing: false };
	}

	private async sumTahsilatBySource(
		db: TenantDb,
		params: MarketingReportParams,
		tenantBase: string
	): Promise<{ revenue_base: number; revenueBySource: Map<string, number> }> {
		const conditions = [eq(transactions.kind, 'income'), isNull(transactions.deletedAt)];
		if (params.from) {
			conditions.push(gte(transactions.occurredOn, params.from));
		}
		if (params.to) {
			conditions.push(lte(transactions.occurredOn, params.to));
		}

		const rows: IncomeWithSourceRow[] = await db
			.select({
				kind: transactions.kind,
				status: transactions.status,
				amount: transactions.amount,
				amountBase: transactions.amountBase,
				baseCurrency: transactions.baseCurrency,
				paidAmount: transactions.paidAmount,
				currency: transactions.currency,
				source: contacts.source
			})
			.from(transactions)
			.leftJoin(
				contacts,
				and(
					eq(transactions.contactId, contacts.id),
					isNull(contacts.deletedAt),
					eq(contacts.contactTypeName, 'Hasta')
				)
			)
			.where(and(...conditions));

		const revenueBySource = new Map<string, number>();
		let revenue_base = 0;

		for (const row of rows) {
			const paidBase = resolvePaidBaseAmount(row, tenantBase) ?? 0;
			revenue_base += paidBase;
			const label = sourceLabel(row.source);
			revenueBySource.set(label, (revenueBySource.get(label) ?? 0) + paidBase);
		}

		return { revenue_base, revenueBySource };
	}

	private async patientCohortBySource(
		db: TenantDb,
		tenantId: string,
		params: MarketingReportParams
	): Promise<{
		leads_count: number;
		treated_count: number;
		cohortBySource: Map<string, { leads: number; treated: number }>;
	}> {
		const conditions = [
			isNull(contacts.deletedAt),
			eq(contacts.contactTypeName, 'Hasta')
		];
		if (params.from) {
			const { start } = await dayRange(db, tenantId, params.from);
			conditions.push(gte(contacts.createdAt, start));
		}
		if (params.to) {
			const { endExclusive } = await dayRange(db, tenantId, params.to);
			conditions.push(lt(contacts.createdAt, endExclusive));
		}

		const rows: PatientCohortRow[] = await db
			.select({
				source: contacts.source,
				status: contacts.status
			})
			.from(contacts)
			.where(and(...conditions));

		const cohortBySource = new Map<string, { leads: number; treated: number }>();
		let leads_count = 0;
		let treated_count = 0;

		for (const row of rows) {
			leads_count += 1;
			const isTreated = row.status === 'treated';
			if (isTreated) treated_count += 1;

			const label = sourceLabel(row.source);
			const cur = cohortBySource.get(label) ?? { leads: 0, treated: 0 };
			cur.leads += 1;
			if (isTreated) cur.treated += 1;
			cohortBySource.set(label, cur);
		}

		return { leads_count, treated_count, cohortBySource };
	}

	/**
	 * Tarih bazlı kohort (ihtiyaç haritası §1.2).
	 *
	 * Kişi `created_at` ayına yazılır; tahsilatı (income, resolvePaidBaseAmount) tarih sınırı
	 * olmadan o aya sayılır. Harcama = aynı ayın `ad_metrics_daily` toplamı.
	 * `treated` = en az bir `completed` randevu (soft-delete hariç).
	 *
	 * Kampanya atıfı değildir — `note_key` bunu açıkça taşır.
	 */
	async cohorts(tenantId: string, params: ReportCohortsParams): Promise<ReportCohorts> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const tenantBase = await this.getTenantBase(db, tenantId);
			const tz = await getTenantTz(db, tenantId);

			const contactConditions: SQL[] = [isNull(contacts.deletedAt)];
			if (params.contact_type) {
				contactConditions.push(eq(contacts.contactTypeName, params.contact_type));
			}
			if (params.from) {
				const { start } = await dayRange(db, tenantId, params.from);
				contactConditions.push(gte(contacts.createdAt, start));
			}
			if (params.to) {
				const { endExclusive } = await dayRange(db, tenantId, params.to);
				contactConditions.push(lt(contacts.createdAt, endExclusive));
			}

			const contactRows = await db
				.select({
					id: contacts.id,
					createdAt: contacts.createdAt
				})
				.from(contacts)
				.where(and(...contactConditions));

			const contactMonth = new Map<string, string>();
			const idsByMonth = new Map<string, string[]>();
			for (const row of contactRows) {
				const month = toTenantDayKey(new Date(row.createdAt), tz).slice(0, 7);
				contactMonth.set(row.id, month);
				const list = idsByMonth.get(month) ?? [];
				list.push(row.id);
				idsByMonth.set(month, list);
			}

			const contactIds = contactRows.map((r) => r.id);
			const treatedIds = new Set<string>();
			if (contactIds.length > 0) {
				const treatedRows = await db
					.select({ contactId: appointments.contactId })
					.from(appointments)
					.where(
						and(
							isNull(appointments.deletedAt),
							eq(appointments.status, 'completed'),
							inArray(appointments.contactId, contactIds)
						)
					);
				for (const row of treatedRows) {
					if (row.contactId) treatedIds.add(row.contactId);
				}
			}

			const spendByMonth = new Map<string, number>();
			const spendConditions: SQL[] = [];
			if (params.from) spendConditions.push(gte(adMetricsDaily.date, params.from));
			if (params.to) spendConditions.push(lte(adMetricsDaily.date, params.to));
			const spendRows = await db
				.select({
					date: adMetricsDaily.date,
					spendMinor: adMetricsDaily.spendMinor,
					spendBase: adMetricsDaily.spendBase,
					baseCurrency: adMetricsDaily.baseCurrency,
					currency: adMetricsDaily.currency
				})
				.from(adMetricsDaily)
				.where(spendConditions.length ? and(...spendConditions) : undefined);

			for (const row of spendRows) {
				const month = row.date.slice(0, 7);
				const base = resolveBaseAmount(
					{
						amount: row.spendMinor,
						amountBase: row.spendBase,
						baseCurrency: row.baseCurrency,
						currency: row.currency
					},
					tenantBase
				);
				if (base == null) continue;
				spendByMonth.set(month, (spendByMonth.get(month) ?? 0) + base);
			}

			// "Veri yok" ile "harcama sıfır" ayrı şeyler. Ads entegrasyonu belirli bir tarihte
			// bağlandığı için ondan önceki aylarda hiç satır yoktur; oraya 0 yazmak "o ay
			// bedavaya hasta geldi" diye okunur. Satırı olan ay 0 bile olsa 0 kalır.
			const monthsWithSpendData = new Set(spendRows.map((row) => row.date.slice(0, 7)));

			type Mat = ReportCohortRow['maturation'];
			const emptyMat = (): Mat => ({ m0: 0, m1: 0, m2: 0, m3_plus: 0 });
			const collectedByMonth = new Map<string, number>();
			const matByMonth = new Map<string, Mat>();
			let missing_fx_count = 0;

			if (contactIds.length > 0) {
				const txRows = await db
					.select({
						contactId: transactions.contactId,
						occurredOn: transactions.occurredOn,
						kind: transactions.kind,
						status: transactions.status,
						amount: transactions.amount,
						amountBase: transactions.amountBase,
						baseCurrency: transactions.baseCurrency,
						paidAmount: transactions.paidAmount,
						currency: transactions.currency
					})
					.from(transactions)
					.where(
						and(
							eq(transactions.kind, 'income'),
							isNull(transactions.deletedAt),
							inArray(transactions.contactId, contactIds)
						)
					);

				for (const row of txRows) {
					if (!row.contactId) continue;
					const month = contactMonth.get(row.contactId);
					if (!month) continue;

					const paidBase = resolvePaidBaseAmount(
						{
							kind: row.kind,
							status: row.status,
							amount: row.amount,
							amountBase: row.amountBase,
							baseCurrency: row.baseCurrency,
							paidAmount: row.paidAmount,
							currency: row.currency
						},
						tenantBase
					);
					if (paidBase == null) {
						missing_fx_count += 1;
						continue;
					}
					if (paidBase === 0) continue;

					collectedByMonth.set(month, (collectedByMonth.get(month) ?? 0) + paidBase);
					const mat = matByMonth.get(month) ?? emptyMat();
					const bucket = maturationBucket(cohortMonthDiff(month, row.occurredOn));
					mat[bucket] += paidBase;
					matByMonth.set(month, mat);
				}
			}

			const monthKeys = new Set<string>([
				...idsByMonth.keys(),
				...spendByMonth.keys(),
				...collectedByMonth.keys()
			]);
			if (params.from && params.to) {
				for (const m of eachYearMonth(params.from.slice(0, 7), params.to.slice(0, 7))) {
					monthKeys.add(m);
				}
			}

			const items: ReportCohortRow[] = [...monthKeys]
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
						roas:
							spend_base == null || spend_base === 0 ? null : collected_base / spend_base,
						maturation: matByMonth.get(cohort_month) ?? emptyMat()
					};
				});

			return {
				period: { from: params.from ?? null, to: params.to ?? null },
				note_key: COHORT_ATTRIBUTION_NOTE_KEY,
				missing_fx_count,
				items
			};
		});
	}

	/**
	 * Temassız kişiler — kimseye dokunulmamış listesi.
	 *
	 * "Son dokunuş" = kişiye bağlı gerçekleşmiş işlerin en yenisi:
	 *   · randevu (`appointments.starts_at`, hasta tarafı `contact_id`)
	 *   · işlem (`transactions.occurred_on`, `contact_id` VEYA `case_contact_id`)
	 *   · vaka notu (`case_notes.created_at`)
	 * Taban `contacts.created_at`: dün açılmış kayıt "90 gündür temassız" sayılamaz.
	 *
	 * GELECEK tarihli randevu bilinçli olarak dokunuş sayılır — `GREATEST` onu seçer,
	 * `days_since` negatife düşer ve kişi eşiğin altında kalır. Önümüzdeki hafta randevusu
	 * olan hasta ihmal edilmiş değil, aktif takiptedir.
	 *
	 * Kovalar (30/60/90) `limit`'ten bağımsız, tam küme üzerinden sayılır: liste ilk N kişiyi
	 * gösterirken "38 temassız, 12'si 60 günü geçti" cümlesi doğru kalsın.
	 */
	async untouchedContacts(
		tenantId: string,
		params: ReportUntouchedContactsParams
	): Promise<ReportUntouchedContacts> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const typeFilter = params.contact_type ?? null;

			// Tek geçişte son aktivite: her kaynak için kişi bazlı MAX, sonra GREATEST.
			// Alt sorgular ilgili tablonun (tenant_id, contact_id) indeksinden yararlanır.
			const rows = await db.execute<{
				contact_id: string;
				display_name: string;
				contact_type_name: string;
				phone: string | null;
				email: string | null;
				last_activity_at: Date;
				last_activity_source: UntouchedActivitySource;
				days_since: number;
			}>(sql`
				with activity as (
					select
						c.id as contact_id,
						c.display_name,
						c.contact_type_name,
						c.phone,
						c.email,
						c.created_at,
						(
							select max(a.starts_at) from appointments a
							where a.contact_id = c.id and a.deleted_at is null
						) as last_appointment,
						(
							select max(t.occurred_on)::timestamptz from transactions t
							where (t.contact_id = c.id or t.case_contact_id = c.id)
								and t.deleted_at is null
						) as last_transaction,
						(
							select max(n.created_at) from case_notes n
							where n.contact_id = c.id
						) as last_note
					from contacts c
					where c.deleted_at is null
						${typeFilter ? sql`and c.contact_type_name = ${typeFilter}` : sql``}
				),
				resolved as (
					select
						contact_id,
						display_name,
						contact_type_name,
						phone,
						email,
						greatest(
							created_at,
							coalesce(last_appointment, created_at),
							coalesce(last_transaction, created_at),
							coalesce(last_note, created_at)
						) as last_activity_at,
						case
							when last_appointment is not null and last_appointment >= coalesce(last_transaction, last_appointment)
								and last_appointment >= coalesce(last_note, last_appointment)
								and last_appointment >= created_at then 'appointment'
							when last_transaction is not null and last_transaction >= coalesce(last_note, last_transaction)
								and last_transaction >= created_at then 'transaction'
							when last_note is not null and last_note >= created_at then 'case_note'
							else 'created'
						end as last_activity_source
					from activity
				)
				select
					contact_id,
					display_name,
					contact_type_name,
					phone,
					email,
					last_activity_at,
					last_activity_source,
					floor(extract(epoch from (now() - last_activity_at)) / 86400)::int as days_since
				from resolved
				where last_activity_at < now() - make_interval(days => ${params.days})
				order by last_activity_at asc
				limit ${params.limit}
			`);

			// Kovalar ve toplam: aynı türetimin sayım hâli, limit uygulanmadan.
			const [counts] = await db.execute<{
				total: number;
				d30: number;
				d60: number;
				d90: number;
			}>(sql`
				with activity as (
					select
						c.id as contact_id,
						c.created_at,
						(
							select max(a.starts_at) from appointments a
							where a.contact_id = c.id and a.deleted_at is null
						) as last_appointment,
						(
							select max(t.occurred_on)::timestamptz from transactions t
							where (t.contact_id = c.id or t.case_contact_id = c.id)
								and t.deleted_at is null
						) as last_transaction,
						(
							select max(n.created_at) from case_notes n
							where n.contact_id = c.id
						) as last_note
					from contacts c
					where c.deleted_at is null
						${typeFilter ? sql`and c.contact_type_name = ${typeFilter}` : sql``}
				),
				resolved as (
					select greatest(
						created_at,
						coalesce(last_appointment, created_at),
						coalesce(last_transaction, created_at),
						coalesce(last_note, created_at)
					) as last_activity_at
					from activity
				)
				select
					count(*) filter (where last_activity_at < now() - make_interval(days => ${params.days}))::int as total,
					count(*) filter (where last_activity_at < now() - interval '30 days')::int as d30,
					count(*) filter (where last_activity_at < now() - interval '60 days')::int as d60,
					count(*) filter (where last_activity_at < now() - interval '90 days')::int as d90
				from resolved
			`);

			const items: ReportUntouchedContactRow[] = rows.map((row) => ({
				contact_id: row.contact_id,
				display_name: row.display_name,
				contact_type_name: row.contact_type_name,
				phone: row.phone,
				email: row.email,
				last_activity_at: new Date(row.last_activity_at).toISOString(),
				last_activity_source: row.last_activity_source,
				days_since: Number(row.days_since)
			}));

			return {
				buckets: {
					d30: Number(counts?.d30 ?? 0),
					d60: Number(counts?.d60 ?? 0),
					d90: Number(counts?.d90 ?? 0)
				},
				total: Number(counts?.total ?? 0),
				items
			};
		});
	}

	/**
	 * Referans değeri raporu (ihtiyaç haritası §A — "X 4 referans hasta gönderdi,
	 * koordinatörü Y, bu dosyaya öncelik").
	 *
	 * Yalnız DOĞRUDAN referans (`contacts.referred_by_contact_id`, tek seviye). "X'in
	 * getirdiğinin getirdiği" zinciri v1'de YOK — özyinelemeli sorgu döngü koruması ve
	 * derinlik sınırı ister, ayrı iş (bkz. docs/2026-08-23-maya-icgoru-sorulari.md § A).
	 *
	 * Gelir tanımı `ContactsService.financeSummary` ile BİREBİR AYNI — ayrı bir hesap
	 * icat edilmedi: her getirilen kişi için aynı satır kümesi (`contact_id = X OR
	 * case_contact_id = X`, soft-delete hariç) ve aynı `resolveBaseAmount` yardımcısı
	 * kullanılır. Toplama burada bir Map ile yapılır — tıpkı `summary`/`byCategory`/
	 * `monthly`'nin yaptığı gibi — çünkü `resolveBaseAmount` satır başına çalışan bir TS
	 * fonksiyonu; FX çözümünü SQL'de yeniden yazmak tanımı çatallandırır. Sonuç yine de
	 * tam sunucu-agregesi olarak döner; istemci kısmi listeden toplamaz.
	 *
	 * Dönem filtresi yalnız işlem tarihine (`occurred_on`) uygulanır — referans ilişkisinin
	 * kendisi zamansızdır (`referred_count` dönemden etkilenmez). Yani bu "bu dönemde
	 * getirdiği" değil, "getirdiklerinden bu dönemde gelen para"dır.
	 */
	async referrals(tenantId: string, params: ReportPeriodParams): Promise<ReportReferrals> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const period = { from: params.from ?? null, to: params.to ?? null };
			const tenantBase = await this.getTenantBase(db, tenantId);

			// Referans kenarları: getirilen kişi (soft-delete hariç) → referans veren
			// (soft-delete hariç). Kimseyi getirmemiş kişiler burada hiç görünmez.
			const edges = await db
				.select({
					referrerId: referrerContacts.id,
					referrerDisplayName: referrerContacts.displayName,
					referrerTitleName: referrerContacts.titleName,
					referrerAssignedUserId: referrerContacts.assignedUserId,
					referredId: contacts.id
				})
				.from(contacts)
				.innerJoin(referrerContacts, eq(contacts.referredByContactId, referrerContacts.id))
				.where(and(isNull(contacts.deletedAt), isNull(referrerContacts.deletedAt)));

			if (edges.length === 0) {
				return { period, items: [] };
			}

			type ReferrerAcc = {
				referrer_contact_id: string;
				referrer_display_name: string;
				referrer_title_name: string | null;
				assignedUserId: string | null;
				referredIds: Set<string>;
			};
			const referrerMap = new Map<string, ReferrerAcc>();
			const referredIds = new Set<string>();
			for (const edge of edges) {
				referredIds.add(edge.referredId);
				const cur = referrerMap.get(edge.referrerId) ?? {
					referrer_contact_id: edge.referrerId,
					referrer_display_name: edge.referrerDisplayName,
					referrer_title_name: edge.referrerTitleName,
					assignedUserId: edge.referrerAssignedUserId,
					referredIds: new Set<string>()
				};
				cur.referredIds.add(edge.referredId);
				referrerMap.set(edge.referrerId, cur);
			}

			// Getirilenlerin geliri/gideri: financeSummary ile aynı satır kümesi, yalnız
			// dönem filtresi eklenmiş (financeSummary tek kişi için dönemsiz çalışır).
			const referredIdList = [...referredIds];
			const periodConditions = [
				isNull(transactions.deletedAt),
				or(
					inArray(transactions.contactId, referredIdList),
					inArray(transactions.caseContactId, referredIdList)
				)
			];
			if (params.from) periodConditions.push(gte(transactions.occurredOn, params.from));
			if (params.to) periodConditions.push(lte(transactions.occurredOn, params.to));

			const txRows = await db
				.select({
					contactId: transactions.contactId,
					caseContactId: transactions.caseContactId,
					kind: transactions.kind,
					status: transactions.status,
					amount: transactions.amount,
					amountBase: transactions.amountBase,
					baseCurrency: transactions.baseCurrency,
					currency: transactions.currency,
					paidAmount: transactions.paidAmount
				})
				.from(transactions)
				.where(and(...periodConditions));

			type ReferredTotals = { incomeBase: number; expenseBase: number };
			const totalsByReferred = new Map<string, ReferredTotals>();

			for (const row of txRows) {
				const base = resolveBaseAmount(row, tenantBase);
				if (base == null) continue;

				// financeSummary'deki `contact_id = X OR case_contact_id = X` eşdeğeri: bu
				// satır hangi getirilen kişi(ler)in kümesine giriyorsa oraya eklenir. Bir
				// Set kullanmak, contact_id === case_contact_id olduğu (aynı kişi iki
				// alanda) satırı tek kez sayar — financeSummary'nin OR'u da böyle davranır.
				const matches = new Set<string>();
				if (row.contactId && referredIds.has(row.contactId)) matches.add(row.contactId);
				if (row.caseContactId && referredIds.has(row.caseContactId)) {
					matches.add(row.caseContactId);
				}

				for (const referredId of matches) {
					const cur = totalsByReferred.get(referredId) ?? { incomeBase: 0, expenseBase: 0 };
					if (row.kind === 'income') cur.incomeBase += base;
					else cur.expenseBase += base;
					totalsByReferred.set(referredId, cur);
				}
			}

			// Koordinatör adı: referans verenin assigned_user_id'sinden çözülür.
			const coordinatorIds = [
				...new Set(
					[...referrerMap.values()]
						.map((r) => r.assignedUserId)
						.filter((id): id is string => id != null)
				)
			];
			const coordinatorNameById = new Map<string, string>();
			if (coordinatorIds.length > 0) {
				const coordinatorRows = await db
					.select({ id: user.id, name: user.name })
					.from(user)
					.where(inArray(user.id, coordinatorIds));
				for (const row of coordinatorRows) {
					coordinatorNameById.set(row.id, row.name);
				}
			}

			const items: ReportReferralRow[] = [...referrerMap.values()]
				.map((referrer) => {
					let incomeBase = 0;
					let expenseBase = 0;
					let withRevenue = 0;
					for (const referredId of referrer.referredIds) {
						const t = totalsByReferred.get(referredId);
						if (!t) continue;
						incomeBase += t.incomeBase;
						expenseBase += t.expenseBase;
						if (t.incomeBase > 0) withRevenue += 1;
					}
					return {
						referrer_contact_id: referrer.referrer_contact_id,
						referrer_display_name: referrer.referrer_display_name,
						referrer_title_name: referrer.referrer_title_name,
						coordinator_name: referrer.assignedUserId
							? (coordinatorNameById.get(referrer.assignedUserId) ?? null)
							: null,
						referred_count: referrer.referredIds.size,
						referred_with_revenue_count: withRevenue,
						total_income_base: incomeBase,
						total_expense_base: expenseBase,
						total_net_base: incomeBase - expenseBase
					};
				})
				.sort((a, b) => b.total_net_base - a.total_net_base);

			return { period, items };
		});
	}
}
