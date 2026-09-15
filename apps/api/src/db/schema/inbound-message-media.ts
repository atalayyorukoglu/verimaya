import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { inboundMessages } from './inbound-messages';
import { tenants } from './tenants';

/**
 * WAHA-01 — gelen WhatsApp mesajının eki (görsel/PDF/ses). Baytlar depoda
 * (`storage_key`), burada yalnız künye. Mesaj silinince ek de gider.
 */
export const inboundMessageMedia = pgTable(
	'inbound_message_media',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		inboundMessageId: uuid('inbound_message_id')
			.notNull()
			.references(() => inboundMessages.id, { onDelete: 'cascade' }),
		filename: text('filename'),
		mimeType: text('mime_type').notNull(),
		sizeBytes: integer('size_bytes').notNull(),
		/** Aynı dosya ikinci kez gelirse (WAHA yeniden deneme) yazılmaz. */
		sha256: text('sha256').notNull(),
		storageKey: text('storage_key').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('inbound_message_media_tenant_message_uidx').on(
			table.tenantId,
			table.inboundMessageId
		)
	]
);

export type InboundMessageMediaRow = typeof inboundMessageMedia.$inferSelect;
