import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { inboundMessages } from './inbound-messages';
import { tenants } from './tenants';

/**
 * Human corrections to AI-parsed WhatsApp transaction drafts (Faz 3).
 * Source of truth for the AI learning signal — never overwritten, append-only.
 */
export const aiCorrections = pgTable(
	'ai_corrections',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		inboundMessageId: uuid('inbound_message_id').references(() => inboundMessages.id, {
			onDelete: 'set null'
		}),
		originalParsed: jsonb('original_parsed').notNull(),
		corrected: jsonb('corrected').notNull(),
		createdBy: text('created_by'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [index('ai_corrections_tenant_created_at_idx').on(table.tenantId, table.createdAt)]
);

export type AiCorrectionRow = typeof aiCorrections.$inferSelect;
export type NewAiCorrectionRow = typeof aiCorrections.$inferInsert;
