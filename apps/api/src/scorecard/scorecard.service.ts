import {
	ConflictException,
	Injectable,
	NotFoundException
} from '@nestjs/common';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import {
	SCORECARD_INCOMPARABILITY_WARNING,
	SCORECARD_PROFILE_LOCKED_CODE,
	buildAssessmentComparison,
	computeAssessmentStats,
	type ScorecardAnswerUpsert,
	type ScorecardBaselineCreate,
	type ScorecardBandId,
	type ScorecardProfileCreate,
	type ScorecardProfilePatch,
	type SetupAnswers
} from '@verimaya/shared';
import {
	scorecardAnswers,
	scorecardAssessments,
	scorecardProfiles,
	type ScorecardAnswerRow,
	type ScorecardAssessmentRow,
	type ScorecardProfileRow
} from '../db/schema/scorecard';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

export type ScorecardProfileDto = {
	id: string;
	band: string;
	setup_s1: boolean;
	setup_s2: boolean;
	setup_s3: boolean;
	locked_at: string | null;
	archived_at: string | null;
	created_at: string;
	updated_at: string;
};

export type ScorecardAssessmentDto = {
	id: string;
	profile_id: string;
	started_at: string;
	completed_at: string | null;
	zero_count: number | null;
	percentage: string | null;
	is_baseline: boolean;
	incomparability_warning: string | null;
};

export type ScorecardAnswerDto = {
	id: string;
	criterion_id: string;
	score: number | null;
	na_declared: boolean;
	evidence_note: string | null;
	source: string;
	answered_at: string;
};

export type ScorecardCurrentDto = {
	profile: ScorecardProfileDto | null;
	assessment: ScorecardAssessmentDto | null;
	answers: ScorecardAnswerDto[];
	stats: {
		denominator: number;
		zero_count: number;
		scored_count: number;
		percentage: number | null;
		maturity: string | null;
	} | null;
	/** Completed assessments on the active profile (newest first). */
	history: ScorecardAssessmentDto[];
};

export type ScorecardCompareDto =
	| {
			comparable: true;
			previous: ScorecardAssessmentDto;
			current: ScorecardAssessmentDto;
			closed_zeros: number;
			opened_zeros: number;
			previous_zero_count: number;
			current_zero_count: number;
			primary_message: string;
			transitions: Array<{
				criterion_id: string;
				previous_score: number | null;
				current_score: number | null;
				closed_zero: boolean;
			}>;
	  }
	| {
			comparable: false;
			warning: string;
			previous: ScorecardAssessmentDto | null;
			current: ScorecardAssessmentDto | null;
	  };

