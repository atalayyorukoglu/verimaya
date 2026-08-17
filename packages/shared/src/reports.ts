import { z } from 'zod';
import { isoDate, isoDateTime, moneyMinor, supportedCurrencySchema, uuid } from './common.js';
import { contactStatusSchema } from './contact.js';
import { transactionKindSchema } from './transaction.js';

export const reportPeriodParams = z.object({
	from: isoDate.optional(),
	to: isoDate.optional()
});
export type ReportPeriodParams = z.infer<typeof reportPeriodParams>;

export const reportPeriodSchema = z.object({
	from: isoDate.nullable(),
	to: isoDate.nullable()
});
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;

export const reportFxMissingByCurrencySchema = z.object({
	currency: supportedCurrencySchema,
	/** Sum of native-currency amounts (minor) that could not be resolved into tenant base. */
	amount_minor: moneyMinor
});
export type ReportFxMissingByCurrency = z.infer<typeof reportFxMissingByCurrencySchema>;

export const reportSummarySchema = z.object({
	period: reportPeriodSchema,
	income_base: moneyMinor,
	expense_base: moneyMinor,
	net_base: moneyMinor,
	/** Unpaid income in tenant base (income amount − paid, clamped ≥ 0 per row). */
	pending_base: moneyMinor,
	transaction_count: z.number().int().nonnegative(),
	/** Rows with no resolvable amount in tenant base (period-scoped). */
	fx_missing_count: z.number().int().nonnegative(),
	fx_missing_amount_by_currency: z.array(reportFxMissingByCurrencySchema),
	/**
	 * Count-based coverage: (transaction_count − fx_missing_count) / max(transaction_count, 1).
	 * Cross-currency value weights are not comparable without FX.
	 */
	coverage_ratio: z.number().min(0).max(1)
});
export type ReportSummary = z.infer<typeof reportSummarySchema>;

export const reportContactStatusCountSchema = z.object({
	status: contactStatusSchema,
	count: z.number().int().nonnegative()
});
export type ReportContactStatusCount = z.infer<typeof reportContactStatusCountSchema>;

export const reportContactSourceCountSchema = z.object({
	source: z.string(),
	count: z.number().int().nonnegative()
});
export type ReportContactSourceCount = z.infer<typeof reportContactSourceCountSchema>;

/** §0-C: medium is a second-level breakout under source grouping. */
export const reportContactMediumCountSchema = z.object({
	medium: z.string(),
	count: z.number().int().nonnegative()
});
export type ReportContactMediumCount = z.infer<typeof reportContactMediumCountSchema>;

export const reportContactDistributionSchema = z.object({
	period: reportPeriodSchema,
	by_status: z.array(reportContactStatusCountSchema),
	by_source: z.array(reportContactSourceCountSchema),
	by_medium: z.array(reportContactMediumCountSchema),
	total: z.number().int().nonnegative()
});
export type ReportContactDistribution = z.infer<typeof reportContactDistributionSchema>;

export const reportBalanceRowSchema = z.object({
	contact_id: uuid,
	contact_label: z.string(),
	currency: supportedCurrencySchema,
	/** Signed open balance: income positive, expense negative. */
	open_amount: moneyMinor,
	/** Signed collected amount: income positive, expense negative. */
	collected_amount: moneyMinor,
	transaction_count: z.number().int().nonnegative()
});
export type ReportBalanceRow = z.infer<typeof reportBalanceRowSchema>;

export const reportBalancesSchema = z.object({
	items: z.array(reportBalanceRowSchema)
});
export type ReportBalances = z.infer<typeof reportBalancesSchema>;

export const reportCategoryRowSchema = z.object({
	category_name: z.string(),
	income_base: moneyMinor,
	expense_base: moneyMinor,
	net_base: moneyMinor,
	transaction_count: z.number().int().nonnegative()
});
export type ReportCategoryRow = z.infer<typeof reportCategoryRowSchema>;

export const reportByCategorySchema = z.object({
	period: reportPeriodSchema,
	items: z.array(reportCategoryRowSchema)
});
export type ReportByCategory = z.infer<typeof reportByCategorySchema>;

export const reportByCategoryDetailParams = z.object({
	from: isoDate.optional(),
	to: isoDate.optional(),
	category: z.string().trim().min(1).max(255)
});
export type ReportByCategoryDetailParams = z.infer<typeof reportByCategoryDetailParams>;

export const reportSubtitleRowSchema = z.object({
	subtitle_name: z.string(),
	income_base: moneyMinor,
	expense_base: moneyMinor,
	net_base: moneyMinor,
	transaction_count: z.number().int().nonnegative()
});
export type ReportSubtitleRow = z.infer<typeof reportSubtitleRowSchema>;

export const reportByCategoryDetailSchema = z.object({
	period: reportPeriodSchema,
	category: z.string(),
	items: z.array(reportSubtitleRowSchema)
});
export type ReportByCategoryDetail = z.infer<typeof reportByCategoryDetailSchema>;

/** `YYYY-MM` bucket key. */
export const reportMonthKey = z.string().regex(/^\d{4}-\d{2}$/);

