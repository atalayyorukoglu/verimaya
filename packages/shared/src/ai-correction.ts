import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';
import { transactionDraftSchema } from './inbound-message.js';

/**
 * Human correction to an AI-parsed WhatsApp transaction draft (Faz 3 learning signal).
 * `original_parsed` is what the heuristic parser produced; `corrected` is what the
 * user actually saved. İnsan onayı olmadan kesin kayda yazılmaz (AGENTS.md) — this
 * table only records the diff for future prompt/parser tuning, it never mutates data.
 */
export const aiCorrectionCreateSchema = z.object({
	inbound_message_id: uuid.nullable().optional(),
	original_parsed: z.array(transactionDraftSchema).min(1),
	corrected: z.array(transactionDraftSchema).min(1)
});
export type AiCorrectionCreate = z.infer<typeof aiCorrectionCreateSchema>;

export const aiCorrectionSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	inbound_message_id: uuid.nullable(),
	original_parsed: z.array(transactionDraftSchema),
	corrected: z.array(transactionDraftSchema),
	created_by: z.string().nullable(),
	created_at: isoDateTime
});
export type AiCorrection = z.infer<typeof aiCorrectionSchema>;
