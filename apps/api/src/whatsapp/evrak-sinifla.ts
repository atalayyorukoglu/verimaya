import type { MediaDocSubtype, MediaDocType, MediaVisitHint } from '@verimaya/shared';

/**
 * EVRAK-01 — ek başlığından belge türü + vizit ipucu. **Saf fonksiyon, LLM yok.**
 *
 * Neden model değil: Evrak grubundaki 5.000+ ekin başlığı tek kalıpta yazılıyor —
 * `Ad Soyad + belge türü + visit N/rpt` (`docs/2026-09-16-HASTA-AKISI.md` § 6.3).
 * Kalıp sabit olunca sözlük modelden hem daha ucuz hem daha kararlı: aynı başlık
 * her seferinde aynı türü verir, geçmiş 5.000 eki yeniden etiketlemek bedava.
 *
 * Girdi gerçek hayatta kirli: Türkçe-İngilizce karışık ("ameliyat sonrası x-ray"),
 * yazım serbest (`xray` / `x-ray` / `X-Rat`), sayfa numarası eklenmiş
 * ("… page1", "… pg 2"). Bu yüzden önce sert bir normalleştirme, sonra SIRALI
 * kural listesi: ilk eşleşen tür kazanır. Sıra veridir — "post operative
 * instructions all on X final prosthesis" yönerge, "all on X final prosthesis
 * consent form" onamdır; ikisi de aynı sözcükleri taşır, ayıran şey sıradır.
 */

export type EvrakSinif = {
	doc_type: MediaDocType;
	/** Yalnız `consent_form` için dolar. */
	doc_subtype: MediaDocSubtype | null;
	visit_hint: MediaVisitHint | null;
};

const TURKCE_ASCII: Record<string, string> = {
	ç: 'c',
	ğ: 'g',
	ı: 'i',
	ö: 'o',
	ş: 's',
	ü: 'u',
	â: 'a',
	î: 'i',
	û: 'u'
};

/**
 * Küçük harf + ASCII + tek boşluk. `toLowerCase()` yerel bağımsızdır (Türkçe
 * "İ" → "i̇" birleşik noktayı NFD ile atarız), `x-ray`/`x ray` tek bir `xray`
 * olur ki kural listesi tek yazımla ilgilensin.
 */
export function evrakNormalize(input: string): string {
	const lower = input.toLowerCase();
	const ascii = Array.from(lower)
		.map((ch) => TURKCE_ASCII[ch] ?? ch)
		.join('')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '');
	return ` ${ascii
		.replace(/[^a-z0-9]+/g, ' ')
		// `x-ray`, `x ray`, `X-Rays` ve elde yakalanan `X-Rat` yazım hatası tek belirteç.
		.replace(/\bx\s+ra[a-z]+\b/g, 'xray')
		.replace(/\brontgen\w*/g, 'xray')
		.trim()} `;
}

/** `visit2`, `visit 2`, `2nd visit`, `1.visit`, `rpt`, `konsültasyon`. */
export function vizitIpucu(text: string): MediaVisitHint | null {
	const n = evrakNormalize(text);
	if (/\brpt\b/.test(n)) return 'rpt';
	if (/\bkonsultasyon\b|\bconsultation\b/.test(n)) return 'consultation';
	const m =
		/\bvisit\s?([123])\b/.exec(n) ??
		/\b([123])(?:st|nd|rd|th)\s+visit\b/.exec(n) ??
		/\b([123])\s+visit\b/.exec(n);
	if (!m) return null;
	return (['visit_1', 'visit_2', 'visit_3'] as const)[Number(m[1]) - 1] ?? null;
}

/** Onam formunun alt türü; sıra önemli — en özgül kalıp önce. */
function onamAltTuru(n: string): MediaDocSubtype {
	if (/\bmedia release\b|\bphotography\b|\bgorsel kullanim\b/.test(n)) return 'media_release';
	if (/\bclinic policy\b|\bconduct communication\b|\bklinik politika/.test(n)) {
		return 'clinic_policy';
	}
	if (/\b(general|genel)\s+(anesthesia|anestezi|anaesthetic|anesthetic|anestezisi)\b/.test(n)) {
		return 'general_anesthesia';
	}
	if (/\b(local|lokal)\s+(anesthesia|anestezi|anaesthetic|anesthetic|anestezisi)\b/.test(n)) {
		return 'local_anesthesia';
	}
	if (/\bextraction\b|\bdis cekim/.test(n)) return 'extraction';
	if (/\bimplant surgery\b|\bimplant cerrahi/.test(n)) return 'implant_surgery';
	if (/\bfinal prosthesis\b|\bfinal protez\b/.test(n)) return 'final_prosthesis';
	if (/\bcrown treatment\b|\btreatment consent\b|\btedavi onam/.test(n)) return 'treatment';
	if (/\btnc form\b/.test(n)) return 'tnc_form';
	return 'visit';
}

/** X-ray'in hangi aşamaya ait olduğu. */
function xrayTuru(n: string): MediaDocType {
	// "ameliyat sonrası", "diş çekimi sonrası", "after surgery" — cerrahi günü.
	if (/\bsonras\w*\b/.test(n) || /\bafter\s+(surgery|extraction|implant)\b/.test(n)) {
		return 'xray_after_surgery';
	}
	if (/\bbitim\b|\blast\b|\bfinal\b|\bafter\b|\bson\b/.test(n)) return 'xray_after';
	if (/\bbefore\b|\bfirst\b|\bilk\b|\bpre\b|\boncesi\b/.test(n)) return 'xray_before';
	// Nitelemesiz röntgen: gelişte çekilen ilk film. Evrak grubunda niteleme
	// unutulduğunda ("konsültasyon xray") gerçekte hep bu.
	return 'xray_before';
}

