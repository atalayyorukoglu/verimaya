import { z } from 'zod';
import { isoDate, isoDateTime, moneyMinor, supportedCurrencySchema, uuid } from './common.js';
import { contactStatusSchema } from './contact.js';
import { addCalendarDays, calendarDaysBetween } from './incentive-file.js';
import { transactionKindSchema } from './transaction.js';

export const reportPeriodParams = z.object({
	from: isoDate.optional(),
	to: isoDate.optional()
});
export type ReportPeriodParams = z.infer<typeof reportPeriodParams>;

/**
 * `compare=previous` — dönem karşılaştırması (yalnız `summary` + `appointment-metrics`,
 * docs/2026-08-23-maya-icgoru-sorulari.md § 6/7 adım 4). Diğer rapor uçları bu alanı
 * hiç okumaz; `reportPeriodParams`'ı genişletmek yerine ayrı bir şema tutuyoruz ki
 * onlar bu değişiklikten tamamen etkilenmesin.
 */
export const reportCompareParam = z.enum(['previous']);
export type ReportCompareParam = z.infer<typeof reportCompareParam>;

export const reportPeriodCompareParams = reportPeriodParams.extend({
	compare: reportCompareParam.optional()
});
export type ReportPeriodCompareParams = z.infer<typeof reportPeriodCompareParams>;

export const reportPeriodSchema = z.object({
	from: isoDate.nullable(),
	to: isoDate.nullable()
});
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;

/**
 * "Önceki dönem" penceresi — dönem karşılaştırmasının çekirdek kuralı
 * (docs/2026-08-23-maya-icgoru-sorulari.md § 6). `from`/`to` arasındaki gün sayısı kadar,
 * `from`'un bir gün öncesinde biten bir pencere.
 *
 * Örnek: `2026-08-01..2026-08-31` (31 gün) → `2026-07-01..2026-07-31`.
 * Örnek: `2026-08-10..2026-08-20` (11 gün) → `2026-07-30..2026-08-09`.
 *
 * Ay uzunluğu BİLİNÇLİ OLARAK eşitlenmez: Şubat 28 gün, Mart 31 gün olsa da kural sabit
 * kalır — ay adına göre değil pencere uzunluğuna göre karşılaştırıyoruz. Sonradan "şubat
 * neden kısa geldi" diye burayı "önceki ay" mantığına çevirmeyin, bu bilinçli bir tercih.
 *
 * `from`/`to` eksikse (sınırsız dönem) "öncesi" tanımsızdır → `null`. Çağıran `compare`'i
 * bu durumda sessizce yok sayar, hata vermez.
 */
export function previousReportPeriod(
	from: string | undefined,
	to: string | undefined
): { from: string; to: string } | null {
	if (!from || !to) return null;
	const dayCount = calendarDaysBetween(from, to) + 1;
	if (dayCount <= 0) return null;
	const prevTo = addCalendarDays(from, -1);
	const prevFrom = addCalendarDays(prevTo, -(dayCount - 1));
	return { from: prevFrom, to: prevTo };
}

export const reportFxMissingByCurrencySchema = z.object({
	currency: supportedCurrencySchema,
	/** Sum of native-currency amounts (minor) that could not be resolved into tenant base. */
	amount_minor: moneyMinor
});
export type ReportFxMissingByCurrency = z.infer<typeof reportFxMissingByCurrencySchema>;

