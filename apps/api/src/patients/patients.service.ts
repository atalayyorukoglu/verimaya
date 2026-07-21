import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { MergeRecords, PatientCreate, PatientUpdate } from '@verimaya/shared';
import { findPatientDuplicateGroups } from '@verimaya/shared';
import {
	appointments,
	caseNotes,
	files,
	patients,
	transactions
} from '../db/schema';
import { writeAuditLog, type AuditActor } from '../common/audit-helper';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { toPatient } from '../common/mappers';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

@Injectable()
export class PatientsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async list(tenantId: string, params: { cursor?: string; limit: number }) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const cursorCond = createdAtCursorCondition(
				patients.createdAt,
				patients.id,
				params.cursor
			);
			const rows = await db
				.select()
				.from(patients)
				.where(and(isNull(patients.deletedAt), cursorCond))
				.orderBy(desc(patients.createdAt), desc(patients.id))
				.limit(params.limit + 1);

			const page = buildCursorPage(rows, params.limit);
			return {
				items: page.items.map(toPatient),
				next_cursor: page.next_cursor
			};
		});
	}

	async get(tenantId: string, id: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const row = await this.findActiveRow(db, id);
			if (!row) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Patient not found' }
				});
			}
			return toPatient(row);
		});
	}

	async createWithDb(db: TenantDb, tenantId: string, input: PatientCreate) {
		const [row] = await db
			.insert(patients)
			.values({
				tenantId,
				fullName: input.full_name,
				phone: input.phone ?? null,
				email: input.email ?? null,
				status: input.status ?? 'lead',
				source: input.source ?? null,
				notes: input.notes ?? null,
				assignedUserId: input.assigned_user_id ?? null,
				contactId: input.contact_id ?? null
			})
			.returning();
		return toPatient(row!);
	}

	async updateWithDb(db: TenantDb, id: string, input: PatientUpdate) {
		const existing = await this.findActiveRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Patient not found' }
			});
		}

		const [row] = await db
			.update(patients)
			.set({
				fullName: input.full_name ?? existing.fullName,
				phone: input.phone !== undefined ? input.phone : existing.phone,
				email: input.email !== undefined ? input.email : existing.email,
				status: input.status ?? existing.status,
				source: input.source !== undefined ? input.source : existing.source,
				notes: input.notes !== undefined ? input.notes : existing.notes,
				assignedUserId:
					input.assigned_user_id !== undefined
						? input.assigned_user_id
						: existing.assignedUserId,
				contactId:
					input.contact_id !== undefined ? input.contact_id : existing.contactId,
				updatedAt: new Date()
			})
			.where(eq(patients.id, id))
			.returning();

		return toPatient(row!);
	}

	async softDeleteWithDb(db: TenantDb, id: string) {
		const existing = await this.findActiveRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Patient not found' }
			});
		}

		await db
			.update(patients)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(eq(patients.id, id));

		return { id, deleted: true as const };
	}

	async duplicateGroups(tenantId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await db
				.select()
				.from(patients)
				.where(isNull(patients.deletedAt));
			return { items: findPatientDuplicateGroups(rows.map(toPatient)) };
		});
	}

	async mergeWithDb(
		db: TenantDb,
		tenantId: string,
		input: MergeRecords,
		actor: AuditActor
	) {
		const { keep_id, merge_ids } = input;
		if (merge_ids.includes(keep_id)) {
			throw new BadRequestException({
				error: { code: 'validation_error', message: 'keep_id cannot be in merge_ids' }
			});
		}

		const keep = await this.findActiveRow(db, keep_id);
		if (!keep) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Patient not found' }
			});
		}

		const sources = [];
		for (const id of merge_ids) {
			const row = await this.findActiveRow(db, id);
			if (!row) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Patient not found' }
				});
			}
			sources.push(row);
		}

		let phone = keep.phone;
		let email = keep.email;
		let notes = keep.notes;
		let contactId = keep.contactId;
		let source = keep.source;
		for (const src of sources) {
			if (!phone && src.phone) phone = src.phone;
			if (!email && src.email) email = src.email;
			if (!notes && src.notes) notes = src.notes;
			if (!contactId && src.contactId) contactId = src.contactId;
			if (!source && src.source) source = src.source;
		}

		const [updatedKeep] = await db
			.update(patients)
			.set({
				phone,
				email,
				notes,
				contactId,
				source,
				updatedAt: new Date()
			})
			.where(eq(patients.id, keep_id))
			.returning();

		const dropIds = merge_ids;
		const keepName = updatedKeep!.fullName;

		await db
			.update(appointments)
			.set({
				patientId: keep_id,
				patientDisplayName: keepName,
				updatedAt: new Date()
			})
			.where(inArray(appointments.patientId, dropIds));

		await db
			.update(transactions)
			.set({
				patientId: keep_id,
				patientDisplayName: keepName,
				updatedAt: new Date()
			})
			.where(inArray(transactions.patientId, dropIds));

		await db
			.update(caseNotes)
			.set({ patientId: keep_id })
			.where(inArray(caseNotes.patientId, dropIds));

		await db
			.update(files)
			.set({ patientId: keep_id })
			.where(inArray(files.patientId, dropIds));

		await db
			.update(patients)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(inArray(patients.id, dropIds));

		await writeAuditLog(db, tenantId, actor, 'update', 'patient', keepName);

		return toPatient(updatedKeep!);
	}

	private async findActiveRow(db: TenantDb, id: string) {
		const [row] = await db
			.select()
			.from(patients)
			.where(and(eq(patients.id, id), isNull(patients.deletedAt)))
			.limit(1);
		return row;
	}
}