type Kural = { test: RegExp; tur: MediaDocType };

/**
 * SIRALI kural listesi. Yukarıdaki kural aşağıdakini gölgeler; sıra değişirse
 * testler kırılır (gerçek başlıklarla yazıldı, bilerek).
 */
const KURALLAR: Kural[] = [
	// Hekim onayı pdf'i — klinik hakedişi için, başka hiçbir şeye benzemez.
	{ test: /\bhekim onay\w*\b|\bdoctor approval\b/, tur: 'doctor_approval' },
	// Lab / kan tetkiki (genel anestezi öncesi).
	{
		test: /\blab tetkik\w*\b|\btetkik sonuc\w*\b|\bkan tahlil\w*\b|\bblood (test|result)\w*\b|\blab result/,
		tur: 'lab_results'
	},
	// Sertifika ailesi: implant passport / crown certificate / guarantee / insurance.
	// "implant passport" pasaporttan ÖNCE gelmeli, yoksa hasta pasaportu sanılır.
	{
		test: /\bimplant passport\b|\bcertificate\w*\b|\bsertifika\w*\b|\bguarantee\w*\b|\bgaranti\w*\b|\binsurance\b|\bwarranty\b/,
		tur: 'certificate'
	},
	{ test: /\binvoice\b|\bfatura\w*\b/, tur: 'invoice' },
	{ test: /\bsatisfaction\b|\bmemnuniyet\b/, tur: 'satisfaction_form' },
	// Diş rengi notu memnuniyet formundan SONRA: "Satisfaction (dis rengi eklendi)"
	// bir memnuniyet formudur, renk notu değil.
	{ test: /\bdis reng\w*\b|\btooth shade\b|\bshade guide\b/, tur: 'tooth_shade_note' },
	{
		test: /\bpost\s?op\w*\s+(instruction|instructions|yonerge\w*)\b|\bpostoperative instruction/,
		tur: 'post_operative_instructions'
	},
	{
		test: /\btemporary crown\b|\btemp crown\b|\btemp guideline\w*\b|\bgecici kron\b/,
		tur: 'temporary_crown_guidelines'
	},
	{ test: /\bafter ?care\b|\baftercare\b|\bbakim yonerge\w*\b/, tur: 'after_care_guidelines' },
	{
		test: /\bregistration\b|\bmedical declaration\b|\bkayit form\w*\b/,
		tur: 'registration_form'
	},
	// X-ray'ler onamdan önce: "before x-ray" onam sözcüğü taşımaz, ama
	// "teeth extraction consent" x-ray sözcüğü taşımaz — çakışma yok.
	{ test: /\bxray\w*\b/, tur: 'xray_before' },
	{
		test: /\bconsent\b|\bonam\w*\b|\btnc form\b|\bclinic policy\b|\bconduct communication\b|\bmedia release\b|\bphotography\b|\bextraction\b|\bwelcome\b|\bpatient acknowledgement\b|\bfinal prosthesis\b/,
		tur: 'consent_form'
	},
	{ test: /\bpassport\b|\bpasaport\w*\b/, tur: 'passport' },
	{ test: /\bstamp\b|\bdamga\w*\b|\bpul\b|\bpulu\b|\bulkeye giris\b/, tur: 'stamp' }
];

/**
 * Tek başlığı sınıflandırır. Tanınmayan başlık `other` döner — ek kaybolmaz,
 * Dosyalar sekmesinde "Diğer" grubunda görünür ve elle düzeltilebilir.
 */
export function evrakSinifla(text: string | null | undefined): EvrakSinif {
	const raw = (text ?? '').trim();
	if (!raw) return { doc_type: 'other', doc_subtype: null, visit_hint: null };

	const n = evrakNormalize(raw);
	const visit_hint = vizitIpucu(raw);

	for (const kural of KURALLAR) {
		if (!kural.test.test(n)) continue;
		if (kural.tur === 'xray_before') {
			return { doc_type: xrayTuru(n), doc_subtype: null, visit_hint };
		}
		if (kural.tur === 'consent_form') {
			return { doc_type: 'consent_form', doc_subtype: onamAltTuru(n), visit_hint };
		}
		return { doc_type: kural.tur, doc_subtype: null, visit_hint };
	}
	return { doc_type: 'other', doc_subtype: null, visit_hint };
}

/**
 * Ekin başlığı iki yerden gelebilir: mesajın kendi metni (caption) ya da dosya adı.
 * Caption önce denenir — insanın yazdığı başlık dosya adından her zaman daha
 * bilgilidir; WhatsApp'ın ürettiği `IMG-20240903-WA0017.jpg` hiçbir şey söylemez.
 * Caption `other` verirse dosya adına düşülür (`Lee Jones 2nd Visit Invoice.pdf`
 * gibi anlamlı adlar için).
 */
export function evrakSiniflaKaynaklardan(
	caption: string | null | undefined,
	filename: string | null | undefined
): EvrakSinif {
	const capt = evrakSinifla(caption);
	if (capt.doc_type !== 'other') return capt;
	const file = evrakSinifla(filename);
	if (file.doc_type !== 'other') return file;
	// İkisi de tanınmadı: vizit ipucu hangisinde varsa onu koru.
	return { doc_type: 'other', doc_subtype: null, visit_hint: capt.visit_hint ?? file.visit_hint };
}