export const reportSummaryDataSchema = z.object({
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
export type ReportSummaryData = z.infer<typeof reportSummaryDataSchema>;

/**
 * `compare=previous` — `previous` aynı şekli taşır (bkz. `reportSummaryDataSchema`), önceki
 * dönemin ham rakamlarıyla. Sunucu yüzde/fark üretmez; istemci iki bloğu da elinde tutup
 * deltayı kendi hesaplar (docs/2026-08-23-maya-icgoru-sorulari.md § 6). `compare`
 * verilmediğinde veya `from`/`to` eksikken bu alan tamamen YOK (undefined) — bugünkü
 * cevapla birebir aynı kalır, geriye dönük kırıcı değişiklik değildir.
 */
export const reportSummarySchema = reportSummaryDataSchema.extend({
	previous: reportSummaryDataSchema.optional()
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

/**
 * Hekim kırılımı — klinik kırılımıyla aynı fikir (Karar 1(b)), ama ham durum sayılarıyla:
 * "RPT oranı" gibi bir kırılım oranı istemcide `by_doctor_type`'tan hesaplanır, burada
 * sadece completed/no_show/cancelled/total taşınır (rate hesabı yok).
 */
export const reportDoctorMetricsRowSchema = z.object({
	doctor_contact_id: uuid.nullable(),
	doctor_name: z.string().min(1).max(255),
	total: z.number().int().nonnegative(),
	completed: z.number().int().nonnegative(),
	no_show: z.number().int().nonnegative(),
	cancelled: z.number().int().nonnegative()
});
export type ReportDoctorMetricsRow = z.infer<typeof reportDoctorMetricsRowSchema>;

/**
 * Hekim × randevu tipi çapraz sayımı. `'RPT'` sunucuya gömülmez — appointment_type
 * tenant'ın yönettiği bir sözlük; ham çapraz sayım döner, oran istemcide seçilen
 * tipe göre hesaplanır (bkz. docs/2026-08-23-maya-icgoru-sorulari.md § Karar 2).
 */
export const reportDoctorTypeCrossRowSchema = z.object({
	doctor_contact_id: uuid.nullable(),
	doctor_name: z.string().min(1).max(255),
	appointment_type: z.string().min(1).max(128),
	count: z.number().int().nonnegative()
});
export type ReportDoctorTypeCrossRow = z.infer<typeof reportDoctorTypeCrossRowSchema>;

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

export const reportAppointmentMetricsDataSchema = z.object({
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
	by_doctor: z.array(reportDoctorMetricsRowSchema),
	by_doctor_type: z.array(reportDoctorTypeCrossRowSchema),
	monthly: z.array(reportAppointmentMonthRowSchema)
});
export type ReportAppointmentMetricsData = z.infer<typeof reportAppointmentMetricsDataSchema>;

/**
 * `compare=previous` — `previous` aynı şekli taşır, önceki dönemin ham rakamlarıyla
 * (`by_doctor`/`by_clinic` dahil — bunlar zaten TAM agregat, sayfalanmış kısmi liste değil,
 * dolayısıyla istemci "tenant ortalaması" gibi türetilmiş değerleri bu tam kümeden kendi
 * hesaplayabilir; ayrı bir "average" alanı burada bilinçli olarak eklenmedi). `compare`
 * verilmediğinde veya `from`/`to` eksikken bu alan tamamen YOK (undefined).
 */
export const reportAppointmentMetricsSchema = reportAppointmentMetricsDataSchema.extend({
	previous: reportAppointmentMetricsDataSchema.optional()
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

/**
 * Tarih bazlı kohort — reklam ayı ≠ tahsilat ayı (ihtiyaç haritası §1.2).
 *
 * Kişi hangi ay oluşturulduysa o aya yazılır; tahsilatı ne zaman gelirse gelsin o kişinin
 * ayına sayılır. Kaynak bazlı `cohortBySource` (marketing) ile karıştırılmamalı.
 *
 * Dürüstlük: bu, kampanya bazlı atıf değildir — ayki harcamanın o ay gelen kişileri
 * getirdiğini varsayar (`note_key: cohort_attribution_assumption`).
 */
export const reportCohortsParams = z
	.object({
		from: isoDate.optional(),
		to: isoDate.optional(),
		/** Kişi türü filtresi; boşsa tüm türler. */
		contact_type: z.string().trim().min(1).max(120).optional()
	})
	.strict();
export type ReportCohortsParams = z.infer<typeof reportCohortsParams>;

/** Tahsilatın kohort ayına göre kaçıncı ayda geldiği (tenant base, minor). */
export const cohortMaturationSchema = z.object({
	m0: moneyMinor,
	m1: moneyMinor,
	m2: moneyMinor,
	m3_plus: moneyMinor
});
export type CohortMaturation = z.infer<typeof cohortMaturationSchema>;

export const reportCohortRowSchema = z.object({
	/** Kohort ayı `YYYY-MM` (contacts.created_at, tenant TZ). */
	cohort_month: z.string().regex(/^\d{4}-\d{2}$/),
	contacts: z.number().int().nonnegative(),
	/** En az bir `completed` randevusu olan kişi sayısı. */
	treated: z.number().int().nonnegative(),
	/**
	 * O ay içindeki reklam harcaması (tenant base).
	 *
	 * **`null` = o ay için hiç reklam verisi YOK** (entegrasyon o tarihte bağlı değildi,
	 * ya da sağlayıcı o ay hiç satır döndürmedi). `0` ise veri var ve harcama gerçekten sıfır.
	 * İkisi ayrı: `0` gösterilen bir ay "bedavaya hasta geldi" diye okunur; veri yoksa bunu
	 * iddia edemeyiz. Panel `null` için `—` gösterir.
	 */
	spend_base: moneyMinor.nullable(),
	/** Bu kohortun kişilerinden bugüne kadar tahsilat (tarih sınırı yok). */
	collected_base: moneyMinor,
	/** `collected_base / spend_base`; `spend_base` null ya da 0 ise null (0'a bölme yok). */
	roas: z.number().nullable(),
	maturation: cohortMaturationSchema
});
export type ReportCohortRow = z.infer<typeof reportCohortRowSchema>;

export const COHORT_ATTRIBUTION_NOTE_KEY = 'cohort_attribution_assumption' as const;

export const reportCohortsSchema = z.object({
	period: reportPeriodSchema,
	/** Panelde görünür dürüstlük notu — kampanya atıfı değildir. */
	note_key: z.literal(COHORT_ATTRIBUTION_NOTE_KEY),
	/** `amount_base` çözülemediği için sayılamayan tahsilat işlemi adedi (tüm kohortlar). */
	missing_fx_count: z.number().int().nonnegative(),
	items: z.array(reportCohortRowSchema)
});
export type ReportCohorts = z.infer<typeof reportCohortsSchema>;

/**
 * Referans değeri raporu (ihtiyaç haritası §A — "X 4 referans hasta gönderdi, koordinatörü Y").
 *
 * Yalnız DOĞRUDAN referans: `contacts.referred_by_contact_id` bir seviye izlenir.
 * "X'in getirdiğinin getirdiği" (zincir) v1'de YOK — özyinelemeli sorgu döngü koruması
 * ve derinlik sınırı ister, ayrı iş.
 *
 * Gelir tanımı `ContactsService.financeSummary` ile birebir aynı: her getirilen kişi için
 * `contact_id = X OR case_contact_id = X`, soft-delete hariç, tenant baz para birimine
 * `resolveBaseAmount` ile çevrilmiş. Referans ilişkisi zamansızdır (`referred_count` dönem
 * filtresinden etkilenmez) — yalnız işlemler `occurred_on` ile dönem filtrelenir. Yani bu
 * "bu dönemde getirdiği" değil, "getirdiklerinden bu dönemde gelen para"dır.
 */
export const reportReferralRowSchema = z.object({
	referrer_contact_id: uuid,
	referrer_display_name: z.string(),
	/** Referans verenin ünvanı (varsa); yalnız tanımlayıcı. */
	referrer_title_name: z.string().nullable(),
	/** Referans verenin `assigned_user_id`'sinden çözülür; atanmamışsa null. */
	coordinator_name: z.string().nullable(),
	/** Kaç kişi getirdi — soft-delete hariç, dönemden bağımsız. */
	referred_count: z.number().int().nonnegative(),
	/** Getirdiklerinden kaçında (dönem içinde) çözülebilir geliri var. */
	referred_with_revenue_count: z.number().int().nonnegative(),
	total_income_base: moneyMinor,
	total_expense_base: moneyMinor,
	total_net_base: moneyMinor
});
export type ReportReferralRow = z.infer<typeof reportReferralRowSchema>;

export const reportReferralsSchema = z.object({
	period: reportPeriodSchema,
	/** `total_net_base` azalan — en değerli referans veren üstte. */
	items: z.array(reportReferralRowSchema)
});
export type ReportReferrals = z.infer<typeof reportReferralsSchema>;

/**
 * Olay kaydı raporu — AI-05'in beslendiği asıl kaynak
 * (docs/2026-08-23-maya-icgoru-sorulari.md § 5/6). Agregasyon SQL'de (GROUP BY);
 * bu şema yalnız şekli tanımlar.
 *
 * İzin `contact:read` (operasyon verisi). `cost_totals` yalnız çağıranın ayrıca
 * `finance:read` izni varsa dolar — yoksa alan tümüyle yok sayılır (bkz.
 * ReportsController.incidents gerekçesi). Para birimi karışabileceği için tek sayı
 * yerine para birimi bazında dizi döner (transactions'ta amount_base yok — kur çevrimi
 * incident'a eklenmedi, bkz. olay kaydı tasarım kararı).
 */
export const incidentReportCostTotalSchema = z.object({
	currency: supportedCurrencySchema,
	amount: moneyMinor
});
export type IncidentReportCostTotal = z.infer<typeof incidentReportCostTotalSchema>;

const incidentReportCountsSchema = z.object({
	count: z.number().int().nonnegative(),
	open_count: z.number().int().nonnegative(),
	resolved_count: z.number().int().nonnegative()
});

export const reportIncidentsAreaRowSchema = incidentReportCountsSchema.extend({
	area: z.string(),
	cost_totals: z.array(incidentReportCostTotalSchema).optional()
});
export type ReportIncidentsAreaRow = z.infer<typeof reportIncidentsAreaRowSchema>;

export const reportIncidentsTypeRowSchema = incidentReportCountsSchema.extend({
	incident_type_id: uuid,
	incident_type_name: z.string(),
	area: z.string(),
	cost_totals: z.array(incidentReportCostTotalSchema).optional()
});
export type ReportIncidentsTypeRow = z.infer<typeof reportIncidentsTypeRowSchema>;

export const reportIncidentsResponsibleRowSchema = incidentReportCountsSchema.extend({
	responsible_contact_id: uuid.nullable(),
	responsible_display_name: z.string().nullable(),
	cost_totals: z.array(incidentReportCostTotalSchema).optional()
});
export type ReportIncidentsResponsibleRow = z.infer<typeof reportIncidentsResponsibleRowSchema>;

export const reportIncidentsSchema = z.object({
	period: reportPeriodSchema,
	total: incidentReportCountsSchema.extend({
		cost_totals: z.array(incidentReportCostTotalSchema).optional()
	}),
	by_area: z.array(reportIncidentsAreaRowSchema),
	by_type: z.array(reportIncidentsTypeRowSchema),
	by_responsible: z.array(reportIncidentsResponsibleRowSchema)
});
export type ReportIncidents = z.infer<typeof reportIncidentsSchema>;

/** Months between cohort `YYYY-MM` and payment `YYYY-MM-DD` (or `YYYY-MM`). */
export function cohortMonthDiff(cohortMonth: string, occurredOn: string): number {
	const [cy, cm] = cohortMonth.split('-').map(Number);
	const [oy, om] = occurredOn.slice(0, 7).split('-').map(Number);
	return (oy! - cy!) * 12 + (om! - cm!);
}

export function maturationBucket(diff: number): keyof CohortMaturation {
	if (diff <= 0) return 'm0';
	if (diff === 1) return 'm1';
	if (diff === 2) return 'm2';
	return 'm3_plus';
}

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
	| 'untouched-contacts'
	| 'cohorts'
	| 'referrals'
	| 'interventions';

/** Build a report URL (path + query only, no origin). */
export function reportUrl(
	path: ReportUrlPath,
	params?: {
		from?: string | null;
		to?: string | null;
		category?: string | null;
		contact_type?: string | null;
		/** `summary` / `appointment-metrics` only; other paths ignore it server-side. */
		compare?: ReportCompareParam | null;
	}
): string {
	const url = new URL(`/v1/reports/${path}`, 'http://local');
	if (params?.from) url.searchParams.set('from', params.from);
	if (params?.to) url.searchParams.set('to', params.to);
	if (params?.category) url.searchParams.set('category', params.category);
	if (params?.contact_type) url.searchParams.set('contact_type', params.contact_type);
	if (params?.compare) url.searchParams.set('compare', params.compare);
	return `${url.pathname}${url.search}`;
}
