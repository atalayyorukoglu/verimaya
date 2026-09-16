import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

/**
 * EVRAK-01 — WhatsApp ekinin **belge türü** (`docs/2026-09-16-HASTA-AKISI.md` § 5, § 6.3).
 *
 * Evrak grubundaki başlıklar zaten standart: `Ad Soyad + belge türü + visit N/rpt`.
 * Tür sözlüğü o başlıklardan çıkarıldı (5.000+ ek, 16 bin satırlık sohbet); sınıflandırma
 * saf fonksiyonla yapılır (`apps/api/src/whatsapp/evrak-sinifla.ts`), LLM yok — başlık
 * kalıbı sabit olduğu için modele gerek kalmıyor, maliyet ve belirsizlik de olmuyor.
 *
 * Tür listesi **kapalı**: yeni tür eklenince hem şema hem sınıflandırıcı hem kontrol
 * listesi eşlemesi birlikte güncellenir. `other` her zaman kalır — tanınmayan ek
 * kaybolmasın, "Tür belirsiz" grubunda görünsün.
 */
export const mediaDocTypeSchema = z.enum([
	'passport',
	'stamp',
	'registration_form',
	'consent_form',
	'xray_before',
	'xray_after_surgery',
	'xray_after',
	'invoice',
	'satisfaction_form',
	'certificate',
	'after_care_guidelines',
	'temporary_crown_guidelines',
	'post_operative_instructions',
	'doctor_approval',
	'lab_results',
	'tooth_shade_note',
	'other'
]);
export type MediaDocType = z.infer<typeof mediaDocTypeSchema>;

/** Türkçe etiketler — Dosyalar sekmesi, Drive adı ve özet aynı sözcükleri kullansın. */
export const mediaDocTypeLabels: Record<MediaDocType, string> = {
	passport: 'Pasaport',
	stamp: 'Giriş damgası',
	registration_form: 'Kayıt formu',
	consent_form: 'Onam formu',
	xray_before: 'X-ray (öncesi)',
	xray_after_surgery: 'X-ray (ameliyat sonrası)',
	xray_after: 'X-ray (bitim)',
	invoice: 'Fatura',
	satisfaction_form: 'Memnuniyet formu',
	certificate: 'Sertifika / garanti',
	after_care_guidelines: 'Bakım yönergesi',
	temporary_crown_guidelines: 'Geçici kron yönergesi',
	post_operative_instructions: 'Ameliyat sonrası yönerge',
	doctor_approval: 'Hekim onayı',
	lab_results: 'Lab / tetkik sonucu',
	tooth_shade_note: 'Diş rengi notu',
	other: 'Diğer'
};

/**
 * Onam formunun alt türü. Evrak grubunda tek bir "consent" yok: vizit onamı, tedavi
 * onamı, anestezi onamı, çekim, implant cerrahi, final protez, media release, klinik
 * politikası ve klinik kendi formu (TNC) ayrı ayrı imzalatılıyor.
 */
export const mediaDocSubtypeSchema = z.enum([
	'visit',
	'treatment',
	'general_anesthesia',
	'local_anesthesia',
	'extraction',
	'implant_surgery',
	'final_prosthesis',
	'media_release',
	'clinic_policy',
	'tnc_form'
]);
export type MediaDocSubtype = z.infer<typeof mediaDocSubtypeSchema>;

export const mediaDocSubtypeLabels: Record<MediaDocSubtype, string> = {
	visit: 'Vizit onamı',
	treatment: 'Tedavi onamı',
	general_anesthesia: 'Genel anestezi',
	local_anesthesia: 'Lokal anestezi',
	extraction: 'Diş çekimi',
	implant_surgery: 'İmplant cerrahisi',
	final_prosthesis: 'Final protez',
	media_release: 'Görsel kullanım izni',
	clinic_policy: 'Klinik politikası',
	tnc_form: 'TNC formu'
};

/**
 * Başlıktan çıkan **vizit ipucu**. `contact_visits.visit_type` ile aynı sözcükler
 * (`other` hariç): ipucu doğrudan vizitle karşılaştırılabilsin.
 */
export const mediaVisitHintSchema = z.enum([
	'consultation',
	'visit_1',
	'visit_2',
	'visit_3',
	'rpt'
]);
export type MediaVisitHint = z.infer<typeof mediaVisitHintSchema>;