export const reportMonthRowSchema = z.object({
	month: reportMonthKey,
	income_base: moneyMinor,
	expense_base: moneyMinor,
	net_base: moneyMinor,
	transaction_count: z.number().int().nonnegative()
});
export type ReportMonthRow = z.infer<typeof reportMonthRowSchema>;

export const reportMonthlySchema = z.object({
	period: reportPeriodSchema,
	items: z.array(reportMonthRowSchema)
});
export type ReportMonthly = z.infer<typeof reportMonthlySchema>;

/** Expenses grouped by responsible staff (Personel). Null id = unassigned. */
export const reportResponsibleRowSchema = z.object({
	responsible_contact_id: uuid.nullable(),
	responsible_label: z.string().min(1).max(255),
	expense_base: moneyMinor,
	transaction_count: z.number().int().nonnegative()
});
export type ReportResponsibleRow = z.infer<typeof reportResponsibleRowSchema>;

export const reportByResponsibleSchema = z.object({
	period: reportPeriodSchema,
	items: z.array(reportResponsibleRowSchema)
});
export type ReportByResponsible = z.infer<typeof reportByResponsibleSchema>;

/** GAP-07: rates are fractions in [0, 1] (UI formats as percent). Total 0 → rates 0. */
export const reportClinicMetricsRowSchema = z.object({
	clinic_contact_id: uuid.nullable(),
	clinic_name: z.string().min(1).max(255),
	count: z.number().int().nonnegative(),
	completion_rate: z.number().min(0).max(1)
});
export type ReportClinicMetricsRow = z.infer<typeof reportClinicMetricsRowSchema>;

export const reportAppointmentTypeMetricsRowSchema = z.object({
	appointment_type: z.string().min(1).max(128),
	count: z.number().int().nonnegative(),
	ratio: z.number().min(0).max(1)
});
export type ReportAppointmentTypeMetricsRow = z.infer<
	typeof reportAppointmentTypeMetricsRowSchema
>;

export const reportAppointmentMonthRowSchema = z.object({
	month: reportMonthKey,
	count: z.number().int().nonnegative()
});
export type ReportAppointmentMonthRow = z.infer<typeof reportAppointmentMonthRowSchema>;

export const reportAppointmentMetricsSchema = z.object({
	period: reportPeriodSchema,
	total: z.number().int().nonnegative(),
	/** completed ÷ total */
	completion_rate: z.number().min(0).max(1),
	/** no_show ÷ total */
	no_show_rate: z.number().min(0).max(1),
	/** cancelled ÷ total */
	cancellation_rate: z.number().min(0).max(1),
	by_clinic: z.array(reportClinicMetricsRowSchema),
	by_appointment_type: z.array(reportAppointmentTypeMetricsRowSchema),
	monthly: z.array(reportAppointmentMonthRowSchema)
});
export type ReportAppointmentMetrics = z.infer<typeof reportAppointmentMetricsSchema>;

/**
 * GAP-05 / G-04: transaction consistency audit (server-side, full period — not page-capped).
 * Rule engine lives in `transaction-consistency.ts` (shared with audit-draft).
 */
export {
	transactionConsistencySeveritySchema as reportConsistencySeveritySchema,
	transactionConsistencyCodeSchema as reportConsistencyCodeSchema,
	transactionConsistencyCodeMeta as reportConsistencyCodeMeta,
	type TransactionConsistencySeverity as ReportConsistencySeverity,
	type TransactionConsistencyCode as ReportConsistencyCode
} from './transaction-consistency.js';

import {
	transactionConsistencyCodeSchema,
	transactionConsistencySeveritySchema
} from './transaction-consistency.js';

export const reportConsistencyItemSchema = z.object({
	transaction_id: uuid,
	title: z.string(),
	occurred_on: isoDate,
	severity: transactionConsistencySeveritySchema,
	code: transactionConsistencyCodeSchema,
	/** i18n catalog key — never a localized string from the server. */
	message_key: z.string().min(1).max(128)
});
export type ReportConsistencyItem = z.infer<typeof reportConsistencyItemSchema>;

/** Max issue rows returned in `items` (full totals live in `counts` / `counts_by_code`). */
export const REPORT_CONSISTENCY_ITEMS_LIMIT = 100;

export const reportConsistencySchema = z.object({
	period: reportPeriodSchema,
	items: z.array(reportConsistencyItemSchema).max(REPORT_CONSISTENCY_ITEMS_LIMIT),
	counts: z.object({
		error: z.number().int().nonnegative(),
		warning: z.number().int().nonnegative()
	}),
	/** Full-period issue counts keyed by rule code (includes codes beyond the items limit). */
	counts_by_code: z.record(transactionConsistencyCodeSchema, z.number().int().nonnegative()),
	/** True when error+warning exceeds items.length (list is capped). */
	truncated: z.boolean()
});
export type ReportConsistency = z.infer<typeof reportConsistencySchema>;

