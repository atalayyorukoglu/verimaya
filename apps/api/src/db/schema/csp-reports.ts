/**
 * Browser CSP violation reports (panel Report-Only).
 *
 * INTENTIONAL EXCEPTION to multi-tenant rules (AGENTS.md §1):
 * - No `tenant_id` — the reporting browser has no session / tenant context.
 * - No RLS — this is infrastructure telemetry, not customer data.
 * Access is application-enforced: unauthenticated ingest (POST) + platform-admin
 * list/clear only. Do not copy this pattern to domain/business tables.
 */
import { index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { timestamptz } from './helpers';

export const cspReports = pgTable(
	'csp_reports',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		documentUri: text('document_uri').notNull(),
		blockedUri: text('blocked_uri').notNull(),
		violatedDirective: text('violated_directive').notNull(),
		effectiveDirective: text('effective_directive'),
		disposition: text('disposition'),
		userAgentFamily: text('user_agent_family'),
		count: integer('count').notNull().default(1),
		firstSeenAt: timestamptz('first_seen_at').notNull().defaultNow(),
		lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('csp_reports_document_blocked_directive_uidx').on(
			table.documentUri,
			table.blockedUri,
			table.violatedDirective
		),
		index('csp_reports_count_last_seen_idx').on(table.count, table.lastSeenAt)
	]
);

export type CspReportRow = typeof cspReports.$inferSelect;
export type NewCspReportRow = typeof cspReports.$inferInsert;