export const mediaVisitHintLabels: Record<MediaVisitHint, string> = {
	consultation: 'Konsültasyon',
	visit_1: '1. vizit',
	visit_2: '2. vizit',
	visit_3: '3. vizit',
	rpt: 'RPT'
};

/** Drive dosya adındaki tür etiketi: `2026-09-14-1141-visit2-consent-form.jpg`. */
export const mediaDocTypeSlugs: Record<MediaDocType, string> = {
	passport: 'passport',
	stamp: 'stamp',
	registration_form: 'registration-form',
	consent_form: 'consent-form',
	xray_before: 'xray-before',
	xray_after_surgery: 'xray-after-surgery',
	xray_after: 'xray-after',
	invoice: 'invoice',
	satisfaction_form: 'satisfaction-form',
	certificate: 'certificate',
	after_care_guidelines: 'after-care-guidelines',
	temporary_crown_guidelines: 'temporary-crown-guidelines',
	post_operative_instructions: 'post-operative-instructions',
	doctor_approval: 'doctor-approval',
	lab_results: 'lab-results',
	tooth_shade_note: 'tooth-shade-note',
	other: 'other'
};

export const mediaVisitHintSlugs: Record<MediaVisitHint, string> = {
	consultation: 'consultation',
	visit_1: 'visit1',
	visit_2: 'visit2',
	visit_3: 'visit3',
	rpt: 'rpt'
};

/* --------------------------------------------------- kişi › Dosyalar sekmesi */

/**
 * Kişiye bağlı bir WhatsApp eki. `files` tablosundaki elle yüklenen belgelerden
 * AYRI: bunlar `inbound_message_media` satırları, kaynağı WhatsApp mesajıdır.
 */
export const contactMediaSchema = z.object({
	id: uuid,
	inbound_message_id: uuid,
	filename: z.string().max(255).nullable(),
	mime_type: z.string().max(120),
	size_bytes: z.number().int().nonnegative(),
	doc_type: mediaDocTypeSchema.nullable(),
	doc_subtype: mediaDocSubtypeSchema.nullable(),
	visit_hint: mediaVisitHintSchema.nullable(),
	contact_visit_id: uuid.nullable(),
	/** Sınıflandırmanın dayandığı başlık (mesajın kendi metni ya da bağlam metni). */
	caption: z.string().max(400).nullable(),
	/** WhatsApp'ın mesajla gönderdiği küçük JPEG önizleme (data URL); yoksa null. */
	thumbnail: z.string().max(200_000).nullable(),
	created_at: isoDateTime
});
export type ContactMedia = z.infer<typeof contactMediaSchema>;

export const contactMediaListSchema = z.object({ items: z.array(contactMediaSchema) });
export type ContactMediaList = z.infer<typeof contactMediaListSchema>;

/**
 * Elle düzeltme. Verilmeyen alana dokunulmaz; `null` alanı boşaltır (ör. yanlış
 * eşlenen viziti sökmek). Sınıflandırıcı yanılırsa kullanıcı burayı düzeltir ve
 * yeniden sınıflandırma bu satırı EZER — bu yüzden `doc_type_locked` yok: yeniden
 * sınıflandırma açıkça "tenant'ın tüm eklerini yeniden etiketle" demek.
 */
export const contactMediaUpdateSchema = z
	.object({
		doc_type: mediaDocTypeSchema.nullable().optional(),
		doc_subtype: mediaDocSubtypeSchema.nullable().optional(),
		contact_visit_id: uuid.nullable().optional()
	})
	.strict();
export type ContactMediaUpdate = z.infer<typeof contactMediaUpdateSchema>;

/** `POST /v1/whatsapp/media/reclassify` yanıtı. */
export const mediaReclassifyResultSchema = z.object({
	/** Taranan ek sayısı. */
	scanned: z.number().int().nonnegative(),
	/** Tür/alt tür/vizit ipucu değişen ek sayısı. */
	updated: z.number().int().nonnegative(),
	/** Yeni vizite bağlanan ek sayısı. */
	linked_to_visit: z.number().int().nonnegative()
});
export type MediaReclassifyResult = z.infer<typeof mediaReclassifyResultSchema>;
