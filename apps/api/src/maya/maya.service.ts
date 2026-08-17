import { Inject, Injectable } from '@nestjs/common';
import {
	MAYA_UNKNOWN_TOKEN,
	buildKnowledgeContext,
	KNOWLEDGE_SECTIONS,
	type KnowledgeSection,
	type MayaAnswer,
	type MayaAsk
} from '@verimaya/shared';
import { LLM_CLIENT, type LlmClient } from '../integrations/llm';
import { SettingsService } from '../settings/settings.service';

/**
 * Maya — bilgi bankasına dayalı soru-cevap.
 *
 * Tek kural: **uydurma yok.** Cevap yalnız tenant'ın bilgi bankasından çıkar. Bilgi
 * bankasında yoksa "bilmiyorum" döner. Sağlık turizminde uydurulmuş bir fiyat, cevapsızlıktan
 * çok daha pahalıdır — müşteriye yanlış taahhüt olur.
 */
@Injectable()
export class MayaService {
	constructor(
		private readonly settings: SettingsService,
		@Inject(LLM_CLIENT) private readonly llm: LlmClient
	) {}

	async ask(tenantId: string, input: MayaAsk): Promise<MayaAnswer> {
		const knowledge = await this.settings.getKnowledge(tenantId);
		const context = buildKnowledgeContext(knowledge.sections);

		if (context == null) {
			// Bilgi bankası boş: LLM'e hiç gitme. Boş bağlamla model uydurmaya yatkın,
			// ayrıca boşuna para ve gecikme olur.
			return {
				answer: '',
				grounded: false,
				used_sections: [],
				knowledge_empty: true,
				heuristic: false
			};
		}

		const result = await this.llm.answerFromKnowledge({
			question: input.question,
			knowledge: context
		});

		const trimmed = result.answer.trim();
		const grounded = trimmed.length > 0 && !trimmed.includes(MAYA_UNKNOWN_TOKEN);

		return {
			answer: grounded ? trimmed : '',
			grounded,
			used_sections: grounded ? this.matchSections(knowledge.sections, trimmed) : [],
			knowledge_empty: false,
			heuristic: result.heuristic
		};
	}

	/**
	 * Cevabın hangi bölümlerden beslendiğini kaba biçimde işaretler: bölüm metninden
	 * anlamlı bir satır cevapta geçiyorsa o bölüm kullanılmış sayılır. Kesin bir atıf
	 * değil — amaç kullanıcıya "bu nereden geldi" yönü vermek.
	 */
	private matchSections(
		sections: Record<KnowledgeSection, string>,
		answer: string
	): KnowledgeSection[] {
		const lowerAnswer = answer.toLocaleLowerCase('tr');
		const used: KnowledgeSection[] = [];
		for (const section of KNOWLEDGE_SECTIONS) {
			const text = sections[section] ?? '';
			if (!text.trim()) continue;
			const lines = text
				.split('\n')
				.map((l) => l.trim())
				.filter((l) => l.length >= 8);
			if (lines.some((line) => lowerAnswer.includes(line.toLocaleLowerCase('tr').slice(0, 24)))) {
				used.push(section);
			}
		}
		return used;
	}
}
