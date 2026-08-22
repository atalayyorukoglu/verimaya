import { z } from 'zod';
import {
	isoDate,
	isoDateTime,
	moneyMinor,
	supportedCurrencySchema,
	uuid
} from './common.js';

/**
 * Amounts are minor units (integer). Legacy used Decimal — corrected here per AGENTS.md.
 *
 * FX: foreign rows store an immutable snapshot `amount_base` in `base_currency`
 * (tenant base at booking time). Reports convert via snapshot — not live rates.
 */
export const transactionKindSchema = z.enum(['income', 'expense']);
export type TransactionKind = z.infer<typeof transactionKindSchema>;

export const transactionStatusSchema = z.enum(['paid', 'partial', 'unpaid']);
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

/** Stored transaction payment-method values used by all clients. */
export const TRANSACTION_PAYMENT_METHODS = [
	'Nakit',
	'Kredi Kartı',
	'Banka Havalesi/EFT',
	'Çek',
	'Senet',
	'Diğer'
] as const;

export type TransactionPaymentMethod = (typeof TRANSACTION_PAYMENT_METHODS)[number];

/**
 * Collected amount in the transaction's native currency (minor units).
 *
 * Tracker model (legacy ETL): `paid` means fully paid — `paid_amount` is often
 * NULL. `paid_amount` is only required for `partial`. Callers in API/web must
 * use this helper; do not use `paid_amount ?? 0`.
 */
export function resolveCollectedAmount(input: {
	status: TransactionStatus | string;
	amount: number;
	paidAmount: number | null;
}): number {
	if (input.status === 'unpaid') return 0;
	if (input.status === 'partial') return input.paidAmount ?? 0;
	// paid — and defensive fallback for unknown status
	return input.paidAmount ?? input.amount;
}

export const invoiceStatusSchema = z.enum(['none', 'issued', 'not_issued']);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

/**
 * AI-09 — kaynak izi beyaz listesi: modelin/heuristiğin atıf verebileceği alanlar.
 * Para dışı serbest metin (title, description) bilinçli olarak dışarıda: oradaki
 * "alıntı" mesajın kendisi olur, iz taşımaz.
 */
export const transactionEvidenceFieldSchema = z.enum([
	'amount',
	'currency',
	'kind',
	'occurred_on',
	'contact_id',
	'payment_method',
	'category'
]);

export type TransactionEvidenceField = z.infer<typeof transactionEvidenceFieldSchema>;

/**
 * Tek alanın kaynak izi.
 *
 * `quote` + `start` **birlikte** taşınır ve rolleri farklıdır:
 * - `quote` her zaman gösterilebilir; sunucu bunu modele gönderilen metinde
 *   gerçekten geçtiğine bakarak doğrular (uydurma atıf düşürülür).
 * - `start` ham mesajdaki karakter ofsetidir ve **yalnız vurgulama** içindir.
 *   PII maskeleme (`[TELEFON]`, `[HASTA]`) ofseti kaydırdığı için alıntı ham
 *   metinde yeniden bulunamayabilir; o durumda `null` olur, quote yine kalır.
 */
export const transactionEvidenceEntrySchema = z.object({
	quote: z.string().max(200),
	start: z.number().int().nonnegative().nullable(),
	confidence: z.enum(['high', 'medium', 'low'])
});

export type TransactionEvidenceEntry = z.infer<typeof transactionEvidenceEntrySchema>;

/**
 * `z.record` bilinçli: beyaz liste genişlediğinde (AI-07) jsonb kolonu ve
 * migration değişmez, yalnız enum büyür. Her alan bağımsız olarak bulunabilir
 * ya da bulunmayabilir — zod runtime'ı hiçbir anahtarı zorunlu tutmaz.
 *
 * ⚠️ `openapi.yaml` içinde bu blok `required: [amount, currency, …]` ile çıkıyor:
 * `zod-to-json-schema`, enum anahtarlı `ZodRecord`'u eksiksiz nesne sanıyor ve
 * ayarla kapatılamıyor. Runtime davranışı doğru (kısmi), yalnız üretilen doküman
 * fazla katı; şemayı `z.object().partial()`'a çevirmek beyaz liste genişletmesini
 * gereksiz yere zorlaştıracağı için bilinçli olarak kabul edildi.
 */
