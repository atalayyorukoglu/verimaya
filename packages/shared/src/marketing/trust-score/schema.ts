import { z } from 'zod';

export const trustCheckId = z.enum([
	'consent_mode',
	'enhanced_conversions',
	'server_side_tagging',
	'crm_feedback',
	'emq_score'
]);
export type TrustCheckId = z.infer<typeof trustCheckId>;

export const trustCheckInput = z.object({
	id: trustCheckId,
	/** 0–100 for that check */
	score: z.number(),
	weight: z.number().optional()
});
export type TrustCheckInput = z.infer<typeof trustCheckInput>;

export const gradeSchema = z.enum(['A', 'B', 'C', 'D', 'F']);
export type Grade = z.infer<typeof gradeSchema>;

export const trustScoreCheck = z.object({
	id: trustCheckId,
	score: z.number(),
	weight: z.number(),
	weighted: z.number()
});
export type TrustScoreCheck = z.infer<typeof trustScoreCheck>;

export const trustScoreResult = z.object({
	score: z.number(),
	grade: gradeSchema,
	checks: z.array(trustScoreCheck)
});
export type TrustScoreResult = z.infer<typeof trustScoreResult>;

/** Persisted tenant checklist input (Ölçüm / Trust Score settings). */
export const trustScoreSettings = z.object({
	checks: z.array(trustCheckInput)
});
export type TrustScoreSettings = z.infer<typeof trustScoreSettings>;
