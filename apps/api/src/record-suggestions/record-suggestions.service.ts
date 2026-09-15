import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { buildKnowledgeContext } from '@verimaya/shared';
import type {
	RecordUpdateSuggestionListQuery,
	RecordUpdateSuggestionRejectRequest
} from '@verimaya/shared';
import { AppointmentsService } from '../appointments/appointments.service';
import type { AuditActor } from '../common/audit-helper';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { toRecordUpdateSuggestion } from '../common/mappers';
import { appointments, contacts, recordUpdateSuggestions } from '../db/schema';
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
					startsAt: appointments.startsAt,
					clinicName: appointments.clinicName,
					hotelName: appointments.hotelName,
					transferNote: appointments.transferNote
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

			const logisticsHints = activeAppointments.map((row) => ({
				appointment_id: row.id,
				contact_display_name: row.contactDisplayName,
				starts_at: row.startsAt.toISOString(),
				clinic: row.clinicName,
				hotel: row.hotelName,
				transfer: row.transferNote
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

			// Lojistik: klinik / otel / transfer. Erteleme ile AYNI çağrıda değil —
			// iki ayrı çıkarım işi, tek prompt'a sıkıştırmak ikisini de bozuyor
			// (model tarihi bulunca otele bakmayı bırakıyor).
			const logistics = await this.llm.suggestAppointmentLogistics({
				message,
				appointments: logisticsHints,
				tenantPromptNote,
				knowledge
			});
			await writeLlmParseLedger(db, tenantId, logistics.usage);

			for (const draft of logistics.suggestions) {
				const appt = activeAppointments.find((a) => a.id === draft.appointment_id);
				if (!appt) continue;

				const mevcut =
					draft.field === 'clinic'
						? appt.clinicName
						: draft.field === 'hotel'
							? appt.hotelName
							: appt.transferNote;
				// Zaten aynıysa öneri açma: kuyruk "karar bekleyen" listesi olmalı.
				if ((mevcut ?? '').trim().toLocaleLowerCase('tr') === draft.suggested_text.trim().toLocaleLowerCase('tr')) {
					continue;
				}

				const existingPending = await db
					.select({ id: recordUpdateSuggestions.id })
					.from(recordUpdateSuggestions)
					.where(
						and(
							eq(recordUpdateSuggestions.appointmentId, draft.appointment_id),
							eq(recordUpdateSuggestions.field, draft.field),
							eq(recordUpdateSuggestions.status, 'pending'),
							isNull(recordUpdateSuggestions.deletedAt)
						)
					)
					.limit(1);
				if (existingPending.length > 0) continue;

				const [row] = await db
					.insert(recordUpdateSuggestions)
					.values({
						tenantId,
						appointmentId: draft.appointment_id,
						field: draft.field,
						currentText: mevcut ?? null,
						suggestedText: draft.suggested_text,
						// Önerilen ad kayıtlı bir kişiye denk geliyorsa bağı da kur.
						suggestedContactId:
							draft.field === 'transfer'
								? null
								: await this.contactIdByName(db, draft.suggested_text),
						sourceText: draft.reason,
						confidence: draft.confidence,
						status: 'pending'
					})
					.returning();

				if (row) created.push(toRecordUpdateSuggestion(row, appt.contactDisplayName));
			}

			return {
				items: created,
				skipped_reason:
					created.length > 0
						? null
						: (result.skipped_reason ?? logistics.skipped_reason ?? null)
			};
		});
	}

	/**
	 * Otel/klinik adı kayıtlı bir kişiye denk geliyor mu? Tam ad eşleşmesi (büyük-
	 * küçük harf duyarsız) arar; benzerini bulmaya çalışmaz — yanlış otele
	 * bağlamaktansa yalnız adı yazmak yeğdir, ad zaten serbest metin olarak tutuluyor.
	 */
	private async contactIdByName(db: TenantDb, name: string): Promise<string | null> {
		const aranan = name.trim();
		if (!aranan) return null;
		const [row] = await db
			.select({ id: contacts.id })
			.from(contacts)
			.where(
				and(
					sql`lower(${contacts.displayName}) = lower(${aranan})`,
					isNull(contacts.deletedAt)
				)
			)
			.limit(1);
		return row?.id ?? null;
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
			.select({
				startsAt: appointments.startsAt,
				clinicName: appointments.clinicName,
				hotelName: appointments.hotelName,
				transferNote: appointments.transferNote
			})
			.from(appointments)
			.where(and(eq(appointments.id, existing.appointmentId), isNull(appointments.deletedAt)))
			.limit(1);
		if (!appt) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Appointment not found' }
			});
		}

		const catisma = () => {
			throw new ConflictException({
				error: {
					code: 'conflict',
					message: 'Appointment was modified since this suggestion was created'
				}
			});
		};

		if (existing.field === 'starts_at') {
			if (!existing.currentValue || !existing.suggestedValue) {
				throw new ConflictException({
					error: { code: 'conflict', message: 'Suggestion is missing its date values' }
				});
			}
			if (appt.startsAt.getTime() !== existing.currentValue.getTime()) catisma();
			await this.appointmentsService.updateWithDb(db, existing.appointmentId, {
				starts_at: existing.suggestedValue.toISOString()
			});
		} else {
			// Lojistik: öneri açıldığından beri alan elle değiştiyse yazma — insanın
			// yazdığını modelin önerisiyle ezmek en kötü sonuç.
			const simdiki =
				existing.field === 'clinic'
					? appt.clinicName
					: existing.field === 'hotel'
						? appt.hotelName
						: appt.transferNote;
			if ((simdiki ?? null) !== (existing.currentText ?? null)) catisma();
			if (!existing.suggestedText) {
				throw new ConflictException({
					error: { code: 'conflict', message: 'Suggestion is missing its value' }
				});
			}

			const yama =
				existing.field === 'clinic'
					? {
							clinic_name: existing.suggestedText,
							...(existing.suggestedContactId
								? { clinic_contact_id: existing.suggestedContactId }
								: {})
						}
					: existing.field === 'hotel'
						? {
								hotel_name: existing.suggestedText,
								...(existing.suggestedContactId
									? { hotel_contact_id: existing.suggestedContactId }
									: {})
							}
						: { transfer_note: existing.suggestedText };
			await this.appointmentsService.updateWithDb(db, existing.appointmentId, yama);
		}

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
