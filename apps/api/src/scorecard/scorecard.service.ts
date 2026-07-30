import {
	ConflictException,
	Injectable,
	NotFoundException
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import {
	SCORECARD_INCOMPARABILITY_WARNING,
	SCORECARD_PROFILE_LOCKED_CODE,
	type ScorecardBaselineCreate,
	type ScorecardProfileCreate,
	type ScorecardProfilePatch
} from '@verimaya/shared';
import {
	scorecardAssessments,
	scorecardProfiles,
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

@Injectable()
export class ScorecardService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async getActiveProfile(tenantId: string): Promise<ScorecardProfileDto | null> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const row = await this.findActiveProfile(db, tenantId);
			return row ? this.toProfileDto(row) : null;
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