/**
 * GAP-F09-14: duplicate-suspicion scan — server-side GROUP BY (full period, not page-capped).
 * Query uses the same `occurred_on` ISO calendar-day filter as summary/consistency
 * (plain `from`/`to` on the date column — not `tenantDayRange`; that helper is for timestamps).
 */
export const reportTransactionDuplicatesParams = z
	.object({
		from: isoDate.optional(),
		to: isoDate.optional()
	})
	.strict();
export type ReportTransactionDuplicatesParams = z.infer<
	typeof reportTransactionDuplicatesParams
>;

/** Max duplicate groups returned in `items` (`total_groups` carries the uncapped total). */
export const REPORT_TRANSACTION_DUPLICATES_ITEMS_LIMIT = 20;

export const reportTransactionDuplicateGroupSchema = z.object({
	count: z.number().int().positive(),
	amount: moneyMinor,
	currency: supportedCurrencySchema,
	occurred_on: isoDate,
	kind: transactionKindSchema,
	/** Representative title for the group (e.g. MIN(title)). */
	title: z.string().min(1).max(255)
});
export type ReportTransactionDuplicateGroup = z.infer<
	typeof reportTransactionDuplicateGroupSchema
>;

export const reportTransactionDuplicatesSchema = z.object({
	items: z
		.array(reportTransactionDuplicateGroupSchema)
		.max(REPORT_TRANSACTION_DUPLICATES_ITEMS_LIMIT),
	total_groups: z.number().int().nonnegative()
});
export type ReportTransactionDuplicates = z.infer<typeof reportTransactionDuplicatesSchema>;

/**
 * Temassız kişiler — "kimseye dokunulmamış" listesi (ihtiyaç haritası §2.2 / §3.5).
 *
 * Dokunuş = kişiyle ilgili gerçekleşmiş bir iş: randevu, işlem (kendi veya vaka tarafı),
 * vaka notu. Kişinin kendi `created_at`'i taban kabul edilir — dün açılmış kayıt
 * "90 gündür temassız" sayılmaz.
 *
 * GELECEK TARİHLİ randevu de dokunuş sayılır ve kişiyi listeden düşürür: önümüzdeki
 * hafta randevusu olan hasta ihmal edilmiş değildir, aktif takiptedir.
 */
export const reportUntouchedContactsParams = z
	.object({
		/** Eşik: bu kadar gündür dokunulmamışlar listelenir. */
		days: z.coerce.number().int().min(1).max(3650).default(30),
		/** Kişi türü filtresi; boşsa tüm türler. Panel varsayılanı "Hasta". */
		contact_type: z.string().trim().min(1).max(120).optional(),
		limit: z.coerce.number().int().min(1).max(200).default(50)
	})
	.strict();
export type ReportUntouchedContactsParams = z.infer<typeof reportUntouchedContactsParams>;

/** Son dokunuşun nereden geldiği — listede "neden bu tarih" sorusunu cevaplar. */
export const untouchedActivitySourceSchema = z.enum([
	'appointment',
	'transaction',
	'case_note',
	/** Hiç aktivite yok; taban kişinin oluşturulma tarihi. */
	'created'
]);
export type UntouchedActivitySource = z.infer<typeof untouchedActivitySourceSchema>;

export const reportUntouchedContactRowSchema = z.object({
	contact_id: uuid,
	display_name: z.string(),
	contact_type_name: z.string(),
	phone: z.string().nullable(),
	email: z.string().nullable(),
	last_activity_at: isoDateTime,
	last_activity_source: untouchedActivitySourceSchema,
	days_since: z.number().int().nonnegative()
});
export type ReportUntouchedContactRow = z.infer<typeof reportUntouchedContactRowSchema>;

export const reportUntouchedContactsSchema = z.object({
	/** Eşikten bağımsız sabit kovalar — "38 temassız, 12'si 60 günü geçti" cümlesi için. */
	buckets: z.object({
		d30: z.number().int().nonnegative(),
		d60: z.number().int().nonnegative(),
		d90: z.number().int().nonnegative()
	}),
	/** Eşiği geçen toplam kişi sayısı (liste `limit` ile kırpılmış olabilir). */
	total: z.number().int().nonnegative(),
	items: z.array(reportUntouchedContactRowSchema)
});
export type ReportUntouchedContacts = z.infer<typeof reportUntouchedContactsSchema>;

export type ReportUrlPath =
	| 'summary'
	| 'by-category'
	| 'monthly'
	| 'by-category-detail'
	| 'by-responsible'
	| 'contact-distribution'
	| 'balances'
	| 'appointment-metrics'
	| 'consistency'
	| 'transaction-duplicates'
	| 'untouched-contacts';

/** Build a report URL (path + query only, no origin). */
export function reportUrl(
	path: ReportUrlPath,
	params?: { from?: string | null; to?: string | null; category?: string | null }
): string {
	const url = new URL(`/v1/reports/${path}`, 'http://local');
	if (params?.from) url.searchParams.set('from', params.from);
	if (params?.to) url.searchParams.set('to', params.to);
	if (params?.category) url.searchParams.set('category', params.category);
	return `${url.pathname}${url.search}`;
}
