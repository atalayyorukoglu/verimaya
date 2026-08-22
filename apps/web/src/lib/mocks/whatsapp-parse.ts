import type {
	Contact,
	SupportedCurrency,
	TransactionDraft,
	TransactionEvidence,
	TransactionEvidenceEntry
} from '@verimaya/shared';
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

function guessKind(text: string): { kind: 'income' | 'expense'; hint: RegExpMatchArray | null } {
	const expense = text.match(EXPENSE_HINTS);
	if (expense) return { kind: 'expense', hint: expense };
	const income = text.match(INCOME_HINTS);
	if (income) return { kind: 'income', hint: income };
	return { kind: 'expense', hint: null };
}

/** AI-09 demo izi — API'deki heuristic yolun aynısı: ofset regex eşleşmesinden gelir. */
function entry(
	quote: string,
	start: number | null,
	confidence: TransactionEvidenceEntry['confidence']
): TransactionEvidenceEntry {
	return { quote: quote.slice(0, 200), start, confidence };
}

/** Okunmadan varsayılan atanan alan: iz yok, güven düşük. */
const inferred = (): TransactionEvidenceEntry => entry('', null, 'low');

function hintEntry(hint: RegExpMatchArray | null): TransactionEvidenceEntry {
	if (!hint || hint.index == null) return inferred();
	return entry(hint[0], hint.index, 'medium');
}

function guessTitle(text: string, amount: number, currency: string): string {
	const trimmed = text.trim().slice(0, 120);
	if (trimmed.length > 0 && trimmed.length < 80) return trimmed;
	return `${amount.toLocaleString('tr-TR')} ${currency} işlem`;
}

function matchContact(text: string, contacts: Contact[]): Contact | null {
	const lower = text.toLowerCase();
	for (const c of contacts) {
		if (c.contact_type_name !== 'Hasta') continue;
		const parts = [c.first_name, c.last_name ?? '', c.display_name]
			.join(' ')
			.toLowerCase()
			.split(/\s+/)
			.filter((x) => x.length > 2);
		if (parts.some((part) => lower.includes(part))) return c;
	}
	return null;
}

/** Demo parser — gerçek AI Faz 3'te backend'de çalışır. */
export function parseWhatsappMessage(
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
				evidence: {
					amount: entry(fallback[1], fallback.index ?? null, 'high'),
					currency: inferred(),
					kind: hintEntry(kindHint),
					occurred_on: inferred(),
					category: inferred()
				}
			}
		];
	}

	const records: TransactionDraft[] = [];
	const { kind, hint: kindHint } = guessKind(text);
	const contact = matchContact(text, contacts);
	const methodHint = text.match(/kart|card/i) ?? text.match(/havale|transfer/i);

	for (const m of matches) {
		const major = parseAmount(m[1]);
		if (major <= 0) continue;
		const currency = normalizeCurrency(m[2]);
		const matchStart = m.index ?? null;
		const evidence: TransactionEvidence = {
			amount: entry(m[1], matchStart, 'high'),
			currency: entry(
				m[2],
				matchStart == null ? null : matchStart + m[0].lastIndexOf(m[2]),
				'high'
			),
			kind: hintEntry(kindHint),
			occurred_on: inferred(),
			category: inferred()
		};
		if (methodHint) evidence.payment_method = hintEntry(methodHint);
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
			description: text,
			evidence
		});
	}

	return records.length > 0 ? records : [];
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
