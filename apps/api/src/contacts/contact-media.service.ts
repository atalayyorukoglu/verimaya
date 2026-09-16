import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ContactMedia, ContactMediaUpdate } from '@verimaya/shared';
import { contactVisits } from '../db/schema/contact-visits';
import { inboundMessageContacts } from '../db/schema/inbound-message-contacts';
import { inboundMessageMedia } from '../db/schema/inbound-message-media';
import { contacts } from '../db/schema/contacts';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

/**
 * EVRAK-01 — kişinin WhatsApp ekleri (Kişi › Dosyalar sekmesi) ve elle düzeltme.
 *
 * `whatsapp/` altında değil `contacts/` altında duruyor: WhatsApp modülü zaten
 * `ContactsModule`'ü içeri alıyor, ters yön döngü olurdu. Zaten iş de kişi
 * tarafında — "bu hastanın belgeleri", ekin nereden geldiğinden bağımsız.
 */
@Injectable()
export class ContactMediaService {
	constructor(private readonly tenantContext: TenantContextService) {}

	/** `GET /v1/contacts/:id/media` — kişi yoksa 404, ek yoksa boş liste. */
	async list(tenantId: string, contactId: string): Promise<{ items: ContactMedia[] }> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [contact] = await db
				.select({ id: contacts.id })
				.from(contacts)
				.where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
				.limit(1);
			if (!contact) {
				throw new NotFoundException({ error: { code: 'not_found', message: 'Contact not found' } });
			}
			return { items: await this.listForContactWithDb(db, contactId) };
		});
	}

	/**
	 * EVRAK-01 — kişinin WhatsApp ekleri (Kişi › Dosyalar sekmesi).
	 *
	 * `files` tablosundaki elle yüklenen belgelerden ayrı bir liste: kaynağı WhatsApp
	 * mesajıdır, tür ve vizit sınıflandırmadan gelir. Küçük önizleme WhatsApp'ın
	 * mesajla gönderdiği `jpegThumbnail`'dır — tam dosya İNDİRİLMEZ, yalnız o alan
	 * JSON'dan çekilir; 40 ekli bir kişide yanıt megabaytlara çıkmasın.
	 */
	async listForContactWithDb(db: TenantDb, contactId: string): Promise<ContactMedia[]> {
		const jsonBody = sql.raw(
			`coalesce(nullif(btrim(msg.payload->'payload'->>'body'), ''), nullif(btrim(msg.payload->'payload'->>'caption'), ''), nullif(btrim(msg.payload->>'body'), ''))`
		);
		const thumb = sql.raw(
			`coalesce(` +
				['imageMessage', 'videoMessage', 'documentMessage', 'stickerMessage']
					.map((k) => `msg.payload->'payload'->'_data'->'message'->'${k}'->>'jpegThumbnail'`)
					.join(', ') +
				`)`
		);
		const rows = await db.execute(sql`
			select
				media.id,
				media.inbound_message_id,
				media.filename,
				media.mime_type,
				media.size_bytes,
				media.doc_type,
				media.doc_subtype,
				media.visit_hint,
				media.contact_visit_id,
				media.created_at,
				${jsonBody} as caption,
				${thumb} as thumbnail
			from inbound_message_media media
			join inbound_messages msg on msg.id = media.inbound_message_id
			join inbound_message_contacts link on link.inbound_message_id = media.inbound_message_id
			where link.contact_id = ${contactId}::uuid
			order by media.created_at asc
		`);

		return [...rows].map((r) => {
			const thumbnail = r.thumbnail as string | null;
			return {
				id: String(r.id),
				inbound_message_id: String(r.inbound_message_id),
				filename: (r.filename as string | null) ?? null,
				mime_type: String(r.mime_type),
				size_bytes: Number(r.size_bytes),
				doc_type: (r.doc_type as ContactMedia['doc_type']) ?? null,
				doc_subtype: (r.doc_subtype as ContactMedia['doc_subtype']) ?? null,
				visit_hint: (r.visit_hint as ContactMedia['visit_hint']) ?? null,
				contact_visit_id: (r.contact_visit_id as string | null) ?? null,
				caption: ((r.caption as string | null) ?? null)?.slice(0, 400) ?? null,
				thumbnail:
					thumbnail && thumbnail.length > 0 && thumbnail.length <= 150_000
						? `data:image/jpeg;base64,${thumbnail}`
						: null,
				created_at: new Date(r.created_at as string).toISOString()
			};
		});
	}

	/**
	 * Elle düzeltme (`PATCH /v1/whatsapp/media/:id`). Sınıflandırıcı %5 başlıkta
	 * tür bulamıyor, vizit eşlemesi de belirsizde boş bırakıyor — o boşluğu insan
	 * kapatır. Vizit verilirse ekin bağlı olduğu kişiye ait olduğu doğrulanır:
	 * başka kişinin vizitine ek taşınamaz.
	 */
	async updateClassificationWithDb(
		db: TenantDb,
		mediaId: string,
		input: ContactMediaUpdate
	): Promise<ContactMedia> {
		const [row] = await db
			.select({ id: inboundMessageMedia.id, messageId: inboundMessageMedia.inboundMessageId })
			.from(inboundMessageMedia)
			.where(eq(inboundMessageMedia.id, mediaId))
			.limit(1);
		if (!row) {
			throw new NotFoundException({ error: { code: 'not_found', message: 'Ek bulunamadı' } });
		}

		if (input.contact_visit_id) {
			const [ok] = await db
				.select({ id: contactVisits.id })
				.from(contactVisits)
				.innerJoin(
					inboundMessageContacts,
					eq(inboundMessageContacts.contactId, contactVisits.contactId)
				)
				.where(
					and(
						eq(contactVisits.id, input.contact_visit_id),
						eq(inboundMessageContacts.inboundMessageId, row.messageId)
					)
				)
				.limit(1);
			if (!ok) {
				throw new BadRequestException({
					error: {
						code: 'visit_not_linked',
						message: 'Vizit, ekin bağlı olduğu kişilerden birine ait değil'
					}
				});
			}
		}

		const patch: Partial<typeof inboundMessageMedia.$inferInsert> = {};
		if (input.doc_type !== undefined) patch.docType = input.doc_type ?? null;
		if (input.doc_subtype !== undefined) patch.docSubtype = input.doc_subtype ?? null;
		if (input.contact_visit_id !== undefined) {
			patch.contactVisitId = input.contact_visit_id ?? null;
		}
		if (Object.keys(patch).length > 0) {
			await db.update(inboundMessageMedia).set(patch).where(eq(inboundMessageMedia.id, mediaId));
		}

		const [contact] = await db
			.select({ contactId: inboundMessageContacts.contactId })
			.from(inboundMessageContacts)
			.where(eq(inboundMessageContacts.inboundMessageId, row.messageId))
			.limit(1);
		const items = contact ? await this.listForContactWithDb(db, contact.contactId) : [];
		const updated = items.find((m) => m.id === mediaId);
		if (updated) return updated;
		// Ek hiçbir kişiye bağlı değilse liste boş döner; künyeyi tek satırdan kur.
		const [fresh] = await db
			.select()
			.from(inboundMessageMedia)
			.where(eq(inboundMessageMedia.id, mediaId))
			.limit(1);
		return {
			id: fresh!.id,
			inbound_message_id: fresh!.inboundMessageId,
			filename: fresh!.filename,
			mime_type: fresh!.mimeType,
			size_bytes: fresh!.sizeBytes,
			doc_type: fresh!.docType ?? null,
			doc_subtype: fresh!.docSubtype ?? null,
			visit_hint: fresh!.visitHint ?? null,
			contact_visit_id: fresh!.contactVisitId ?? null,
			caption: null,
			thumbnail: null,
			created_at: fresh!.createdAt.toISOString()
		};
	}
}
