import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { MediaDocSubtype, MediaDocType, MediaVisitHint } from '@verimaya/shared';
import { contactVisits } from './contact-visits';
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
		/**
		 * EVRAK-01 — başlıktan çıkarılan belge türü (`media-doc.ts` sözlüğü). Sözlük
		 * ürün kararıyla büyüdüğü için DB'de CHECK kısıtı yok; doğrulama şemada.
		 * Sınıflandırılamamış eski satırlarda `null`, tanınmamış başlıkta `'other'`.
		 */
		docType: text('doc_type').$type<MediaDocType>(),
		/** Yalnız `consent_form` için dolar (vizit onamı / anestezi / media release…). */
		docSubtype: text('doc_subtype').$type<MediaDocSubtype>(),
		/** Başlıkta geçen vizit ("visit 2", "rpt"); vizitle EŞLEŞME değil, ipucu. */
		visitHint: text('visit_hint').$type<MediaVisitHint>(),
		/**
		 * Ekin düştüğü vizit. Tarih aralığından tek adayla eşleşince dolar, birden
		 * fazla vizit uyarsa boş kalır — sistem tahmin etmez, kullanıcı düzeltir.
		 */
		contactVisitId: uuid('contact_visit_id').references(() => contactVisits.id, {
			onDelete: 'set null'
		}),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('inbound_message_media_tenant_message_uidx').on(
			table.tenantId,
			table.inboundMessageId
		),
		index('inbound_message_media_tenant_visit_type_idx').on(
			table.tenantId,
			table.contactVisitId,
			table.docType
		),
		index('inbound_message_media_tenant_doc_type_idx').on(table.tenantId, table.docType)
	]
);

export type InboundMessageMediaRow = typeof inboundMessageMedia.$inferSelect;
