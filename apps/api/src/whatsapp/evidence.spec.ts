/**
 * AI-09 — kaynak izi doğrulaması.
 *
 * Bu dosyanın kanıtladığı tek cümle: **UI'da görünen atıf, mesajda gerçekten geçer.**
 * Uydurulmuş atıf atıfsızlıktan zararlıdır — kullanıcı gördüğü ize güvenip yanlış
 * rakamı onaylar.
 */
import { describe, expect, it, vi } from 'vitest';
import { transactionDraftSchema, type TransactionEvidence } from '@verimaya/shared';
import { verifyDraftEvidence, verifyEvidence } from './evidence';
import { heuristicParseWhatsappMessage } from './heuristic-parse';
import { maskMessagePii } from '../integrations/llm/pii-mask';
import {
	OpenAiCompatibleLlmClient,
	buildWhatsappExtractionSystemPrompt
} from '../integrations/llm/openai-compatible-llm.client';

const RAW = 'Ayşe Yılmaz 2900 GBP ödedi, tel 0532 111 22 33';
const MASKED = maskMessagePii(RAW);

describe('verifyEvidence (AI-09)', () => {
	it('mesajda geçen alıntıyı korur ve start ofsetini ham metne göre hesaplar', () => {
		const out = verifyEvidence(
			{ amount: { quote: '2900 GBP', start: 999, confidence: 'high' } },
			MASKED,
			RAW
		);
		expect(out?.amount).toEqual({
			quote: '2900 GBP',
			start: RAW.indexOf('2900 GBP'),
			confidence: 'high'
		});
	});

	it('uydurulmuş alıntıyı DÜŞÜRÜR — mesajda geçmeyen atıf UI\'a çıkmaz', () => {
		const out = verifyEvidence(
			{
				amount: { quote: '2900 GBP', start: null, confidence: 'high' },
				category: { quote: 'faturaya işlendi', start: 0, confidence: 'high' }
			},
			MASKED,
			RAW
		);
		expect(out?.amount).toBeDefined();
		expect(out?.category).toBeUndefined();
	});

	it('hiçbir alıntı doğrulanmazsa null döner (alan hiç yazılmaz)', () => {
		expect(
			verifyEvidence({ amount: { quote: 'hayalî', start: 0, confidence: 'high' } }, MASKED, RAW)
		).toBeNull();
	});

	it('boş alıntı yalnız confidence=low ile kabul edilir (okumadan çıkarım sinyali)', () => {
		const low = verifyEvidence(
			{ occurred_on: { quote: '', start: null, confidence: 'low' } },
			MASKED,
			RAW
		);
		expect(low?.occurred_on).toEqual({ quote: '', start: null, confidence: 'low' });

		const high = verifyEvidence(
			{ occurred_on: { quote: '', start: 3, confidence: 'high' } },
			MASKED,
			RAW
		);
		expect(high).toBeNull();
	});

	it('maskelenmiş alıntı korunur ama start null olur (ham metinde ofset kaymıştır)', () => {
		expect(MASKED).toContain('[TELEFON]');
		const out = verifyEvidence(
			{ payment_method: { quote: 'tel [TELEFON]', start: 21, confidence: 'medium' } },
			MASKED,
			RAW
		);
		expect(out?.payment_method).toEqual({
			quote: 'tel [TELEFON]',
			start: null,
			confidence: 'medium'
		});
	});

	it('modelin verdiği start yok sayılır — vurgu keyfî bir aralığa kaydırılamaz', () => {
		const out = verifyEvidence(
			{ amount: { quote: 'GBP', start: 0, confidence: 'high' } },
			MASKED,
			RAW
		);
		expect(out?.amount?.start).toBe(RAW.indexOf('GBP'));
	});

	it('izsiz taslak bozulmaz — evidence yoksa null yazılır', () => {
		const [record] = verifyDraftEvidence(
			[
				{
					kind: 'income',
					amount: 1000,
					currency: 'TRY',
					title: 'x',
					occurred_on: '2026-08-01'
				}
			],
			MASKED,
			RAW
		);
		expect(record?.evidence).toBeNull();
		expect(record?.amount).toBe(1000);
	});
});

