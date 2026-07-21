import { z } from 'zod';
import { isoDate, isoDateTime, moneyMinor, supportedCurrencySchema, uuid } from './common.js';
import { transactionKindSchema } from './transaction.js';

/** WAHA webhook ile gelen grup mesajı durumu. */
export const inboundMessageStatusSchema = z.enum(['new', 'parsed', 'approved', 'ignored']);
export type InboundMessageStatus = z.infer<typeof inboundMessageStatusSchema>;

/**
 * AI'ın WhatsApp mesajından çıkardığı işlem taslağı.
 * İnsan onayı olmadan kesin kayda yazılmaz (AGENTS.md).
 */
export const transactionDraftSchema = z.object({
	kind: transactionKindSchema,
	amount: moneyMinor.positive(),
	currency: supportedCurrencySchema.default('TRY'),
	/** Tenant base currency karşılığı (farklı para birimindeyse) — minor units. */
	counterparty_amount: moneyMinor.nonnegative().nullable().optional(),
	title: z.string().min(1).max(255),
	category: z.string().max(128).nullable().optional(),
	subcategory: z.string().max(128).nullable().optional(),
	patient_id: uuid.nullable().optional(),
	patient_display_name: z.string().max(255).nullable().optional(),
	contact_label: z.string().max(255).nullable().optional(),
	occurred_on: isoDate,
	payment_method: z.string().max(64).nullable().optional(),
	description: z.string().max(8000).nullable().optional()
});

export type TransactionDraft = z.infer<typeof transactionDraftSchema>;

export const inboundMessageSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	chat_name: z.string().max(255).nullable(),
	sender: z.string().max(255).nullable(),
	body: z.string().max(16000).nullable(),
	has_media: z.boolean().default(false),
	media_path: z.string().max(1024).nullable(),
	status: inboundMessageStatusSchema.default('new'),
	parsed_records: z.array(transactionDraftSchema).nullable(),
	parse_error: z.string().max(2000).nullable(),
	created_at: isoDateTime
});

export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export const whatsappParseRequestSchema = z.object({
	message: z.string().min(1).max(16000)
});

export type WhatsappParseRequest = z.infer<typeof whatsappParseRequestSchema>;

export const whatsappParseResponseSchema = z.object({
	records: z.array(transactionDraftSchema)
});

export type WhatsappParseResponse = z.infer<typeof whatsappParseResponseSchema>;

export const inboundMessageProcessResponseSchema = z.object({
	processed: z.number().int().nonnegative(),
	parsed: z.number().int().nonnegative(),
	error: z.number().int().nonnegative()
});

export type InboundMessageProcessResponse = z.infer<typeof inboundMessageProcessResponseSchema>;

export const inboundMessageActionResponseSchema = z.object({
	success: z.literal(true),
	id: uuid,
	status: inboundMessageStatusSchema
});

export type InboundMessageActionResponse = z.infer<typeof inboundMessageActionResponseSchema>;
