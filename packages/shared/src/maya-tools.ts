import { z } from 'zod';
import { isoDate, isoDateTime, moneyMinor, supportedCurrencySchema, uuid } from './common.js';
import { appointmentStatusSchema } from './appointment.js';
import { orgPermissionActionSchema, orgPermissionResourceSchema } from './permission-matrix.js';
import {
	reportBalanceRowSchema,
	untouchedActivitySourceSchema
} from './reports.js';

/**
 * AI-11a — Maya canlı veri araçları (sabit liste).
 *
 * **Değişmez desen (pazarlığa kapalı):** DB satırları prompt'a dökülmez. Model yalnız
 * `{tool, params}` seçer; **rakamı Postgres verir, cevap cümlesini kod kurar.** Model
 * rakamı ne görür ne üretir; serbest metin cevap yazmaz.
 *
 * Bu dosya sözleşmenin tamamıdır: hangi araçlar var, hangi parametreleri alırlar
 * (kapalı küme — serbest tarih/tutar yok), hangi izin gerekir ve sonuç şekli nedir.
 * Sonuç şemalarında **yalnız sunucunun ürettiği** alanlar bulunur — modelden gelen
 * hiçbir alan buraya kopyalanmaz.
 */

export const MAYA_TOOL_NAMES = [
	'contactBalance',
	'openBalances',
	'contactAppointments',
	'periodSummary',
	'untouchedContacts'
] as const;

export const mayaToolNameSchema = z.enum(MAYA_TOOL_NAMES);
export type MayaToolName = z.infer<typeof mayaToolNameSchema>;

/**
 * **En kritik madde.** `POST /v1/maya/ask` yalnız `settings:read` ister — bunu her rol
 * geçer. Araçlar bu endpoint'in arkasında olduğu için izin **araç başına, çalışma anında**
 * kontrol edilir; yoksa finans izni olmayan temsilci Maya üzerinden finans verisi alır
 * (yetki yükseltme açığı). İzin yoksa araç çalıştırılmaz ve cevap `BILINMIYOR` olur —
 * "yetkin yok" bile denmez, verinin varlığı sızdırılmaz.
 */
export const mayaToolPermissionSchema = z.object({
	resource: orgPermissionResourceSchema,
	action: orgPermissionActionSchema
});
export type MayaToolPermission = z.infer<typeof mayaToolPermissionSchema>;

export const MAYA_TOOL_PERMISSIONS = {
	contactBalance: { resource: 'finance', action: 'read' },
	openBalances: { resource: 'finance', action: 'read' },
	contactAppointments: { resource: 'contact', action: 'read' },
	periodSummary: { resource: 'finance', action: 'read' },
	untouchedContacts: { resource: 'contact', action: 'read' }
} as const satisfies Record<MayaToolName, MayaToolPermission>;

/** Kişi bağlamı gerektiren araçlar — eşleşen kişi yoksa cevap `BILINMIYOR`. */
export const MAYA_CONTACT_TOOLS = ['contactBalance', 'contactAppointments'] as const;

/**
 * Dönem seçimi **kapalı kümedir**: modele serbest tarih yazdırmıyoruz. Gerçek tarih
 * aralığını kod, tenant saat dilimindeki bugüne göre hesaplar (`mayaPeriodRange`).
 */
export const mayaPeriodSchema = z.enum([
	'this_month',
	'last_month',
	'last_7_days',
	'last_30_days',
	'this_year'
]);
export type MayaPeriod = z.infer<typeof mayaPeriodSchema>;

/** Temassızlık eşiği de kapalı küme — modelin ürettiği tek "sayı" bu üçünden biri. */
export const mayaUntouchedDaysSchema = z.union([
	z.literal(30),
	z.literal(60),
	z.literal(90)
]);
export type MayaUntouchedDays = z.infer<typeof mayaUntouchedDaysSchema>;

