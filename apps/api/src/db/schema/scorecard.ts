import { sql } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	numeric,
	pgTable,
	smallint,
	text,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { createdUpdated, timestamptz } from './helpers';
import { tenants } from './tenants';

/**
 * Product AI scorecard (tenant-scoped, Adım 34).
 * Distinct from public free karne (`karne_*` — no tenant_id).
 * Spec §5: profile locks on first measurement; silent recalc forbidden.
 */

export const scorecardProfiles = pgTable(
	'scorecard_profiles',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		band: text('band').notNull(),
		setupS1: boolean('setup_s1').notNull(),
		setupS2: boolean('setup_s2').notNull(),
		setupS3: boolean('setup_s3').notNull(),
		/** Set when first assessment locks the profile; null = draft unlock. */
		lockedAt: timestamptz('locked_at'),
		/** Set when superseded by a new baseline profile. */
		archivedAt: timestamptz('archived_at'),
		...createdUpdated()
	},
	(table) => [
		uniqueIndex('scorecard_profiles_tenant_active_uidx')
			.on(table.tenantId)
			.where(sql`${table.archivedAt} is null`),
		index('scorecard_profiles_tenant_idx').on(table.tenantId)
	]
);

export const scorecardAssessments = pgTable(
	'scorecard_assessments',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		profileId: uuid('profile_id')
			.notNull()
			.references(() => scorecardProfiles.id, { onDelete: 'cascade' }),
		startedAt: timestamptz('started_at').notNull().defaultNow(),
		completedAt: timestamptz('completed_at'),
		zeroCount: integer('zero_count'),
		/** Secondary display metric (§6); stored for history. */
		percentage: numeric('percentage', { precision: 6, scale: 2 }),
		/** True when created after a profile change — not comparable to prior scores. */
		isBaseline: boolean('is_baseline').notNull().default(false),
		/** Spec §5 incomparability notice (TR), when is_baseline. */
		incomparabilityWarning: text('incomparability_warning'),
		...createdUpdated()
	},
	(table) => [
		index('scorecard_assessments_tenant_idx').on(table.tenantId),
		index('scorecard_assessments_profile_idx').on(table.profileId)
	]
);

export const scorecardAnswers = pgTable(
	'scorecard_answers',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		assessmentId: uuid('assessment_id')
			.notNull()
			.references(() => scorecardAssessments.id, { onDelete: 'cascade' }),
		criterionId: text('criterion_id').notNull(),
		/** 0–4; null when na_declared. */
		score: smallint('score'),
		naDeclared: boolean('na_declared').notNull().default(false),
		evidenceNote: text('evidence_note'),
		source: text('source').notNull().default('manual'),
		answeredAt: timestamptz('answered_at').notNull().defaultNow(),
		...createdUpdated()
	},
	(table) => [
		uniqueIndex('scorecard_answers_assessment_criterion_uidx').on(
			table.assessmentId,
			table.criterionId
		),
		index('scorecard_answers_tenant_idx').on(table.tenantId)
	]
);

export type ScorecardProfileRow = typeof scorecardProfiles.$inferSelect;
export type ScorecardAssessmentRow = typeof scorecardAssessments.$inferSelect;
export type ScorecardAnswerRow = typeof scorecardAnswers.$inferSelect;
