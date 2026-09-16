import { describe, expect, it } from 'vitest';
import {
	evrakNormalize,
	evrakSinifla,
	evrakSiniflaKaynaklardan,
	vizitIpucu
} from './evrak-sinifla';

/**
 * EVRAK-01 — sınıflandırıcı testi. Örnekler **uydurulmadı**: hepsi
 * `docs/whatsapp-01/Evrak Grubu OrbisMed …` sohbetindeki gerçek ek başlıkları
 * (`grep -A1 "dosya ekli"` ile çıkarılan 4.956 farklı başlıktan seçildi).
 * Yazım hataları, Türkçe-İngilizce karışımı ve sayfa numaraları olduğu gibi
 * duruyor — sınıflandırıcının işi zaten bunlarla başa çıkmak.
 */
type Beklenen = { tur: string; alt?: string | null; vizit?: string | null };

const GERCEK_BASLIKLAR: Array<[string, Beklenen]> = [
	// — pasaport / damga (gelişte) —
	['Wayne Embleton passport', { tur: 'passport' }],
	['Anita Prozmo Pasaport', { tur: 'passport' }],
	['Dariusz Dwojacki pasaport ve Pulu', { tur: 'passport' }],
	['Matthew Baker stamp', { tur: 'stamp' }],
	['Claire Mccubbin stamp', { tur: 'stamp' }],

	// — kayıt formu —
	['Wayne Embleton registration form page1', { tur: 'registration_form' }],
	['Avisha Salehi patient registration form page1', { tur: 'registration_form' }],
	[
		'Arianne Strubbe visit 2 Patient Registration & Full Medical Declaration Form Page 1',
		{ tur: 'registration_form', vizit: 'visit_2' }
	],
	['Joanne Barker registration consent form page2', { tur: 'registration_form' }],

	// — onam formları ve alt türleri —
	['Robert Cooper visit 1 consent form', { tur: 'consent_form', alt: 'visit', vizit: 'visit_1' }],
	['Aaron lewsey visit 1 consent', { tur: 'consent_form', alt: 'visit', vizit: 'visit_1' }],
	[
		'Perdita Alice Durant Welcome Consent Form 1st visit',
		{ tur: 'consent_form', alt: 'visit', vizit: 'visit_1' }
	],
	['Christopher Kelly rpt consent form', { tur: 'consent_form', alt: 'visit', vizit: 'rpt' }],
	['Iwona Jaglowska tnc form', { tur: 'consent_form', alt: 'tnc_form' }],
	[
		'Sara Kaleab conduct communication and clinic policy consent form',
		{ tur: 'consent_form', alt: 'clinic_policy' }
	],
	[
		'Aaron Nicholas before and after photography media release consent form',
		{ tur: 'consent_form', alt: 'media_release' }
	],
	[
		'Adele Hicks general anesthesia consent form page1',
		{ tur: 'consent_form', alt: 'general_anesthesia' }
	],
	[
		'Adrian Popescu genel anestezi consent form page2',
		{ tur: 'consent_form', alt: 'general_anesthesia' }
	],
	['Local anaesthetic consent dawn evans', { tur: 'consent_form', alt: 'local_anesthesia' }],
	['Adele Hicks local anesthesia consent form', { tur: 'consent_form', alt: 'local_anesthesia' }],
	['Adele Hicks teeth extraction page1', { tur: 'consent_form', alt: 'extraction' }],
	[
		'Adele Hicks zygomatic implant surgery consent form page2',
		{ tur: 'consent_form', alt: 'implant_surgery' }
	],
	[
		'Mark Shaw all on X final prosthesis consent form page1',
		{ tur: 'consent_form', alt: 'final_prosthesis' }
	],
	['Sara Kaleab crown treatment consent form', { tur: 'consent_form', alt: 'treatment' }],

	// — röntgenler —
	['Claire Smith visit 1 before x-ray', { tur: 'xray_before', vizit: 'visit_1' }],
	['Adele hicks visit2 before x-ray', { tur: 'xray_before', vizit: 'visit_2' }],
	['Alan Carter first X-ray', { tur: 'xray_before' }],
	['Eileen Holmes ilk röntgeni', { tur: 'xray_before' }],
	['Abdirazak mohamoud ilk xray 1.visit', { tur: 'xray_before', vizit: 'visit_1' }],
	[
		'Ruth Samuels CONSULTATION X-Ray ( Sarah janes arkadasi)',
		{
			tur: 'xray_before',
			vizit: 'consultation'
		}
	],
	['Abdul mutakabbir ameliyat sonrası xray', { tur: 'xray_after_surgery' }],
	['Adele Hicks ameliyat sonrası x-ray', { tur: 'xray_after_surgery' }],
	['Roy Kamis diş çekimi sonrasi x-ray', { tur: 'xray_after_surgery' }],
	['Anthony paul agar visit 1 bitim xray', { tur: 'xray_after', vizit: 'visit_1' }],
	['Krzystof Bolanski visit 2 bitim x-ray', { tur: 'xray_after', vizit: 'visit_2' }],
	['Gary Dawson Last X-ray bitim rontgeni', { tur: 'xray_after' }],
	['Ian Thompson rpt after x-ray', { tur: 'xray_after', vizit: 'rpt' }],
	['Timothy Angel bitim röntgeni', { tur: 'xray_after' }],

	// — bitim evrak seti —
	['Kathryn Hurley visit 2 invoice', { tur: 'invoice', vizit: 'visit_2' }],
	['Adrian Popescu 2nd Visit Invoice.pdf', { tur: 'invoice', vizit: 'visit_2' }],
	['Craig Atherton 3rd Visit Invoice.pdf', { tur: 'invoice', vizit: 'visit_3' }],
	[
		'Gary Wainwright visit 2 satisfaction form page 1',
		{ tur: 'satisfaction_form', vizit: 'visit_2' }
	],
	['Kathleen fortune rpt satisfaction pg 1', { tur: 'satisfaction_form', vizit: 'rpt' }],
	['Mark Shaw after care guidelines', { tur: 'after_care_guidelines' }],
	['David jones aftercare guideline', { tur: 'after_care_guidelines' }],
	['Adele Hicks temporary crown care guidelines page1', { tur: 'temporary_crown_guidelines' }],
	[
		'Carl Thorn Visit 1 temp guideline pg 1',
		{ tur: 'temporary_crown_guidelines', vizit: 'visit_1' }
	],
	[
		'Raul Pirnevan post operative instructions crowns and fixed restorations',
		{ tur: 'post_operative_instructions' }
	],
	[
		'Mark Shaw post operative instructions all on X final prosthesis',
		{ tur: 'post_operative_instructions' }
	],
	[
		'Aynur Taşman all on x post operative instructions page1',
		{
			tur: 'post_operative_instructions'
		}
	],

	// — sertifika ailesi —
	['Aaron Nicholas implant and crown certificate', { tur: 'certificate' }],
	['Stephen Paterson implant passport', { tur: 'certificate' }],
	['Alan davis crown certificate and implant passport', { tur: 'certificate' }],
	['Daniel thurston crown guarantee', { tur: 'certificate' }],
	['Amanda O’Donnell insurance', { tur: 'certificate' }],

	// — sonradan gelenler —
	['Aaron Nicholas Visit 2 Hekim Onay.pdf', { tur: 'doctor_approval', vizit: 'visit_2' }],
	['Adrian Gaitan RPT Hekim Onay.pdf', { tur: 'doctor_approval', vizit: 'rpt' }],
	['Zaid Waldu tıbbi lab tetkik sonuçları', { tur: 'lab_results' }],
	['Ariana strubbe kan tahlil sonuçları', { tur: 'lab_results' }],
	['Timothy Angel Dis rengi: 1M1', { tur: 'tooth_shade_note' }],
	['Susan Catherine Kavanagh diş rengi OM2', { tur: 'tooth_shade_note' }],

	// — tanınmayanlar: tür uydurulmaz —
	['IMG-20240903-WA0017.jpg', { tur: 'other' }],
	['Susan Catherine Kavanagh', { tur: 'other' }],
	['Page2', { tur: 'other' }]
];

