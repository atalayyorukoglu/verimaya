import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type {
	ContactVisitDraft,
	ContactVisitSuggestion,
	ContactVisitSuggestionApprove,
	ContactVisitSuggestionConfidence,
	ContactVisitSuggestionListQuery,
	ContactVisitSuggestionReject,
	ContactVisitSuggestionStatus
} from '@verimaya/shared';
import { contactVisitCreateFromDraft } from '@verimaya/shared';
import type { AuditActor } from '../common/audit-helper';
import { contacts } from '../db/schema/contacts';
import {
	contactVisitSuggestions,
	type ContactVisitSuggestionRow
} from '../db/schema/contact-visits';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ContactVisitsService } from './contact-visits.service';

function toSuggestion(
	row: ContactVisitSuggestionRow,
	contactDisplayName: string
): ContactVisitSuggestion {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		contact_id: row.contactId,
		contact_display_name: contactDisplayName,
		inbound_message_id: row.inboundMessageId,
		draft: row.draft,
		source_text: row.sourceText,
		confidence: row.confidence as ContactVisitSuggestionConfidence,
		status: row.status as ContactVisitSuggestionStatus,
		created_visit_id: row.createdVisitId,
		decided_at: row.decidedAt ? row.decidedAt.toISOString() : null,
		decided_by: row.decidedBy,
		reject_reason: row.rejectReason,
		created_at: row.createdAt.toISOString(),
		updated_at: row.updatedAt.toISOString()
	};
}

/**
 * VIZIT-01 — vizit önerisi kuyruğu.
 *
 * AGENTS ilke 6: insan onayı olmadan kesin kayıt yok. Kuyruk işlemcisi mesajdan
 * çıkardığı taslağı buraya yazar; kullanıcı kartta alanları düzeltip onaylayınca
 * `contact_visits` satırı doğar. Reddedilen öneri silinmez, `rejected` kalır —
 * aynı mesaj yeniden işlenirse tekil kısıt sayesinde tekrar sorulmaz.
 */
@Injectable()
export class ContactVisitSuggestionsService {
	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly visits: ContactVisitsService
	) {}

	/**
	 * Kuyruk işlemcisinden çağrılır. Mükerrer öneri kısmi tekil indeksle engellenir;
	 * çakışma sessizce atlanır (aynı mesaj ikinci kez işlenmiş demektir).
	 */
	async createFromMessageWithDb(
		db: TenantDb,
		tenantId: string,
		input: {
			contactId: string;
			/** Elle açılan öneride null olabilir; tekil kısıt yalnız mesajlı satırlarda çalışır. */
			inboundMessageId: string | null;
			draft: ContactVisitDraft;
			sourceText: string;
			confidence: ContactVisitSuggestionConfidence;
		}
	): Promise<ContactVisitSuggestion | null> {
		const [row] = await db
			.insert(contactVisitSuggestions)
			.values({
				tenantId,
				contactId: input.contactId,
				inboundMessageId: input.inboundMessageId,
				draft: input.draft,
				sourceText: input.sourceText.slice(0, 4000),
				confidence: input.confidence,
				status: 'pending'
			})
			/*
			 * Kısmi tekil indeks: çakışma hedefi indeksin koşuluyla birlikte verilmeli,
			 * yoksa Postgres "no unique or exclusion constraint matching" der.
			 */
			.onConflictDoNothing({
				target: [
					contactVisitSuggestions.tenantId,
					contactVisitSuggestions.inboundMessageId,
					contactVisitSuggestions.contactId
				],
				where: sql`${contactVisitSuggestions.deletedAt} is null and ${contactVisitSuggestions.inboundMessageId} is not null`
			})
			.returning();
		if (!row) return null;
		return toSuggestion(row, await this.kisiAdi(db, row.contactId));
	}

	async list(tenantId: string, params: ContactVisitSuggestionListQuery) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await db
				.select({ suggestion: contactVisitSuggestions, displayName: contacts.displayName })
				.from(contactVisitSuggestions)
				.innerJoin(contacts, eq(contactVisitSuggestions.contactId, contacts.id))
				.where(
					and(
						eq(contactVisitSuggestions.status, params.status),
						isNull(contactVisitSuggestions.deletedAt)
					)
				)
				.orderBy(desc(contactVisitSuggestions.createdAt), desc(contactVisitSuggestions.id))
				.limit(params.limit);

			return { items: rows.map((r) => toSuggestion(r.suggestion, r.displayName)) };
		});
	}

	/**
	 * Onay: taslak (ya da kullanıcının kuyrukta düzelttiği hâli) vizit olarak yazılır,
	 * öneri `approved` damgalanır ve doğan vizite bağlanır. Aynı işlemde — yarım
	 * kalmış "öneri onaylandı ama vizit yok" durumu olmasın.
	 */
	async approveWithDb(
		db: TenantDb,
		id: string,
		actor: AuditActor,
		input: ContactVisitSuggestionApprove
	): Promise<ContactVisitSuggestion> {
		const existing = await this.bekleyenSatir(db, id);

		const create = input.visit ?? contactVisitCreateFromDraft(existing.draft);
		const visit = await this.visits.createWithDb(
			db,
			existing.tenantId,
			existing.contactId,
			{ ...create, source_inbound_message_id: existing.inboundMessageId },
			{ displayName: actor.actorDisplayName }
		);

		const [row] = await db
			.update(contactVisitSuggestions)
			.set({
				status: 'approved',
				createdVisitId: visit.id,
				decidedAt: new Date(),
				decidedBy: actor.actorDisplayName,
				updatedAt: new Date()
			})
			.where(eq(contactVisitSuggestions.id, id))
			.returning();

		return toSuggestion(row!, await this.kisiAdi(db, existing.contactId));
	}

	async rejectWithDb(
		db: TenantDb,
		id: string,
		actor: AuditActor,
		input: ContactVisitSuggestionReject
	): Promise<ContactVisitSuggestion> {
		const existing = await this.bekleyenSatir(db, id);

		const [row] = await db
			.update(contactVisitSuggestions)
			.set({
				status: 'rejected',
				decidedAt: new Date(),
				decidedBy: actor.actorDisplayName,
				rejectReason: input.reason?.trim() || null,
				updatedAt: new Date()
			})
			.where(eq(contactVisitSuggestions.id, id))
			.returning();

		return toSuggestion(row!, await this.kisiAdi(db, existing.contactId));
	}

	private async bekleyenSatir(db: TenantDb, id: string): Promise<ContactVisitSuggestionRow> {
		const [row] = await db
			.select()
			.from(contactVisitSuggestions)
			.where(and(eq(contactVisitSuggestions.id, id), isNull(contactVisitSuggestions.deletedAt)))
			.limit(1);
		if (!row) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact visit suggestion not found' }
			});
		}
		if (row.status !== 'pending') {
			// Aynı öneriye iki kişi aynı anda bastıysa ikincisi sessizce ikinci vizit
			// açmasın; kuyruk yenilensin ve kullanıcı durumu görsün.
			throw new ConflictException({
				error: { code: 'conflict', message: 'Suggestion was already decided' }
			});
		}
		return row;
	}

	private async kisiAdi(db: TenantDb, contactId: string): Promise<string> {
		const [row] = await db
			.select({ displayName: contacts.displayName })
			.from(contacts)
			.where(eq(contacts.id, contactId))
			.limit(1);
		return row?.displayName ?? '';
	}
}
