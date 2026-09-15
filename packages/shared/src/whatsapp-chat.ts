import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

/**
 * Sohbetin ne işe yaradığı. Ayrıştırıcıya "bu grupta ne aransın" der; metin
 * yine okunur, bu yalnız önceliği belirler.
 *
 *   finance    — para/ödeme grubu
 *   operations — randevu, otel, transfer, klinik
 *   mixed      — ikisi de geçer (varsayılan)
 *   ignore     — hiç işlenmesin
 */
export const whatsappChatPurposeSchema = z.enum(['finance', 'operations', 'mixed', 'ignore']);
export type WhatsappChatPurpose = z.infer<typeof whatsappChatPurposeSchema>;

export const whatsappChatSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	/** WAHA sohbet kimliği: `…@g.us` (grup) / `…@c.us` (birebir). */
	chat_id: z.string().min(1).max(255),
	name: z.string().min(1).max(128),
	purpose: whatsappChatPurposeSchema,
	/** Bu sohbetten gelmiş mesaj sayısı — adlandırılmamışları sıralamak için. */
	message_count: z.number().int().nonnegative().default(0),
	created_at: isoDateTime,
	updated_at: isoDateTime
});
export type WhatsappChat = z.infer<typeof whatsappChatSchema>;

export const whatsappChatCreateSchema = z
	.object({
		chat_id: z.string().min(1).max(255),
		name: z.string().min(1).max(128),
		purpose: whatsappChatPurposeSchema.default('mixed')
	})
	.strict();
export type WhatsappChatCreate = z.infer<typeof whatsappChatCreateSchema>;

export const whatsappChatUpdateSchema = z
	.object({
		name: z.string().min(1).max(128).optional(),
		purpose: whatsappChatPurposeSchema.optional()
	})
	.strict()
	.refine((v) => v.name !== undefined || v.purpose !== undefined, {
		message: 'name veya purpose verilmeli'
	});
export type WhatsappChatUpdate = z.infer<typeof whatsappChatUpdateSchema>;

/**
 * Henüz adlandırılmamış sohbet: gelen kutusunda görülmüş ama `whatsapp_chats`
 * içinde karşılığı yok. Ayarlar ekranı bunları "adlandır" olarak listeler —
 * kullanıcının kimliği elle kopyalaması gerekmesin.
 */
export const whatsappChatUnnamedSchema = z.object({
	chat_id: z.string().min(1).max(255),
	message_count: z.number().int().nonnegative(),
	/** Bu sohbetten gelen en son mesajın gövdesi — hangi grup olduğunu tanımaya yarar. */
	last_body: z.string().max(280).nullable(),
	last_at: isoDateTime
});
export type WhatsappChatUnnamed = z.infer<typeof whatsappChatUnnamedSchema>;

export const whatsappChatListResponseSchema = z.object({
	items: z.array(whatsappChatSchema),
	unnamed: z.array(whatsappChatUnnamedSchema)
});
export type WhatsappChatListResponse = z.infer<typeof whatsappChatListResponseSchema>;