describe('EVRAK-01 evrakSinifla — gerçek Evrak grubu başlıkları', () => {
	it(`${GERCEK_BASLIKLAR.length} gerçek başlığı doğru sınıflandırır`, () => {
		const yanlis: string[] = [];
		for (const [baslik, beklenen] of GERCEK_BASLIKLAR) {
			const s = evrakSinifla(baslik);
			if (s.doc_type !== beklenen.tur) {
				yanlis.push(`${baslik} → ${s.doc_type} (beklenen ${beklenen.tur})`);
				continue;
			}
			if (beklenen.alt !== undefined && s.doc_subtype !== beklenen.alt) {
				yanlis.push(`${baslik} → alt ${s.doc_subtype} (beklenen ${beklenen.alt})`);
			}
			const vizit = beklenen.vizit ?? null;
			if (s.visit_hint !== vizit) {
				yanlis.push(`${baslik} → vizit ${s.visit_hint} (beklenen ${vizit})`);
			}
		}
		expect(yanlis).toEqual([]);
	});

	it('en az 25 gerçek başlık kapsanır (test vakumda geçmesin)', () => {
		expect(GERCEK_BASLIKLAR.length).toBeGreaterThanOrEqual(25);
	});

	it('boş/ eksik başlık tür uydurmaz', () => {
		expect(evrakSinifla(null)).toEqual({ doc_type: 'other', doc_subtype: null, visit_hint: null });
		expect(evrakSinifla('   ')).toEqual({ doc_type: 'other', doc_subtype: null, visit_hint: null });
	});

	it('yalnız onam formunda alt tür dolar', () => {
		expect(evrakSinifla('Kathryn Hurley visit 2 invoice').doc_subtype).toBeNull();
		expect(evrakSinifla('Iwona Jaglowska tnc form').doc_subtype).toBe('tnc_form');
	});
});

