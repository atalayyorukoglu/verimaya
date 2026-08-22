import { Injectable } from '@nestjs/common';
import { MAYA_UNKNOWN_TOKEN } from '@verimaya/shared';
import { heuristicRouteMayaTool } from '../../maya/heuristic-tool-route';
import { heuristicSuggestAppointmentReschedule } from '../../record-suggestions/heuristic-reschedule-parse';
import { heuristicParseWhatsappMessage } from '../../whatsapp/heuristic-parse';
import type {
	LlmClient,
	LlmParseContext,
	LlmParseResult,
	LlmRescheduleContext,
	LlmRescheduleResult,
	MayaAskContext,
	MayaAskResult,
	MayaToolSelectionContext,
	MayaToolSelectionResult,
	LlmUsageLedger
} from './llm.types';

/** LLM'siz Maya cevabı için sabit ledger satırı (maliyet yok, yol `heuristic`). */
function mayaAnswerUsage(): LlmUsageLedger {
	return {
		provider: 'heuristic',
		model: 'heuristic-maya-answer',
		requestedModel: null,
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0,
		estimatedCostUsdMicros: 0,
		path: 'heuristic',
		error: null
	};
}

/** Deterministic regex/heuristic parser used when no LLM_API_KEY is set. */
@Injectable()
export class HeuristicLlmClient implements LlmClient {
	async parseTransactionDrafts(ctx: LlmParseContext): Promise<LlmParseResult> {
		const records = heuristicParseWhatsappMessage(ctx.message, ctx.patients);
		return {
			records,
			usage: {
				provider: 'heuristic',
				model: 'heuristic-parse',
				requestedModel: null,
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
				estimatedCostUsdMicros: 0,
				path: 'heuristic',
				error: null
			}
		};
	}

	async suggestAppointmentReschedule(ctx: LlmRescheduleContext): Promise<LlmRescheduleResult> {
		const parsed = heuristicSuggestAppointmentReschedule(ctx.message, ctx.appointments);
		return {
			suggestions: parsed.drafts,
			skipped_reason: parsed.skipped_reason,
			usage: {
				provider: 'heuristic',
				model: 'heuristic-reschedule',
				requestedModel: null,
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
				estimatedCostUsdMicros: 0,
				path: 'heuristic',
				error: null
			}
		};
	}

	/**
	 * LLM yokken Maya basit kelime eşlemesi yapar: sorudaki anlamlı kelimeler bilgi
	 * bankasının hangi satırlarında geçiyorsa onları döndürür.
	 *
	 * Uydurma yok — eşleşme bulunamazsa `MAYA_UNKNOWN_TOKEN`. Bu bilinçli: LLM'siz bir
	 * kurulumda "akıllı" görünmektense dürüst görünmek yeğdir.
	 */
	async answerFromKnowledge(ctx: MayaAskContext): Promise<MayaAskResult> {
		if (!ctx.knowledge) {
			return { answer: MAYA_UNKNOWN_TOKEN, heuristic: true, usage: mayaAnswerUsage() };
		}

		const words = ctx.question
			.toLocaleLowerCase('tr')
			.split(/[^\p{L}\p{N}]+/u)
			.filter((w) => w.length >= 4);
		if (words.length === 0) {
			return { answer: MAYA_UNKNOWN_TOKEN, heuristic: true, usage: mayaAnswerUsage() };
		}

		const lines = ctx.knowledge.split('\n').filter((l) => l.trim().length > 0);
		const hits = lines.filter((line) => {
			const lower = line.toLocaleLowerCase('tr');
			return words.some((w) => lower.includes(w));
		});

		if (hits.length === 0) {
			return { answer: MAYA_UNKNOWN_TOKEN, heuristic: true, usage: mayaAnswerUsage() };
		}
		return {
			answer: hits.slice(0, 4).join('\n'),
			heuristic: true,
			usage: mayaAnswerUsage()
		};
	}

	/**
	 * AI-11a — LLM yokken deterministik kelime eşlemesiyle araç seçilir. Veri
	 * üretilmez: seçim yalnız "hangi sorgu çalışsın" sorusunu cevaplar, rakam yine
	 * Postgres'ten gelir. Eşleşme yoksa `null` → çağıran taraf `BILINMIYOR` der.
	 */
	async selectMayaTool(ctx: MayaToolSelectionContext): Promise<MayaToolSelectionResult> {
		return {
			call: heuristicRouteMayaTool(ctx.question, ctx.contacts),
			usage: {
				provider: 'heuristic',
				model: 'heuristic-maya-tool',
				requestedModel: null,
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
				estimatedCostUsdMicros: 0,
				path: 'heuristic',
				error: null
			}
		};
	}
}
