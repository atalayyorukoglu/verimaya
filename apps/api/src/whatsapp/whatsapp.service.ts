import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type {
	ApproveDraftItem,
	ApproveDraftsRequest,
	ApproveDraftsResponse,
	InboundMessage,
	InboundMessageActionResponse,
	InboundMessageProcessResponse,
	InboundMessageCreateContactResponse,
	InboundMessageStatus,
	Contact,
	TransactionDraft,
	TransactionDraftSnapshot,
	WhatsappChatPurpose,
	WhatsappCreateContact
} from '@verimaya/shared';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { aiCorrections } from '../db/schema/ai-corrections';
import { inboundMessages, type InboundMessageRow } from '../db/schema/inbound-messages';
import { inboundMessageContacts } from '../db/schema/inbound-message-contacts';
import { MessageContactsService } from './message-contacts.service';
import { InboundMediaService } from './inbound-media.service';
import type { KisiAdayi } from './kisi-eslestir';
import { buildKnowledgeContext } from '@verimaya/shared';
import { type AuditActor } from '../common/audit-helper';
import { LLM_CLIENT, writeLlmParseLedger, type LlmClient } from '../integrations/llm';
import { DriveMirrorEnqueueService } from '../integrations/google-drive/drive-mirror-enqueue.service';
import { ContactsService } from '../contacts/contacts.service';
import { SettingsService } from '../settings/settings.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { TransactionsService, type TransactionSource } from '../transactions/transactions.service';
import { evidenceForApprovedDraft } from './evidence';
import { WhatsappChatsService } from '../settings/whatsapp-chats.service';
import { groupInboundMessages } from './group-events';
import { turleriBul } from './mesaj-turu';
import {
	asRecord,
	extractInboundDisplayFields,
	extractParsedRecords,
	mergeParsedPayload,
	toInboundMessage
} from './inbound-mapper';

const PARSE_ERROR_NO_TEXT = 'Medya mesajı — metin yok';
const PARSE_ERROR_NO_MATCH = 'Ayrıştırılamadı';

export type ProcessInboundOutcome = 'parsed' | 'error' | 'skipped';

/**
 * `ai_corrections` anlık görüntüsü — iz taşımaz. `original_parsed` de
 * `transactionDraftSnapshotSchema` ile ayrıştırıldığı için iki taraf aynı
 * alan kümesini karşılaştırır; evidence yüzünden sahte "düzeltildi" çıkmaz.
 */
function toDraftSnapshot(item: ApproveDraftItem): TransactionDraftSnapshot {
	return {
		kind: item.kind,
		amount: item.amount,
		currency: item.currency,
		counterparty_amount: item.counterparty_amount,
		title: item.title,
		category: item.category,
		subcategory: item.subcategory,
		contact_id: item.contact_id,
		contact_display_name: item.contact_display_name,
		contact_label: item.contact_label,
		occurred_on: item.occurred_on,
		payment_method: item.payment_method,
		description: item.description
	};
}

@Injectable()
export class WhatsappService {
	private readonly logger = new Logger(WhatsappService.name);

	constructor(
		private readonly contactsService: ContactsService,
		private readonly tenantContext: TenantContextService,
		private readonly transactionsService: TransactionsService,
		private readonly settings: SettingsService,
		private readonly whatsappChats: WhatsappChatsService,
		private readonly messageContacts: MessageContactsService,
		private readonly inboundMedia: InboundMediaService,
		private readonly driveMirror: DriveMirrorEnqueueService,
		@Inject(LLM_CLIENT) private readonly llm: LlmClient
	) {}