describe('EVRAK-01 evrakNormalize', () => {
	it('Türkçe harfleri ASCII yapar ve x-ray yazımlarını tekler', () => {
		expect(evrakNormalize('Ameliyat Sonrası X-Ray')).toBe(' ameliyat sonrasi xray ');
		expect(evrakNormalize('bitim röntgeni')).toBe(' bitim xray ');
		// Elde yakalanan yazım hatası: "RPT Bitim X-Rat".
		expect(evrakNormalize('RPT Bitim X-Rat')).toBe(' rpt bitim xray ');
	});

	it('büyük İ ve ı ayrımı tür eşlemesini bozmaz', () => {
		expect(evrakSinifla('İNVOICE VİSİT 1').doc_type).toBe('invoice');
	});
});

describe('EVRAK-01 vizitIpucu', () => {
	it.each([
		['Robert Cooper visit 1 consent form', 'visit_1'],
		['Adele hicks visit2 before x-ray', 'visit_2'],
		['Janet Rose 2nd Visit Invoice.pdf', 'visit_2'],
		['Darren Fice 3rd Visit Invoice.pdf', 'visit_3'],
		['Abdirazak mohamoud ilk xray 1.visit', 'visit_1'],
		['Mark Shaw rpt satisfaction form', 'rpt'],
		['Darren mccinery konsültasyon consent', 'consultation'],
		['Mark Shaw after care guidelines', null]
	])('%s → %s', (baslik, beklenen) => {
		expect(vizitIpucu(baslik)).toBe(beklenen);
	});
});

describe('EVRAK-01 evrakSiniflaKaynaklardan', () => {
	it('caption tanınırsa dosya adına bakmaz', () => {
		const s = evrakSiniflaKaynaklardan('Claire Smith visit 1 before x-ray', 'IMG-0001.jpg');
		expect(s).toEqual({ doc_type: 'xray_before', doc_subtype: null, visit_hint: 'visit_1' });
	});

	it('caption yoksa dosya adından çıkarır', () => {
		const s = evrakSiniflaKaynaklardan(null, 'Lee Jones 2nd Visit Invoice.pdf');
		expect(s).toEqual({ doc_type: 'invoice', doc_subtype: null, visit_hint: 'visit_2' });
	});

	it('ikisi de tanınmazsa vizit ipucu korunur', () => {
		const s = evrakSiniflaKaynaklardan('Susan Kavanagh visit 2', 'IMG-0001.jpg');
		expect(s).toEqual({ doc_type: 'other', doc_subtype: null, visit_hint: 'visit_2' });
	});
});
