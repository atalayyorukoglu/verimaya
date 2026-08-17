import { describe, expect, it } from 'vitest';
import { MAYA_UNKNOWN_TOKEN, emptyKnowledgeSections } from '@verimaya/shared';
import type { LlmClient, MayaAskContext } from '../integrations/llm';
import { MayaService } from './maya.service';
import type { SettingsService } from '../settings/settings.service';

/**
 * Maya'nın tek değişmez kuralı: **uydurmaz.** Bu spec o kuralı korur.
 * Bilgi bankasında olmayan bir şey sorulduğunda "bilmiyorum" dönmeli; asla
 * kendiliğinden fiyat/kural üretmemeli.
 */

function makeSettings(sections: Record<string, string>): SettingsService {
	return {
		getKnowledge: async () => ({
			sections: { ...emptyKnowledgeSections(), ...sections },
			is_default: false,
			updated_at: null,
			updated_by: null,
			pii_warnings: []
		})
	} as unknown as SettingsService;
}

function makeLlm(answer: string, heuristic = false): LlmClient {
	return {
		parseTransactionDrafts: async () => {
			throw new Error('not used');
		},
		answerFromKnowledge: async (_ctx: MayaAskContext) => ({ answer, heuristic })
	} as LlmClient;
}

describe('MayaService', () => {
	it('bilgi bankası boşsa LLM çağrılmaz ve knowledge_empty döner', async () => {
		let called = false;
		const llm = {
			parseTransactionDrafts: async () => {
				throw new Error('not used');
			},
			answerFromKnowledge: async () => {
				called = true;
				return { answer: 'uydurma cevap', heuristic: false };
			}
		} as LlmClient;

		const settings = {
			getKnowledge: async () => ({
				sections: emptyKnowledgeSections(),
				is_default: true,
				updated_at: null,
				updated_by: null,
				pii_warnings: []
			})
		} as unknown as SettingsService;

		const res = await new MayaService(settings, llm).ask('t1', { question: 'Fiyat ne?' });

		expect(called).toBe(false);
		expect(res.knowledge_empty).toBe(true);
		expect(res.grounded).toBe(false);
		expect(res.answer).toBe('');
	});

	it('model BILINMIYOR derse cevap boş kalır — uydurma metin sızmaz', async () => {
		const service = new MayaService(
			makeSettings({ services: 'Saç ekimi 2.500 EUR' }),
			makeLlm(MAYA_UNKNOWN_TOKEN)
		);
		const res = await service.ask('t1', { question: 'Diş implantı kaç para?' });

		expect(res.grounded).toBe(false);
		expect(res.answer).toBe('');
		expect(res.used_sections).toEqual([]);
		expect(res.knowledge_empty).toBe(false);
	});

	it('BILINMIYOR bir cümlenin içinde geçse bile grounded sayılmaz', async () => {
		// Model "Bu konuda BILINMIYOR ama tahminen 3.000 EUR olabilir" gibi bir şey
		// dönerse tahmini kullanıcıya göstermemeliyiz.
		const service = new MayaService(
			makeSettings({ services: 'Saç ekimi 2.500 EUR' }),
			makeLlm('Bu konuda BILINMIYOR ama tahminen 3.000 EUR olabilir')
		);
		const res = await service.ask('t1', { question: 'Diş implantı?' });

		expect(res.grounded).toBe(false);
		expect(res.answer).toBe('');
	});

	it('bilgi bankasından cevap gelirse grounded ve kaynak bölüm işaretlenir', async () => {
		const service = new MayaService(
			makeSettings({
				services: 'Saç ekimi (FUE) — 2.500 EUR, 3000 grefte kadar dahil.',
				payment: 'Kapora %30, kalan işlem günü.'
			}),
			makeLlm('Saç ekimi (FUE) — 2.500 EUR, 3000 grefte kadar dahil.')
		);
		const res = await service.ask('t1', { question: 'Saç ekimi kaça?' });

		expect(res.grounded).toBe(true);
		expect(res.answer).toContain('2.500 EUR');
		expect(res.used_sections).toContain('services');
		// Cevapta geçmeyen bölüm kaynak olarak işaretlenmemeli.
		expect(res.used_sections).not.toContain('payment');
	});

	it('LLM yapılandırılmamışsa heuristic bayrağı yanıtta görünür', async () => {
		const service = new MayaService(
			makeSettings({ services: 'Saç ekimi 2.500 EUR' }),
			makeLlm('Saç ekimi 2.500 EUR', true)
		);
		const res = await service.ask('t1', { question: 'Saç ekimi?' });

		expect(res.heuristic).toBe(true);
		expect(res.grounded).toBe(true);
	});
});