describe('transactionDraftSchema.evidence opsiyonelliği (AI-09)', () => {
	it('evidence alanı olmayan ESKİ kayıt hâlâ geçerli', () => {
		const parsed = transactionDraftSchema.parse({
			kind: 'expense',
			amount: 5000,
			currency: 'TRY',
			title: 'Eski kayıt',
			occurred_on: '2026-01-01'
		});
		expect(parsed.evidence).toBeUndefined();
	});

	it('evidence beyaz liste dışı alan taşıyamaz', () => {
		const bad = transactionDraftSchema.safeParse({
			kind: 'expense',
			amount: 5000,
			currency: 'TRY',
			title: 'x',
			occurred_on: '2026-01-01',
			evidence: { title: { quote: 'x', start: 0, confidence: 'high' } }
		});
		expect(bad.success).toBe(false);
	});
});

describe('heuristicParseWhatsappMessage evidence (AI-09)', () => {
	it('tutar ve para birimi izini regex ofsetinden üretir', () => {
		const message = 'Sandra Lab için 2900 GBP ödendi';
		const [record] = heuristicParseWhatsappMessage(message);
		const evidence = record?.evidence as TransactionEvidence;

		expect(evidence.amount?.quote).toBe('2900');
		expect(evidence.amount?.confidence).toBe('high');
		expect(message.slice(evidence.amount!.start!, evidence.amount!.start! + 4)).toBe('2900');

		expect(evidence.currency?.quote).toBe('GBP');
		expect(message.slice(evidence.currency!.start!, evidence.currency!.start! + 3)).toBe('GBP');
	});

	it('okunmadan varsayılan atanan alan low + boş alıntı taşır', () => {
		const [record] = heuristicParseWhatsappMessage('Sandra Lab için 2900 GBP ödendi');
		const evidence = record?.evidence as TransactionEvidence;
		expect(evidence.occurred_on).toEqual({ quote: '', start: null, confidence: 'low' });
		expect(evidence.category?.confidence).toBe('low');
	});

	it('heuristic izi kendi doğrulamasından geçer (kendi ürettiği alıntı gerçek)', () => {
		const message = 'Sandra Lab için 2900 GBP ödendi';
		const [record] = heuristicParseWhatsappMessage(message);
		const [verified] = verifyDraftEvidence([record!], message, message);
		expect(verified?.evidence?.amount?.quote).toBe('2900');
		expect(verified?.evidence?.currency?.quote).toBe('GBP');
	});
});

describe('OpenAiCompatibleLlmClient evidence doğrulaması (AI-09)', () => {
	function clientReturning(records: unknown[]) {
		const fetchFn = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						model: 'gpt-4o-mini',
						choices: [{ message: { content: JSON.stringify({ records }) } }],
						usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				)
		);
		return new OpenAiCompatibleLlmClient({
			apiKey: 'sk-test',
			baseUrl: 'https://api.openai.com/v1',
			model: 'gpt-4o-mini',
			fetchFn: fetchFn as unknown as typeof fetch
		});
	}

	const baseRecord = {
		kind: 'income',
		amount: 290000,
		currency: 'GBP',
		title: 'Ödeme',
		occurred_on: '2026-07-01'
	};

	it('modelin uydurduğu alıntı kayda düşmez, gerçek olan kalır', async () => {
		const client = clientReturning([
			{
				...baseRecord,
				evidence: {
					amount: { quote: '2900 GBP', start: 12, confidence: 'high' },
					kind: { quote: 'banka dekontunda yazıyor', start: 0, confidence: 'high' }
				}
			}
		]);

		const result = await client.parseTransactionDrafts({ message: RAW, patients: [] });

		expect(result.usage.path).toBe('openai_compatible');
		expect(result.records[0]?.evidence?.amount?.quote).toBe('2900 GBP');
		expect(result.records[0]?.evidence?.kind).toBeUndefined();
	});

	it('evidence göndermeyen model kaydı bozmaz', async () => {
		const client = clientReturning([baseRecord]);
		const result = await client.parseTransactionDrafts({ message: RAW, patients: [] });
		expect(result.records).toHaveLength(1);
		expect(result.records[0]?.evidence).toBeNull();
		expect(result.records[0]?.amount).toBe(290000);
	});

	it('sistem prompt\'u modelden evidence ister ve çekirdek kuralları korur', () => {
		const prompt = buildWhatsappExtractionSystemPrompt(null, null);
		expect(prompt).toContain('"evidence"');
		expect(prompt).toContain('verbatim');
		expect(prompt).toContain('confidence "low"');
		expect(prompt).toContain('Return ONLY valid JSON');
	});
});
