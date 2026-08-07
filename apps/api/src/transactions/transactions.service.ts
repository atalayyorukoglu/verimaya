import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, isNull, lte, type SQL } from 'drizzle-orm';
import type { TransactionCreate, TransactionListQuery, TransactionUpdate } from '@verimaya/shared';
import { contacts, patients, tenants, transactions } from '../db/schema';
import { buildOccurredOnCursorPage, occurredOnCursorCondition } from '../common/list-query';
import { toTransaction } from '../common/mappers';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

@Injectable()
export class TransactionsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async list(tenantId: string, params: TransactionListQuery) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const filters: SQL[] = [];
			const cursorCond = occurredOnCursorCondition(
				transactions.occurredOn,
				transactions.id,
				params.cursor
			);
			if (cursorCond) filters.push(cursorCond);
			if (params.patient_id) filters.push(eq(transactions.patientId, params.patient_id));
			if (params.contact_id) filters.push(eq(transactions.contactId, params.contact_id));
			// CONTRACT-01: inclusive range over the naive occurred_on date (see list-query.ts doc).
			if (params.from) filters.push(gte(transactions.occurredOn, params.from));
			if (params.to) filters.push(lte(transactions.occurredOn, params.to));

			const rows = await db
				.select()
				.from(transactions)
				.where(filters.length > 0 ? and(...filters) : undefined)
				.orderBy(desc(transactions.occurredOn), desc(transactions.id))
				.limit(params.limit + 1);

			const page = buildOccurredOnCursorPage(rows, params.limit);
			return {
				items: page.items.map(toTransaction),
				next_cursor: page.next_cursor
			};
		});
	}

	async createWithDb(db: TenantDb, tenantId: string, input: TransactionCreate) {
		const denorm = await this.resolveDenormalized(db, tenantId, input);
		const [row] = await db
			.insert(transactions)
			.values({
				tenantId,
				kind: input.kind,
				title: input.title,
				subtitle: input.subtitle ?? null,
				category: input.category ?? null,
				occurredOn: input.occurred_on,
				status: input.status,
				invoiceStatus: input.invoice_status ?? 'none',
				paymentMethod: input.payment_method ?? null,
				amount: input.amount,
				paidAmount: input.paid_amount ?? null,
				currency: input.currency ?? 'TRY',
				amountBase: denorm.amountBase,
				baseCurrency: denorm.baseCurrency,
				fxRate: input.fx_rate ?? null,
				fxDated: input.fx_dated ?? null,
				patientId: input.patient_id ?? null,
				patientDisplayName: denorm.patientDisplayName,
				contactId: input.contact_id ?? null,
				contactLabel: denorm.contactLabel,
				description: input.description ?? null
			})
			.returning();
		return toTransaction(row!);
	}

	async updateWithDb(db: TenantDb, tenantId: string, id: string, input: TransactionUpdate) {
		const existing = await this.findRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Transaction not found' }
			});
		}

		const merged = {
			kind: (input.kind ?? existing.kind) as TransactionCreate['kind'],
			title: input.title ?? existing.title,
			subtitle: input.subtitle !== undefined ? input.subtitle : existing.subtitle,
			category: input.category !== undefined ? input.category : existing.category,
			occurred_on: input.occurred_on ?? existing.occurredOn,
			status: (input.status ?? existing.status) as TransactionCreate['status'],
			invoice_status: (input.invoice_status !== undefined
				? input.invoice_status
				: existing.invoiceStatus) as TransactionCreate['invoice_status'],
			payment_method:
				input.payment_method !== undefined ? input.payment_method : existing.paymentMethod,
			amount: input.amount ?? existing.amount,
			paid_amount: input.paid_amount !== undefined ? input.paid_amount : existing.paidAmount,
			currency: (input.currency ?? existing.currency) as TransactionCreate['currency'],
			amount_base: input.amount_base !== undefined ? input.amount_base : existing.amountBase,
			base_currency: (input.base_currency !== undefined
				? input.base_currency
				: existing.baseCurrency) as TransactionCreate['base_currency'],
			fx_rate: input.fx_rate !== undefined ? input.fx_rate : existing.fxRate,
			fx_dated: input.fx_dated !== undefined ? input.fx_dated : existing.fxDated,
			patient_id: input.patient_id !== undefined ? input.patient_id : existing.patientId,
			contact_id: input.contact_id !== undefined ? input.contact_id : existing.contactId,
			contact_label:
				input.contact_label !== undefined ? input.contact_label : existing.contactLabel,
			description: input.description !== undefined ? input.description : existing.description
		} satisfies TransactionCreate;

		const denorm = await this.resolveDenormalized(db, tenantId, merged);

		const [row] = await db
			.update(transactions)
			.set({
				kind: merged.kind,
				title: merged.title,
				subtitle: merged.subtitle,
				category: merged.category,
				occurredOn: merged.occurred_on,
				status: merged.status,
				invoiceStatus: merged.invoice_status ?? 'none',
				paymentMethod: merged.payment_method,
				amount: merged.amount,
				paidAmount: merged.paid_amount,
				currency: merged.currency ?? 'TRY',
				amountBase: denorm.amountBase,
				baseCurrency: denorm.baseCurrency,
				fxRate: merged.fx_rate,
				fxDated: merged.fx_dated,
				patientId: merged.patient_id,
				patientDisplayName: denorm.patientDisplayName,
				contactId: merged.contact_id,
				contactLabel: denorm.contactLabel,
				description: merged.description,
				updatedAt: new Date()
			})
			.where(eq(transactions.id, id))
			.returning();

		return toTransaction(row!);
	}

	private async findRow(db: TenantDb, id: string) {
		const [row] = await db
			.select()
			.from(transactions)
			.where(eq(transactions.id, id))
			.limit(1);
		return row;
	}

	private async resolveDenormalized(
		db: TenantDb,
		tenantId: string,
		input: Pick<
			TransactionCreate,
			| 'patient_id'
			| 'contact_id'
			| 'contact_label'
			| 'currency'
			| 'amount'
			| 'amount_base'
			| 'base_currency'
		>
	) {
		let patientDisplayName: string | null = null;
		if (input.patient_id) {
			const [patient] = await db
				.select({ fullName: patients.fullName })
				.from(patients)
				.where(and(eq(patients.id, input.patient_id), isNull(patients.deletedAt)))
				.limit(1);
			if (!patient) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Patient not found' }
				});
			}
			patientDisplayName = patient.fullName;
		}

		let contactLabel = input.contact_label ?? null;
		if (input.contact_id) {
			const [contact] = await db
				.select({ displayName: contacts.displayName })
				.from(contacts)
				.where(eq(contacts.id, input.contact_id))
				.limit(1);
			if (!contact) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Contact not found' }
				});
			}
			contactLabel = contact.displayName;
		}

		const [tenant] = await db
			.select({ baseCurrency: tenants.baseCurrency })
			.from(tenants)
			.where(eq(tenants.id, tenantId))
			.limit(1);
		const tenantBase = (tenant?.baseCurrency ?? 'TRY') as TransactionCreate['currency'];
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

		return { patientDisplayName, contactLabel, amountBase, baseCurrency };
	}
}