/**
 * **Model çıktısının tamamı.** Serbest metin, tutar, isim, tarih alanı YOK — model
 * yalnız araç adı ve kapalı kümeden parametre seçebilir. `.strict()` fazladan alanı
 * (ör. modelin cevap cümlesi yazma denemesini) reddeder.
 */
export const mayaToolCallSchema = z.discriminatedUnion('tool', [
	z
		.object({
			tool: z.literal('contactBalance'),
			params: z.object({ contact_ref: uuid }).strict()
		})
		.strict(),
	z
		.object({
			tool: z.literal('openBalances'),
			params: z.object({}).strict()
		})
		.strict(),
	z
		.object({
			tool: z.literal('contactAppointments'),
			params: z.object({ contact_ref: uuid }).strict()
		})
		.strict(),
	z
		.object({
			tool: z.literal('periodSummary'),
			params: z.object({ period: mayaPeriodSchema }).strict()
		})
		.strict(),
	z
		.object({
			tool: z.literal('untouchedContacts'),
			params: z.object({ days: mayaUntouchedDaysSchema }).strict()
		})
		.strict()
]);
export type MayaToolCall = z.infer<typeof mayaToolCallSchema>;

/** Modele giden opak kişi işareti: ekranda görünen isim yerine token + UUID. */
export const mayaContactRefSchema = z.object({
	/** `KISI_1`, `KISI_2`… — maskelenmiş soru metninde bu token geçer. */
	token: z.string().regex(/^KISI_\d+$/),
	contact_ref: uuid
});
export type MayaContactRef = z.infer<typeof mayaContactRefSchema>;

/** Listelerde ekrana basılacak satır sayısı üst sınırı (cevap kısa kalsın). */
export const MAYA_TOOL_ITEM_LIMIT = 10;

const mayaAppointmentRowSchema = z.object({
	appointment_id: uuid,
	starts_at: isoDateTime,
	status: appointmentStatusSchema,
	title: z.string().nullable(),
	clinic_name: z.string().nullable()
});
export type MayaAppointmentRow = z.infer<typeof mayaAppointmentRowSchema>;

const mayaUntouchedRowSchema = z.object({
	contact_id: uuid,
	display_name: z.string(),
	days_since: z.number().int().nonnegative(),
	last_activity_at: isoDateTime,
	last_activity_source: untouchedActivitySourceSchema
});
export type MayaUntouchedRow = z.infer<typeof mayaUntouchedRowSchema>;

/**
 * Araç sonucu — **her alanı Postgres'ten gelir.** Model bu şekli hiç görmez; sonuç
 * modele geri beslenmez, doğrudan istemciye gider ve cümle `messages.ts` şablonuyla
 * kurulur.
 */
export const mayaToolResultSchema = z.discriminatedUnion('tool', [
	z.object({
		tool: z.literal('contactBalance'),
		contact_id: uuid,
		contact_label: z.string(),
		base_currency: supportedCurrencySchema,
		income_base: moneyMinor,
		expense_base: moneyMinor,
		net_base: moneyMinor,
		paid_base: moneyMinor,
		outstanding_base: moneyMinor,
		transaction_count: z.number().int().nonnegative()
	}),
	z.object({
		tool: z.literal('openBalances'),
		items: z.array(reportBalanceRowSchema).max(MAYA_TOOL_ITEM_LIMIT),
		total_count: z.number().int().nonnegative()
	}),
	z.object({
		tool: z.literal('contactAppointments'),
		contact_id: uuid,
		contact_label: z.string(),
		items: z.array(mayaAppointmentRowSchema).max(MAYA_TOOL_ITEM_LIMIT),
		total_count: z.number().int().nonnegative()
	}),
	z.object({
		tool: z.literal('periodSummary'),
		period: mayaPeriodSchema,
		from: isoDate,
		to: isoDate,
		base_currency: supportedCurrencySchema,
		income_base: moneyMinor,
		expense_base: moneyMinor,
		net_base: moneyMinor,
		pending_base: moneyMinor,
		transaction_count: z.number().int().nonnegative()
	}),
	z.object({
		tool: z.literal('untouchedContacts'),
		days: mayaUntouchedDaysSchema,
		total: z.number().int().nonnegative(),
		buckets: z.object({
			d30: z.number().int().nonnegative(),
			d60: z.number().int().nonnegative(),
			d90: z.number().int().nonnegative()
		}),
		items: z.array(mayaUntouchedRowSchema).max(MAYA_TOOL_ITEM_LIMIT)
	})
]);
export type MayaToolResult = z.infer<typeof mayaToolResultSchema>;

