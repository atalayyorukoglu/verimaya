import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/** Tenant-configured outbound webhook destinations for the outbox delivery worker (Faz 6). */
export const webhookSubscriptions = pgTable(
	'webhook_subscriptions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' }),
		url: text('url').notNull(),
		/** Base64-encoded AES-256-GCM ciphertext produced by CryptoService. */
		secretCiphertext: text('secret_ciphertext').notNull(),
		eventTypes: text('event_types').array().notNull(),
		active: boolean('active').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		index('webhook_subscriptions_tenant_created_at_idx').on(table.tenantId, table.createdAt),
		index('webhook_subscriptions_tenant_active_idx').on(table.tenantId, table.active)
	]
);

export type WebhookSubscriptionRow = typeof webhookSubscriptions.$inferSelect;
export type NewWebhookSubscriptionRow = typeof webhookSubscriptions.$inferInsert;
