import { Inject, Injectable, Logger } from '@nestjs/common';
import {
	MAYA_UNKNOWN_TOKEN,
	buildKnowledgeContext,
	KNOWLEDGE_SECTIONS,
	type KnowledgeSection,
	type MayaAnswer,
	type MayaAsk,
	type MayaToolCall,
	type MayaToolName,
	type MayaToolResult
} from '@verimaya/shared';
import { mayaQuestions } from '../db/schema';
import {
	LLM_CLIENT,
	writeLlmParseLedger,
	type LlmClient,
	type LlmUsageLedger
} from '../integrations/llm';
import { SettingsService } from '../settings/settings.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { buildMayaMaskedQuestion, type MayaMaskedQuestion } from './maya-contact-match';
import { MayaToolsService, type MayaActor } from './maya-tools.service';

/**
 * Maya — bilgi bankası + canlı veri soru-cevap.
 *
 * Tek kural: **uydurma yok.**
 * - Bilgi bankası yolu (AI-01): cevap yalnız tenant'ın bilgi bankasından çıkar.
 * - Canlı veri yolu (AI-11a): model **yalnız** hangi aracın çalışacağını seçer;
 *   rakamı Postgres verir, cevap cümlesini istemci `messages.ts` şablonundan kurar.
 *   Model rakamı ne görür ne üretir.
 *
 * Karar sırası nettir ve testle sabittir: önce araç seçici çalışır, `null` derse
 * bilgi bankası yoluna düşülür. Böylece "Saç ekimi fiyatımız ne?" eskisi gibi cevaplanır.
 */
@Injectable()
export class MayaService {
	private readonly logger = new Logger(MayaService.name);

	constructor(
		private readonly settings: SettingsService,
		@Inject(LLM_CLIENT) private readonly llm: LlmClient,
		private readonly tools: MayaToolsService,
		private readonly tenantContext: TenantContextService
	) {}

	async ask(tenantId: string, input: MayaAsk, actor: MayaActor): Promise<MayaAnswer> {
		// 1) Kişi çözümü ve maskeleme sunucuda. Modele isim/telefon gitmez.
		const candidates = await this.tools.findContactCandidates(tenantId, input.question);
		const masked = buildMayaMaskedQuestion(input.question, candidates);

		// 2) Araç seçimi — modelin verebileceği tek çıktı `{tool, params}`.
		const selection = await this.llm.selectMayaTool({
			question: masked.question,
			contacts: masked.contacts
		});
		await this.writeLedger(tenantId, selection.usage);

		if (selection.call) {
			return this.answerWithTool(
				tenantId,
				actor,
				masked,
				selection.call,
				selection.usage.path === 'heuristic'
			);
		}

		// 3) Araç eşleşmedi → bilgi bankası yolu (AI-01 davranışı aynen korunur).
		return this.answerFromKnowledge(tenantId, input, masked);
	}

	private async answerWithTool(
		tenantId: string,
		actor: MayaActor,
		masked: MayaMaskedQuestion,
		call: MayaToolCall,
		heuristic: boolean
	): Promise<MayaAnswer> {
		// **İzin sınırı.** `POST /v1/maya/ask` yalnız `settings:read` ister ve bunu her
		// rol geçer; araç izni burada, çalışma anında ayrıca çözülür. İzin yoksa araç
		// hiç çalıştırılmaz — sorgu bile atılmaz.
		const allowed = await this.tools.isToolAllowed(tenantId, actor, call.tool);
		const result = allowed ? await this.tools.run(tenantId, call, masked.matches) : null;

		if (!result) {
			// İzinsizlik ile "veri yok"u ayırt ettirmiyoruz: verinin varlığı da bilgidir.
			// Kullanıcı her iki hâlde de aynı `BILINMIYOR` cevabını görür.
			await this.logQuestion(tenantId, masked.question, call.tool, false, 'unknown');
			return this.unknownAnswer(heuristic);
		}

		await this.logQuestion(tenantId, masked.question, call.tool, true, 'tool');
		return this.toolAnswer(call.tool, result, heuristic);
	}