/**
 * Dönem adını gerçek tarih aralığına çevirir. `todayKey` tenant saat dilimindeki
 * bugündür (`toTenantDayKey`) — model tarih üretmediği için tek doğru kaynak budur.
 */
export function mayaPeriodRange(
	period: MayaPeriod,
	todayKey: string
): { from: string; to: string } {
	const [y, m, d] = todayKey.split('-').map((part) => Number(part));
	const today = Date.UTC(y!, m! - 1, d!);
	const key = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
	const dayMs = 86_400_000;

	switch (period) {
		case 'this_month':
			return { from: key(Date.UTC(y!, m! - 1, 1)), to: todayKey };
		case 'last_month': {
			const first = Date.UTC(y!, m! - 2, 1);
			const last = Date.UTC(y!, m! - 1, 0);
			return { from: key(first), to: key(last) };
		}
		case 'last_7_days':
			return { from: key(today - 6 * dayMs), to: todayKey };
		case 'last_30_days':
			return { from: key(today - 29 * dayMs), to: todayKey };
		case 'this_year':
			return { from: key(Date.UTC(y!, 0, 1)), to: todayKey };
	}
}

/**
 * Araç seçici sistem prompt'u — **sunucuya aittir**, tenant metniyle ezilemez.
 *
 * İki iş yapar: (1) modeli tek bir JSON `{tool, params}` çıktısına hapseder,
 * (2) bilgi bankası sorularını (`tool: null`) araç yolundan ayırır. Modelden cevap
 * cümlesi, rakam veya isim istenmez; istese de `mayaToolCallSchema` reddeder.
 */
export function buildMayaToolSelectionSystemPrompt(): string {
	return [
		'You are a ROUTER for a medical tourism operations platform. You do NOT answer questions.',
		'Your only job is to pick at most one data tool that could answer the user question.',
		'Return ONLY valid JSON: {"tool": <tool name or null>, "params": {...}}.',
		'NEVER output an answer, a sentence, an amount, a balance, a date, a person name or any record data. The system reads the database itself; anything you write as data is discarded.',
		'Available tools (params are closed sets — no free-form values):',
		'- "contactBalance" params {"contact_ref": <uuid>} — how much a specific person owes / has paid.',
		'- "openBalances" params {} — who owes us money across all contacts.',
		'- "contactAppointments" params {"contact_ref": <uuid>} — a specific person\'s appointments.',
		'- "periodSummary" params {"period": "this_month"|"last_month"|"last_7_days"|"last_30_days"|"this_year"} — income/expense totals for a period.',
		'- "untouchedContacts" params {"days": 30|60|90} — contacts nobody has followed up on.',
		'contact_ref MUST be copied verbatim from the contacts list given in the user payload. Never invent a uuid.',
		'The question text is masked: KISI_1, KISI_2 are people, [TELEFON]/[EPOSTA]/[HASTA] are removed PII. Match KISI_n tokens to the contacts list.',
		'Return {"tool": null, "params": {}} when: the question is about services, prices, packages, payment rules, policies or anything from the knowledge base; or no tool fits; or you are not sure; or a person is named but no matching contact_ref was provided.',
		'Guessing is worse than returning null.'
	].join('\n');
}