	async parseMessage(tenantId: string, message: string) {
		const { items: patients } = await this.contactsService.list(tenantId, {
			limit: 100
		});
		const tenantPromptNote = await this.resolveTenantPromptNote(tenantId);
		const knowledge = await this.resolveKnowledge(tenantId);
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const result = await this.llm.parseTransactionDrafts({
				message,
				patients,
				tenantPromptNote,
				knowledge
			});
			await writeLlmParseLedger(db, tenantId, result.usage);
			return result.records;
		});
	}

	async listInbox(tenantId: string, params: { cursor?: string; limit: number }) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const cursorCond = createdAtCursorCondition(
				inboundMessages.createdAt,
				inboundMessages.id,
				params.cursor
			);
			const rows = await db
				.select()
				.from(inboundMessages)
				.where(cursorCond)
				.orderBy(desc(inboundMessages.createdAt), desc(inboundMessages.id))
				.limit(params.limit + 1);

			const page = buildCursorPage(rows, params.limit);
			const named = await this.decorateWithDb(db, page.items);
			return {
				// AI-13: aynı olayı anlatan mesajlar `group_id` ile işaretlenir; kayıt değişmez.
				messages: groupInboundMessages(named),
				next_cursor: page.next_cursor
			};
		});
	}

	/**
	 * Satırdan API mesajına: grup adı + tür + bahsedilen kişiler.
	 *
	 * Grup adı webhook gövdesinde gelmiyor (WAHA NOWEB); Ayarlar'daki sohbet
	 * defterinden okunur. Defterde yoksa `chat_name` null kalır ve arayüz
	 * kimliği gösterir — uydurma ad yazmaktansa. Kişi bağları (KISI-01) ayrı
	 * tabloda; sayfa başına tek sorguyla eklenir.
	 */
	private async decorateWithDb(db: TenantDb, rows: InboundMessageRow[]): Promise<InboundMessage[]> {
		const directory = await this.whatsappChats.directoryWithDb(db);
		const ids = rows.map((r) => r.id);
		const links = await this.messageContacts.contactsForMessagesWithDb(db, ids);
		const media = await this.inboundMedia.forMessagesWithDb(db, ids);
		return rows.map((row) => {
			const message: InboundMessage = {
				...toInboundMessage(row),
				contacts: links.get(row.id) ?? [],
				media: media.get(row.id) ?? null
			};
			const entry = message.chat_id ? directory.get(message.chat_id) : undefined;
			if (!entry) return message;
			// Grubun görevi biliniyorsa tür yeniden hesaplanır: işaretsiz mesaj
			// artık "anlaşılmadı" değil, grubun varsayılanı olur.
			const turler = turleriBul(message.body, entry.purpose as WhatsappChatPurpose);
			return {
				...message,
				chat_name: entry.name,
				message_kinds: turler.turler,
				message_kind_signals: turler.isaretler
			};
		});
	}

	/**
	 * KISI-01: kişinin adı geçen mesajlar, gruptan bağımsız, yeniden eskiye.
	 * Kişi Akışı'nın WhatsApp satırları buradan gelir.
	 */
	async listInboxByContact(
		tenantId: string,
		contactId: string,
		params: { cursor?: string; limit: number }
	) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const cursorCond = createdAtCursorCondition(
				inboundMessages.createdAt,
				inboundMessages.id,
				params.cursor
			);
			const rows = await db
				.select({
					id: inboundMessages.id,
					tenantId: inboundMessages.tenantId,
					provider: inboundMessages.provider,
					externalId: inboundMessages.externalId,
					payload: inboundMessages.payload,
					status: inboundMessages.status,
					createdAt: inboundMessages.createdAt
				})
				.from(inboundMessages)
				.innerJoin(
					inboundMessageContacts,
					eq(inboundMessageContacts.inboundMessageId, inboundMessages.id)
				)
				.where(and(eq(inboundMessageContacts.contactId, contactId), cursorCond))
				.orderBy(desc(inboundMessages.createdAt), desc(inboundMessages.id))
				.limit(params.limit + 1);

			const page = buildCursorPage(rows, params.limit);
			return {
				messages: await this.decorateWithDb(db, page.items),
				next_cursor: page.next_cursor
			};
		});
	}

	/** KISI-01: geçmişi yeniden eşleştir (yeni kişi eklendi / kural düzeldi). */
	relinkContacts(tenantId: string) {
		return this.messageContacts.relinkAll(tenantId);
	}

	/** Bağ kurmak ana işi düşürmez: hata yalnız loglanır. */
	private async linkContactsSafely(
		db: TenantDb,
		tenantId: string,
		row: InboundMessageRow,
		adaylar: KisiAdayi[]
	): Promise<void> {
		try {
			const display = extractInboundDisplayFields(asRecord(row.payload) ?? {});
			await this.messageContacts.linkWithDb(db, tenantId, row.id, display.body, adaylar);
			// Metinsiz görsel/dosya: az önceki metinli mesajın kişilerine (bağlam).
			await this.messageContacts.linkMediaByContextWithDb(db, tenantId, row.id);
		} catch (err) {
			this.logger.warn(
				`contact link failed message=${row.id}: ${err instanceof Error ? err.message : String(err)}`
			);
		}
	}

	async getInboxItem(tenantId: string, id: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const row = await this.findRow(db, id);
			const [message] = await this.decorateWithDb(db, [row]);
			return message;
		});
	}

	/** LLM/heuristic parse of a single inbox item; stashes drafts (or an error) into `payload`. */
	async parseInboxItem(tenantId: string, id: string): Promise<{ records: TransactionDraft[] }> {
		const { items: patients } = await this.contactsService.list(tenantId, {
			limit: 100
		});
		const tenantPromptNote = await this.resolveTenantPromptNote(tenantId);
		const knowledge = await this.resolveKnowledge(tenantId);

		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const row = await this.findRow(db, id);
			const payload = asRecord(row.payload) ?? {};
			const display = extractInboundDisplayFields(payload);

			if (!display.body?.trim()) {
				await this.savePayload(db, id, payload, {
					parsed_records: null,
					parse_error: PARSE_ERROR_NO_TEXT
				});
				return { records: [] };
			}

			const result = await this.llm.parseTransactionDrafts({
				message: display.body,
				patients,
				tenantPromptNote,
				knowledge
			});
			await writeLlmParseLedger(db, tenantId, result.usage);
			const records = result.records;
			await this.savePayload(db, id, payload, {
				parsed_records: records.length > 0 ? records : null,
				parse_error: records.length === 0 ? PARSE_ERROR_NO_MATCH : null
			});
			return { records };
		});
	}

	/**
	 * Process one inbound message (queue worker + shared with batch process).
	 * Idempotent: only `status === 'new'` rows are parsed; otherwise `skipped`.
	 */
	async processInboundMessage(
		tenantId: string,
		inboundMessageId: string
	): Promise<ProcessInboundOutcome> {
		const { items: patients } = await this.contactsService.list(tenantId, {
			limit: 100
		});
		const tenantPromptNote = await this.resolveTenantPromptNote(tenantId);
		const knowledge = await this.resolveKnowledge(tenantId);

		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const row = await this.findRow(db, inboundMessageId);
			if (row.status !== 'new') {
				return 'skipped';
			}
			const outcome = await this.processNewInboundRow(
				db,
				row,
				patients,
				tenantPromptNote,
				knowledge
			);
			// KISI-01: para ayrıştırması ne derse desin, mesaj bahsettiği kişilere bağlanır.
			await this.linkContactsSafely(
				db,
				tenantId,
				row,
				await this.messageContacts.directoryWithDb(db)
			);
			return outcome;
		});
	}

	/** Parse every `new` message with text; skips media-only messages. Does not create transactions. */
	async processInbox(tenantId: string): Promise<InboundMessageProcessResponse> {
		const { items: patients } = await this.contactsService.list(tenantId, {
			limit: 100
		});
		const tenantPromptNote = await this.resolveTenantPromptNote(tenantId);
		const knowledge = await this.resolveKnowledge(tenantId);

		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await db.select().from(inboundMessages).where(eq(inboundMessages.status, 'new'));

			let processed = 0;
			let parsed = 0;
			let error = 0;
			const adaylar = await this.messageContacts.directoryWithDb(db);

			for (const row of rows) {
				const payload = asRecord(row.payload) ?? {};
				const display = extractInboundDisplayFields(payload);
				// Batch endpoint historically skipped media-only without status change.
				if (!display.body?.trim()) continue;

				processed++;
				const outcome = await this.processNewInboundRow(
					db,
					row,
					patients,
					tenantPromptNote,
					knowledge
				);
				if (outcome === 'parsed') parsed++;
				else if (outcome === 'error') error++;
				await this.linkContactsSafely(db, tenantId, row, adaylar);
			}

			return { processed, parsed, error };
		});
	}

	/**
	 * "Kişi bilgisi" mesajından yeni kişi: kayıt açılır, bu mesaj ona `manual`
	 * bağlanır, ardından aynı yazarın 3 dk içindeki görsel/dosya mesajları da
	 * bağlamdan bağlanır (bilet görselleri). Kişi açmak insan onayıdır; model
	 * yalnız formu doldurmuştu.
	 */
	async createContactFromMessageWithDb(
		db: TenantDb,
		tenantId: string,
		inboundMessageId: string,
		input: WhatsappCreateContact
	): Promise<InboundMessageCreateContactResponse> {
		const row = await this.findRow(db, inboundMessageId);
		const contact = await this.contactsService.createWithDb(db, tenantId, input);
		await db
			.insert(inboundMessageContacts)
			.values({
				tenantId,
				inboundMessageId: row.id,
				contactId: contact.id,
				method: 'manual',
				matchedText: 'kişi bu mesajdan açıldı'
			})
			.onConflictDoNothing();
		const media = await this.messageContacts.linkMediaByContextWithDb(db, tenantId, null);
		// DRIVE-01: kişi bu mesajdan açıldı — mesajın eki varsa yeni klasöre kopyalansın.
		await this.driveMirror.enqueueSync(db, tenantId, row.id);
		return { contact, linked_messages: 1 + media };
	}

	/** Marks inbox item approved only — does not auto-create transactions (POST /v1/transactions). */
	async approveInboxItem(tenantId: string, id: string): Promise<InboundMessageActionResponse> {
		return this.setStatus(tenantId, id, 'approved');
	}

	/**
	 * MONEY-01: atomically insert transactions + optional ai_correction + mark inbox approved.
	 * Must run inside IdempotencyService.run so the whole unit shares one DB transaction.
	 */
	async approveDraftsWithDb(
		db: TenantDb,
		tenantId: string,
		inboxId: string,
		input: ApproveDraftsRequest,
		actor: AuditActor
	): Promise<ApproveDraftsResponse> {
		const inboxRow = await this.findRow(db, inboxId);

		// AI-13: aynı mesaj iki kez onaylanamaz. `@Idempotent()` yalnız aynı
		// Idempotency-Key'li tekrarı yakalar; yeni anahtarla gelen ikinci onay
		// oraya takılmaz ve aynı gideri ikinci kez yazardı.
		if (inboxRow.status === 'approved') {
			throw new ConflictException({
				error: {
					code: 'conflict',
					message: 'Inbound message already approved'
				}
			});
		}

		// AI-09: iz sunucudaki taslaktan okunur, istek gövdesinden DEĞİL.
		// Satır sayısı tutmuyorsa (kullanıcı taslak eklemiş/çıkarmışsa) sıra
		// eşleştirmesi güvenilmez — iz yazılmaz, kaynak mesaj bağı yine kalır.
		const storedDrafts = extractParsedRecords(asRecord(inboxRow.payload) ?? {});
		const alignedDrafts =
			storedDrafts && storedDrafts.length === input.drafts.length ? storedDrafts : null;

		const created = [];
		for (const [index, draft] of input.drafts.entries()) {
			const source: TransactionSource = {
				inboundMessageId: inboxId,
				evidence: alignedDrafts ? evidenceForApprovedDraft(alignedDrafts[index], draft) : null
			};
			const tx = await this.transactionsService.createWithDb(
				db,
				tenantId,
				{
					kind: draft.kind,
					title: draft.title.trim(),
					subtitle: null,
					category: draft.category ?? null,
					occurred_on: draft.occurred_on,
					status: draft.status,
					invoice_status: 'none',
					payment_method: draft.payment_method ?? null,
					amount: draft.amount,
					paid_amount: draft.paid_amount,
					currency: draft.currency,
					contact_id: draft.contact_id ?? null,
					contact_label: draft.contact_label ?? null,
					case_contact_id: null,
					responsible_contact_id: null,
					amount_base: draft.amount_base,
					base_currency: null,
					fx_rate: draft.fx_rate,
					fx_dated: draft.occurred_on,
					description: draft.description ?? null
				},
				actor,
				source
			);
			created.push(tx);
		}

		let correctionId: string | null = null;
		const corrected = input.drafts.map(toDraftSnapshot);
		if (input.original_parsed && input.original_parsed.length > 0) {
			const changed = JSON.stringify(input.original_parsed) !== JSON.stringify(corrected);
			if (changed) {
				const [row] = await db
					.insert(aiCorrections)
					.values({
						tenantId,
						inboundMessageId: inboxId,
						originalParsed: input.original_parsed,
						corrected,
						createdBy: actor.actorId
					})
					.returning({ id: aiCorrections.id });
				correctionId = row?.id ?? null;
			}
		}

		await db
			.update(inboundMessages)
			.set({ status: 'approved' })
			.where(eq(inboundMessages.id, inboxId));

		return {
			id: inboxId,
			status: 'approved',
			transactions: created,
			correction_id: correctionId
		};
	}

	async ignoreInboxItem(tenantId: string, id: string): Promise<InboundMessageActionResponse> {
		return this.setStatus(tenantId, id, 'ignored');
	}

	/** Kuyruk temizliği: insanın yapacağı işi olmayan satır; akışta kalır, kuyrukta değil. */
	async archiveInboxItem(tenantId: string, id: string): Promise<void> {
		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await db
				.update(inboundMessages)
				.set({ status: 'archived' })
				.where(and(eq(inboundMessages.id, id), eq(inboundMessages.status, 'parsed')));
		});
	}

	/**
	 * "Okunmayacak grup"tan gelen mesaj: ayrıştırma yok, satır `ignored`; yalnız
	 * kişi bağı kurulur (kural tabanlı, modele gitmez). Zaten işlenmiş satıra dokunmaz.
	 */
	async markIgnoredAndLink(tenantId: string, inboundMessageId: string): Promise<void> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const row = await this.findRow(db, inboundMessageId);
			if (row.status === 'new') {
				await db
					.update(inboundMessages)
					.set({ status: 'ignored' })
					.where(eq(inboundMessages.id, row.id));
			}
			await this.linkContactsSafely(
				db,
				tenantId,
				row,
				await this.messageContacts.directoryWithDb(db)
			);
		});
	}

	/**
	 * Shared parse path for a `new` row. Media-only → parsed with error text (worker must complete).
	 */
	private async processNewInboundRow(
		db: TenantDb,
		row: InboundMessageRow,
		patients: Contact[],
		tenantPromptNote: string | null,
		knowledge: string | null
	): Promise<'parsed' | 'error'> {
		const payload = asRecord(row.payload) ?? {};
		const display = extractInboundDisplayFields(payload);

		if (!display.body?.trim()) {
			await this.savePayload(db, row.id, payload, {
				parsed_records: null,
				parse_error: PARSE_ERROR_NO_TEXT
			});
			return 'error';
		}

		const result = await this.llm.parseTransactionDrafts({
			message: display.body,
			patients,
			tenantPromptNote,
			knowledge
		});
		await writeLlmParseLedger(db, row.tenantId, result.usage);
		const records = result.records;
		const isError = records.length === 0;
		await this.savePayload(db, row.id, payload, {
			parsed_records: isError ? null : records,
			parse_error: isError ? PARSE_ERROR_NO_MATCH : null
		});
		return isError ? 'error' : 'parsed';
	}

	/** AI-01: dolu bölümlerden tek bağlam metni; bilgi bankası boşsa null (prompt'a hiçbir şey eklenmez). */
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

	private async setStatus(
		tenantId: string,
		id: string,
		status: InboundMessageStatus
	): Promise<InboundMessageActionResponse> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await this.findRow(db, id);
			await db.update(inboundMessages).set({ status }).where(eq(inboundMessages.id, id));
			return { success: true, id, status };
		});
	}

	private async savePayload(
		db: TenantDb,
		id: string,
		payload: Record<string, unknown>,
		patch: {
			parsed_records: TransactionDraft[] | null;
			parse_error: string | null;
		}
	) {
		await db
			.update(inboundMessages)
			.set({ status: 'parsed', payload: mergeParsedPayload(payload, patch) })
			.where(eq(inboundMessages.id, id));
	}

	private async findRow(db: TenantDb, id: string): Promise<InboundMessageRow> {
		const [row] = await db
			.select()
			.from(inboundMessages)
			.where(eq(inboundMessages.id, id))
			.limit(1);

		if (!row) {
			throw new NotFoundException('Inbound message not found');
		}

		return row;
	}
}
