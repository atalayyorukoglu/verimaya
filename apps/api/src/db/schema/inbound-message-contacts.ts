import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { contacts } from './contacts';
import { inboundMessages } from './inbound-messages';
import { tenants } from './tenants';

/**
 * KISI-01 — WhatsApp mesajı hangi kişilerden bahsediyor?
 *
 * Kişi Akışı'nın ham maddesi: kişinin adı geçen her mesaj (hangi gruptan geldiği
 * fark etmez) buraya bağlanır. `method` bağı hangi kuralın kurduğunu söyler:
 *   exact   — görünen ad metinde aynen geçiyor
 *   name    — ad ve soyad ikisi de geçiyor (ek almış hâli dahil: "McLeoda")
 *   surname — yalnız soyad (KAPALI: kayıttaki soyad alanı güvenilmez çıktı, 2026-09-15)
 *   model   — LLM bağladı (henüz kullanılmıyor)
 *   manual  — kullanıcı bağladı / düzeltti
 */
export const inboundMessageContacts = pgTable(
	'inbound_message_contacts',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		inboundMessageId: uuid('inbound_message_id')
			.notNull()
			.references(() => inboundMessages.id, { onDelete: 'cascade' }),
		contactId: uuid('contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'cascade' }),
		method: text('method').notNull(),
		/** Metinde eşleşen parça — "neden bu kişiye bağladın" cevabı. */
		matchedText: text('matched_text'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('inbound_message_contacts_tenant_message_contact_uidx').on(
			table.tenantId,
			table.inboundMessageId,
			table.contactId
		),
		index('inbound_message_contacts_tenant_contact_created_idx').on(
			table.tenantId,
			table.contactId,
			table.createdAt
		),
		index('inbound_message_contacts_tenant_message_idx').on(table.tenantId, table.inboundMessageId)
	]
);

export type InboundMessageContactRow = typeof inboundMessageContacts.$inferSelect;
export type NewInboundMessageContactRow = typeof inboundMessageContacts.$inferInsert;
