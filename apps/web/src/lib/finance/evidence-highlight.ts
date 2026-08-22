import {
	transactionEvidenceFieldSchema,
	type TransactionEvidence,
	type TransactionEvidenceEntry,
	type TransactionEvidenceField
} from '@verimaya/shared';

/** Mesaj metninin alıntı etrafında üç parçası; `match` vurgulanır. */
export type EvidenceHighlight = { before: string; match: string; after: string };

/**
 * AI-09 — alıntıyı mesaj metninde konumlar.
 *
 * `start` sunucuda ham mesaja göre hesaplanır, ama burada yine doğrulanır:
 * kullanıcı mesaj kutusunu düzenlemiş olabilir. Ofset tutmuyorsa alıntı metinde
 * aranır. Hiç bulunamazsa `null` döner — çağıran alıntıyı yine gösterir, sadece
 * vurgulamaz (PII maskelemesi ham metinde karşılığı olmayan bir alıntı üretmiş
 * olabilir; `[TELEFON]` gibi).
 */
export function locateEvidenceQuote(
	message: string,
	entry: TransactionEvidenceEntry | null | undefined
): EvidenceHighlight | null {
	if (!entry || entry.quote.length === 0) return null;
	const idx =
		entry.start != null && message.startsWith(entry.quote, entry.start)
			? entry.start
			: message.indexOf(entry.quote);
	if (idx === -1) return null;
	return {
		before: message.slice(0, idx),
		match: message.slice(idx, idx + entry.quote.length),
		after: message.slice(idx + entry.quote.length)
	};
}

export type SourceQuote = { field: TransactionEvidenceField; label: string; quote: string };

/**
 * İşlem detayında listelenecek alıntılar.
 *
 * Boş alıntılı girdiler (AI okumadan çıkarım yaptı, `confidence: 'low'`)
 * bilinçli olarak listelenmez: gösterilecek bir cümle yok, satır yalnız gürültü
 * olurdu. Taslak kartında ise aynı girdi "çıkarım" rozeti olarak görünür —
 * orada kullanıcı hâlâ değeri düzeltebilir, bilgi işe yarar.
 */
export function visibleSourceQuotes(
	evidence: TransactionEvidence | null | undefined,
	labelFor: (field: TransactionEvidenceField) => string
): SourceQuote[] {
	if (!evidence) return [];
	const out: SourceQuote[] = [];
	for (const field of transactionEvidenceFieldSchema.options) {
		const entry = evidence[field];
		if (!entry || entry.quote.length === 0) continue;
		out.push({ field, label: labelFor(field), quote: entry.quote });
	}
	return out;
}
