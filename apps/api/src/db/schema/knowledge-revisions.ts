import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { createdAt } from './helpers';

/**
 * AI-06 — bilgi bankası sürüm geçmişi.
 *
 * Her kaydetmede bir satır eklenir; satır asla güncellenmez veya silinmez (GRANT'te
 * yalnız SELECT + INSERT var). Sebep: bu bir kanıt kaydı — "o tarihte bilgi bankasında
 * ne yazıyordu" sorusuna cevap verir. Değiştirilebilir olsaydı kanıt değeri kalmazdı.
 */
export const knowledgeRevisions = pgTable(
	'knowledge_revisions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' }),
		sections: jsonb('sections').notNull(),
		changedBy: text('changed_by'),
		createdAt: createdAt()
	},
	(table) => [index('knowledge_revisions_tenant_created_at_idx').on(table.tenantId, table.createdAt)]
);

export type KnowledgeRevisionRow = typeof knowledgeRevisions.$inferSelect;
