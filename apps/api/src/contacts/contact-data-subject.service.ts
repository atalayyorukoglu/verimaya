import { Injectable, NotFoundException } from '@nestjs/common';
import type {
	ContactDataDeletionRequest,
	ContactDataExport
} from '@verimaya/shared';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { writeAuditLog, type AuditActor } from '../common/audit-helper';
import { resolveBaseAmount, resolvePaidBaseAmount } from '../common/finance-base';
import {
	toAppointment,
	toContact,
	toContactCaseNote,
	toContactFile
} from '../common/mappers';
import { toIsoDateTime } from '../common/pagination';
import {
	appointments,
	caseNotes,
	contactDataDeletionRequests,
	contacts,
	files,
	tenants,
	transactions
} from '../db/schema';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

const ANONYMIZED_FIRST_NAME = 'Anonymized';
const ANONYMIZED_DISPLAY_NAME = 'Anonymized Contact';

function toContactDeletionRequest(
	row: typeof contactDataDeletionRequests.$inferSelect
): ContactDataDeletionRequest {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		subject_contact_id: row.subjectContactId,
		status: row.status as ContactDataDeletionRequest['status'],
		anonymized_at: row.anonymizedAt ? toIsoDateTime(row.anonymizedAt) : null,
		created_at: toIsoDateTime(row.createdAt)
	};
}

/**
 * AUDIT-F09-07b — contact data subject (KVKK m.11) under `/v1/contacts/:id/*`.
 * Subject is a contact row; the session user is the operator, never the subject.
 */
@Injectable()
export class ContactDataSubjectService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async exportData(tenantId: string, contactId: string): Promise<ContactDataExport> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const contact = await this.requireContact(db, contactId);

			const [tenantRow] = await db
				.select({
					dataRetentionUntil: tenants.dataRetentionUntil,
					baseCurrency: tenants.baseCurrency
				})
				.from(tenants)
				.where(eq(tenants.id, tenantId))
				.limit(1);

			const noteRows = await db
				.select()
				.from(caseNotes)
				.where(eq(caseNotes.contactId, contactId))
				.orderBy(asc(caseNotes.createdAt), asc(caseNotes.id));

			const appointmentRows = await db
				.select()
				.from(appointments)
				.where(eq(appointments.contactId, contactId))
				.orderBy(desc(appointments.createdAt), desc(appointments.id));

			const fileRows = await db
				.select()
				.from(files)
				.where(eq(files.contactId, contactId))
				.orderBy(desc(files.createdAt), desc(files.id));

			const tenantBase = tenantRow?.baseCurrency ?? 'TRY';
			const txRows = await db
				.select({
					kind: transactions.kind,
					status: transactions.status,
					amount: transactions.amount,
					amountBase: transactions.amountBase,
					baseCurrency: transactions.baseCurrency,
					currency: transactions.currency,
					paidAmount: transactions.paidAmount
				})
				.from(transactions)
				.where(and(eq(transactions.contactId, contactId), isNull(transactions.deletedAt)));

			let incomeBase = 0;
			let expenseBase = 0;
			let paidBase = 0;
			let outstandingBase = 0;

			for (const row of txRows) {
				const base = resolveBaseAmount(row, tenantBase);
				if (base == null) continue;
				if (row.kind === 'income') {
					incomeBase += base;
					const paid = resolvePaidBaseAmount(row, tenantBase) ?? 0;
					paidBase += paid;
					outstandingBase += base - paid;
				} else {
					expenseBase += base;
				}
			}

			const deletionRows = await db
				.select()
				.from(contactDataDeletionRequests)
				.where(
					and(
						eq(contactDataDeletionRequests.tenantId, tenantId),
						eq(contactDataDeletionRequests.subjectContactId, contactId)
					)
				)
				.orderBy(desc(contactDataDeletionRequests.createdAt))
				.limit(50);

			return {
				exported_at: new Date().toISOString(),
				tenant_id: tenantId,
				data_retention_until: tenantRow?.dataRetentionUntil
					? toIsoDateTime(tenantRow.dataRetentionUntil)
					: null,
				contact: toContact(contact),
				case_notes: noteRows.map(toContactCaseNote),
				appointments: appointmentRows.map(toAppointment),
				files: fileRows.map(toContactFile),
				finance_summary: {
					income_base: incomeBase,
					expense_base: expenseBase,
					net_base: incomeBase - expenseBase,
					paid_base: paidBase,
					outstanding_base: outstandingBase,
					transaction_count: txRows.length
				},
				deletion_requests: deletionRows.map(toContactDeletionRequest)
			};
		});
	}

	/**
	 * Records a deletion request and anonymizes identifying fields on the contact.
	 * Hard-delete is never used. Soft-delete (deleted_at) is left unchanged.
	 * Transactions keep contact_id; denormalized display names are masked.
	 */
	async requestDeletion(
		tenantId: string,
		contactId: string,
		actor: AuditActor
	): Promise<ContactDataDeletionRequest> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await this.requireContact(db, contactId);

			const [existingApplied] = await db
				.select()
				.from(contactDataDeletionRequests)
				.where(
					and(
						eq(contactDataDeletionRequests.tenantId, tenantId),
						eq(contactDataDeletionRequests.subjectContactId, contactId),
						eq(contactDataDeletionRequests.status, 'applied')
					)
				)
				.orderBy(desc(contactDataDeletionRequests.createdAt))
				.limit(1);

			if (existingApplied) {
				return toContactDeletionRequest(existingApplied);
			}

			const now = new Date();

			await db
				.update(contacts)
				.set({
					firstName: ANONYMIZED_FIRST_NAME,
					lastName: null,
					displayName: ANONYMIZED_DISPLAY_NAME,
					phone: null,
					email: null,
					updatedAt: now
				})
				.where(eq(contacts.id, contactId));

			await db
				.update(appointments)
				.set({
					contactDisplayName: ANONYMIZED_DISPLAY_NAME,
					updatedAt: now
				})
				.where(eq(appointments.contactId, contactId));

			await db
				.update(transactions)
				.set({
					contactDisplayName: ANONYMIZED_DISPLAY_NAME,
					contactLabel: ANONYMIZED_DISPLAY_NAME,
					updatedAt: now
				})
				.where(eq(transactions.contactId, contactId));

			const [row] = await db
				.insert(contactDataDeletionRequests)
				.values({
					tenantId,
					subjectContactId: contactId,
					status: 'applied',
					anonymizedAt: now
				})
				.returning();

			await writeAuditLog(
				db,
				tenantId,
				actor,
				'delete',
				'contact',
				`data-deletion-request:${row!.id}:anonymized`
			);

			return toContactDeletionRequest(row!);
		});
	}

	/** Contact may be soft-deleted — KVKK rights still apply; RLS enforces tenant scope. */
	private async requireContact(db: TenantDb, contactId: string) {
		const [row] = await db
			.select()
			.from(contacts)
			.where(eq(contacts.id, contactId))
			.limit(1);

		if (!row) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}

		return row;
	}
}
