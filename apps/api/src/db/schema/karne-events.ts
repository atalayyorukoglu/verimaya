/**
 * Public free-scorecard funnel tables (lead magnet).
 *
 * INTENTIONAL EXCEPTION to multi-tenant rules:
 * - No `tenant_id` — the visitor is not a tenant yet (anonymous lead).
 * - No RLS — there is no `app.current_tenant_id` for this traffic.
 * This is the single documented exception (docs/MIMARI.md § Değişmez ilkeler).
 * Do not copy this pattern to any other domain table.
 *
 * PII: no IP storage. user_agent_family is a coarse family (chrome/safari/…), not the raw UA.
 * referrer is host-only. Email (karne_leads) is KVKK-scoped — consent text lands in Adım 16.
 */
import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

export const karneSessions = pgTable(
	'karne_sessions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		/** Clinic size band: 1-4 | 5-15 | 16+ — never shown as named maturity bands. */
		band: text('band').notNull(),
		/** evet | hayir | emin-degilim */
		euExposure: text('eu_exposure').notNull(),
		completed: boolean('completed').notNull().default(false),
		zeroCount: integer('zero_count'),
		userAgentFamily: text('user_agent_family'),
		/** Referrer host only (no full URL / path / query). */
		referrer: text('referrer')
	},
	(table) => [index('karne_sessions_started_at_idx').on(table.startedAt)]
);

export const karneEvents = pgTable(
	'karne_events',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		sessionId: uuid('session_id')
			.notNull()
			.references(() => karneSessions.id, { onDelete: 'cascade' }),
		questionId: text('question_id').notNull(),
		/** viewed | answered */
		eventType: text('event_type').notNull(),
		choiceId: text('choice_id'),
		dwellMs: integer('dwell_ms'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		uniqueIndex('karne_events_session_question_type_uidx').on(
			table.sessionId,
			table.questionId,
			table.eventType
		),
		index('karne_events_session_id_idx').on(table.sessionId)
	]
);

export const karneLeads = pgTable(
	'karne_leads',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		sessionId: uuid('session_id')
			.notNull()
			.references(() => karneSessions.id, { onDelete: 'cascade' }),
		email: text('email').notNull(),
		consentAt: timestamp('consent_at', { withTimezone: true, mode: 'date' }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		uniqueIndex('karne_leads_email_uidx').on(table.email),
		index('karne_leads_session_id_idx').on(table.sessionId)
	]
);

export type KarneSessionRow = typeof karneSessions.$inferSelect;
export type NewKarneSessionRow = typeof karneSessions.$inferInsert;
export type KarneEventRow = typeof karneEvents.$inferSelect;
export type NewKarneEventRow = typeof karneEvents.$inferInsert;
export type KarneLeadRow = typeof karneLeads.$inferSelect;
export type NewKarneLeadRow = typeof karneLeads.$inferInsert;
