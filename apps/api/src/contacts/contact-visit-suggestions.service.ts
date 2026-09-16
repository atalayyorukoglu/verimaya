import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type {
	ContactVisitDraft,
	ContactVisitSuggestion,
	ContactVisitSuggestionApprove,
	ContactVisitSuggestionApproveAllResult,
	ContactVisitSuggestionBulkDecide,
	ContactVisitSuggestionConfidence,
	ContactVisitSuggestionListQuery,
	ContactVisitSuggestionReject,
	ContactVisitSuggestionRejectAllResult,
	ContactVisitSuggestionStatus
} from '@verimaya/shared';
import {
	contactVisitCreateFromDraft,
	contactVisitSuggestionDedupeKey,
	contactVisitSuggestionMeetsConfidence
} from '@verimaya/shared';
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
	private readonly logger = new Logger(ContactVisitSuggestionsService.name);

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

	/**
	 * Toplu onay (VIZIT-01). Canlıda 408 bekleyen öneri birikti; tek tek onay
	 * telefondan yapılabilir bir iş değil.
	 *
	 * Üç kural:
	 * - **Öneri başına bir transaction.** Tek büyük transaction'da 400 vizit açmak,
	 *   400'üncüde patlayınca 399'unu da geri alırdı; ayrıca RLS oturumunu dakikalarca
	 *   açık tutardı. Biri hata verirse `failed` sayılır, sıradakine geçilir.
	 * - **Tekil onay yolunun aynısı.** `approveWithDb` çağrılır — vizit oluşturma,
	 *   `approved` damgası ve `created_visit_id` bağı tek yerde kalsın; toplu yol
	 *   kendi kopyasını tutmaz, yoksa ikisi zamanla ayrışır.
	 * - **Mükerrer vizit açılmaz.** Aynı kişide aynı tür + aynı geliş günü ikinci kez
	 *   gelirse `skipped`; öneri `pending` kalır, kullanıcı isterse tek tek bakar.
	 *
	 * Eskiden yeniye işlenir: kuyruk geldiği sırayla boşalsın, `limit` tavanına
	 * takılırsa en eski öneriler kurtulmuş olsun.
	 *
	 * `db` **yalnız aday listesini okumak** için: ucun idempotency transaction'ı.
	 * Onaylar ondan bağımsız transaction'larda koşar — bu yüzden uç 2xx dönmeden
	 * önce vizitler zaten kalıcıdır; idempotency satırı sonradan yazılır ve ikinci
	 * tık yanıtı tekrar oynatır, işi ikinci kez yapmaz.
	 */
	async approveAllWithDb(
		db: TenantDb,
		tenantId: string,
		actor: AuditActor,
		input: ContactVisitSuggestionBulkDecide
	): Promise<ContactVisitSuggestionApproveAllResult> {
		const adaylar = await this.bekleyenAdaylar(db, input);

		let approved = 0;
		let failed = 0;
		let skipped = 0;
		const gorulen = new Set<string>();

		for (const aday of adaylar) {
			const anahtar = contactVisitSuggestionDedupeKey(aday.contactId, aday.draft);
			if (gorulen.has(anahtar)) {
				skipped += 1;
				continue;
			}
			try {
				await this.tenantContext.withTenant(tenantId, ({ db }) =>
					this.approveWithDb(db, aday.id, actor, {})
				);
				// Anahtar yalnız onay tuttuysa işaretlenir: hata alan öneri, aynı
				// gelişin ikinci önerisini de sessizce yutmasın.
				gorulen.add(anahtar);
				approved += 1;
			} catch (err) {
				failed += 1;
				this.logger.warn(
					`toplu onay atlandı (${aday.id}): ${err instanceof Error ? err.message : String(err)}`
				);
			}
		}

		return { approved, failed, skipped };
	}

	/**
	 * Toplu yoksayma — eşiği karşılayan bekleyen önerileri `rejected` damgalar.
	 * Vizit doğurmaz, satır silinmez: karar geri dönülebilir kalsın diye kuyruktan
	 * düşer ama kayıt durur. Burada da öneri başına bir transaction.
	 */
	async rejectAllWithDb(
		db: TenantDb,
		tenantId: string,
		actor: AuditActor,
		input: ContactVisitSuggestionBulkDecide
	): Promise<ContactVisitSuggestionRejectAllResult> {
		const adaylar = await this.bekleyenAdaylar(db, input);

		let rejected = 0;
		let failed = 0;

		for (const aday of adaylar) {
			try {
				await this.tenantContext.withTenant(tenantId, ({ db }) =>
					this.rejectWithDb(db, aday.id, actor, {})
				);
				rejected += 1;
			} catch (err) {
				failed += 1;
				this.logger.warn(
					`toplu yoksayma atlandı (${aday.id}): ${err instanceof Error ? err.message : String(err)}`
				);
			}
		}

		return { rejected, failed };
	}

	/**
	 * Eşiği karşılayan bekleyen öneriler, eskiden yeniye. Güven süzgeci JS tarafında:
	 * `confidence` serbest metin bir sütun ve eşik sıralaması zaten paylaşılan
	 * yardımcıda — SQL'e ikinci bir kopyasını yazmak iki kuralı ayrıştırırdı.
	 */
	private async bekleyenAdaylar(
		db: TenantDb,
		input: ContactVisitSuggestionBulkDecide
	): Promise<Array<{ id: string; contactId: string; draft: ContactVisitDraft }>> {
		const rows = await db
			.select({
				id: contactVisitSuggestions.id,
				contactId: contactVisitSuggestions.contactId,
				draft: contactVisitSuggestions.draft,
				confidence: contactVisitSuggestions.confidence
			})
			.from(contactVisitSuggestions)
			.where(
				and(
					eq(contactVisitSuggestions.status, 'pending'),
					isNull(contactVisitSuggestions.deletedAt)
				)
			)
			.orderBy(asc(contactVisitSuggestions.createdAt), asc(contactVisitSuggestions.id));

		return rows
			.filter((r) =>
				contactVisitSuggestionMeetsConfidence(
					r.confidence as ContactVisitSuggestionConfidence,
					input.min_confidence
				)
			)
			.slice(0, input.limit)
			.map((r) => ({ id: r.id, contactId: r.contactId, draft: r.draft }));
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
