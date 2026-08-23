#!/usr/bin/env node
/**
 * LLM karşılaştırma aracı — aynı Türkçe mesajı iki yoldan geçirip yan yana koyar:
 * bugünkü **heuristic** (regex) ve yapılandırılmış **LLM**.
 *
 * Neden var: "hangi model Türkçede yeterli" sorusu hissiyatla cevaplanamaz. Bu araç
 * ölçü aletidir — bugün AB bölgesi bir sağlayıcıyı denemek için, ileride yerel modeli
 * aynı çıtaya karşı ölçmek için. (docs/2026-08-23-llm-altyapi-secenekleri.md § 4)
 *
 * Kullanım:
 *   pnpm --filter @verimaya/api build      # dist güncel olmalı
 *   pnpm --filter @verimaya/api llm:compare
 *
 * Env (apps/api/.env'den okunur):
 *   LLM_API_KEY    Boşsa yalnız heuristic çalışır, karşılaştırma yapılmaz.
 *   LLM_BASE_URL   Örn. https://api.mistral.ai/v1
 *   LLM_MODEL      Örn. mistral-small-latest
 *
 * GÜVENLİK: Anahtar yalnız okunur, hiçbir yere yazılmaz ve ekrana basılmaz.
 * Mesajlar LLM'e giderken üretimdeki aynı PII maskeleme kapısından geçer.
 *
 * Çıkış: 0 = koştu · 1 = hata
 */

const path = require('node:path');
const fs = require('node:fs');

const API_ROOT = path.resolve(__dirname, '..');
const DIST = path.join(API_ROOT, 'dist/apps/api/src');

// --- .env yükle (bağımlılık eklemeden, basit ayrıştırma) -----------------------
const envPath = path.join(API_ROOT, '.env');
if (fs.existsSync(envPath)) {
	for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
		if (!m) continue;
		const [, key, rawValue] = m;
		if (process.env[key] !== undefined) continue;
		process.env[key] = rawValue.replace(/^["']|["']$/g, '');
	}
}

if (!fs.existsSync(DIST)) {
	console.error('dist yok. Önce: pnpm --filter @verimaya/api build');
	process.exit(1);
}

const { heuristicParseWhatsappMessage } = require(
	path.join(DIST, 'whatsapp/heuristic-parse.js')
);
const { createLlmClientFromEnv } = require(path.join(DIST, 'integrations/llm/llm.module.js'));

/**
 * Gerçek saha mesajları. Sağlık turizmi acentesinin WhatsApp'ında görülen biçimler:
 * çekimli ekler ("kliniğe"), kısaltılmış tarih ("28'ine"), karışık para birimi,
 * tek mesajda iki olay.
 *
 * Yeni bir zorluk keşfedince buraya ekle — bu liste zamanla değerlendirme kümesi olur.
 */
const CASES = [
	{
		label: 'Tek mesajda iki olay (tarih + ödeme)',
		message: "Ahmet bey'in ameliyatı 28'ine kaydı, kliniğe 2.900 GBP ödendi",
		expect: 'gider · 2900 GBP · karşı taraf: klinik (Ahmet DEĞİL) · kategori: klinik/operasyon'
	},
	{
		label: 'Tahsilat, çekimli firma adı',
		message: 'Mehmet Yılmaz hastadan 1500 euro kapora aldık, kalanı gelince ödeyecek',
		expect: 'gelir · 1500 EUR · karşı taraf: Mehmet Yılmaz · kısmi ödeme'
	},
	{
		label: 'Otel gideri, tarih yazıyla',
		message: '3 gecelik otel için Grand Palas Otel’e 12.400 TL havale yaptım',
		expect: 'gider · 12400 TRY · karşı taraf: Grand Palas Otel · ödeme: havale'
	},
	{
		label: 'Belirsiz — hiçbir şey üretilmemeli',
		message: 'Hastayla görüştüm, düşünüp dönecek',
		expect: 'taslak YOK (tutar yok)'
	},
	{
		label: 'Sadece randevu değişikliği',
		message: 'Zeynep hanımın kontrolünü gelecek salıya alalım',
		expect: 'finans taslağı yok · randevu önerisi olmalı'
	}
];

function fmtDraft(d) {
	if (!d) return '—';
	const money = `${(d.amount / 100).toLocaleString('tr-TR')} ${d.currency}`;
	const who = d.contact_label || d.contact_display_name || (d.contact_id ? '(eşleşen kişi)' : '—');
	return `${d.kind === 'income' ? 'gelir' : 'gider'} · ${money} · ${who} · ${d.category ?? '—'}`;
}

function fmtEvidence(d) {
	if (!d || !d.evidence) return '';
	const parts = [];
	for (const [field, e] of Object.entries(d.evidence)) {
		if (!e || !e.quote) continue;
		parts.push(`      ${field}: "${e.quote}" (${e.confidence})`);
	}
	return parts.length ? '\n' + parts.join('\n') : '';
}

async function main() {
	const hasLlm = Boolean(process.env.LLM_API_KEY && process.env.LLM_API_KEY.trim());
	const client = createLlmClientFromEnv();

	console.log('='.repeat(78));
	console.log('LLM karşılaştırma');
	console.log(
		hasLlm
			? `LLM: ${process.env.LLM_BASE_URL || '(varsayılan)'} · model: ${process.env.LLM_MODEL || '(varsayılan)'}`
			: 'LLM: YAPILANDIRILMAMIŞ — yalnız heuristic gösterilecek'
	);
	console.log('='.repeat(78));

	let llmTotalMicros = 0;

	for (const testCase of CASES) {
		console.log(`\n── ${testCase.label}`);
		console.log(`   mesaj:    ${testCase.message}`);
		console.log(`   beklenen: ${testCase.expect}`);

		const heuristic = heuristicParseWhatsappMessage(testCase.message, []);
		console.log(`\n   REGEX:    ${heuristic.length ? '' : '(taslak yok)'}`);
		for (const d of heuristic) console.log(`     ${fmtDraft(d)}${fmtEvidence(d)}`);

		if (!hasLlm) continue;

		try {
			const result = await client.parseTransactionDrafts({
				message: testCase.message,
				patients: [],
				tenantPromptNote: null,
				knowledge: null
			});
			const path_ = result.usage.path;
			const cost = result.usage.estimatedCostUsdMicros ?? 0;
			llmTotalMicros += cost;
			console.log(
				`\n   LLM:      ${result.records.length ? '' : '(taslak yok)'}  [yol: ${path_}${
					result.usage.error ? ` · hata: ${result.usage.error}` : ''
				}]`
			);
			for (const d of result.records) console.log(`     ${fmtDraft(d)}${fmtEvidence(d)}`);
		} catch (err) {
			console.log(`\n   LLM:      ÇAĞRI BAŞARISIZ — ${err.message}`);
		}
	}

	console.log('\n' + '='.repeat(78));
	if (hasLlm) {
		console.log(`Tahmini toplam maliyet: ${(llmTotalMicros / 1_000_000).toFixed(6)} USD`);
		console.log(
			'Not: "yol: openai_compatible_fallback" görüyorsan LLM boş/hatalı döndü ve regex devreye girdi.'
		);
	} else {
		console.log('LLM_API_KEY ekleyip tekrar koştur — karşılaştırma o zaman görünür.');
	}
	console.log('='.repeat(78));
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
