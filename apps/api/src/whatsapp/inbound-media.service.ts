import {
	BadRequestException,
	Inject,
	Injectable,
	NotFoundException,
	PayloadTooLargeException,
	UnsupportedMediaTypeException
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { and, eq, inArray } from 'drizzle-orm';
import type { InboundMessageMedia } from '@verimaya/shared';
import { inboundMessageMedia } from '../db/schema/inbound-message-media';
import { inboundMessages } from '../db/schema/inbound-messages';
import { FILE_STORAGE, MAX_UPLOAD_BYTES, type FileStoragePort } from '../storage/storage.types';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

/** WhatsApp'ta gelen ve saklamaya değer türler; başkası reddedilir (yürütülebilir vb.). */
const ALLOWED_MIME =
	/^(image\/(jpeg|png|webp|gif)|application\/pdf|audio\/(ogg|mpeg|mp4)|video\/mp4)$/;

/**
 * WAHA-01 — mesaj ekini saklar ve geri verir.
 *
 * Bayt relay'den imzalı gelir (`POST /v1/webhooks/waha/media`), depoya yazılır,
 * künye `inbound_message_media`'ya. Aynı dosya ikinci kez gelirse (WAHA yeniden
 * deneme) sha256 tutar, yeniden yazılmaz. Mesaj bulunamazsa 404: relay önce
 * mesajı, sonra eki gönderir; sıra bozulursa yeniden dener.
 */
@Injectable()
export class InboundMediaService {
	constructor(
		private readonly tenantContext: TenantContextService,
		@Inject(FILE_STORAGE) private readonly storage: FileStoragePort
	) {}

	async store(
		tenantId: string,
		input: { externalId: string; mimetype: string; filename: string | null; buf: Buffer }
	): Promise<{ duplicate: boolean; inboundMessageId: string; mediaId: string }> {
		const mime = input.mimetype.trim().toLowerCase();
		if (!ALLOWED_MIME.test(mime)) {
			throw new UnsupportedMediaTypeException({
				error: { code: 'unsupported_media_type', message: `Desteklenmeyen ek türü: ${mime}` }
			});
		}
		if (input.buf.length === 0) {
			throw new BadRequestException({ error: { code: 'empty_media', message: 'Boş ek' } });
		}
		if (input.buf.length > MAX_UPLOAD_BYTES) {
			throw new PayloadTooLargeException({
				error: { code: 'media_too_large', message: 'Ek 25 MB sınırını aşıyor' }
			});
		}
		const sha256 = createHash('sha256').update(input.buf).digest('hex');

		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [msg] = await db
				.select({ id: inboundMessages.id })
				.from(inboundMessages)
				.where(
					and(
						eq(inboundMessages.provider, 'waha'),
						eq(inboundMessages.externalId, input.externalId)
					)
				)
				.limit(1);
			if (!msg) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Ekin ait olduğu mesaj bulunamadı' }
				});
			}

			const [existing] = await db
				.select()
				.from(inboundMessageMedia)
				.where(eq(inboundMessageMedia.inboundMessageId, msg.id))
				.limit(1);
			if (existing && existing.sha256 === sha256) {
				return { duplicate: true, inboundMessageId: msg.id, mediaId: existing.id };
			}

			const mediaId = existing?.id ?? randomUUID();
			const storageKey = this.storage.buildKey(tenantId, `whatsapp-${msg.id}`, mediaId);
			await this.storage.put(storageKey, input.buf, {
				contentType: mime,
				filename: input.filename ?? undefined
			});
			const values = {
				id: mediaId,
				tenantId,
				inboundMessageId: msg.id,
				filename: input.filename,
				mimeType: mime,
				sizeBytes: input.buf.length,
				sha256,
				storageKey
			};
			await db
				.insert(inboundMessageMedia)
				.values(values)
				.onConflictDoUpdate({
					target: [inboundMessageMedia.tenantId, inboundMessageMedia.inboundMessageId],
					set: values
				});
			return { duplicate: false, inboundMessageId: msg.id, mediaId };
		});
	}

	/** Liste yanıtı için: mesaj id → ek künyesi (tek sorgu). */
	async forMessagesWithDb(
		db: TenantDb,
		messageIds: string[]
	): Promise<Map<string, InboundMessageMedia>> {
		const out = new Map<string, InboundMessageMedia>();
		if (messageIds.length === 0) return out;
		const rows = await db
			.select()
			.from(inboundMessageMedia)
			.where(inArray(inboundMessageMedia.inboundMessageId, messageIds));
		for (const r of rows) {
			out.set(r.inboundMessageId, {
				id: r.id,
				filename: r.filename,
				mime_type: r.mimeType,
				size_bytes: r.sizeBytes
			});
		}
		return out;
	}

	async open(
		tenantId: string,
		inboundMessageId: string
	): Promise<{ stream: Readable; mimeType: string; filename: string; sizeBytes: number }> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db
				.select()
				.from(inboundMessageMedia)
				.where(eq(inboundMessageMedia.inboundMessageId, inboundMessageId))
				.limit(1);
			if (!row) {
				throw new NotFoundException({ error: { code: 'not_found', message: 'Ek bulunamadı' } });
			}
			const stream = await this.storage.getStream(row.storageKey);
			if (!stream) {
				throw new NotFoundException({ error: { code: 'not_found', message: 'Ek depoda yok' } });
			}
			const ext = row.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin';
			return {
				stream,
				mimeType: row.mimeType,
				filename: row.filename ?? `whatsapp-${row.id.slice(0, 8)}.${ext}`,
				sizeBytes: row.sizeBytes
			};
		});
	}
}
