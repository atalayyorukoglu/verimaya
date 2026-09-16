import type { TransactionDraft } from '@verimaya/shared';
import { trAnahtar } from './kategori';
import { tekKisiBul, type KisiAdayi } from './kisi-eslestir';

/** Hasta alanının bağlandığı kişi türü. */
const HASTA_TURU = 'hasta';

/**
 * Taslak ön dolumu — hasta ve karşı taraf.
 *
 * - **Hasta:** mesaja bağlı kişilerden türü Hasta olan TEK kişi varsa önerilir.
 *   Sıfır ya da birden fazlaysa boş kalır: yanlış hasta yazmaktansa boş.
 * - **Karşı taraf:** modelin yazdığı serbest ad ("Dumos Hotel") dizinde tek ve
 *   kesin eşleşiyorsa `contact_id` doldurulur. Serbest ad olduğu gibi kalır —
 *   mesajın kendi ifadesi kaybolmasın.
 *
 * Model bu alanları üretmez; ikisi de kullanıcı tarafından değiştirilebilir
 * (AGENTS ilke 6: taslak, kesin kayıt değil).
 */
export function taslaklariOnDoldur(
	records: TransactionDraft[],
	adaylar: KisiAdayi[],
	bagliKisiIdleri: string[]
): TransactionDraft[] {
	if (records.length === 0) return records;
	const dizin = new Map(adaylar.map((a) => [a.id, a]));
	const hastalar = bagliKisiIdleri
		.map((id) => dizin.get(id))
		.filter((a): a is KisiAdayi => !!a && trAnahtar(a.contactTypeName ?? '') === HASTA_TURU);
	const caseContactId = hastalar.length === 1 ? hastalar[0].id : null;

	return records.map((r) => {
		const next: TransactionDraft = { ...r };
		if (caseContactId && !next.case_contact_id) next.case_contact_id = caseContactId;
		if (!next.contact_id) {
			const eslesen = tekKisiBul(next.contact_label, adaylar);
			if (eslesen) {
				next.contact_id = eslesen.id;
				next.contact_display_name = eslesen.displayName;
			}
		}
		return next;
	});
}
