import { z } from 'zod';
import { isoDateTime } from './common.js';

/** Default Turkish disclosure text (EU AI Act Art. 50 transparency). */
export const DEFAULT_WHATSAPP_AI_DISCLOSURE_TEXT =
	'Bu yanıt yapay zekâ desteğiyle oluşturulmuştur. İnsan operatör doğrulaması uygulanabilir.';

/** Persisted tenant_settings key = `whatsapp_ai_disclosure`. */
export const whatsappAiDisclosureSchema = z.object({
	enabled: z.boolean(),
	text: z.string().min(1).max(2000),
	updated_by: z.string().max(255).nullable(),
	updated_at: isoDateTime.nullable()
});
export type WhatsappAiDisclosure = z.infer<typeof whatsappAiDisclosureSchema>;

/** PUT body — server fills updated_by / updated_at. */
export const whatsappAiDisclosureUpdateSchema = z.object({
	enabled: z.boolean(),
	text: z.string().min(1).max(2000)
});
export type WhatsappAiDisclosureUpdate = z.infer<typeof whatsappAiDisclosureUpdateSchema>;

export function defaultWhatsappAiDisclosure(): WhatsappAiDisclosure {
	return {
		enabled: false,
		text: DEFAULT_WHATSAPP_AI_DISCLOSURE_TEXT,
		updated_by: null,
		updated_at: null
	};
}
