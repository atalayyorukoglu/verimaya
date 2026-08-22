import type {
	Contact,
	SupportedCurrency,
	TransactionDraft,
	TransactionEvidence
} from '@verimaya/shared';
import { toTenantDayKey } from '@verimaya/shared';
import { evidenceEntry } from './evidence';

const CURRENCY_PATTERN = /\b(\d[\d.,]*)\s*(TRY|GBP|EUR|USD|₺|£|€|\$)\b/gi;
const INCOME_HINTS = /alındı|tahsilat|ödeme alındı|received|deposit|gelir/i;
const EXPENSE_HINTS = /ödeme yapıldı|harcama|gider|paid to|ödendi|komisyon/i;

function parseAmount(raw: string): number {
	const normalized = raw.replace(/\./g, '').replace(',', '.');
	const n = Number.parseFloat(normalized);
	return Number.isFinite(n) ? n : 0;
}

function normalizeCurrency(token: string): SupportedCurrency {
	const t = token.toUpperCase();
	if (t === '₺' || t === 'TRY') return 'TRY';
	if (t === '£' || t === 'GBP') return 'GBP';
	if (t === '€' || t === 'EUR') return 'EUR';
	if (t === '$' || t === 'USD') return 'USD';
	return 'TRY';
}

function today(): string {
	return toTenantDayKey(new Date(), 'Europe/Istanbul');
}

/**
 * AI-09: `kind` hem değeri hem izini döndürür. Regex zaten eşleşmenin ofsetini
 * biliyor — iz burada bedava ve LLM'den güvenilir (uydurulamaz).
 * Hiçbir ipucu yoksa `expense` **varsayılandır**, okunmuş değildir: quote boş, low.
 */
function guessKind(text: string): { kind: 'income' | 'expense'; hint: RegExpMatchArray | null } {
	const expense = text.match(EXPENSE_HINTS);
	if (expense) return { kind: 'expense', hint: expense };
	const income = text.match(INCOME_HINTS);
	if (income) return { kind: 'income', hint: income };
	return { kind: 'expense', hint: null };
}

const PAYMENT_METHOD_HINTS: ReadonlyArray<{ re: RegExp; value: string }> = [
	{ re: /kart|card/i, value: 'Kart' },
	{ re: /havale|transfer/i, value: 'Havale' }
];

function guessPaymentMethod(text: string): { value: string | null; hint: RegExpMatchArray | null } {
	for (const { re, value } of PAYMENT_METHOD_HINTS) {
		const m = text.match(re);
		if (m) return { value, hint: m };
	}
	return { value: null, hint: null };
}

/** Regex eşleşmesinden iz; `index` her zaman vardır ama tip düzeyinde opsiyonel. */
function hintEvidence(
	hint: RegExpMatchArray | null,
	confidence: 'high' | 'medium'
): ReturnType<typeof evidenceEntry> {
	if (!hint || hint.index == null) return evidenceEntry('', null, 'low');
	return evidenceEntry(hint[0], hint.index, confidence);
}

/** Okunmadan varsayılan atanan alan — dürüst sinyal: iz yok, güven düşük. */
const INFERRED = () => evidenceEntry('', null, 'low');

function contactEvidence(text: string, contact: Contact | null): ReturnType<typeof evidenceEntry> {
	const name = contact?.display_name?.trim() ?? '';
	if (!name) return INFERRED();
	const idx = text.toLowerCase().indexOf(name.toLowerCase());
	if (idx === -1) {
		// Eşleşme ad parçası üzerinden olmuştu; tam ad metinde geçmiyor.
		return evidenceEntry(name, null, 'low');
	}
	return evidenceEntry(text.slice(idx, idx + name.length), idx, 'medium');
}

function guessTitle(text: string, amount: number, currency: string): string {
	const trimmed = text.trim().slice(0, 120);
	if (trimmed.length > 0 && trimmed.length < 80) return trimmed;
	return `${amount.toLocaleString('tr-TR')} ${currency} işlem`;
}

