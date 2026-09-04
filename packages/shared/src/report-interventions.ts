import { z } from 'zod';
import { isoDate, moneyMinor, uuid } from './common.js';
import { reportPeriodSchema } from './reports.js';

/**
 * AI-05 — müdahale listesi v1. `docs/2026-08-23-maya-icgoru-sorulari.md` § 7 adım 7.
 *
 * **Cümleler şablon, rakamlar SQL.** Bu dosya yalnız yapılandırılmış bulguyu tanımlar —
 * hiçbir alan Türkçe/İngilizce cümle taşımaz. Web tarafı `messages.ts` şablonundan
 * cümleyi kurar (`kind` + varsa `metric` anahtarına göre).
 *
 * **Tip başına en fazla `INTERVENTIONS_MAX_ITEMS_PER_GROUP` satır** — liste eyleme dönük
 * kalsın, tarama listesi olmasın.
 *
 * **Global sıralama YOK.** `severity` yalnız aynı `kind` içinde karşılaştırılabilir;
 * gruplar arasında ortak ölçek yoktur (bkz. `report-thresholds.ts`).
 */
export const INTERVENTIONS_MAX_ITEMS_PER_GROUP = 5;

export const interventionFindingKindSchema = z.enum([
	'quality_drop',
	'revenue_drop',
	'open_incident',
	'referral_value'
]);
export type InterventionFindingKind = z.infer<typeof interventionFindingKindSchema>;

/**
 * Drill-down hedefi. `route` bir SvelteKit rota id'si (`/contacts/[id]` gibi); `params`
 * hem yol parametrelerini hem de web tarafının query string'e çevireceği anahtarları taşır
 * (`from`/`to`/`tab`). İstemci hangi rotanın hangi parametreyi yol/query yapacağını bilir —
 * sabit üç rota kullanılıyor (`/reports`, `/referrals`, `/contacts/[id]`).
 */
export const interventionLinkSchema = z.object({
	route: z.string().min(1),
	params: z.record(z.string(), z.string()).optional()
});
export type InterventionLink = z.infer<typeof interventionLinkSchema>;

/**
 * `quality_drop` — hekim bazında RPT / no-show / iptal oranı kötüleşti.
 *
 * Yalnız hekim kırılımında üretilir: `appointment-metrics`'te klinik kırılımı
 * (`by_clinic`) yalnız `completion_rate` taşıyor, no-show/iptal/RPT ayrımı yok —
 * bu üçü yalnız hekim kırılımında (`by_doctor` + `by_doctor_type`) mevcut.
 *
 * `'RPT'` tip adı veriden gelir (tenant sözlüğünde o ad yoksa bu metrik hiç üretilmez) —
 * bkz. `docs/2026-08-23-maya-icgoru-sorulari.md` § Karar 2 ve `appointment-metrics`
 * yorumu (`'RPT' sunucuya gömülmez`).
 */
export const interventionQualityMetricSchema = z.enum([
	'rpt_rate',
	'no_show_rate',
	'cancel_rate'
]);
export type InterventionQualityMetric = z.infer<typeof interventionQualityMetricSchema>;

export const interventionQualityDropItemSchema = z.object({
	kind: z.literal('quality_drop'),
	subject_type: z.literal('doctor'),
	subject_id: uuid,
	subject_name: z.string(),
	metric: interventionQualityMetricSchema,
	/** Fraction [0,1] — web `formatPercent` ile gösterir. */
	current: z.number().min(0).max(1),
	previous: z.number().min(0).max(1),
	/** Bu dönemdeki randevu sayısı — eşiğin `minSample` kontrolüne dayandığı adet. */
	sample_size: z.number().int().nonnegative(),
	severity: z.number(),
	link: interventionLinkSchema
});
export type InterventionQualityDropItem = z.infer<typeof interventionQualityDropItemSchema>;

/** `revenue_drop` — dönem geliri veya neti düştü. Konu tenant'ın kendisi, bir kişi değil. */
export const interventionRevenueMetricSchema = z.enum(['income', 'net']);
export type InterventionRevenueMetric = z.infer<typeof interventionRevenueMetricSchema>;

