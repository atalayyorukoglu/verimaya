import { z } from 'zod';
import { cursorPageSchema, isoDate, isoDateTime, supportedCurrencySchema, uuid } from './common.js';

/**
 * Olay kaydı (incident) — sistemin "ne oldu"yu bilip "ne ters gitti"yi bilmediği
 * boşluğu kapatan tek tablo. Bkz. docs/2026-08-23-maya-icgoru-sorulari.md § 5.
 *
 * Altı alan şema düzeyinde var (departman genişlemesi veri değişikliği olsun, şema
 * değişikliği olmasın diye) ama **v1 yalnız `clinic` seed edilir ve UI yalnız klinik
 * gösterir** — diğerleri karar bekliyor (docs/FIKIRLER.md § Olay kaydı — diğer departmanlar).
 */
export const incidentAreaSchema = z.enum([
	'clinic',
	'hotel',
	'transfer',
	'sales',
	'marketing',
	'coordination'
]);
export type IncidentArea = z.infer<typeof incidentAreaSchema>;

export const incidentStatusSchema = z.enum(['open', 'resolved']);
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;

/**
 * Olay türü sözlüğü — `contact_titles` ile birebir aynı desen (tenant yönetir, FK,
 * `sort_order`), ek olarak `area` taşır. Kullanımdaki tür silinemez (RESTRICT) —
 * `contact_titles`'ın aksine: burada tür olayın *ne olduğunu* tanımlıyor, boşalırsa
 * kayıt anlamsızlaşır.
 */
export const incidentTypeSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	area: incidentAreaSchema,
	name: z.string().min(1).max(128),
	sort_order: z.number().int().nonnegative().default(0),
	/** Bu türü kullanan olay sayısı (soft-delete hariç). Silme onayında gösterilir. */
	usage_count: z.number().int().nonnegative().default(0),
	created_at: isoDateTime
});
export type IncidentType = z.infer<typeof incidentTypeSchema>;

export const incidentTypeCreateSchema = z.object({
	area: incidentAreaSchema,
	name: z.string().min(1).max(128)
});
export type IncidentTypeCreate = z.infer<typeof incidentTypeCreateSchema>;

/** Rename only — `area` sabit kalır (tür hangi departmana ait olduğunu değiştirmez). */
export const incidentTypeUpdateSchema = z
	.object({
		name: z.string().min(1).max(128)
	})
	.strict();
export type IncidentTypeUpdate = z.infer<typeof incidentTypeUpdateSchema>;

export const incidentTypeListQuerySchema = z
	.object({
		/** Verilmezse tüm alanlardaki türler döner (ileride yönetim ekranı için). */
		area: incidentAreaSchema.optional()
	})
	.strict();
export type IncidentTypeListQuery = z.infer<typeof incidentTypeListQuerySchema>;

/**
 * Tam kayıt — liste/detay cevabı. Dosya/tür/sorumlu isimleri denormalize gelir
 * (liste ekranı join'siz render eder — `contacts.title_name` deseniyle aynı ilke).
 */
export const incidentSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	contact_id: uuid,
	contact_display_name: z.string(),
	incident_type_id: uuid,
	incident_type_name: z.string(),
	area: incidentAreaSchema,
	appointment_id: uuid.nullable(),
	responsible_contact_id: uuid.nullable(),
	responsible_display_name: z.string().nullable(),
	cost_amount: z.number().int().nullable(),
	cost_currency: supportedCurrencySchema.nullable(),
	status: incidentStatusSchema,
	description: z.string().nullable(),
	occurred_on: isoDate,
	resolved_at: isoDateTime.nullable(),
	created_at: isoDateTime,
	updated_at: isoDateTime
});
export type Incident = z.infer<typeof incidentSchema>;

export const incidentListPageSchema = cursorPageSchema(incidentSchema);
export type IncidentListPage = z.infer<typeof incidentListPageSchema>;

function requireCostPairBothOrNeither(
	body: { cost_amount?: number | null; cost_currency?: string | null },
	ctx: z.RefinementCtx
) {
	const hasAmount = body.cost_amount != null;
	const hasCurrency = body.cost_currency != null;
	if (hasAmount !== hasCurrency) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: 'cost_amount and cost_currency must be both set or both empty',
			path: ['cost_amount']
		});
	}
}

/**
 * `responsible_contact_id` verilmezse ve `appointment_id` verilmişse sunucu
 * randevunun `clinic_contact_id`'sini otomatik kopyalar — kullanıcı ekstra alan
 * doldurmaz, rapor yine de "hangi klinik" kırılımını alır (bkz. incidents.service.ts).
 */
export const incidentCreateSchema = z
	.object({
		contact_id: uuid,
		incident_type_id: uuid,
		appointment_id: uuid.nullable().optional(),
		responsible_contact_id: uuid.nullable().optional(),
		cost_amount: z.number().int().nonnegative().nullable().optional(),
		cost_currency: supportedCurrencySchema.nullable().optional(),
		description: z.string().trim().max(4000).nullable().optional(),
		occurred_on: isoDate
	})
	.strict()
	.superRefine(requireCostPairBothOrNeither);
export type IncidentCreate = z.infer<typeof incidentCreateSchema>;

export const incidentResolveResultSchema = incidentSchema;
