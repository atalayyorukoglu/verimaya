import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { buildKnowledgeContext } from '@verimaya/shared';
import type {
	RecordUpdateSuggestionListQuery,
	RecordUpdateSuggestionRejectRequest
} from '@verimaya/shared';
import { AppointmentsService } from '../appointments/appointments.service';
import type { AuditActor } from '../common/audit-helper';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { toRecordUpdateSuggestion } from '../common/mappers';
import { appointments, recordUpdateSuggestions } from '../db/schema';
import { LLM_CLIENT, writeLlmParseLedger, type LlmClient } from '../integrations/llm';
import { SettingsService } from '../settings/settings.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

@Injectable()
export class RecordSuggestionsService {
	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly appointmentsService: AppointmentsService,
		private readonly settings: SettingsService,
		@Inject(LLM_CLIENT) private readonly llm: LlmClient
	) {}

	async parse(tenantId: string, message: string) {
		const tenantPromptNote = await this.resolveTenantPromptNote(tenantId);
		const knowledge = await this.resolveKnowledge(tenantId);

		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const activeAppointments = await db
				.select({
					id: appointments.id,
					contactDisplayName: appointments.contactDisplayName,
					startsAt: appointments.startsAt
				})
				.from(appointments)
				.where(isNull(appointments.deletedAt))
				.orderBy(desc(appointments.startsAt))
				.limit(200);

			const hints = activeAppointments.map((row) => ({
				appointment_id: row.id,
				contact_display_name: row.contactDisplayName,
				starts_at: row.startsAt.toISOString()
			}));

			const result = await this.llm.suggestAppointmentReschedule({
				message,
				appointments: hints,
				tenantPromptNote,
				knowledge
			});
			await writeLlmParseLedger(db, tenantId, result.usage);

			const created = [];
			for (const draft of result.suggestions) {
				const appt = activeAppointments.find((a) => a.id === draft.appointment_id);
				if (!appt) continue;

				const existingPending = await db
					.select({ id: recordUpdateSuggestions.id })
					.from(recordUpdateSuggestions)
					.where(
						and(
							eq(recordUpdateSuggestions.appointmentId, draft.appointment_id),
							eq(recordUpdateSuggestions.field, 'starts_at'),
							eq(recordUpdateSuggestions.status, 'pending'),
							isNull(recordUpdateSuggestions.deletedAt)
						)
					)
					.limit(1);
				if (existingPending.length > 0) continue;

				const suggestedAt = new Date(draft.suggested_value);
				if (suggestedAt.getTime() === appt.startsAt.getTime()) continue;

				const [row] = await db
					.insert(recordUpdateSuggestions)
					.values({
						tenantId,
						appointmentId: draft.appointment_id,
						field: 'starts_at',
						currentValue: appt.startsAt,
						suggestedValue: suggestedAt,
						sourceText: draft.reason,
						confidence: draft.confidence,
						status: 'pending'
					})
					.returning();

				if (row) {
					created.push(toRecordUpdateSuggestion(row, appt.contactDisplayName));
				}
			}

			return {
				items: created,
				skipped_reason: created.length > 0 ? null : (result.skipped_reason ?? null)
			};
		});
	}

	async list(tenantId: string, params: RecordUpdateSuggestionListQuery) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const cursorCond = createdAtCursorCondition(
				recordUpdateSuggestions.createdAt,
				recordUpdateSuggestions.id,
				params.cursor
			);
			const filters = [isNull(recordUpdateSuggestions.deletedAt)];
			if (params.status) {
				filters.push(eq(recordUpdateSuggestions.status, params.status));
			}
			if (cursorCond) filters.push(cursorCond);

			const rows = await db
				.select({
					suggestion: recordUpdateSuggestions,
					contactDisplayName: appointments.contactDisplayName
				})
				.from(recordUpdateSuggestions)
				.innerJoin(appointments, eq(recordUpdateSuggestions.appointmentId, appointments.id))
				.where(and(...filters))
				.orderBy(
					desc(recordUpdateSuggestions.createdAt),
					desc(recordUpdateSuggestions.id)
				)
				.limit(params.limit + 1);

			const page = buildCursorPage(
				rows.map((row) => ({
					...row,
					id: row.suggestion.id,
					createdAt: row.suggestion.createdAt
				})),
				params.limit
			);

			return {
				items: page.items.map((row) =>
					toRecordUpdateSuggestion(row.suggestion, row.contactDisplayName)
				),
				next_cursor: page.next_cursor
			};
		});
	}

	async approveWithDb(db: TenantDb, id: string, actor: AuditActor) {
		const existing = await this.findPendingRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Record update suggestion not found' }
			});
		}

		const [appt] = await db
			.select({ startsAt: appointments.startsAt })
			.from(appointments)
			.where(and(eq(appointments.id, existing.appointmentId), isNull(appointments.deletedAt)))
			.limit(1);
		if (!appt) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Appointment not found' }
			});
		}

		if (appt.startsAt.getTime() !== existing.currentValue.getTime()) {
			throw new ConflictException({
				error: {
					code: 'conflict',
					message: 'Appointment was modified since this suggestion was created'
				}
			});
		}

		await this.appointmentsService.updateWithDb(db, existing.appointmentId, {
			starts_at: existing.suggestedValue.toISOString()
		});

		const [row] = await db
			.update(recordUpdateSuggestions)
			.set({
				status: 'approved',
				decidedAt: new Date(),
				decidedBy: actor.actorDisplayName,
				updatedAt: new Date()
			})
			.where(eq(recordUpdateSuggestions.id, id))
			.returning();

		const [contact] = await db
			.select({ contactDisplayName: appointments.contactDisplayName })
			.from(appointments)
			.where(eq(appointments.id, existing.appointmentId))
			.limit(1);

		return toRecordUpdateSuggestion(row!, contact?.contactDisplayName ?? '');
	}

	async rejectWithDb(
		db: TenantDb,
		id: string,
		actor: AuditActor,
		input: RecordUpdateSuggestionRejectRequest
	) {
		const existing = await this.findPendingRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Record update suggestion not found' }
			});
		}

		const [row] = await db
			.update(recordUpdateSuggestions)
			.set({
				status: 'rejected',
				decidedAt: new Date(),
				decidedBy: actor.actorDisplayName,
				rejectReason: input.reason?.trim() || null,
				updatedAt: new Date()
			})
			.where(eq(recordUpdateSuggestions.id, id))
			.returning();

		const [contact] = await db
			.select({ contactDisplayName: appointments.contactDisplayName })
			.from(appointments)
			.where(eq(appointments.id, existing.appointmentId))
			.limit(1);

		return toRecordUpdateSuggestion(row!, contact?.contactDisplayName ?? '');
	}

	private async findPendingRow(db: TenantDb, id: string) {
		const [row] = await db
			.select()
			.from(recordUpdateSuggestions)
			.where(
				and(
					eq(recordUpdateSuggestions.id, id),
					eq(recordUpdateSuggestions.status, 'pending'),
					isNull(recordUpdateSuggestions.deletedAt)
				)
			)
			.limit(1);
		return row;
	}

	private async resolveKnowledge(tenantId: string): Promise<string | null> {
		const knowledge = await this.settings.getKnowledge(tenantId);
		return buildKnowledgeContext(knowledge.sections);
	}

	private async resolveTenantPromptNote(tenantId: string): Promise<string | null> {
		const prompt = await this.settings.getAiPrompt(tenantId);
		if (prompt.is_default) return null;
		const text = prompt.text.trim();
		return text.length > 0 ? text : null;
	}
}
