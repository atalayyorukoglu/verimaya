import { Injectable } from '@nestjs/common';
import {
	and,
	count,
	eq,
	gte,
	isNotNull,
	isNull,
	lt,
	lte,
	sql,
	type SQL
} from 'drizzle-orm';
import {
	tenantDayRange,
	ATTRIBUTION_COVERAGE_THRESHOLD,
	calculateRealRoas,
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
	type ReportConsistency,
	type ReportConsistencyCode,
	type ReportConsistencyItem,
	type ReportConsistencySeverity,
	type ReportMonthly,
	type ReportContactDistribution,
	type ReportPeriodParams,
	type ReportSummary,
	type ReportTransactionDuplicates,
	type ReportTransactionDuplicatesParams
} from '@verimaya/shared';
import { resolveBaseAmount, resolvePaidBaseAmount } from '../common/finance-base';
import { adMetricsDaily, appointments, contacts, tenants, transactions } from '../db/schema';
import { TenantContextService } from '../tenant/tenant-context.service';

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
				monthly: monthRows.map((row) => ({
					month: row.month,
					count: Number(row.count)
				}))
			};
		});
	}

	/**
	 * GAP-05: full-period transaction consistency audit.
	 * Counts = SQL FILTER aggregation over the whole period; items = capped list (LIMIT 100).
	 * BF-04/BF-05 rules (responsible_party, payer/payee) and contact_type_mismatch are out of scope.
	 */
	async consistency(
		tenantId: string,
		params: ReportPeriodParams
	): Promise<ReportConsistency> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const tenantBase = await this.getTenantBase(db, tenantId);
			const period: SQL[] = [isNull(transactions.deletedAt)];
			if (params.from) period.push(gte(transactions.occurredOn, params.from));
			if (params.to) period.push(lte(transactions.occurredOn, params.to));
			const periodWhere = and(...period)!;

			const emptyCategory = sql`btrim(coalesce(${transactions.category}, '')) = ''`;
			const incomeNoPatient = sql`${transactions.kind} = 'income' AND ${transactions.contactId} IS NULL`;
			const expenseNoContact = sql`${transactions.kind} = 'expense' AND ${transactions.contactId} IS NULL AND btrim(coalesce(${transactions.contactLabel}, '')) = ''`;
			// FX: foreign currency without base snapshot. Same-currency rows may have
			// amount_base NULL on purpose (ETL-ESLEME.md §3.4 — resolver uses amount).
			const fxMissing = sql`${transactions.currency} <> ${tenantBase} AND ${transactions.amountBase} IS NULL`;
			const paidMismatch = sql`${transactions.status} = 'paid' AND ${transactions.paidAmount} IS NOT NULL AND ${transactions.paidAmount} <> ${transactions.amount}`;
			const unpaidWithPay = sql`${transactions.status} = 'unpaid' AND coalesce(${transactions.paidAmount}, 0) > 0`;
			const partialInvalid = sql`${transactions.status} = 'partial' AND (${transactions.paidAmount} IS NULL OR ${transactions.paidAmount} <= 0 OR ${transactions.paidAmount} >= ${transactions.amount})`;

			const [agg] = await db
				.select({
					category_missing: sql<number>`(count(*) filter (where ${emptyCategory}))::int`,
					income_contact_missing: sql<number>`(count(*) filter (where ${incomeNoPatient}))::int`,
					expense_contact_missing: sql<number>`(count(*) filter (where ${expenseNoContact}))::int`,
					fx_missing: sql<number>`(count(*) filter (where ${fxMissing}))::int`,
					paid_amount_mismatch: sql<number>`(count(*) filter (where ${paidMismatch}))::int`,
					unpaid_with_payment: sql<number>`(count(*) filter (where ${unpaidWithPay}))::int`,
					partial_amount_invalid: sql<number>`(count(*) filter (where ${partialInvalid}))::int`
				})
				.from(transactions)
				.where(periodWhere);

			const counts_by_code: ReportConsistency['counts_by_code'] = {};
			const addCount = (code: ReportConsistencyCode, raw: number | null | undefined) => {
				const n = Number(raw ?? 0);
				if (n > 0) counts_by_code[code] = n;
			};
			addCount('category_missing', agg?.category_missing);
			addCount('income_contact_missing', agg?.income_contact_missing);
			addCount('expense_contact_missing', agg?.expense_contact_missing);
			addCount('fx_missing', agg?.fx_missing);
			addCount('paid_amount_mismatch', agg?.paid_amount_mismatch);
			addCount('unpaid_with_payment', agg?.unpaid_with_payment);
			addCount('partial_amount_invalid', agg?.partial_amount_invalid);

			const warning =
				(counts_by_code.category_missing ?? 0) +
				(counts_by_code.income_contact_missing ?? 0) +
				(counts_by_code.expense_contact_missing ?? 0) +
				(counts_by_code.fx_missing ?? 0);
			const error =
				(counts_by_code.paid_amount_mismatch ?? 0) +
				(counts_by_code.unpaid_with_payment ?? 0) +
				(counts_by_code.partial_amount_invalid ?? 0);

			const branch = (
				severity: ReportConsistencySeverity,
				code: ReportConsistencyCode,
				messageKey: string,
				pred: SQL
			) => sql`
				SELECT
					${transactions.id} AS transaction_id,
					${transactions.title} AS title,
					${transactions.occurredOn} AS occurred_on,
					${severity}::text AS severity,
					${code}::text AS code,
					${messageKey}::text AS message_key
				FROM ${transactions}
				WHERE ${and(periodWhere, pred)}
			`;

			const itemResult = await db.execute(sql`
				SELECT transaction_id, title, occurred_on, severity, code, message_key
				FROM (
					${branch('warning', 'category_missing', 'reports.consistency.category_missing', emptyCategory)}
					UNION ALL
					${branch('warning', 'income_contact_missing', 'reports.consistency.income_contact_missing', incomeNoPatient)}
					UNION ALL
					${branch('warning', 'expense_contact_missing', 'reports.consistency.expense_contact_missing', expenseNoContact)}
					UNION ALL
					${branch('warning', 'fx_missing', 'reports.consistency.fx_missing', fxMissing)}
					UNION ALL
					${branch('error', 'paid_amount_mismatch', 'reports.consistency.paid_amount_mismatch', paidMismatch)}
					UNION ALL
					${branch('error', 'unpaid_with_payment', 'reports.consistency.unpaid_with_payment', unpaidWithPay)}
					UNION ALL
					${branch('error', 'partial_amount_invalid', 'reports.consistency.partial_amount_invalid', partialInvalid)}
				) AS issues
				ORDER BY
					CASE severity WHEN 'error' THEN 0 ELSE 1 END,
					occurred_on DESC,
					transaction_id DESC
				LIMIT ${REPORT_CONSISTENCY_ITEMS_LIMIT}
			`);

			const items: ReportConsistencyItem[] = [...itemResult].map((row) => {
				const occurred =
					typeof row.occurred_on === 'string'
						? row.occurred_on.slice(0, 10)
						: row.occurred_on instanceof Date
							? row.occurred_on.toISOString().slice(0, 10)
							: String(row.occurred_on).slice(0, 10);
				return {
					transaction_id: String(row.transaction_id),
					title: String(row.title),
					occurred_on: occurred,
					severity: row.severity as ReportConsistencySeverity,
					code: row.code as ReportConsistencyCode,
					message_key: String(row.message_key)
				};
			});

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
				.filter((row) => row.open_amount !== 0 || row.collected_amount !== 0)
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

}
