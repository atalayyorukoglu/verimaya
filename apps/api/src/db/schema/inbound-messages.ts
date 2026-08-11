import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/** WAHA / provider inbound WhatsApp messages (source of truth). */
export const inboundMessages = pgTable(
	'inbound_messages',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		provider: text('provider').notNull().default('waha'),
		externalId: text('external_id').notNull(),
		payload: jsonb('payload').notNull(),
		status: text('status').notNull().default('new'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		uniqueIndex('inbound_messages_tenant_provider_external_uidx').on(
			table.tenantId,
			table.provider,
			table.externalId
		),
		index('inbound_messages_tenant_created_at_idx').on(table.tenantId, table.createdAt)
	]
);

export type InboundMessageRow = typeof inboundMessages.$inferSelect;
export type NewInboundMessageRow = typeof inboundMessages.$inferInsert;
