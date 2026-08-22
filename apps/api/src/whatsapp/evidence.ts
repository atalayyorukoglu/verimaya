import {
	transactionEvidenceFieldSchema,
	transactionEvidenceSchema,
	type ApproveDraftItem,
	type TransactionDraft,
	type TransactionEvidence,
	type TransactionEvidenceEntry,
	type TransactionEvidenceField
} from '@verimaya/shared';

const EVIDENCE_FIELDS = transactionEvidenceFieldSchema.options;

/**
 * AI-09 — sunucu tarafı atıf doğrulaması.
 *
 * **Uydurulmuş atıf, atıfsızlıktan daha zararlıdır**: kullanıcı gördüğü ize güvenir,
 * "şu cümleden aldım" yazısı yanlışsa yanlış rakamı onaylar. Bu yüzden modelin
 * verdiği her alıntı, modele gerçekten gönderilen metinde aranır; geçmiyorsa o
 * evidence girdisi düşürülür (kayıt kalır, izi gider).
 *
 * ### Hangi metne karşı doğrulanıyor ve neden
 * `modelText` — yani **maskelenmiş** metin (`buildMaskedLlmUserPayload` çıktısı).
 * Model ham mesajı hiç görmez; ham metne karşı doğrulamak, `[TELEFON]`/`[HASTA]`
 * içeren dürüst bir alıntıyı "uydurma" sayıp atardı. Soru "model bunu uydurdu mu"
 * olduğuna göre ölçüt, modelin önündeki metindir.
 *
 * ### `start` neden yeniden hesaplanıyor
 * Vurgulama ham mesaj üzerinde yapılır, maskeleme ofsetleri kaydırır. Modelin
 * verdiği ofset hiç kullanılmaz (yalnız aynı alıntı birden çok geçtiğinde ipucu
 * olarak denenir); ham metinde alıntı bulunamazsa `start: null` olur — quote
 * gösterilmeye devam eder, sadece vurgulanmaz.
 */
export function verifyEvidence(
	evidence: TransactionEvidence | null | undefined,
	modelText: string,
	rawText: string
): TransactionEvidence | null {
	if (!evidence) return null;

	const verified: TransactionEvidence = {};
	for (const field of EVIDENCE_FIELDS) {
		const entry = evidence[field];
		if (!entry) continue;

		const quote = entry.quote;
		if (quote.length === 0) {
			// Prompt "okumadan çıkardım" durumunda boş quote + low ister. Boş alıntı
			// doğrulanamaz ama dürüst bir sinyaldir; yalnız `low` ile kabul edilir.
			if (entry.confidence !== 'low') continue;
			verified[field] = { quote: '', start: null, confidence: 'low' };
			continue;
		}

		if (!modelText.includes(quote)) continue;

		verified[field] = {
			quote,
			start: resolveRawStart(quote, entry.start, rawText),
			confidence: entry.confidence
		};
	}

	return Object.keys(verified).length > 0 ? verified : null;
}

/** Doğrulanmış alıntıyı ham mesajda konumlar; bulunamazsa null (maskeleme kaydırmıştır). */
function resolveRawStart(quote: string, hint: number | null, rawText: string): number | null {
	if (hint != null && hint >= 0 && rawText.startsWith(quote, hint)) return hint;
	const idx = rawText.indexOf(quote);
	return idx === -1 ? null : idx;
}

/** Her taslağın izini doğrular; hiçbir taslak alanına dokunmaz. */
export function verifyDraftEvidence(
	records: TransactionDraft[],
	modelText: string,
	rawText: string
): TransactionDraft[] {
	return records.map((record) => ({
		...record,
		evidence: verifyEvidence(record.evidence, modelText, rawText)
	}));
}

/** Alan değerlerini iz için karşılaştırılabilir hâle getirir (undefined ≡ null). */
function fieldValue(
	draft: TransactionDraft | ApproveDraftItem,
	field: TransactionEvidenceField
): string | number | null {
	switch (field) {
		case 'amount':
			return draft.amount;
		case 'currency':
			return draft.currency;
		case 'kind':
			return draft.kind;
		case 'occurred_on':
			return draft.occurred_on;
		case 'contact_id':
			return draft.contact_id ?? null;
		case 'payment_method':
			return draft.payment_method ?? null;
		case 'category':
			return draft.category ?? null;
	}
}

/**
 * AI-09 — onaylanan işleme yazılacak iz.
 *
 * Kaynak **sunucudaki** taslaktır (`inbound_messages.payload.parsed_records`),
 * istek gövdesi değil: istemci "şu cümleden aldım" diye uydurma bir atıf
 * gönderemesin diye. Gövdeden gelen `evidence` zaten şemada yok, zod düşürüyor;
 * burası o kararın ikinci yarısı — izin nereden geldiği.
 *
 * İnsan bir alanı düzelttiyse o alanın izi **düşürülür**: iz "AI bunu şu
 * cümleden aldı" der; kullanıcı üstüne yazdıysa cümle artık o değerin kaynağı
 * değildir. (Yan kazanç: geriye kalan iz, AI-03 için "hangi alan hangi
 * confidence'ta düzeltildi" verisidir.)
 */
export function evidenceForApprovedDraft(
	stored: TransactionDraft | undefined,
	approved: ApproveDraftItem
): TransactionEvidence | null {
	if (!stored) return null;
	// Payload jsonb; sunucu yazsa da savunma amaçlı yeniden doğrulanır.
	const parsed = transactionEvidenceSchema.safeParse(stored.evidence ?? {});
	if (!parsed.success) return null;

	const kept: TransactionEvidence = {};
	for (const field of EVIDENCE_FIELDS) {
		const entry = parsed.data[field];
		if (!entry) continue;
		if (fieldValue(stored, field) !== fieldValue(approved, field)) continue;
		kept[field] = entry;
	}
	return Object.keys(kept).length > 0 ? kept : null;
}

/** Ham metinde `quote`'u konumlayıp iz girdisi kurar; heuristic yol için. */
export function evidenceEntry(
	quote: string,
	start: number | null,
	confidence: TransactionEvidenceEntry['confidence']
): TransactionEvidenceEntry {
	return { quote: quote.slice(0, 200), start, confidence };
}

export type { TransactionEvidenceField };
