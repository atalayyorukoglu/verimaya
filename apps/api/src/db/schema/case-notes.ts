import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './helpers';
import { patients } from './patients';
import { tenants } from './tenants';

export const caseNotes = pgTable(
	'case_notes',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' }),
		patientId: uuid('patient_id')
			.notNull()
			.references(() => patients.id, { onDelete: 'cascade' }),
		body: text('body').notNull(),
		authorDisplayName: text('author_display_name').notNull(),
		createdAt: createdAt()
	},
	(table) => [
		index('case_notes_tenant_id_created_at_idx').on(table.tenantId, table.createdAt),
		index('case_notes_tenant_id_patient_id_created_at_idx').on(
			table.tenantId,
			table.patientId,
			table.createdAt
		)
	]
);

export type CaseNoteRow = typeof caseNotes.$inferSelect;
export type NewCaseNoteRow = typeof caseNotes.$inferInsert;
