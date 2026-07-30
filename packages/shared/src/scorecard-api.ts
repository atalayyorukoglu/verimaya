import { z } from 'zod';

/** Product scorecard API schemas (Adım 34). Distinct from free public karne. */

export const scorecardBandId = z.enum(['1-4', '5-15', '16+']);
export type ScorecardBandIdApi = z.infer<typeof scorecardBandId>;

export const scorecardAnswerSource = z.enum(['manual', 'auto']);
export type ScorecardAnswerSource = z.infer<typeof scorecardAnswerSource>;

export const scorecardProfileCreateSchema = z.object({
	band: scorecardBandId,
	setup_s1: z.boolean(),
	setup_s2: z.boolean(),
	setup_s3: z.boolean()
});
export type ScorecardProfileCreate = z.infer<typeof scorecardProfileCreateSchema>;

export const scorecardProfilePatchSchema = z.object({
	band: scorecardBandId.optional(),
	setup_s1: z.boolean().optional(),
	setup_s2: z.boolean().optional(),
	setup_s3: z.boolean().optional()
});
export type ScorecardProfilePatch = z.infer<typeof scorecardProfilePatchSchema>;

export const scorecardBaselineCreateSchema = scorecardProfileCreateSchema;
export type ScorecardBaselineCreate = z.infer<typeof scorecardBaselineCreateSchema>;

export const SCORECARD_PROFILE_LOCKED_CODE = 'scorecard_profile_locked' as const;

export const SCORECARD_INCOMPARABILITY_WARNING =
	'Ekip büyüklüğünüz / yapınız değişti. Bu yeni bir başlangıç ölçümüdür, önceki skorla kıyaslanamaz. Önceki ölçüm arşivde kalır.';

export const SCORECARD_PERCENTAGE_WARNING =
	'Farklı ölçek bantlarının yüzdeleri birbiriyle kıyaslanmaz. Bu yüzde yalnızca kendi önceki ölçümünüzle karşılaştırmak içindir.';

/** Returned when compare spans different profiles / baseline (§5). */
export const SCORECARD_COMPARE_BLOCKED_CODE = 'scorecard_compare_blocked' as const;

export const scorecardAnswerUpsertSchema = z.object({
	criterion_id: z.string().min(1),
	score: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable(),
	na_declared: z.boolean().default(false),
	evidence_note: z.string().max(4000).nullable().optional()
});
export type ScorecardAnswerUpsert = z.infer<typeof scorecardAnswerUpsertSchema>;
