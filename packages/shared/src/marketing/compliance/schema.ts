import { z } from 'zod';

export const severity = z.enum(['block', 'warn']);
export type Severity = z.infer<typeof severity>;

export const complianceHit = z.object({
	term: z.string(),
	index: z.number().int(),
	severity
});
export type ComplianceHit = z.infer<typeof complianceHit>;

export const complianceScanResult = z.object({
	ok: z.boolean(),
	hits: z.array(complianceHit)
});
export type ComplianceScanResult = z.infer<typeof complianceScanResult>;

export const bannedTerm = z.object({
	term: z.string(),
	severity
});
export type BannedTerm = z.infer<typeof bannedTerm>;
