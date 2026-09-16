import type { ContactSummaryMissing, ContactSummarySentence } from '@verimaya/shared';
import {
	boolean,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { contacts } from './contacts';
import { tenants } from './tenants';

/**
 * KISI-01 adım 3 — kişi özeti önbelleği. Türetilmiş veri: kaynak akış değişince
 * (`inputFingerprint` tutmayınca) yeniden yazılır; elle düzenlenmez.
 */
export const contactSummaries = pgTable(
	'contact_summaries',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		contactId: uuid('contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'cascade' }),
		sentences: jsonb('sentences').$type<ContactSummarySentence[]>().notNull().default([]),
		/**
		 * KISI-02 — hasta akışı kontrol listesinde karşılığı bulunamayan maddeler.
		 * Kişi türü Hasta değilse hep boş; şablon değişince parmak izi de değişir.
		 */
		missing: jsonb('missing').$type<ContactSummaryMissing[]>().notNull().default([]),
		/** Özete giren kayıtların kimlik+güncelleme damgası; değişince özet bayatlar. */
		inputFingerprint: text('input_fingerprint').notNull(),
		inputCount: integer('input_count').notNull().default(0),
		model: text('model'),
		heuristic: boolean('heuristic').notNull().default(false),
		generatedAt: timestamp('generated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(table) => [
		uniqueIndex('contact_summaries_tenant_contact_uidx').on(table.tenantId, table.contactId)
	]
);

export type ContactSummaryRow = typeof contactSummaries.$inferSelect;
export type NewContactSummaryRow = typeof contactSummaries.$inferInsert;
