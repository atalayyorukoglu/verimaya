import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/**
 * AI-11a — Maya soru kaydı. AI-11b'nin tek girdisi: hangi soru soruldu, hangi araca
 * düştü (ya da düşmedi), cevaplanabildi mi.
 *
 * **PII girmez.** `questionMasked` maskelenmiş metindir; ham soru saklanmaz.
 * Denetim kaydı olduğu için UPDATE grant'i bilinçli olarak verilmedi (0061).
 */
export const mayaQuestions = pgTable(
	'maya_questions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		questionMasked: text('question_masked').notNull(),
		/** `MayaToolName` ya da null (bilgi bankası / eşleşme yok). */
		tool: text('tool'),
		answered: boolean('answered').notNull(),
		/** `'knowledge' | 'tool' | 'unknown'` — `MayaAnswer.source` ile aynı küme. */
		source: text('source').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		index('maya_questions_tenant_id_created_at_idx').on(table.tenantId, table.createdAt),
		index('maya_questions_tenant_id_tool_created_at_idx').on(
			table.tenantId,
			table.tool,
			table.createdAt
		)
	]
);

export type MayaQuestionRow = typeof mayaQuestions.$inferSelect;
export type NewMayaQuestionRow = typeof mayaQuestions.$inferInsert;
