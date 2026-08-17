import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, isNull, lte, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
	CommissionEntryCreate,
	CommissionEntryListQuery,
	CommissionEntryUpdate,
	CommissionSummary,
	SupportedCurrency
} from '@verimaya/shared';
import { commissionEntryStatusSchema, utcTodayIsoDate } from '@verimaya/shared';
import { writeAuditLog, type AuditActor } from '../common/audit-helper';
import { resolveBaseAmount } from '../common/finance-base';
import {
	buildOccurredOnCursorPage,
	occurredOnCursorCondition
} from '../common/list-query';
import { toCommissionEntry } from '../common/mappers';
import { commissionEntries, contacts, tenants, transactions } from '../db/schema';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

const beneficiaryContacts = alias(contacts, 'commission_beneficiary');
const caseContacts = alias(contacts, 'commission_case');

@Injectable()
export class CommissionsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async list(tenantId: string, params: CommissionEntryListQuery) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const cursorCond = occurredOnCursorCondition(
				commissionEntries.earnedOn,
				commissionEntries.id,
				params.cursor
			);
			const filters: SQL[] = [isNull(commissionEntries.deletedAt)];
			if (params.beneficiary_contact_id) {
				filters.push(
					eq(commissionEntries.beneficiaryContactId, params.beneficiary_contact_id)
				);
			}
			if (params.status) filters.push(eq(commissionEntries.status, params.status));
			if (params.from) filters.push(gte(commissionEntries.earnedOn, params.from));
			if (params.to) filters.push(lte(commissionEntries.earnedOn, params.to));
			if (cursorCond) filters.push(cursorCond);

			const rows = await db
				.select({
					entry: commissionEntries,
					beneficiaryDisplayName: beneficiaryContacts.displayName,
					caseDisplayName: caseContacts.displayName
				})
				.from(commissionEntries)
				.innerJoin(
					beneficiaryContacts,
					eq(commissionEntries.beneficiaryContactId, beneficiaryContacts.id)
				)
				.leftJoin(caseContacts, eq(commissionEntries.caseContactId, caseContacts.id))
				.where(and(...filters))
				.orderBy(desc(commissionEntries.earnedOn), desc(commissionEntries.id))
				.limit(params.limit + 1);

			const page = buildOccurredOnCursorPage(
				rows.map((r) => ({
					...r,
					id: r.entry.id,
					occurredOn: r.entry.earnedOn
				})),
				params.limit
			);

			return {
				items: page.items.map((row) =>
					toCommissionEntry(
						row.entry,
						row.beneficiaryDisplayName,
						row.caseDisplayName ?? null
					)
				),
				next_cursor: page.next_cursor
			};
		});
	}

	async createWithDb(db: TenantDb, tenantId: string, input: CommissionEntryCreate) {
		const beneficiary = await this.requireContact(db, input.beneficiary_contact_id);
		let caseDisplayName: string | null = null;
		if (input.case_contact_id) {
			const caseContact = await this.requireContact(db, input.case_contact_id);
			caseDisplayName = caseContact.displayName;
		}
		if (input.source_transaction_id) {
			await this.requireTransaction(db, input.source_transaction_id);
		}

		const fx = await this.resolveFxSnapshot(db, tenantId, input);
		let status = input.status ?? 'accrued';
		let paidOn = input.paid_on ?? null;
		if (status === 'paid' && !paidOn) {
			paidOn = utcTodayIsoDate();
		}

		const [row] = await db
			.insert(commissionEntries)
			.values({
				tenantId,
				beneficiaryContactId: input.beneficiary_contact_id,
				caseContactId: input.case_contact_id ?? null,
				sourceTransactionId: input.source_transaction_id ?? null,
				amount: input.amount,
				currency: input.currency,
				amountBase: fx.amountBase,
				baseCurrency: fx.baseCurrency,
				fxRate: input.fx_rate ?? null,
				fxDated: input.fx_dated ?? null,
				status,
				earnedOn: input.earned_on,
				paidOn,
				note: input.note ?? null
			})
			.returning();

		return toCommissionEntry(row!, beneficiary.displayName, caseDisplayName);
	}

	async updateWithDb(db: TenantDb, id: string, input: CommissionEntryUpdate) {
		const existing = await this.findActiveWithNames(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Commission entry not found' }
			});
		}

		const nextStatus =
			input.status !== undefined ? input.status : existing.entry.status;
		let paidOn =
			input.paid_on !== undefined ? input.paid_on : existing.entry.paidOn;
		if (nextStatus === 'paid' && !paidOn) {
			paidOn = utcTodayIsoDate();
		}

		const nextAmount =
			input.amount !== undefined ? input.amount : existing.entry.amount;
		let amountBase = existing.entry.amountBase;
		const tenantBase = await this.getTenantBase(db, existing.entry.tenantId);
		if (
			input.amount !== undefined &&
			existing.entry.currency === tenantBase &&
			(existing.entry.amountBase == null ||
				existing.entry.baseCurrency === tenantBase)
		) {
			amountBase = nextAmount;
		}

		const [row] = await db
			.update(commissionEntries)
			.set({
				status: nextStatus,
				paidOn,
				amount: nextAmount,
				amountBase,
				note: input.note !== undefined ? input.note : existing.entry.note,
				updatedAt: new Date()
			})
			.where(eq(commissionEntries.id, id))
			.returning();

		return toCommissionEntry(
			row!,
			existing.beneficiaryDisplayName,
			existing.caseDisplayName
		);
	}

	async softDeleteWithDb(db: TenantDb, tenantId: string, id: string, actor: AuditActor) {
		const existing = await this.findActiveWithNames(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Commission entry not found' }
			});
		}

		await db
			.update(commissionEntries)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(eq(commissionEntries.id, id));

		await writeAuditLog(
			db,
			tenantId,
			actor,
			'delete',
			'tenant',
			`commission:${existing.beneficiaryDisplayName}`
		);

		return { id, deleted: true as const };
	}

	async summary(tenantId: string): Promise<CommissionSummary> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const tenantBase = await this.getTenantBase(db, tenantId);
			const rows = await db
				.select({
					entry: commissionEntries,
					beneficiaryDisplayName: beneficiaryContacts.displayName
				})
				.from(commissionEntries)
				.innerJoin(
					beneficiaryContacts,
					eq(commissionEntries.beneficiaryContactId, beneficiaryContacts.id)
				)
				.where(isNull(commissionEntries.deletedAt));

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

			for (const row of rows) {
				const status = commissionEntryStatusSchema.safeParse(row.entry.status);
				if (!status.success || status.data === 'cancelled') continue;

				const base = resolveBaseAmount(
					{
						amount: row.entry.amount,
						amountBase: row.entry.amountBase,
						baseCurrency: row.entry.baseCurrency,
						currency: row.entry.currency
					},
					tenantBase
				);

				const cur = map.get(row.entry.beneficiaryContactId) ?? {
					beneficiary_contact_id: row.entry.beneficiaryContactId,
					beneficiary_display_name: row.beneficiaryDisplayName,
					accrued_base: 0,
					paid_base: 0,
					entry_count: 0
				};
				cur.entry_count += 1;

				if (base == null) {
					missingFxCount += 1;
				} else if (status.data === 'accrued') {
					cur.accrued_base += base;
				} else {
					cur.paid_base += base;
				}
				map.set(row.entry.beneficiaryContactId, cur);
			}

			const items = [...map.values()]
				.map((row) => ({
					...row,
					open_base: row.accrued_base - row.paid_base
				}))
				.filter((row) => row.open_base !== 0)
				.sort((a, b) => Math.abs(b.open_base) - Math.abs(a.open_base));

			return { items, missing_fx_count: missingFxCount };
		});
	}

	private async findActiveWithNames(db: TenantDb, id: string) {
		const [row] = await db
			.select({
				entry: commissionEntries,
				beneficiaryDisplayName: beneficiaryContacts.displayName,
				caseDisplayName: caseContacts.displayName
			})
			.from(commissionEntries)
			.innerJoin(
				beneficiaryContacts,
				eq(commissionEntries.beneficiaryContactId, beneficiaryContacts.id)
			)
			.leftJoin(caseContacts, eq(commissionEntries.caseContactId, caseContacts.id))
			.where(and(eq(commissionEntries.id, id), isNull(commissionEntries.deletedAt)))
			.limit(1);
		if (!row) return null;
		return {
			entry: row.entry,
			beneficiaryDisplayName: row.beneficiaryDisplayName,
			caseDisplayName: row.caseDisplayName ?? null
		};
	}

	private async requireContact(db: TenantDb, contactId: string) {
		const [contact] = await db
			.select({ displayName: contacts.displayName })
			.from(contacts)
			.where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
			.limit(1);
		if (!contact) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}
		return contact;
	}

	private async requireTransaction(db: TenantDb, transactionId: string) {
		const [row] = await db
			.select({ id: transactions.id })
			.from(transactions)
			.where(and(eq(transactions.id, transactionId), isNull(transactions.deletedAt)))
			.limit(1);
		if (!row) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Transaction not found' }
			});
		}
		return row;
	}

	private async getTenantBase(db: TenantDb, tenantId: string): Promise<string> {
		const [tenant] = await db
			.select({ baseCurrency: tenants.baseCurrency })
			.from(tenants)
			.where(eq(tenants.id, tenantId))
			.limit(1);
		return tenant?.baseCurrency ?? 'TRY';
	}

	private async resolveFxSnapshot(
		db: TenantDb,
		tenantId: string,
		input: Pick<
			CommissionEntryCreate,
			'currency' | 'amount' | 'amount_base' | 'base_currency'
		>
	) {
		const tenantBase = (await this.getTenantBase(db, tenantId)) as SupportedCurrency;
		const currency = input.currency ?? 'TRY';
		let amountBase = input.amount_base ?? null;
		let baseCurrency = input.base_currency ?? null;
		if (amountBase === null && currency === tenantBase) {
			amountBase = input.amount;
			baseCurrency = tenantBase;
		}
		if (amountBase !== null && baseCurrency === null) {
			baseCurrency = tenantBase;
		}
		return { amountBase, baseCurrency };
	}
}
