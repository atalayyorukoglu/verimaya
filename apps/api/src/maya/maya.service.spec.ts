import { describe, expect, it, vi } from 'vitest';
import {
	MAYA_UNKNOWN_TOKEN,
	emptyKnowledgeSections,
	type MayaToolCall,
	type MayaToolResult
} from '@verimaya/shared';
import type {
	LlmClient,
	LlmUsageLedger,
	MayaAskContext,
	MayaToolSelectionContext
} from '../integrations/llm';
import { MayaService } from './maya.service';
import type { MayaActor, MayaToolsService } from './maya-tools.service';
import type { SettingsService } from '../settings/settings.service';
import type { TenantContextService } from '../tenant/tenant-context.service';

/**
 * Maya'nın tek değişmez kuralı: **uydurmaz.** Bu spec o kuralı korur.
 *
 * AI-11a ile ikinci bir kural eklendi: **rakamı model üretmez.** Araç yolunda
 * `answer` daima boş kalır; sayı yalnız `tool_result` içinde, Postgres'ten gelir.
 * Bilgi bankası yolunun bozulmadığı da burada kanıtlanıyor.
 */

const ACTOR: MayaActor = { kind: 'session', userId: 'u1', requestId: 'r1' };

function usage(path: LlmUsageLedger['path'] = 'heuristic'): LlmUsageLedger {
	return {
		provider: 'test',
		model: 'test',
		requestedModel: null,
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0,
		estimatedCostUsdMicros: 0,
		path,
		error: null
	};
}

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

/** Ledger ve soru kaydı yazımlarını yutan sahte tenant bağlamı. */
function makeTenantContext(): TenantContextService {
	return {
		withTenant: async <T>(_id: string, fn: (ctx: { db: unknown }) => Promise<T>) =>
			fn({ db: { insert: () => ({ values: async () => undefined }) } })
	} as unknown as TenantContextService;
}

type LlmOverrides = {
	answer?: string;
	heuristic?: boolean;
	call?: MayaToolCall | null;
	onAnswer?: (ctx: MayaAskContext) => void;
	onSelect?: (ctx: MayaToolSelectionContext) => void;
};

function makeLlm(overrides: LlmOverrides = {}): LlmClient {
	return {
		parseTransactionDrafts: async () => {
			throw new Error('not used');
		},
		suggestAppointmentReschedule: async () => {
			throw new Error('not used');
		},
		answerFromKnowledge: async (ctx: MayaAskContext) => {
			overrides.onAnswer?.(ctx);
			return {
				answer: overrides.answer ?? MAYA_UNKNOWN_TOKEN,
				heuristic: overrides.heuristic ?? false,
				usage: usage()
			};
		},
		selectMayaTool: async (ctx: MayaToolSelectionContext) => {
			overrides.onSelect?.(ctx);
			return { call: overrides.call ?? null, usage: usage() };
		}
	} as unknown as LlmClient;
}

function makeTools(
	overrides: Partial<{
		candidates: Array<{ id: string; displayName: string }>;
		allowed: boolean;
		result: MayaToolResult | null;
		onRun: () => void;
	}> = {}
): MayaToolsService {
	return {
		findContactCandidates: async () => overrides.candidates ?? [],
		isToolAllowed: async () => overrides.allowed ?? true,
		run: async () => {
			overrides.onRun?.();
			return overrides.result ?? null;
		}
	} as unknown as MayaToolsService;
}

function makeService(
	llm: LlmClient,
	settings: SettingsService,
	tools: MayaToolsService = makeTools()
): MayaService {
	return new MayaService(settings, llm, tools, makeTenantContext());
}

describe('MayaService — bilgi bankası yolu (AI-01, bozulmamalı)', () => {
	it('bilgi bankası boşsa LLM çağrılmaz ve knowledge_empty döner', async () => {
		let called = false;
		const llm = makeLlm({ onAnswer: () => (called = true) });
		const settings = {
			getKnowledge: async () => ({
				sections: emptyKnowledgeSections(),
				is_default: true,
				updated_at: null,
				updated_by: null,
				pii_warnings: []
			})
		} as unknown as SettingsService;

		const res = await makeService(llm, settings).ask('t1', { question: 'Fiyat ne?' }, ACTOR);

		expect(called).toBe(false);
		expect(res.knowledge_empty).toBe(true);
		expect(res.grounded).toBe(false);
		expect(res.answer).toBe('');
		expect(res.source).toBe('unknown');
	});

	it('model BILINMIYOR derse cevap boş kalır — uydurma metin sızmaz', async () => {
		const service = makeService(
			makeLlm({ answer: MAYA_UNKNOWN_TOKEN }),
			makeSettings({ services: 'Saç ekimi 2.500 EUR' })
		);
		const res = await service.ask('t1', { question: 'Diş implantı kaç para?' }, ACTOR);

		expect(res.grounded).toBe(false);
		expect(res.answer).toBe('');
		expect(res.used_sections).toEqual([]);
		expect(res.knowledge_empty).toBe(false);
		expect(res.source).toBe('unknown');
	});

	it('BILINMIYOR bir cümlenin içinde geçse bile grounded sayılmaz', async () => {
		// Model "Bu konuda BILINMIYOR ama tahminen 3.000 EUR olabilir" gibi bir şey
		// dönerse tahmini kullanıcıya göstermemeliyiz.
		const service = makeService(
			makeLlm({ answer: 'Bu konuda BILINMIYOR ama tahminen 3.000 EUR olabilir' }),
			makeSettings({ services: 'Saç ekimi 2.500 EUR' })
		);
		const res = await service.ask('t1', { question: 'Diş implantı?' }, ACTOR);

		expect(res.grounded).toBe(false);
		expect(res.answer).toBe('');
	});

	it('bilgi bankasından cevap gelirse grounded ve kaynak bölüm işaretlenir', async () => {
		const service = makeService(
			makeLlm({ answer: 'Saç ekimi (FUE) — 2.500 EUR, 3000 grefte kadar dahil.' }),
			makeSettings({
				services: 'Saç ekimi (FUE) — 2.500 EUR, 3000 grefte kadar dahil.',
				payment: 'Kapora %30, kalan işlem günü.'
			})
		);
		const res = await service.ask('t1', { question: 'Saç ekimi kaça?' }, ACTOR);

		expect(res.grounded).toBe(true);
		expect(res.source).toBe('knowledge');
		expect(res.answer).toContain('2.500 EUR');
		expect(res.used_sections).toContain('services');
		// Cevapta geçmeyen bölüm kaynak olarak işaretlenmemeli.
		expect(res.used_sections).not.toContain('payment');
	});

	it('LLM yapılandırılmamışsa heuristic bayrağı yanıtta görünür', async () => {
		const service = makeService(
			makeLlm({ answer: 'Saç ekimi 2.500 EUR', heuristic: true }),
			makeSettings({ services: 'Saç ekimi 2.500 EUR' })
		);
		const res = await service.ask('t1', { question: 'Saç ekimi?' }, ACTOR);

		expect(res.heuristic).toBe(true);
		expect(res.grounded).toBe(true);
	});

	it('bilgi bankası sorusunda araç çalıştırılmaz', async () => {
		const onRun = vi.fn();
		const service = makeService(
			makeLlm({ call: null, answer: 'Kapora %30' }),
			makeSettings({ payment: 'Kapora %30, kalan işlem günü.' }),
			makeTools({ onRun })
		);
		await service.ask('t1', { question: 'Kapora oranı ne?' }, ACTOR);
		expect(onRun).not.toHaveBeenCalled();
	});
});

