import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/**
 * WhatsApp sohbetinin adı ve ne işe yaradığı.
 *
 * NEDEN: WAHA'nın NOWEB motoru webhook gövdesinde grup adını göndermiyor; gelen
 * kutusu `120363143271144447@g.us` yazmak zorunda kalıyordu. Ad burada elle
 * tutuluyor — sağlayıcıdan gelmesini beklemek yerine, çünkü ikinci bir işi daha
 * var: `purpose` ayrıştırıcıya "bu grupta ne aransın" bilgisini veriyor.
 *
 * `purpose` değerleri:
 *   finance    — para/ödeme grubu (muhasebe)
 *   operations — randevu, otel, transfer, klinik
 *   mixed      — ikisi de geçer (varsayılan; sınıflandırma yalnız metne bakar)
 *   ignore     — hiç işlenmesin (özel/sohbet grubu)
 */
export const whatsappChats = pgTable(
	'whatsapp_chats',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		/** WAHA sohbet kimliği: `…@g.us` (grup) / `…@c.us` (birebir). */
		chatId: text('chat_id').notNull(),
		name: text('name').notNull(),
		purpose: text('purpose').notNull().default('mixed'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(table) => [
		index('whatsapp_chats_tenant_id_created_at_idx').on(table.tenantId, table.createdAt),
		uniqueIndex('whatsapp_chats_tenant_id_chat_id_uidx').on(table.tenantId, table.chatId)
	]
);

export type WhatsappChatRow = typeof whatsappChats.$inferSelect;
export type NewWhatsappChatRow = typeof whatsappChats.$inferInsert;
