import type {
	AppointmentLogisticsDraft,
	RecordUpdateSuggestionSkippedReason,
	RecordUpdateSuggestionTextField
} from '@verimaya/shared';
import type { LlmLogisticsAppointmentHint } from '../integrations/llm/llm.types';

/**
 * "Hastanın oteli/kliniği/transferi ne?" — deterministik okuyucu.
 *
 * WhatsApp'tan gelen en yaygın biçim tek satır: "Dawit Abraham Alp paşa hotel".
 * Hasta adı randevuyu seçer, geri kalan metin değerdir. Model gerekmiyor; bu yol
 * hem `HeuristicLlmClient`in kendisi hem de LLM düştüğünde yedek.
 *
 * TAHMİN YOK (Madde 6.2): hasta tek bir randevuya denk gelmiyorsa ya da geriye
 * okunur bir değer kalmıyorsa boş döner ve nedenini söyler.
 */

/** Hangi kelime hangi alana işaret ediyor. Sıra önemli: ilk eşleşen kazanır. */
const ALAN_ISARETLERI: Array<{ alan: RecordUpdateSuggestionTextField; kalip: RegExp }> = [
	{ alan: 'hotel', kalip: /\b(otel|hotel|resort|konaklama|pansiyon)\w*/i },
	{ alan: 'clinic', kalip: /\b(klinik|hastane|clinic|hospital)\w*/i },
	{
		alan: 'transfer',
		kalip: /\b(transfer|şoför|sofor|havalimanı|havalimani|havaalanı|havaalani|karşılama|karsilama)\w*/i
	}
];

/** Değerin başından/sonundan atılacak bağlayıcılar ve noktalama. */
const KENAR_GURULTU = /^[\s,;:.\-–—/]+|[\s,;:.\-–—/]+$/g;
const BAGLAYICI =
	/^(icin|için|ile|de|da|ve|olarak|olsun|oldu|degisti|değişti|yapildi|yapıldı|kaldi|kaldı|kalacak|gidecek|ayarlandi|ayarlandı)\b\s*/i;

function temizle(parca: string): string {
	let out = parca.replace(KENAR_GURULTU, '');
	// Baştaki bağlayıcıyı bir kez at: "icin Alp Pasa Hotel" → "Alp Pasa Hotel".
	out = out.replace(BAGLAYICI, '').replace(KENAR_GURULTU, '');
	return out.replace(/\s+/g, ' ').trim();
}

/**
 * Hasta adının metinde geçen parçalarını siler. Ad randevuyu seçmek için
 * kullanıldı; değerin içinde kalırsa "Dawit Abraham Alp Paşa Hotel" diye
 * saçma bir otel adı yazılır.
 */
function adiCikar(metin: string, adSoyad: string): string {
	let out = metin;
	for (const parca of adSoyad.split(/\s+/).filter((p) => p.length > 2)) {
		out = out.replace(new RegExp(`\\b${parca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ');
	}
	return out;
}

function randevulariEslestir(
	metin: string,
	randevular: LlmLogisticsAppointmentHint[]
): LlmLogisticsAppointmentHint[] {
	const kucuk = metin.toLocaleLowerCase('tr');
	return randevular.filter((a) => {
		const parcalar = a.contact_display_name
			.toLocaleLowerCase('tr')
			.split(/\s+/)
			.filter((p) => p.length > 2);
		return parcalar.some((p) => kucuk.includes(p));
	});
}

export type HeuristicLogisticsParseResult = {
	drafts: AppointmentLogisticsDraft[];
	/** Yalnız `drafts` boşken ve sebep BİLİNİYORSA dolu; uydurulmaz. */
	skipped_reason: RecordUpdateSuggestionSkippedReason | null;
};

export function heuristicSuggestAppointmentLogistics(
	message: string,
	randevular: LlmLogisticsAppointmentHint[] = []
): HeuristicLogisticsParseResult {
	const metin = message.trim();
	if (!metin || randevular.length === 0) {
		return { drafts: [], skipped_reason: null };
	}

	const isaret = ALAN_ISARETLERI.find((a) => a.kalip.test(metin));
	if (!isaret) {
		return { drafts: [], skipped_reason: null };
	}

	const eslesen = randevulariEslestir(metin, randevular);
	if (eslesen.length !== 1) {
		return { drafts: [], skipped_reason: eslesen.length > 1 ? 'ambiguous_contact' : null };
	}
	const randevu = eslesen[0]!;

	const deger = temizle(adiCikar(metin, randevu.contact_display_name));
	// Anahtar kelimenin kendisi tek başına değer değildir ("otel" ≠ otel adı).
	const yalnizAnahtar = temizle(deger.replace(isaret.kalip, '')).length === 0;
	if (!deger || yalnizAnahtar || deger.length > 255) {
		return { drafts: [], skipped_reason: 'no_value' };
	}

	const mevcut = randevu[isaret.alan];
	if (mevcut && mevcut.toLocaleLowerCase('tr') === deger.toLocaleLowerCase('tr')) {
		return { drafts: [], skipped_reason: 'no_change' };
	}

	return {
		drafts: [
			{
				appointment_id: randevu.appointment_id,
				field: isaret.alan,
				suggested_text: deger,
				confidence: 'medium',
				reason: metin.slice(0, 4000)
			}
		],
		skipped_reason: null
	};
}