describe('MayaService — canlı veri yolu (AI-11a)', () => {
	const CONTACT = { id: '11111111-1111-4111-8111-111111111111', displayName: 'Ayşe Yılmaz' };
	const CALL: MayaToolCall = {
		tool: 'contactBalance',
		params: { contact_ref: CONTACT.id }
	};
	const RESULT: MayaToolResult = {
		tool: 'contactBalance',
		contact_id: CONTACT.id,
		contact_label: 'Ayşe Yılmaz',
		base_currency: 'TRY',
		income_base: 500_000,
		expense_base: 0,
		net_base: 500_000,
		paid_base: 200_000,
		outstanding_base: 300_000,
		transaction_count: 3
	};

	it('araç çalışınca rakam tool_result içinde gelir, answer boş kalır', async () => {
		const service = makeService(
			makeLlm({ call: CALL }),
			makeSettings({ services: 'Saç ekimi 2.500 EUR' }),
			makeTools({ candidates: [CONTACT], allowed: true, result: RESULT })
		);
		const res = await service.ask('t1', { question: 'Ayşe Yılmaz ne kadar borçlu?' }, ACTOR);

		expect(res.source).toBe('tool');
		expect(res.tool).toBe('contactBalance');
		expect(res.grounded).toBe(true);
		// Cevap cümlesini sunucu KURMAZ — istemci şablondan kurar.
		expect(res.answer).toBe('');
		expect(res.tool_result).toEqual(RESULT);
	});

	it('izin yoksa araç hiç çalıştırılmaz ve cevap BILINMIYOR olur', async () => {
		const onRun = vi.fn();
		const service = makeService(
			makeLlm({ call: CALL }),
			makeSettings({ services: 'Saç ekimi 2.500 EUR' }),
			makeTools({ candidates: [CONTACT], allowed: false, result: RESULT, onRun })
		);
		const res = await service.ask('t1', { question: 'Ayşe Yılmaz ne kadar borçlu?' }, ACTOR);

		expect(onRun).not.toHaveBeenCalled();
		expect(res.grounded).toBe(false);
		expect(res.source).toBe('unknown');
		expect(res.tool).toBeNull();
		expect(res.tool_result).toBeNull();
		// "Yetkin yok" demiyoruz: verinin varlığı da bir bilgidir.
		expect(res.answer).toBe('');
	});

	it('araç sonuç üretemezse BILINMIYOR — tahmin yok', async () => {
		const service = makeService(
			makeLlm({ call: CALL }),
			makeSettings({ services: 'Saç ekimi 2.500 EUR' }),
			makeTools({ candidates: [CONTACT], allowed: true, result: null })
		);
		const res = await service.ask('t1', { question: 'Ayşe Yılmaz ne kadar borçlu?' }, ACTOR);

		expect(res.grounded).toBe(false);
		expect(res.source).toBe('unknown');
		expect(res.tool_result).toBeNull();
	});

	it('modele isim gitmez — araç seçiciye maskelenmiş soru + opak ref gider', async () => {
		let seen: MayaToolSelectionContext | null = null;
		const service = makeService(
			makeLlm({ call: CALL, onSelect: (ctx) => (seen = ctx) }),
			makeSettings({ services: 'Saç ekimi 2.500 EUR' }),
			makeTools({ candidates: [CONTACT], allowed: true, result: RESULT })
		);
		await service.ask('t1', { question: 'Ayşe Yılmaz ne kadar borçlu?' }, ACTOR);

		const ctx = seen as unknown as MayaToolSelectionContext;
		expect(ctx.question).not.toContain('Ayşe');
		expect(ctx.question).not.toContain('Yılmaz');
		expect(ctx.question).toContain('KISI_1');
		expect(ctx.contacts).toEqual([{ token: 'KISI_1', contact_ref: CONTACT.id }]);
	});
});
