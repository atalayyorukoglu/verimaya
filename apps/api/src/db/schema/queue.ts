import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/** Inbound webhook / provider event audit trail (source of truth). */
export const integrationEvents = pgTable(
	'integration_events',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		provider: text('provider').notNull(),
		externalEventId: text('external_event_id').notNull(),
		payloadHash: text('payload_hash').notNull(),
		payload: jsonb('payload').notNull(),
		status: text('status').notNull().default('received'),
		receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		/**
		 * EVENT-01 (Faz 4.2): scoped to tenant_id — provider event ids are only guaranteed
		 * unique *within* a provider's own account/location, not globally across every tenant
		 * we host. The old (provider, external_event_id) index let two tenants racing the same
		 * event id collide: the duplicate-lookup in webhooks.controller.ts is tenant-scoped via
		 * RLS, so tenant A's SELECT never saw tenant B's row, and the INSERT then hit the global
		 * unique constraint and 500'd instead of proceeding.
		 */
		uniqueIndex('integration_events_tenant_provider_external_uidx').on(
			table.tenantId,
			table.provider,
			table.externalEventId
		),
		index('integration_events_tenant_status_idx').on(table.tenantId, table.status, table.receivedAt)
	]
);

/** Outbound webhook delivery queue (n8n, customer endpoints, etc.). */
export const outboxEvents = pgTable(
	'outbox_events',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		eventType: text('event_type').notNull(),
		destinationUrl: text('destination_url').notNull(),
		payload: jsonb('payload').notNull(),
		status: text('status').notNull().default('pending'),
		attempts: integer('attempts').notNull().default(0),
		lastError: text('last_error'),
		scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
		/** Set when BullMQ retries are exhausted (`status='dead'`). Null while still retrying. */
		deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		index('outbox_events_tenant_status_idx').on(table.tenantId, table.status, table.scheduledAt)
	]
);

/** Durable job ledger mirrored alongside BullMQ (source of truth). */
export const jobs = pgTable(
	'jobs',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		queue: text('queue').notNull().default('default'),
		jobType: text('job_type').notNull(),
		payload: jsonb('payload').notNull(),
		status: text('status').notNull().default('pending'),
		bullmqJobId: text('bullmq_job_id'),
		attempts: integer('attempts').notNull().default(0),
		lastError: text('last_error'),
		scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
		completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		index('jobs_tenant_status_idx').on(table.tenantId, table.status, table.scheduledAt),
		index('jobs_bullmq_job_id_idx').on(table.bullmqJobId)
	]
);

export type IntegrationEventRow = typeof integrationEvents.$inferSelect;
export type NewIntegrationEventRow = typeof integrationEvents.$inferInsert;
export type OutboxEventRow = typeof outboxEvents.$inferSelect;
export type NewOutboxEventRow = typeof outboxEvents.$inferInsert;
export type JobRow = typeof jobs.$inferSelect;
export type NewJobRow = typeof jobs.$inferInsert;
