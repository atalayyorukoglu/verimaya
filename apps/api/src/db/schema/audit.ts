import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { createdAt } from './helpers';
import { tenants } from './tenants';

export const auditLogs = pgTable(
	'audit_logs',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		actorId: uuid('actor_id').references(() => user.id, { onDelete: 'set null' }),
		actorDisplayName: text('actor_display_name').notNull(),
		action: text('action').notNull(),
		entityType: text('entity_type').notNull(),
		entityLabel: text('entity_label'),
		createdAt: createdAt()
	},
	(table) => [index('audit_logs_tenant_id_created_at_idx').on(table.tenantId, table.createdAt)]
);

export type AuditLogRow = typeof auditLogs.$inferSelect;
export type NewAuditLogRow = typeof auditLogs.$inferInsert;
