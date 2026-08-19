import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

/** Aggregated CSP violation row (platform-admin list). */
export const cspReportSchema = z.object({
	id: uuid,
	document_uri: z.string(),
	blocked_uri: z.string(),
	violated_directive: z.string(),
	effective_directive: z.string().nullable(),
	disposition: z.string().nullable(),
	user_agent_family: z.string().nullable(),
	count: z.number().int().positive(),
	first_seen_at: isoDateTime,
	last_seen_at: isoDateTime
});
export type CspReport = z.infer<typeof cspReportSchema>;

export const cspReportListSchema = z.object({
	items: z.array(cspReportSchema)
});
export type CspReportList = z.infer<typeof cspReportListSchema>;

/** Browser payloads vary (legacy `csp-report` vs Reporting API array). */
export const cspReportIngestBodySchema = z.unknown();

export const cspReportsClearedSchema = z.object({
	deleted: z.literal(true)
});
