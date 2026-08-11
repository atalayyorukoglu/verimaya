import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { contacts } from './contacts';
import { createdAt } from './helpers';
import { tenants } from './tenants';

export const caseNotes = pgTable(
	'case_notes',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		contactId: uuid('contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'cascade' }),
		body: text('body').notNull(),
		authorDisplayName: text('author_display_name').notNull(),
		createdAt: createdAt()
	},
	(table) => [
		index('case_notes_tenant_id_created_at_idx').on(table.tenantId, table.createdAt),
		index('case_notes_tenant_id_contact_id_created_at_idx').on(
			table.tenantId,
			table.contactId,
			table.createdAt
		)
	]
);

export type CaseNoteRow = typeof caseNotes.$inferSelect;
export type NewCaseNoteRow = typeof caseNotes.$inferInsert;