export const interventionRevenueDropItemSchema = z.object({
	kind: z.literal('revenue_drop'),
	subject_type: z.literal('metric'),
	subject_id: interventionRevenueMetricSchema,
	subject_name: z.null(),
	metric: interventionRevenueMetricSchema,
	/** Tenant taban para birimi, kuruş (bkz. `reportSummaryDataSchema.income_base`). */
	current: moneyMinor,
	previous: moneyMinor,
	/** O dönemki işlem adedi (`summary.transaction_count`). */
	sample_size: z.number().int().nonnegative(),
	severity: z.number(),
	link: interventionLinkSchema
});
export type InterventionRevenueDropItem = z.infer<typeof interventionRevenueDropItemSchema>;

/**
 * `open_incident` — çözülmemiş olay kaydı. Delta değil mevcut durum: eşik uygulanmaz,
 * en eskiden yeniye sıralanır (en uzun süredir açık olan üstte).
 */
export const interventionOpenIncidentItemSchema = z.object({
	kind: z.literal('open_incident'),
	subject_type: z.literal('contact'),
	subject_id: uuid,
	subject_name: z.string(),
	incident_id: uuid,
	incident_type_name: z.string(),
	area: z.string(),
	occurred_on: isoDate,
	/** Bugüne kadar (UTC takvim günü) kaç gündür açık. */
	days_open: z.number().int().nonnegative(),
	severity: z.number(),
	link: interventionLinkSchema
});
export type InterventionOpenIncidentItem = z.infer<typeof interventionOpenIncidentItemSchema>;

/**
 * `referral_value` — en çok kazandıran referans verenler. Delta değil **değer** tipi;
 * eşik değil ilk N kuralı (`total_net_base > 0`, azalan sırayla ilk
 * `INTERVENTIONS_MAX_ITEMS_PER_GROUP`).
 */
export const interventionReferralValueItemSchema = z.object({
	kind: z.literal('referral_value'),
	subject_type: z.literal('contact'),
	subject_id: uuid,
	subject_name: z.string(),
	coordinator_name: z.string().nullable(),
	referred_count: z.number().int().nonnegative(),
	total_net_base: moneyMinor,
	severity: z.number(),
	link: interventionLinkSchema
});
export type InterventionReferralValueItem = z.infer<typeof interventionReferralValueItemSchema>;

export const interventionFindingItemSchema = z.discriminatedUnion('kind', [
	interventionQualityDropItemSchema,
	interventionRevenueDropItemSchema,
	interventionOpenIncidentItemSchema,
	interventionReferralValueItemSchema
]);
export type InterventionFindingItem = z.infer<typeof interventionFindingItemSchema>;

export const interventionGroupSchema = z.object({
	kind: interventionFindingKindSchema,
	items: z.array(interventionFindingItemSchema).max(INTERVENTIONS_MAX_ITEMS_PER_GROUP)
});
export type InterventionGroup = z.infer<typeof interventionGroupSchema>;

/**
 * Boş grup (`items: []`) cevaba hiç eklenmez — yalnız en az bir bulgusu olan `kind`ler
 * `groups` içinde yer alır. Hiç bulgu yoksa `groups: []`; ekran bunu olumlu gösterir
 * ("bu dönemde müdahale gerektiren bir şey görünmüyor").
 */
export const interventionsReportSchema = z.object({
	period: reportPeriodSchema,
	/** `from`/`to` eksikse veya pencere hesaplanamıyorsa `null` — delta bulguları üretilmez. */
	previous_period: reportPeriodSchema.nullable(),
	groups: z.array(interventionGroupSchema),
	/**
	 * Üretilemeyen bulgu tipleri ve sebebi. **Sessiz eksilme yerine görünür eksilme:**
	 * "revizyon sayılan randevu tipi ayarlanmamış" durumunda kalite bulguları hiç
	 * üretilmez — bunu söylemeden atlamak, kullanıcının eksik listeyi tam sanmasına
	 * yol açar (YAPIM-GUNLUGU § 14.3, sessiz açık yerine gürültülü hata).
	 */
	notices: z.array(
		z.object({
			code: z.enum(['revision_type_unset']),
			/** Kullanıcının gidip düzeltebileceği yer. */
			link: interventionLinkSchema
		})
	)
});
export type InterventionsReport = z.infer<typeof interventionsReportSchema>;