export const transactionEvidenceSchema = z.record(
	transactionEvidenceFieldSchema,
	transactionEvidenceEntrySchema
);

export type TransactionEvidence = z.infer<typeof transactionEvidenceSchema>;

export const transactionSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	kind: transactionKindSchema,
	/** Optional; Tracker form never collects a title. List UI derives a label when empty. */
	title: z.string().max(255).nullable(),
	subtitle: z.string().max(255).nullable(),
	category: z.string().max(128).nullable(),
	occurred_on: isoDate,
	status: transactionStatusSchema,
	invoice_status: invoiceStatusSchema.default('none'),
	payment_method: z.string().max(64).nullable(),
	amount: moneyMinor.positive(),
	paid_amount: moneyMinor.nonnegative().nullable(),
	currency: supportedCurrencySchema.default('TRY'),
	/**
	 * Amount in `base_currency` (minor units) at booking time.
	 * Required when `currency` ≠ tenant base; equals `amount` when same currency.
	 */
	amount_base: moneyMinor.nonnegative().nullable().default(null),
	/** Snapshot of tenant base currency when amount_base was set */
	base_currency: supportedCurrencySchema.nullable().default(null),
	/** 1 unit of `currency` (major) = fx_rate units of base (major). Optional audit. */
	fx_rate: z.number().positive().nullable().default(null),
	fx_dated: isoDate.nullable().default(null),
	/**
	 * Linked person or counterparty (DOMAIN-02: former patient_id absorbed;
	 * single contact_id remains).
	 */
	contact_id: uuid.nullable().default(null),
	/** Denormalized display for contact_id (was patient_display_name) */
	contact_display_name: z.string().max(255).nullable(),
	/** Free-text counterparty when contact_id is unset (WhatsApp drafts etc.) */
	contact_label: z.string().max(255).nullable(),
	/**
	 * Patient (case) this cost/revenue belongs to — independent of `contact_id`
	 * (the payee/payer counterparty). Optional; must be contact type Hasta when set.
	 */
	case_contact_id: uuid.nullable().default(null),
	/**
	 * Staff member who spent / owns the expense (Personel). Optional.
	 */
	responsible_contact_id: uuid.nullable().default(null),
	description: z.string().max(8000).nullable(),
	created_at: isoDateTime,
	updated_at: isoDateTime
});

export type Transaction = z.infer<typeof transactionSchema>;

/**
 * List/detail label when `title` is empty — Tracker-style derived display.
 * Order: title → category › subtitle → contact name → description first line → —.
 */
export function deriveTransactionLabel(input: {
	title?: string | null;
	category?: string | null;
	subtitle?: string | null;
	contact_display_name?: string | null;
	contact_label?: string | null;
	description?: string | null;
}): string {
	const title = input.title?.trim();
	if (title) return title;

	const category = input.category?.trim() ?? '';
	const subtitle = input.subtitle?.trim() ?? '';
	if (category && subtitle) return `${category} › ${subtitle}`;
	if (category) return category;
	if (subtitle) return subtitle;

	const contact =
		input.contact_display_name?.trim() || input.contact_label?.trim() || '';
	if (contact) return contact;

	const firstLine = input.description?.split(/\r?\n/, 1)[0]?.trim() ?? '';
	if (firstLine) return firstLine;

	return '—';
}

export const transactionCreateSchema = transactionSchema.omit({
	id: true,
	tenant_id: true,
	contact_display_name: true,
	created_at: true,
	updated_at: true
});

export type TransactionCreate = z.infer<typeof transactionCreateSchema>;

export const transactionUpdateSchema = transactionCreateSchema.partial();

export type TransactionUpdate = z.infer<typeof transactionUpdateSchema>;
