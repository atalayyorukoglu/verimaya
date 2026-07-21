import { Injectable } from '@nestjs/common';
import { and, eq, gte, lte } from 'drizzle-orm';
import type { ReportByCategory, ReportPeriodParams, ReportSummary } from '@verimaya/shared';
import { tenants, transactions } from '../db/schema';
import { TenantContextService } from '../tenant/tenant-context.service';

type TxRow = {
	kind: string;
	category: string | null;
	amount: number;
	amountBase: number | null;
	currency: string;
};

function resolveBaseAmount(row: TxRow, tenantBase: string): number | null {
	if (row.currency === tenantBase) {
		return row.amountBase ?? row.amount;
	}
	if (row.amountBase != null) {
		return row.amountBase;
	}
	return null;
}

function categoryLabel(category: string | null): string {
	const trimmed = (category ?? '').trim();
	return trimmed || 'Kategorisiz';
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

	private async getTenantBase(
		db: Parameters<Parameters<TenantContextService['withTenant']>[1]>[0]['db'],
		tenantId: string
	): Promise<string> {
		const [tenant] = await db
			.select({ baseCurrency: tenants.baseCurrency })
			.from(tenants)
			.where(eq(tenants.id, tenantId))
			.limit(1);
		return tenant?.baseCurrency ?? 'TRY';
	}

	private async fetchTransactions(
		db: Parameters<Parameters<TenantContextService['withTenant']>[1]>[0]['db'],
		params: ReportPeriodParams
	): Promise<TxRow[]> {
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
				amount: transactions.amount,
				amountBase: transactions.amountBase,
				currency: transactions.currency
			})
			.from(transactions)
			.where(conditions.length ? and(...conditions) : undefined);
	}
}
