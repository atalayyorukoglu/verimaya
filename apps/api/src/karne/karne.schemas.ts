import { z } from 'zod';

/** Intake (2) + scored (10) — matches web karne question ids. */
export const karneQuestionIdSchema = z.enum([
	'band',
	'eu',
	's1',
	's2',
	's3',
	's4',
	's5',
	's6',
	's7',
	's8',
	's9',
	's10'
]);

export const karneBandSchema = z.enum(['1-4', '5-15', '16+']);
export const karneEuExposureSchema = z.enum(['evet', 'hayir', 'emin-degilim']);
export const karneEventTypeSchema = z.enum(['viewed', 'answered']);

export const karneSessionCreateSchema = z.object({
	band: karneBandSchema,
	eu_exposure: karneEuExposureSchema,
	referrer_host: z.string().max(253).optional()
});

export const karneEventCreateSchema = z.object({
	session_id: z.string().uuid(),
	question_id: karneQuestionIdSchema,
	event_type: karneEventTypeSchema,
	choice_id: z.string().max(64).optional(),
	dwell_ms: z.number().int().min(0).max(3_600_000).optional()
});

export const karneCompleteSchema = z.object({
	session_id: z.string().uuid(),
	zero_count: z.number().int().min(0).max(10)
});

/** `website` is a honeypot — must be absent or empty. */
export const karneLeadCreateSchema = z
	.object({
		session_id: z.string().uuid(),
		email: z.string().trim().email().max(320),
		consent: z.literal(true),
		website: z.string().max(200).optional()
	})
	.superRefine((data, ctx) => {
		if (data.website !== undefined && data.website.trim() !== '') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Invalid request',
				path: ['website']
			});
		}
	});

export type KarneSessionCreate = z.infer<typeof karneSessionCreateSchema>;
export type KarneEventCreate = z.infer<typeof karneEventCreateSchema>;
export type KarneComplete = z.infer<typeof karneCompleteSchema>;
export type KarneLeadCreate = z.infer<typeof karneLeadCreateSchema>;
