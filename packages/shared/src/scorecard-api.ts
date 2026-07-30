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
