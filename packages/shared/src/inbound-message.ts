import { z } from 'zod';
import { isoDate, isoDateTime, moneyMinor, supportedCurrencySchema, uuid } from './common.js';
import { contactCreateSchema } from './contact.js';
import { financeCategoryCreateSchema } from './finance-category.js';
import {
	transactionKindSchema,
	transactionSchema,
	transactionStatusSchema
} from './transaction.js';

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

/**
 * MONEY-01: human approval payload for one AI draft.
 * Payment status, paid_amount, FX, and counterparty are required — no silent defaults.
 */
export const approveDraftItemSchema = transactionDraftSchema
	.extend({
		status: transactionStatusSchema,
		paid_amount: moneyMinor.nonnegative(),
		/** 1 major unit of draft currency = fx_rate major units of tenant base. */
		fx_rate: z.number().positive(),
		/** Amount in tenant base currency (minor units). */
		amount_base: moneyMinor.nonnegative(),
		contact_id: uuid.nullable().default(null)
	})
	.superRefine((item, ctx) => {
		const hasCounterparty = item.contact_id != null || Boolean(item.contact_label?.trim());
		if (!hasCounterparty) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Counterparty (contact_id or contact_label) is required',
				path: ['contact_label']
			});
		}
		if (item.status === 'unpaid' && item.paid_amount !== 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'paid_amount must be 0 when status is unpaid',
				path: ['paid_amount']
			});
		}
		if (item.status === 'paid' && item.paid_amount !== item.amount) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'paid_amount must equal amount when status is paid',
				path: ['paid_amount']
			});
		}
		if (item.status === 'partial' && (item.paid_amount <= 0 || item.paid_amount >= item.amount)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'paid_amount must be between 0 and amount (exclusive) when status is partial',
				path: ['paid_amount']
			});
		}
	});

export type ApproveDraftItem = z.infer<typeof approveDraftItemSchema>;

export const approveDraftsRequestSchema = z.object({
	drafts: z.array(approveDraftItemSchema).min(1),
	/** AI original drafts; when present and different from submitted drafts, an ai_correction is written. */
	original_parsed: z.array(transactionDraftSchema).optional()
});

export type ApproveDraftsRequest = z.infer<typeof approveDraftsRequestSchema>;

export const approveDraftsResponseSchema = z.object({
	id: uuid,
	status: z.literal('approved'),
	transactions: z.array(transactionSchema),
	correction_id: uuid.nullable()
});

export type ApproveDraftsResponse = z.infer<typeof approveDraftsResponseSchema>;
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

/**
 * GAP-F09-16 (G-16): inline create from WhatsApp draft approval.
 * Subcategory create intentionally omitted — Verimaya category model is flat
 * (`transactions.category` + `finance_categories` dictionary, no subcategory entity).
 */
export const whatsappCreateContactSchema = contactCreateSchema
	.pick({
		display_name: true,
		contact_type_id: true,
		phone: true,
		email: true
	})
	.strict();

export type WhatsappCreateContact = z.infer<typeof whatsappCreateContactSchema>;

/** Minimal patient create subset for inline draft approval. */
export const whatsappCreatePatientSchema = z
	.object({
		full_name: z.string().min(1).max(255),
		contact_id: uuid.nullable().optional()
	})
	.strict();

export type WhatsappCreatePatient = z.infer<typeof whatsappCreatePatientSchema>;

export const whatsappCreateCategorySchema = financeCategoryCreateSchema
	.pick({
		name: true,
		kind: true
	})
	.strict();

export type WhatsappCreateCategory = z.infer<typeof whatsappCreateCategorySchema>;