	private async answerFromKnowledge(
		tenantId: string,
		input: MayaAsk,
		masked: MayaMaskedQuestion
	): Promise<MayaAnswer> {
		const knowledge = await this.settings.getKnowledge(tenantId);
		const context = buildKnowledgeContext(knowledge.sections);

		if (context == null) {
			// Bilgi bankası boş: LLM'e hiç gitme. Boş bağlamla model uydurmaya yatkın,
			// ayrıca boşuna para ve gecikme olur.
			await this.logQuestion(tenantId, masked.question, null, false, 'unknown');
			return {
				answer: '',
				grounded: false,
				used_sections: [],
				knowledge_empty: true,
				heuristic: false,
				source: 'unknown',
				tool: null,
				tool_result: null
			};
		}

		const result = await this.llm.answerFromKnowledge({
			question: input.question,
			knowledge: context
		});
		await this.writeLedger(tenantId, result.usage);

		const trimmed = result.answer.trim();
		const grounded = trimmed.length > 0 && !trimmed.includes(MAYA_UNKNOWN_TOKEN);

		await this.logQuestion(
			tenantId,
			masked.question,
			null,
			grounded,
			grounded ? 'knowledge' : 'unknown'
		);

		return {
			answer: grounded ? trimmed : '',
			grounded,
			used_sections: grounded ? this.matchSections(knowledge.sections, trimmed) : [],
			knowledge_empty: false,
			heuristic: result.heuristic,
			source: grounded ? 'knowledge' : 'unknown',
			tool: null,
			tool_result: null
		};
	}

	/**
	 * Araç cevabı. `answer` **daima boş** — cümleyi istemci `messages.ts` şablonundan
	 * kurar; sunucudan serbest metin çıkmaz, modelden hiç çıkmaz.
	 */
	private toolAnswer(
		tool: MayaToolName,
		result: MayaToolResult,
		heuristic: boolean
	): MayaAnswer {
		return {
			answer: '',
			grounded: true,
			used_sections: [],
			knowledge_empty: false,
			heuristic,
			source: 'tool',
			tool,
			tool_result: result
		};
	}

	/**
	 * Araç çalıştırılamadı (izin yok, kişi çözülemedi ya da sorgu patladı). Hangi
	 * aracın denendiği kullanıcıya **söylenmez** — verinin varlığı da bir bilgidir.
	 */
	private unknownAnswer(heuristic: boolean): MayaAnswer {
		return {
			answer: '',
			grounded: false,
			used_sections: [],
			knowledge_empty: false,
			heuristic,
			source: 'unknown',
			tool: null,
			tool_result: null
		};
	}

	/** Her LLM çağrısı `jobs` tablosundaki `llm.parse` ledger'ına bir satır yazar. */
	private async writeLedger(tenantId: string, usage: LlmUsageLedger): Promise<void> {
		try {
			await this.tenantContext.withTenant(tenantId, ({ db }) =>
				writeLlmParseLedger(db, tenantId, usage)
			);
		} catch (err) {
			// Ledger yazımı cevabı düşürmemeli; kayıp satır loglanır.
			this.logger.warn(
				`Maya ledger write failed: ${err instanceof Error ? err.message : String(err)}`
			);
		}
	}

	/**
	 * AI-11b'nin tek girdisi. Soru **maskelenmiş** hâliyle saklanır (PII girmez);
	 * seçilen araç, cevaplanıp cevaplanmadığı ve hangi yolun kullanıldığı yazılır.
	 * İzin reddi yüzünden çalışmayan araç da kaydedilir — hangi rolün neye ihtiyaç
	 * duyduğu ancak böyle görülür.
	 */
	private async logQuestion(
		tenantId: string,
		questionMasked: string,
		tool: MayaToolName | null,
		answered: boolean,
		source: 'knowledge' | 'tool' | 'unknown'
	): Promise<void> {
		try {
			await this.tenantContext.withTenant(tenantId, async ({ db }) => {
				await db.insert(mayaQuestions).values({
					tenantId,
					questionMasked: questionMasked.slice(0, 1000),
					tool,
					answered,
					source
				});
			});
		} catch (err) {
			this.logger.warn(
				`Maya question log failed: ${err instanceof Error ? err.message : String(err)}`
			);
		}
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
