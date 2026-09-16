import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';
import { contactVisitTypeSchema } from './contact-visit.js';

/**
 * EVRAK-01 — kontrol listesinin **kendini işaretlemesi**.
 *
 * Bugüne kadar "eksik" listesini yalnız model yazıyordu: 80 mesajlık bağlamdan
 * "pasaport var mı" diye tahmin ediyordu. Artık evrak sınıflandırması ve vizit
 * alanları sayılabilir veri olduğu için madde durumu **hesaplanır**; model yalnız
 * yorum ekler (bkz. `ContactSummaryService`).
 *
 * Üç durum:
 *  - `done`    — kanıt bulundu (ilgili türde ek var / vizit alanı dolu).
 *  - `missing` — kanıt yok ve maddenin aşaması geldi.
 *  - `na`      — hesaplanamaz (maddenin `auto` eşlemesi yok) ya da aşaması gelmedi.
 */
export const patientChecklistStatusSchema = z.enum(['done', 'missing', 'na']);
export type PatientChecklistStatus = z.infer<typeof patientChecklistStatusSchema>;

export const patientChecklistItemStatusSchema = z.object({
	item_id: z.string().max(64),
	stage: z.string().max(120),
	label: z.string().max(200),
	warning: z.string().max(200),
	status: patientChecklistStatusSchema,
	/** Maddeyi karşılayan kanıt sayısı (ek adedi); `visit_field` maddelerinde 0/1. */
	evidence_count: z.number().int().nonnegative(),
	/** Kanıt olarak sayılan belge türleri — arayüz "ne yüklenmeli" diyebilsin. */
	doc_types: z.array(z.string().max(64))
});
export type PatientChecklistItemStatus = z.infer<typeof patientChecklistItemStatusSchema>;

/**
 * Bir vizit için madde durumları. `visit_id` null olan grup **vizitsiz** kanıtları
 * taşır: kişinin hiç viziti yoksa ya da ek hiçbir vizite bağlanamadıysa.
 */
export const patientChecklistVisitSchema = z.object({
	visit_id: uuid.nullable(),
	visit_type: contactVisitTypeSchema.nullable(),
	/** "2. vizit · 13 Eyl 2026 → 19 Eyl 2026" ya da "Vizit belirsiz". */
	visit_label: z.string().max(200),
	arrival_at: isoDateTime.nullable(),
	items: z.array(patientChecklistItemStatusSchema)
});
export type PatientChecklistVisit = z.infer<typeof patientChecklistVisitSchema>;

export const patientChecklistSchema = z.object({
	contact_id: uuid,
	/** Kişi türü Hasta değilse `false` ve `visits` boş — kontrol listesi hasta akışına ait. */
	is_patient: z.boolean(),
	visits: z.array(patientChecklistVisitSchema),
	generated_at: isoDateTime
});
export type PatientChecklist = z.infer<typeof patientChecklistSchema>;

/** "Vizit belirsiz" grubunun etiketi — sunucu ve arayüz aynı sözcüğü kullansın. */
export const PATIENT_CHECKLIST_UNKNOWN_VISIT_LABEL = 'Vizit belirsiz';
