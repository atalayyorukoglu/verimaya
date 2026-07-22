import { Injectable } from '@nestjs/common';
import { and, eq, gte, isNull, lt, lte } from 'drizzle-orm';
import {
	calculateRealRoas,
	type MarketingReport,
	type MarketingReportParams,
	type MarketingSourceRow,
	type ReportByCategory,
	type ReportByCategoryDetail,
	type ReportByCategoryDetailParams,
	type ReportMonthly,
	type ReportPeriodParams,
	type ReportSummary
} from '@verimaya/shared';
import { resolveBaseAmount, resolvePaidBaseAmount } from '../common/finance-base';
import { adMetricsDaily, patients, tenants, transactions } from '../db/schema';
import { TenantContextService } from '../tenant/tenant-context.service';

type TenantDb = Parameters<Parameters<TenantContextService['withTenant']>[1]>[0]['db'];

type TxRow = {
	kind: string;
	category: string | null;
	subtitle: string | null;
	occurredOn: string;
	amount: number;
	amountBase: number | null;
	paidAmount: number | null;
	currency: string;
};

type IncomeWithSourceRow = {
	kind: string;
	amount: number;
	amountBase: number | null;
	paidAmount: number | null;
	currency: string;
	source: string | null;
};

type PatientCohortRow = {
	source: string | null;
	status: string;
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

/** Exclusive end of calendar day `YYYY-MM-DD` as UTC Date (start of next day). */
function dayAfterUtc(isoDate: string): Date {
	const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
	return new Date(Date.UTC(y, m - 1, d + 1));
}

function startOfDayUtc(isoDate: string): Date {
	const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
	return new Date(Date.UTC(y, m - 1, d));
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

			for (const row of rows) {
				const base = resolveBaseAmount(row, tenantBase);
				if (base == null) continue;
				if (row.kind === 'income') incomeBase += base;
				else expenseBase += base;
			}

			return {
				period: { from: params.from ?? null, to: params.to ?? null },
				income_base: incomeBase,
				expense_base: expenseBase,
				net_base: incomeBase - expenseBase,
				transaction_count: rows.length
			};
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
	 * Real ROAS report: ad spend vs tahsilat (paid income) + lead/closed cohort by source.
	 * Revenue denominator = TAHSİLAT (paid_amount → tenant base), not invoice amount.
	 */
	async marketing(tenantId: string, params: MarketingReportParams): Promise<MarketingReport> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const tenantBase = await this.getTenantBase(db, tenantId);

			const spend_base = await this.sumAdSpend(db, params);
			const { revenue_base, revenueBySource } = await this.sumTahsilatBySource(
				db,
				params,
				tenantBase
			);
			const { leads_count, closed_count, cohortBySource } = await this.patientCohortBySource(
				db,
				params
			);

			const sourceKeys = new Set([...revenueBySource.keys(), ...cohortBySource.keys()]);
			const by_source: MarketingSourceRow[] = [...sourceKeys]
				.map((source) => {
					const cohort = cohortBySource.get(source);
					return {
						source,
						leads: cohort?.leads ?? 0,
						closed: cohort?.closed ?? 0,
						revenue_base: revenueBySource.get(source) ?? 0
					};
				})
				.sort(
					(a, b) =>
						Math.abs(b.leads) +
						Math.abs(b.closed) +
						Math.abs(b.revenue_base) -
						(Math.abs(a.leads) + Math.abs(a.closed) + Math.abs(a.revenue_base))
				);

			const metrics = calculateRealRoas({
				spendMinor: spend_base,
				revenueMinor: revenue_base,
				leads: leads_count,
				closed: closed_count
			});

			return {
				period: { from: params.from ?? null, to: params.to ?? null },
				spend_base,
				revenue_base,
				real_roas: metrics.realRoas,
				leads_count,
				closed_count,
				cost_per_lead: metrics.costPerLead,
				cost_per_closed: metrics.costPerClosed,
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
		const conditions = [];
		if (params.from) {
			conditions.push(gte(transactions.occurredOn, params.from));
		}
		if (params.to) {
			conditions.push(lte(transactions.occurredOn, params.to));
		}

		return db
			.select({
				kind: transactions.kind,
				category: transactions.category,
				subtitle: transactions.subtitle,
				occurredOn: transactions.occurredOn,
				amount: transactions.amount,
				amountBase: transactions.amountBase,
				paidAmount: transactions.paidAmount,
				currency: transactions.currency
			})
			.from(transactions)
			.where(conditions.length ? and(...conditions) : undefined);
	}

	/**
	 * V1: spendMinor is treated as already in the tenant base currency.
	 * Cross-currency (USD/TRY) reconciliation for ad spend is deferred to V2.
	 */
	private async sumAdSpend(db: TenantDb, params: MarketingReportParams): Promise<number> {
		const conditions = [];
		if (params.from) {
			conditions.push(gte(adMetricsDaily.date, params.from));
		}
		if (params.to) {
			conditions.push(lte(adMetricsDaily.date, params.to));
		}
		if (params.provider) {
			conditions.push(eq(adMetricsDaily.provider, params.provider));
		}

		const rows = await db
			.select({ spendMinor: adMetricsDaily.spendMinor })
			.from(adMetricsDaily)
			.where(conditions.length ? and(...conditions) : undefined);

		return rows.reduce((sum, row) => sum + row.spendMinor, 0);
	}

	private async sumTahsilatBySource(
		db: TenantDb,
		params: MarketingReportParams,
		tenantBase: string
	): Promise<{ revenue_base: number; revenueBySource: Map<string, number> }> {
		const conditions = [eq(transactions.kind, 'income')];
		if (params.from) {
			conditions.push(gte(transactions.occurredOn, params.from));
		}
		if (params.to) {
			conditions.push(lte(transactions.occurredOn, params.to));
		}

		const rows: IncomeWithSourceRow[] = await db
			.select({
				kind: transactions.kind,
				amount: transactions.amount,
				amountBase: transactions.amountBase,
				paidAmount: transactions.paidAmount,
				currency: transactions.currency,
				source: patients.source
			})
			.from(transactions)
			.leftJoin(patients, eq(transactions.patientId, patients.id))
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
		params: MarketingReportParams
	): Promise<{
		leads_count: number;
		closed_count: number;
		cohortBySource: Map<string, { leads: number; closed: number }>;
	}> {
		const conditions = [isNull(patients.deletedAt)];
		if (params.from) {
			conditions.push(gte(patients.createdAt, startOfDayUtc(params.from)));
		}
		if (params.to) {
			conditions.push(lt(patients.createdAt, dayAfterUtc(params.to)));
		}

		const rows: PatientCohortRow[] = await db
			.select({
				source: patients.source,
				status: patients.status
			})
			.from(patients)
			.where(and(...conditions));

		const cohortBySource = new Map<string, { leads: number; closed: number }>();
		let leads_count = 0;
		let closed_count = 0;

		for (const row of rows) {
			leads_count += 1;
			const isClosed = row.status === 'closed_won';
			if (isClosed) closed_count += 1;

			const label = sourceLabel(row.source);
			const cur = cohortBySource.get(label) ?? { leads: 0, closed: 0 };
			cur.leads += 1;
			if (isClosed) cur.closed += 1;
			cohortBySource.set(label, cur);
		}

		return { leads_count, closed_count, cohortBySource };
	}
}
