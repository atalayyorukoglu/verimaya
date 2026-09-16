import { z } from 'zod';
import { isoDateTime, moneyMinor, supportedCurrencySchema, uuid } from './common.js';
import { contactVisitStatusSchema, contactVisitTypeSchema } from './contact-visit.js';

/**
 * PARA-01 — **vizit bazlı para mutabakatı** (`docs/2026-09-16-HASTA-AKISI.md` § 6.4).
 *
 * Finans Özet bugüne kadar kişinin tüm para satırlarını tek torbada topluyordu:
 * "8.260 aldık, 4.030 gider" — hangi vizitin kârı belli değildi. Akış vizit başına
 * ilerlediği için (1. vizit 4.030 alındı, 2. vizit kalan 3.950) mutabakat da vizit
 * başına olmalı. Bu şema kişi kartındaki "Vizit mutabakatı" tablosunun sözleşmesidir.
 *
 * **Ödeme / gider ayrımı bilinçli asimetrik:**
 *  - Ödeme (`income`): kişi ya karşı taraf (`contact_id`) ya da hasta (`case_contact_id`).
 *    Tahsilat bazen hastanın kendi adına, bazen eşi/refakatçisi üzerinden yazılıyor.
 *  - Gider (`expense`): yalnız `case_contact_id`. Otel faturasının karşı tarafı otel,
 *    hekim payının karşı tarafı hekimdir; gideri hastaya bağlayan tek alan budur.
 *    `contact_id` üzerinden saymak "hastaya ödediğimiz" satırları kâra gider yazardı.
 *
 * **Kur:** yalnız `transactions.amount_base` anlık görüntüsü kullanılır — canlı kur yok.
 * Çevrilemeyen satır toplama girmez, `unconverted_count` ile sayılır: eksik toplam
 * göstermek, yanlış toplam göstermekten iyidir.
 */

/** Gider kırılımının bir satırı — kategori adı ham `transactions.category` metnidir. */
export const visitLedgerExpenseBucketSchema = z.object({
	/** Kategori adı; kategorisiz satırlar `null` altında toplanır. */
	category: z.string().max(128).nullable(),
	amount_base: moneyMinor,
	count: z.number().int().nonnegative()
});
export type VisitLedgerExpenseBucket = z.infer<typeof visitLedgerExpenseBucketSchema>;

export const contactVisitLedgerRowSchema = z.object({
	/** `null` → "Vizit belirsiz": hiçbir vizite bağlanamayan para satırları. */
	visit_id: uuid.nullable(),
	visit_type: contactVisitTypeSchema.nullable(),
	visit_status: contactVisitStatusSchema.nullable(),
	/** "2. vizit · 13 Eyl 2026 → 19 Eyl 2026" ya da "Vizit belirsiz". */
	visit_label: z.string().max(200),
	arrival_at: isoDateTime.nullable(),
	/** Hasta ödemeleri toplamı (baz para birimi, minor units). */
	income_base: moneyMinor,
	/** Hasta giderleri toplamı (baz para birimi, minor units). */
	expense_base: moneyMinor,
	/** Kâr = ödeme − gider. Negatif olabilir. */
	profit_base: moneyMinor,
	/** Gider kırılımı — kategoriye göre, büyükten küçüğe. */
	expense_by_category: z.array(visitLedgerExpenseBucketSchema),
	/** Vizitin teklif toplamı (`contact_visits.quoted_total_minor`), varsa. */
	quoted_total_minor: moneyMinor.nonnegative().nullable(),
	quoted_currency: supportedCurrencySchema.nullable(),
	/**
	 * Teklif para biriminde tahsil edilen — **native** tutarlar toplanır, kur
	 * çevrimi yapılmaz. Teklif GBP ise GBP tahsilat sayılır; başka para birimindeki
	 * tahsilat `other_currency_income_count` ile bildirilir, toplama girmez.
	 */
	collected_quoted_minor: moneyMinor.nullable(),
	/** Kalan = teklif − tahsilat (teklif para biriminde). Teklif yoksa `null`. */
	remaining_quoted_minor: moneyMinor.nullable(),
	/** Teklif para biriminden farklı para birimindeki ödeme sayısı (uyarı için). */
	other_currency_income_count: z.number().int().nonnegative(),
	transaction_count: z.number().int().nonnegative(),
	/** `amount_base` çözülemediği için toplama giremeyen satır sayısı. */
	unconverted_count: z.number().int().nonnegative()
});
export type ContactVisitLedgerRow = z.infer<typeof contactVisitLedgerRowSchema>;

export const contactVisitLedgerSchema = z.object({
	contact_id: uuid,
	/** Kişi türü Hasta değilse `false` ve `rows` boş — mutabakat hasta akışına ait. */
	is_patient: z.boolean(),
	base_currency: supportedCurrencySchema,
	rows: z.array(contactVisitLedgerRowSchema),
	/** Tüm satırların toplamı — tablonun alt satırı. */
	totals: z.object({
		income_base: moneyMinor,
		expense_base: moneyMinor,
		profit_base: moneyMinor,
		transaction_count: z.number().int().nonnegative(),
		unconverted_count: z.number().int().nonnegative()
	}),
	generated_at: isoDateTime
});
export type ContactVisitLedger = z.infer<typeof contactVisitLedgerSchema>;

/** "Vizit belirsiz" — sunucu, kontrol listesi ve arayüz aynı sözcüğü kullansın. */
export const VISIT_LEDGER_UNKNOWN_VISIT_LABEL = 'Vizit belirsiz';
