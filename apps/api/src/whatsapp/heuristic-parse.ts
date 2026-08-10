import type { Contact, SupportedCurrency, TransactionDraft } from '@verimaya/shared';
import { toTenantDayKey } from '@verimaya/shared';

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

function guessKind(text: string): 'income' | 'expense' {
	if (EXPENSE_HINTS.test(text)) return 'expense';
	if (INCOME_HINTS.test(text)) return 'income';
	return 'expense';
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
		const kind = guessKind(text);
		const contact = matchContact(text, contacts);
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
				description: text
			}
		];
	}

	const records: TransactionDraft[] = [];
	const kind = guessKind(text);
	const contact = matchContact(text, contacts);

	for (const m of matches) {
		const major = parseAmount(m[1]);
		if (major <= 0) continue;
		const currency = normalizeCurrency(m[2]);
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
			payment_method: /kart|card/i.test(text)
				? 'Kart'
				: /havale|transfer/i.test(text)
					? 'Havale'
					: null,
			description: text
		});
	}
	return records;
}
