import { describe, expect, it } from 'vitest';
import {
	WHATSAPP_AI_PROMPT_MAX_LENGTH,
	defaultWhatsappAiPrompt,
	frameTenantAiPromptNote,
	whatsappAiPromptUpdateSchema
} from './ai-prompt.js';

describe('whatsappAiPrompt (G-26)', () => {
	it('default is empty note + is_default', () => {
		expect(defaultWhatsappAiPrompt()).toEqual({
			text: '',
			is_default: true,
			updated_by: null,
			updated_at: null
		});
	});

	it(`rejects text longer than ${WHATSAPP_AI_PROMPT_MAX_LENGTH}`, () => {
		const result = whatsappAiPromptUpdateSchema.safeParse({
			text: 'x'.repeat(WHATSAPP_AI_PROMPT_MAX_LENGTH + 1)
		});
		expect(result.success).toBe(false);
	});

	it('rejects empty / whitespace-only text', () => {
		expect(whatsappAiPromptUpdateSchema.safeParse({ text: '' }).success).toBe(false);
		expect(whatsappAiPromptUpdateSchema.safeParse({ text: '   ' }).success).toBe(false);
	});

	it('frames tenant note as non-instructional context', () => {
		const framed = frameTenantAiPromptNote('Prefer GBP amounts');
		expect(framed).toContain('not instructions');
		expect(framed).toContain('Prefer GBP amounts');
		expect(framed).toContain('<<<');
		expect(frameTenantAiPromptNote('  ')).toBe('');
	});
});