@Injectable()
export class ScorecardService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async getActiveProfile(tenantId: string): Promise<ScorecardProfileDto | null> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const row = await this.findActiveProfile(db, tenantId);
			return row ? this.toProfileDto(row) : null;
		});
	}

	/** Active profile + open assessment + answers + live stats (Adım 36). */
	async getCurrent(tenantId: string): Promise<ScorecardCurrentDto> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const profile = await this.findActiveProfile(db, tenantId);
			if (!profile) {
				return { profile: null, assessment: null, answers: [], stats: null, history: [] };
			}

			const [open] = await db
				.select()
				.from(scorecardAssessments)
				.where(
					and(
						eq(scorecardAssessments.tenantId, tenantId),
						eq(scorecardAssessments.profileId, profile.id),
						isNull(scorecardAssessments.completedAt)
					)
				)
				.limit(1);

			const assessment = open ?? null;
			const answerRows = assessment
				? await db
						.select()
						.from(scorecardAnswers)
						.where(
							and(
								eq(scorecardAnswers.tenantId, tenantId),
								eq(scorecardAnswers.assessmentId, assessment.id)
							)
						)
				: [];

			const historyRows = await db
				.select()
				.from(scorecardAssessments)
				.where(
					and(
						eq(scorecardAssessments.tenantId, tenantId),
						eq(scorecardAssessments.profileId, profile.id),
						isNotNull(scorecardAssessments.completedAt)
					)
				)
				.orderBy(desc(scorecardAssessments.completedAt))
				.limit(20);

			const setup = this.toSetup(profile);
			const stats = computeAssessmentStats(
				profile.band as ScorecardBandId,
				setup,
				answerRows.map((a) => ({
					criterionId: a.criterionId,
					score: a.score,
					naDeclared: a.naDeclared
				}))
			);

			return {
				profile: this.toProfileDto(profile),
				assessment: assessment ? this.toAssessmentDto(assessment) : null,
				answers: answerRows.map((a) => this.toAnswerDto(a)),
				stats: {
					denominator: stats.denominator,
					zero_count: stats.zeroCount,
					scored_count: stats.scoredCount,
					percentage: stats.percentage,
					maturity: stats.maturity
				},
				history: historyRows.map((r) => this.toAssessmentDto(r))
			};
		});
	}

	async listAssessments(tenantId: string): Promise<ScorecardAssessmentDto[]> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await db
				.select()
				.from(scorecardAssessments)
				.where(eq(scorecardAssessments.tenantId, tenantId))
				.orderBy(desc(scorecardAssessments.startedAt))
				.limit(50);
			return rows.map((r) => this.toAssessmentDto(r));
		});
	}

	async getAssessment(
		tenantId: string,
		assessmentId: string
	): Promise<{ assessment: ScorecardAssessmentDto; answers: ScorecardAnswerDto[] }> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const assessment = await this.requireAssessment(db, tenantId, assessmentId);
			const answerRows = await db
				.select()
				.from(scorecardAnswers)
				.where(
					and(
						eq(scorecardAnswers.tenantId, tenantId),
						eq(scorecardAnswers.assessmentId, assessmentId)
					)
				);
			return {
				assessment: this.toAssessmentDto(assessment),
				answers: answerRows.map((a) => this.toAnswerDto(a))
			};
		});
	}

	/**
	 * Compare two assessments. Different profiles → not comparable (§5 warning verbatim).
	 */
	async compareAssessments(
		tenantId: string,
		previousId: string,
		currentId: string
	): Promise<ScorecardCompareDto> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const previous = await this.requireAssessment(db, tenantId, previousId);
			const current = await this.requireAssessment(db, tenantId, currentId);

			if (previous.profileId !== current.profileId || current.isBaseline) {
				return {
					comparable: false,
					warning: SCORECARD_INCOMPARABILITY_WARNING,
					previous: this.toAssessmentDto(previous),
					current: this.toAssessmentDto(current)
				};
			}

			const prevAnswers = await db
				.select()
				.from(scorecardAnswers)
				.where(eq(scorecardAnswers.assessmentId, previousId));
			const currAnswers = await db
				.select()
				.from(scorecardAnswers)
				.where(eq(scorecardAnswers.assessmentId, currentId));

			const comparison = buildAssessmentComparison(
				prevAnswers.map((a) => ({
					criterionId: a.criterionId,
					score: a.score,
					naDeclared: a.naDeclared
				})),
				currAnswers.map((a) => ({
					criterionId: a.criterionId,
					score: a.score,
					naDeclared: a.naDeclared
				}))
			);

			return {
				comparable: true,
				previous: this.toAssessmentDto(previous),
				current: this.toAssessmentDto(current),
				closed_zeros: comparison.closedZeros,
				opened_zeros: comparison.openedZeros,
				previous_zero_count: comparison.previousZeroCount,
				current_zero_count: comparison.currentZeroCount,
				primary_message: `${comparison.closedZeros} of ${comparison.previousZeroCount} zeros closed`,
				transitions: comparison.transitions.map((t) => ({
					criterion_id: t.criterionId,
					previous_score: t.previousScore,
					current_score: t.currentScore,
					closed_zero: t.closedZero
				}))
			};
		});
	}

	private async requireAssessment(
		db: TenantDb,
		tenantId: string,
		assessmentId: string
	): Promise<ScorecardAssessmentRow> {
		const [row] = await db
			.select()
			.from(scorecardAssessments)
			.where(
				and(
					eq(scorecardAssessments.id, assessmentId),
					eq(scorecardAssessments.tenantId, tenantId)
				)
			)
			.limit(1);
		if (!row) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Assessment not found' }
			});
		}
		return row;
	}

	async upsertAnswer(
		tenantId: string,
		assessmentId: string,
		input: ScorecardAnswerUpsert
	): Promise<ScorecardAnswerDto> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [assessment] = await db
				.select()
				.from(scorecardAssessments)
				.where(
					and(
						eq(scorecardAssessments.id, assessmentId),
						eq(scorecardAssessments.tenantId, tenantId)
					)
				)
				.limit(1);
			if (!assessment) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Assessment not found' }
				});
			}
			if (assessment.completedAt) {
				throw new ConflictException({
					error: {
						code: 'conflict',
						message: 'Assessment is completed; start a new measurement to change answers'
					}
				});
			}

			const na = input.na_declared === true;
			const score = na ? null : input.score;
			const now = new Date();

			const [existing] = await db
				.select()
				.from(scorecardAnswers)
				.where(
					and(
						eq(scorecardAnswers.assessmentId, assessmentId),
						eq(scorecardAnswers.criterionId, input.criterion_id)
					)
				)
				.limit(1);

			if (existing) {
				const [row] = await db
					.update(scorecardAnswers)
					.set({
						score,
						naDeclared: na,
						evidenceNote: input.evidence_note ?? existing.evidenceNote,
						source: 'manual',
						answeredAt: now,
						updatedAt: now
					})
					.where(eq(scorecardAnswers.id, existing.id))
					.returning();
				return this.toAnswerDto(row!);
			}

			const [row] = await db
				.insert(scorecardAnswers)
				.values({
					tenantId,
					assessmentId,
					criterionId: input.criterion_id,
					score,
					naDeclared: na,
					evidenceNote: input.evidence_note ?? null,
					source: 'manual',
					answeredAt: now
				})
				.returning();
			return this.toAnswerDto(row!);
		});
	}

	async completeAssessment(
		tenantId: string,
		assessmentId: string
	): Promise<ScorecardAssessmentDto> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [assessment] = await db
				.select()
				.from(scorecardAssessments)
				.where(
					and(
						eq(scorecardAssessments.id, assessmentId),
						eq(scorecardAssessments.tenantId, tenantId)
					)
				)
				.limit(1);
			if (!assessment) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Assessment not found' }
				});
			}
			if (assessment.completedAt) {
				return this.toAssessmentDto(assessment);
			}

			const [profile] = await db
				.select()
				.from(scorecardProfiles)
				.where(eq(scorecardProfiles.id, assessment.profileId))
				.limit(1);
			if (!profile) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Profile not found' }
				});
			}

			const answerRows = await db
				.select()
				.from(scorecardAnswers)
				.where(eq(scorecardAnswers.assessmentId, assessmentId));

			const stats = computeAssessmentStats(
				profile.band as ScorecardBandId,
				this.toSetup(profile),
				answerRows.map((a) => ({
					criterionId: a.criterionId,
					score: a.score,
					naDeclared: a.naDeclared
				}))
			);

			const now = new Date();
			const [row] = await db
				.update(scorecardAssessments)
				.set({
					completedAt: now,
					zeroCount: stats.zeroCount,
					percentage: stats.percentage === null ? null : String(stats.percentage),
					updatedAt: now
				})
				.where(eq(scorecardAssessments.id, assessmentId))
				.returning();

			return this.toAssessmentDto(row!);
		});
	}

	/**
	 * Create the first active profile (unlocked). Fails if one already exists.
	 */
	async createProfile(
		tenantId: string,
		input: ScorecardProfileCreate
	): Promise<ScorecardProfileDto> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const existing = await this.findActiveProfile(db, tenantId);
			if (existing) {
				throw new ConflictException({
					error: {
						code: 'conflict',
						message: 'Active scorecard profile already exists'
					}
				});
			}

			const [row] = await db
				.insert(scorecardProfiles)
				.values({
					tenantId,
					band: input.band,
					setupS1: input.setup_s1,
					setupS2: input.setup_s2,
					setupS3: input.setup_s3
				})
				.returning();
			return this.toProfileDto(row!);
		});
	}

	/**
	 * Start (or continue) an open assessment on the active profile and lock it.
	 * Silent band/setup changes after this are forbidden (§5).
	 */
	async startAssessment(tenantId: string): Promise<{
		profile: ScorecardProfileDto;
		assessment: ScorecardAssessmentDto;
	}> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const profile = await this.requireActiveProfile(db, tenantId);
			const now = new Date();

			if (!profile.lockedAt) {
				await db
					.update(scorecardProfiles)
					.set({ lockedAt: now, updatedAt: now })
					.where(eq(scorecardProfiles.id, profile.id));
				profile.lockedAt = now;
			}

			const [open] = await db
				.select()
				.from(scorecardAssessments)
				.where(
					and(
						eq(scorecardAssessments.tenantId, tenantId),
						eq(scorecardAssessments.profileId, profile.id),
						isNull(scorecardAssessments.completedAt)
					)
				)
				.limit(1);

			if (open) {
				return {
					profile: this.toProfileDto(profile),
					assessment: this.toAssessmentDto(open)
				};
			}

			const [assessment] = await db
				.insert(scorecardAssessments)
				.values({
					tenantId,
					profileId: profile.id,
					startedAt: now,
					isBaseline: false
				})
				.returning();

			return {
				profile: this.toProfileDto(profile),
				assessment: this.toAssessmentDto(assessment!)
			};
		});
	}

	/**
	 * Attempt to change band/setup on the active profile.
	 * Locked → 409 with explicit message + suggest starting a baseline (§5).
	 */
	async patchActiveProfile(
		tenantId: string,
		input: ScorecardProfilePatch
	): Promise<ScorecardProfileDto> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const profile = await this.requireActiveProfile(db, tenantId);

			if (profile.lockedAt) {
				throw new ConflictException({
					error: {
						code: SCORECARD_PROFILE_LOCKED_CODE,
						message:
							'Profile is locked. Band/setup cannot change silently. Start a new baseline assessment (POST /v1/scorecard/baseline).'
					}
				});
			}

			const [row] = await db
				.update(scorecardProfiles)
				.set({
					...(input.band !== undefined ? { band: input.band } : {}),
					...(input.setup_s1 !== undefined ? { setupS1: input.setup_s1 } : {}),
					...(input.setup_s2 !== undefined ? { setupS2: input.setup_s2 } : {}),
					...(input.setup_s3 !== undefined ? { setupS3: input.setup_s3 } : {}),
					updatedAt: new Date()
				})
				.where(eq(scorecardProfiles.id, profile.id))
				.returning();

			return this.toProfileDto(row!);
		});
	}

	/**
	 * Archive the active profile and create a new baseline profile + assessment.
	 * Prior scores remain but are not comparable (§5).
	 */
	async startBaseline(
		tenantId: string,
		input: ScorecardBaselineCreate
	): Promise<{
		profile: ScorecardProfileDto;
		assessment: ScorecardAssessmentDto;
		archived_profile_id: string | null;
	}> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const now = new Date();
			const active = await this.findActiveProfile(db, tenantId);

			let archivedId: string | null = null;
			if (active) {
				await db
					.update(scorecardProfiles)
					.set({ archivedAt: now, updatedAt: now })
					.where(eq(scorecardProfiles.id, active.id));
				archivedId = active.id;
			}

			const [profile] = await db
				.insert(scorecardProfiles)
				.values({
					tenantId,
					band: input.band,
					setupS1: input.setup_s1,
					setupS2: input.setup_s2,
					setupS3: input.setup_s3,
					lockedAt: now
				})
				.returning();

			const [assessment] = await db
				.insert(scorecardAssessments)
				.values({
					tenantId,
					profileId: profile!.id,
					startedAt: now,
					isBaseline: true,
					incomparabilityWarning: SCORECARD_INCOMPARABILITY_WARNING
				})
				.returning();

			return {
				profile: this.toProfileDto(profile!),
				assessment: this.toAssessmentDto(assessment!),
				archived_profile_id: archivedId
			};
		});
	}

	private async findActiveProfile(
		db: TenantDb,
		tenantId: string
	): Promise<ScorecardProfileRow | undefined> {
		const [profile] = await db
			.select()
			.from(scorecardProfiles)
			.where(
				and(eq(scorecardProfiles.tenantId, tenantId), isNull(scorecardProfiles.archivedAt))
			)
			.limit(1);
		return profile;
	}

	private async requireActiveProfile(
		db: TenantDb,
		tenantId: string
	): Promise<ScorecardProfileRow> {
		const profile = await this.findActiveProfile(db, tenantId);
		if (!profile) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'No active scorecard profile' }
			});
		}
		return profile;
	}

	private toSetup(profile: ScorecardProfileRow): SetupAnswers {
		return {
			S1: profile.setupS1,
			S2: profile.setupS2,
			S3: profile.setupS3
		};
	}

	private toAnswerDto(row: ScorecardAnswerRow): ScorecardAnswerDto {
		return {
			id: row.id,
			criterion_id: row.criterionId,
			score: row.score,
			na_declared: row.naDeclared,
			evidence_note: row.evidenceNote,
			source: row.source,
			answered_at: row.answeredAt.toISOString()
		};
	}

	private toProfileDto(row: ScorecardProfileRow): ScorecardProfileDto {
		return {
			id: row.id,
			band: row.band,
			setup_s1: row.setupS1,
			setup_s2: row.setupS2,
			setup_s3: row.setupS3,
			locked_at: row.lockedAt?.toISOString() ?? null,
			archived_at: row.archivedAt?.toISOString() ?? null,
			created_at: row.createdAt.toISOString(),
			updated_at: row.updatedAt.toISOString()
		};
	}

	private toAssessmentDto(row: ScorecardAssessmentRow): ScorecardAssessmentDto {
		return {
			id: row.id,
			profile_id: row.profileId,
			started_at: row.startedAt.toISOString(),
			completed_at: row.completedAt?.toISOString() ?? null,
			zero_count: row.zeroCount,
			percentage: row.percentage,
			is_baseline: row.isBaseline,
			incomparability_warning: row.incomparabilityWarning
		};
	}
}