function matchContact(text: string, contactRows: Contact[]): Contact | null {
	const lower = text.toLowerCase();
	for (const p of contactRows) {
		const parts = (p.display_name ?? p.first_name ?? '')
			.toLowerCase()
			.split(/\s+/)
			.filter((x: string) => x.length > 2);
		if (parts.some((part: string) => lower.includes(part))) return p;
	}
	return null;
}

function extractContactLabel(text: string): string | null {
	const lab = text.match(
		/([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)*)\s+(?:Lab|Klinik|Hotel)/i
	);
	if (lab) return lab[0];
	const bey = text.match(/([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)\s+bey/i);
	if (bey) return bey[1];
	return null;
}

/**
 * Heuristic WhatsApp message parser (used by HeuristicLlmClient / LLM fallback).
 * Output remains draft-only until human confirmation via POST /v1/transactions.
 * AGENTS ilke 6: AI extraction is draft — never written as final without approval.
 */
export function heuristicParseWhatsappMessage(
	message: string,
	contacts: Contact[] = []
): TransactionDraft[] {
	const text = message.trim();
	if (!text) return [];

	const matches = [...text.matchAll(CURRENCY_PATTERN)];
	if (matches.length === 0) {
		const fallback = text.match(/(\d[\d.,]+)/);
		if (!fallback) return [];
		const amount = Math.round(parseAmount(fallback[1]) * 100);
		const { kind, hint: kindHint } = guessKind(text);
		const contact = matchContact(text, contacts);
		const evidence: TransactionEvidence = {
			amount: evidenceEntry(fallback[1], fallback.index ?? null, 'high'),
			// Para birimi metinde yok — TRY varsayıldı.
			currency: INFERRED(),
			kind: hintEvidence(kindHint, 'medium'),
			occurred_on: INFERRED(),
			category: INFERRED()
		};
		if (contact) evidence.contact_id = contactEvidence(text, contact);
		return [
			{
				kind,
				amount,
				currency: 'TRY',
				title: guessTitle(text, amount / 100, 'TRY'),
				category: kind === 'income' ? 'Operasyon' : 'Konaklama',
				contact_id: contact?.id ?? null,
				contact_display_name: contact?.display_name ?? null,
				contact_label: null,
				occurred_on: today(),
				payment_method: null,
				description: text,
				evidence
			}
		];
	}

	const records: TransactionDraft[] = [];
	const { kind, hint: kindHint } = guessKind(text);
	const contact = matchContact(text, contacts);
	const payment = guessPaymentMethod(text);

	for (const m of matches) {
		const major = parseAmount(m[1]);
		if (major <= 0) continue;
		const currency = normalizeCurrency(m[2]);
		// `m.index` tam eşleşmenin başı ("2900 GBP"); tutar grubu orada başlar,
		// para birimi tokeni ise eşleşmenin sonundadır.
		const matchStart = m.index ?? null;
		const currencyStart = matchStart == null ? null : matchStart + m[0].lastIndexOf(m[2]);
		const evidence: TransactionEvidence = {
			amount: evidenceEntry(m[1], matchStart, 'high'),
			currency: evidenceEntry(m[2], currencyStart, 'high'),
			kind: hintEvidence(kindHint, 'medium'),
			// Tarih mesajdan okunmuyor; bugüne düşülüyor.
			occurred_on: INFERRED(),
			category: INFERRED()
		};
		if (contact) evidence.contact_id = contactEvidence(text, contact);
		if (payment.value) evidence.payment_method = hintEvidence(payment.hint, 'medium');

		records.push({
			kind,
			amount: Math.round(major * 100),
			currency,
			title: guessTitle(text, major, currency),
			category: kind === 'income' ? 'Operasyon' : 'Pazarlama',
			subcategory: null,
			contact_id: contact?.id ?? null,
			contact_display_name: contact?.display_name ?? null,
			contact_label: extractContactLabel(text),
			occurred_on: today(),
			payment_method: payment.value,
			description: text,
			evidence
		});
	}
	return records;
}
