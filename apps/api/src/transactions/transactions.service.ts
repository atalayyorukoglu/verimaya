import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, gte, isNull, lte, type SQL } from 'drizzle-orm';
import {
	DEFAULT_CONTACT_TYPE_NAMES,
	deriveTransactionLabel,
	evaluateTransactionConsistency,
	type TransactionCreate,
	type TransactionAuditDraft,
	type TransactionAuditDraftResponse,
	type TransactionEvidence,
	type TransactionListQuery,
	type TransactionUpdate
} from '@verimaya/shared';
import { contacts, tenants, transactions } from '../db/schema';
import { writeAuditLog, type AuditActor } from '../common/audit-helper';
import { buildOccurredOnCursorPage, occurredOnCursorCondition } from '../common/list-query';
import { toTransaction } from '../common/mappers';
import { textSearchCondition } from '../common/search';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

const HASTA_TYPE = DEFAULT_CONTACT_TYPE_NAMES[0];
const PERSONEL_TYPE = DEFAULT_CONTACT_TYPE_NAMES[4];

/** AI-09 — sunucu tarafından üretilen kaynak izi; istek gövdesinden gelmez. */
export type TransactionSource = {
	inboundMessageId: string;
	evidence: TransactionEvidence | null;
};

@Injectable()
export class TransactionsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async list(tenantId: string, params: TransactionListQuery) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const cursorCond = occurredOnCursorCondition(
				transactions.occurredOn,
				transactions.id,
				params.cursor
			);
			const baseFilters: SQL[] = [isNull(transactions.deletedAt)];
			if (params.contact_id) baseFilters.push(eq(transactions.contactId, params.contact_id));
			if (params.case_contact_id) {
				baseFilters.push(eq(transactions.caseContactId, params.case_contact_id));
			}
			if (params.from) baseFilters.push(gte(transactions.occurredOn, params.from));
			if (params.to) baseFilters.push(lte(transactions.occurredOn, params.to));
			if (params.kind) baseFilters.push(eq(transactions.kind, params.kind));
			if (params.status) baseFilters.push(eq(transactions.status, params.status));
			if (params.category) baseFilters.push(eq(transactions.category, params.category));
			const searchCond = textSearchCondition(params.q, [
				transactions.title,
				transactions.subtitle,
				transactions.category,
				transactions.contactDisplayName,
				transactions.contactLabel,
				transactions.description
			]);
			if (searchCond) baseFilters.push(searchCond);

			const [totalRow] = await db
				.select({ n: count() })
				.from(transactions)
				.where(and(...baseFilters));

			const pageFilters = [...baseFilters];
			if (cursorCond) pageFilters.push(cursorCond);

			const rows = await db
				.select()
				.from(transactions)
				.where(and(...pageFilters))
				.orderBy(desc(transactions.occurredOn), desc(transactions.id))
				.limit(params.limit + 1);

			const page = buildOccurredOnCursorPage(rows, params.limit);
			return {
				items: page.items.map(toTransaction),
				next_cursor: page.next_cursor,
				total_count: Number(totalRow?.n ?? 0)
			};
		});
	}

	/**
	 * @param source AI-09 kaynak izi. **Ayrı parametre bilinçli:** `input`
	 * doğrudan istek gövdesinden geliyor; iz oraya karışırsa bir istemci
	 * "şu cümleden aldım" diye uydurma bir atıf yazabilirdi. Bu argümanı
	 * yalnız sunucu tarafındaki onay akışı (`WhatsappService`) doldurur;
	 * HTTP controller hiç geçmez.
	 */
	async createWithDb(
		db: TenantDb,
		tenantId: string,
		input: TransactionCreate,
		actor: AuditActor,
		source?: TransactionSource
	) {
		await this.assertTypedContact(db, input.case_contact_id, HASTA_TYPE, 'case_contact_id');
		await this.assertTypedContact(
			db,
			input.responsible_contact_id,
			PERSONEL_TYPE,
			'responsible_contact_id'
		);
		const denorm = await this.resolveDenormalized(db, tenantId, input);
		const [row] = await db
			.insert(transactions)
			.values({
				tenantId,
				kind: input.kind,
				title: input.title ?? null,
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
				contactId: input.contact_id ?? null,
				contactDisplayName: denorm.contactDisplayName,
				contactLabel: denorm.contactLabel,
				caseContactId: input.case_contact_id ?? null,
				responsibleContactId: input.responsible_contact_id ?? null,
				description: input.description ?? null,
				sourceInboundMessageId: source?.inboundMessageId ?? null,
				sourceEvidence: source?.evidence ?? null
			})
			.returning();

		await writeAuditLog(
			db,
			tenantId,
			actor,
			'create',
			'transaction',
			deriveTransactionAuditLabel(row!)
		);

		return toTransaction(row!);
	}

	async updateWithDb(
		db: TenantDb,
		tenantId: string,
		id: string,
		input: TransactionUpdate,
		actor: AuditActor
	) {
		const existing = await this.findActiveRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Transaction not found' }
			});
		}

		const merged = {
			kind: (input.kind ?? existing.kind) as TransactionCreate['kind'],
			title: input.title !== undefined ? input.title : existing.title,
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
			contact_id: input.contact_id !== undefined ? input.contact_id : existing.contactId,
			contact_label:
				input.contact_label !== undefined ? input.contact_label : existing.contactLabel,
			case_contact_id:
				input.case_contact_id !== undefined ? input.case_contact_id : existing.caseContactId,
			responsible_contact_id:
				input.responsible_contact_id !== undefined
					? input.responsible_contact_id
					: existing.responsibleContactId,
			description: input.description !== undefined ? input.description : existing.description
		} satisfies TransactionCreate;

		await this.assertTypedContact(db, merged.case_contact_id, HASTA_TYPE, 'case_contact_id');
		await this.assertTypedContact(
			db,
			merged.responsible_contact_id,
			PERSONEL_TYPE,
			'responsible_contact_id'
		);

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
				contactId: merged.contact_id,
				contactDisplayName: denorm.contactDisplayName,
				contactLabel: denorm.contactLabel,
				caseContactId: merged.case_contact_id,
				responsibleContactId: merged.responsible_contact_id,
				description: merged.description,
				updatedAt: new Date()
			})
			.where(eq(transactions.id, id))
			.returning();

		await writeAuditLog(
			db,
			tenantId,
			actor,
			'update',
			'transaction',
			deriveTransactionAuditLabel(row!)
		);

		return toTransaction(row!);
	}

	async softDeleteWithDb(db: TenantDb, tenantId: string, id: string, actor: AuditActor) {
		const existing = await this.findActiveRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Transaction not found' }
			});
		}

		await db
			.update(transactions)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(eq(transactions.id, id));

		await writeAuditLog(
			db,
			tenantId,
			actor,
			'delete',
			'transaction',
			existing.title ?? existing.id
		);

		return { id, deleted: true as const };
	}

	async auditDraft(
		tenantId: string,
		input: TransactionAuditDraft
	): Promise<TransactionAuditDraftResponse> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [tenant] = await db
				.select({ baseCurrency: tenants.baseCurrency })
				.from(tenants)
				.where(eq(tenants.id, tenantId))
				.limit(1);

			let responsible_is_internal: boolean | null = null;
			if (input.responsible_contact_id) {
				const [contact] = await db
					.select({ isInternal: contacts.isInternal })
					.from(contacts)
					.where(
						and(
							eq(contacts.id, input.responsible_contact_id),
							isNull(contacts.deletedAt)
						)
					)
					.limit(1);
				responsible_is_internal = contact?.isInternal ?? null;
			}

			return {
				items: evaluateTransactionConsistency(
					{ ...input, responsible_is_internal },
					{ baseCurrency: tenant?.baseCurrency ?? 'TRY' }
				)
			};
		});
	}

	private async findActiveRow(db: TenantDb, id: string) {
		const [row] = await db
			.select()
			.from(transactions)
			.where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
			.limit(1);
		return row;
	}

	private async assertTypedContact(
		db: TenantDb,
		contactId: string | null | undefined,
		expectedTypeName: string,
		field: string
	) {
		if (!contactId) return;
		const [row] = await db
			.select({
				id: contacts.id,
				contactTypeName: contacts.contactTypeName
			})
			.from(contacts)
			.where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
			.limit(1);
		if (!row) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}
		if (row.contactTypeName !== expectedTypeName) {
			throw new BadRequestException({
				error: {
					code: 'invalid_contact_type',
					message: `${field} must reference a ${expectedTypeName} contact`
				}
			});
		}
	}

	private async resolveDenormalized(
		db: TenantDb,
		tenantId: string,
		input: Pick<
			TransactionCreate,
			| 'contact_id'
			| 'contact_label'
			| 'currency'
			| 'amount'
			| 'amount_base'
			| 'base_currency'
		>
	) {
		let contactDisplayName: string | null = null;
		let contactLabel = input.contact_label ?? null;
		if (input.contact_id) {
			const [contact] = await db
				.select({ displayName: contacts.displayName })
				.from(contacts)
				.where(and(eq(contacts.id, input.contact_id), isNull(contacts.deletedAt)))
				.limit(1);
			if (!contact) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Contact not found' }
				});
			}
			contactDisplayName = contact.displayName;
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

		return { contactDisplayName, contactLabel, amountBase, baseCurrency };
	}
}

function deriveTransactionAuditLabel(row: {
	title: string | null;
	subtitle: string | null;
	category: string | null;
	contactDisplayName: string | null;
	contactLabel: string | null;
	description: string | null;
}): string {
	return deriveTransactionLabel({
		title: row.title,
		subtitle: row.subtitle,
		category: row.category,
		contact_display_name: row.contactDisplayName,
		contact_label: row.contactLabel,
		description: row.description
	});
}
