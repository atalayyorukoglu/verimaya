import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, lte, type SQL } from 'drizzle-orm';
import type {
	IncentiveFileCreate,
	IncentiveFileListQuery,
	IncentiveFileUpdate
} from '@verimaya/shared';
import {
	DEFAULT_INCENTIVE_DOCUMENTS,
	addCalendarDays,
	utcTodayIsoDate
} from '@verimaya/shared';
import { writeAuditLog, type AuditActor } from '../common/audit-helper';
import {
	buildDeadlineAtCursorPage,
	deadlineAtCursorCondition
} from '../common/list-query';
import { toIncentiveFile } from '../common/mappers';
import { contacts, incentiveFiles, transactions } from '../db/schema';
import { SettingsService } from '../settings/settings.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

@Injectable()
export class IncentivesService {
	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly settingsService: SettingsService
	) {}

	async list(tenantId: string, params: IncentiveFileListQuery) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const today = utcTodayIsoDate();
			const cursorCond = deadlineAtCursorCondition(
				incentiveFiles.deadlineAt,
				incentiveFiles.id,
				params.cursor
			);
			const filters: SQL[] = [isNull(incentiveFiles.deletedAt)];
			if (params.status) filters.push(eq(incentiveFiles.status, params.status));
			if (params.due_within_days != null) {
				const cutoff = addCalendarDays(today, params.due_within_days);
				filters.push(lte(incentiveFiles.deadlineAt, cutoff));
			}
			if (cursorCond) filters.push(cursorCond);

			const rows = await db
				.select()
				.from(incentiveFiles)
				.where(and(...filters))
				.orderBy(asc(incentiveFiles.deadlineAt), asc(incentiveFiles.id))
				.limit(params.limit + 1);

			const page = buildDeadlineAtCursorPage(
				rows.map((row) => ({ ...row, deadlineAt: row.deadlineAt })),
				params.limit
			);
			return {
				items: page.items.map((row) => toIncentiveFile(row, today)),
				next_cursor: page.next_cursor
			};
		});
	}

	async createWithDb(db: TenantDb, tenantId: string, input: IncentiveFileCreate) {
		const contact = await this.requireContact(db, input.contact_id);
		if (input.transaction_id) {
			await this.requireTransaction(db, input.transaction_id);
		}

		const deadlineDays = await this.settingsService.getIncentiveDeadlineDays(tenantId);
		const deadlineAt = addCalendarDays(input.payment_date, deadlineDays);

		const [row] = await db
			.insert(incentiveFiles)
			.values({
				tenantId,
				contactId: input.contact_id,
				contactDisplayName: contact.displayName,
				transactionId: input.transaction_id ?? null,
				paymentDate: input.payment_date,
				deadlineAt,
				status: 'open',
				submittedAt: null,
				note: input.note ?? null,
				documents: DEFAULT_INCENTIVE_DOCUMENTS.map((d) => ({ ...d }))
			})
			.returning();

		return toIncentiveFile(row!);
	}

	async updateWithDb(db: TenantDb, id: string, input: IncentiveFileUpdate) {
		const existing = await this.findActiveRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Incentive file not found' }
			});
		}

		const [row] = await db
			.update(incentiveFiles)
			.set({
				status: input.status !== undefined ? input.status : existing.status,
				submittedAt:
					input.submitted_at !== undefined ? input.submitted_at : existing.submittedAt,
				note: input.note !== undefined ? input.note : existing.note,
				documents: input.documents !== undefined ? input.documents : existing.documents,
				updatedAt: new Date()
			})
			.where(eq(incentiveFiles.id, id))
			.returning();

		return toIncentiveFile(row!);
	}

	async softDeleteWithDb(db: TenantDb, tenantId: string, id: string, actor: AuditActor) {
		const existing = await this.findActiveRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Incentive file not found' }
			});
		}

		await db
			.update(incentiveFiles)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(eq(incentiveFiles.id, id));

		await writeAuditLog(
			db,
			tenantId,
			actor,
			'delete',
			'tenant',
			`incentive:${existing.contactDisplayName}`
		);

		return { id, deleted: true as const };
	}

	private async findActiveRow(db: TenantDb, id: string) {
		const [row] = await db
			.select()
			.from(incentiveFiles)
			.where(and(eq(incentiveFiles.id, id), isNull(incentiveFiles.deletedAt)))
			.limit(1);
		return row;
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
}
