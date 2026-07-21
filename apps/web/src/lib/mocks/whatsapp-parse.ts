import type { Patient, SupportedCurrency, TransactionDraft } from '@verimaya/shared';

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
	return new Date().toISOString().slice(0, 10);
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

function matchPatient(text: string, patients: Patient[]): Patient | null {
	const lower = text.toLowerCase();
	for (const p of patients) {
		const parts = p.full_name
			.toLowerCase()
			.split(/\s+/)
			.filter((x) => x.length > 2);
		if (parts.some((part) => lower.includes(part))) return p;
	}
	return null;
}

/** Demo parser — gerçek AI Faz 3'te backend'de çalışır. */
export function parseWhatsappMessage(
	message: string,
	patients: Patient[] = []
): TransactionDraft[] {
	const text = message.trim();
	if (!text) return [];

	const matches = [...text.matchAll(CURRENCY_PATTERN)];
	if (matches.length === 0) {
		const fallback = text.match(/(\d[\d.,]+)/);
		if (!fallback) return [];
		const amount = Math.round(parseAmount(fallback[1]) * 100);
		const kind = guessKind(text);
		const patient = matchPatient(text, patients);
		return [
			{
				kind,
				amount,
				currency: 'TRY',
				title: guessTitle(text, amount / 100, 'TRY'),
				category: kind === 'income' ? 'Operasyon' : 'Konaklama',
				patient_id: patient?.id ?? null,
				patient_display_name: patient?.full_name ?? null,
				contact_label: null,
				occurred_on: today(),
				payment_method: null,
				description: text
			}
		];
	}

	const records: TransactionDraft[] = [];
	const kind = guessKind(text);
	const patient = matchPatient(text, patients);

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
			patient_id: patient?.id ?? null,
			patient_display_name: patient?.full_name ?? null,
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
