import type { WhatsappChatPurpose } from '@verimaya/shared';

/**
 * Bir WhatsApp mesajı NE HAKKINDA?
 *
 * NEDEN: gelen kutusu tek listeydi ve Finans'ın altındaydı; otel değişikliği de
 * randevu ertelemesi de para ekranında duruyordu. Tür bilinirse satır doğru
 * rozeti alır, doğru ajan çalışır, yanlış ajan hiç çağrılmaz (LLM çağrısı da
 * boşa gitmez).
 *
 * KURAL TABANLI, MODEL YOK. Sebepleri:
 *  - Sınıflandırma her mesajda çalışır; LLM'e sormak hem pahalı hem yavaş.
 *  - Kural yanılırsa NEDEN yanıldığı görülür ve düzeltilir; model yanılırsa
 *    elde "bazen yapıyor" kalır.
 *  - Sonuç kayda yazılmaz, okuma anında türetilir — kural düzelince eski
 *    satırlar da düzelir, geri doldurma gerekmez.
 *
 * Bir mesaj BİRDEN FAZLA tür olabilir: "randevusunu 15'ine alalım, 100 GBP
 * ödeme alındı" hem para hem randevu. Tek tür seçmek bilgi kaybı olurdu.
 */
export type MesajTuru = 'finance' | 'appointment' | 'contact';

/**
 * Türkçe metni kabalaştırır: ekip şapkasız yazıyor ("odeme", "yatirildi",
 * "hastanin"). Küçük harfe çevirme Türkçeye özgü: I→ı, İ→i.
 */
export function sadelestir(metin: string): string {
	return metin
		.replace(/İ/g, 'i')
		.replace(/I/g, 'ı')
		.toLowerCase()
		.replace(/ç/g, 'c')
		.replace(/ğ/g, 'g')
		.replace(/ı/g, 'i')
		.replace(/ö/g, 'o')
		.replace(/ş/g, 's')
		.replace(/ü/g, 'u');
}

/**
 * Türkçe ek alır: "havalimani" → "havalimanına", "randevu" → "randevusunu".
 * Kelimenin SONUNA sınır koymak bu yüzden yanlış; en fazla 8 harflik ek geçilir.
 * Sekiz, "randevu|sundan" gibi en uzun yığılmayı kapsar; daha uzunu başka
 * kelimeye taşma riski.
 */
function ekli(...govdeler: string[]): RegExp {
	return new RegExp(`\\b(${govdeler.join('|')})[a-z]{0,8}\\b`);
}

/** Ek almayan / kısa ve başka kelimeye benzeyen gövdeler için tam eşleşme. */
function tam(...kelimeler: string[]): RegExp {
	return new RegExp(`\\b(${kelimeler.join('|')})\\b`);
}

/**
 * Tutar + para birimi. "129.000 tl", "600 gbp", "2.900₺", "100 EUR".
 * Para biriminin kendisi şart: çıplak sayı ("2 kişi 1 oda") para değildir.
 */
const PARA_TUTARI = /\d[\d.,]*\s*(tl|try|gbp|eur|usd|₺|£|€|\$)\b/;

/** Para birimi yazılmasa da parayı belli eden kelimeler. */
const PARA_SOZU = ekli(
	'odeme',
	'odendi',
	'odedi',
	'tahsilat',
	'tahsil',
	'yatirildi',
	'yatirdi',
	'havale',
	'dekont',
	'fatura',
	'komisyon',
	'iade',
	'masraf',
	'harcama',
	'gider',
	'kapora',
	'depozito',
	'nakit'
);
/** Kısa ve gövdesi başka kelimelere benzeyen para sözleri. */
const PARA_SOZU_TAM = tam('eft', 'pos', 'kredi karti');

/** Randevunun kendisinden söz eden kelimeler. */
const RANDEVU_SOZU = ekli(
	'randevu',
	'seans',
	'vizit',
	'operasyon',
	'ameliyat',
	'ertele',
	'ertelendi',
	'muayene',
	'kontrole'
);
/**
 * "iptal" ve "onaylandi" bilerek YOK: ikisi de ödeme cümlesinde en az randevu
 * cümlesindeki kadar geçiyor ("odeme iptal"), tek başlarına randevu saymak
 * yanlış rozet üretir. Randevu cümlesinde zaten "randevu" kelimesi var.
 */
const RANDEVU_SOZU_TAM = tam('checkup', 'check-up');

/**
 * Tarih/saat işareti. "15.09", "15/09/2026", "2026-09-15", "14:00", "31 eylul",
 * "yarin", "bugun". Tek başına tür belirlemez — randevu sözüyle birlikte sayar.
 */
const TARIH_SAAT =
	/(\b\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)[a-z]{0,6}\b|\b(bugun|yarin|pazartesi|sali|carsamba|persembe|cuma|cumartesi|pazar)[a-z]{0,6}\b)/;

/**
 * Kişiye/randevuya bağlı lojistik bilgisi: otel, transfer, klinik, hekim.
 * Ekip bunları çoğu zaman tek satırda yazıyor: "Dawit Abraham Alp paşa hotel".
 */
const LOJISTIK_SOZU = ekli(
	'otel',
	'hotel',
	'resort',
	'konaklama',
	'transfer',
	'sofor',
	'havalimani',
	'havaalani',
	'ucus',
	'klinik',
	'hastane',
	'hekim',
	'doktor',
	'karsilama'
);
/** "oda" → "odak/odaklan", "arac" → "aracılığıyla" olmasın diye tam eşleşme. */
const LOJISTIK_SOZU_TAM = tam(
	'oda',
	'odasi',
	'odalar',
	'arac',
	'araci',
	'ucak',
	'dr',
	'giris',
	'cikis',
	'checkin',
	'check-in',
	'checkout',
	'check-out'
);

export type TurSonucu = {
	/** Bulunan türler; hiçbir işaret yoksa boş dizi ("ne olduğu anlaşılmadı"). */
	turler: MesajTuru[];
	/**
	 * Hangi kelime/desen tetikledi. Kullanıcı "bunu neden para saydın" diye
	 * sorabilsin diye taşınır; uydurma değil, metinden kesilmiş parça.
	 */
	isaretler: string[];
};

const BOS: TurSonucu = { turler: [], isaretler: [] };

/**
 * @param govde Mesaj metni (ham, şapkalı olabilir).
 * @param amac  Grubun görevi. `ignore` ise hiç bakılmaz. `finance`/`operations`
 *              yalnız İŞARET YOKKEN varsayılan verir — metinde açık işaret varsa
 *              metin kazanır, çünkü muhasebe grubuna da otel yazılıyor.
 */
export function turleriBul(govde: string | null, amac: WhatsappChatPurpose = 'mixed'): TurSonucu {
	if (amac === 'ignore') return BOS;
	const metin = sadelestir((govde ?? '').trim());
	if (!metin) return BOS;

	const turler = new Set<MesajTuru>();
	const isaretler: string[] = [];

	const ekle = (tur: MesajTuru, ...kaliplar: RegExp[]) => {
		for (const kalip of kaliplar) {
			const eslesme = metin.match(kalip);
			if (eslesme) {
				turler.add(tur);
				isaretler.push(eslesme[0].trim());
			}
		}
	};

	ekle('finance', PARA_TUTARI, PARA_SOZU, PARA_SOZU_TAM);

	// Tarih TEK BAŞINA randevu değil: "600 gbp 15.09'da yatırıldı" da tarih taşır.
	// Randevu sözü varsa tarih olmasa da randevudur ("randevu iptal").
	const randevuOnce = turler.size;
	ekle('appointment', RANDEVU_SOZU, RANDEVU_SOZU_TAM);
	if (turler.has('appointment') && turler.size !== randevuOnce) {
		const tarih = metin.match(TARIH_SAAT);
		if (tarih) isaretler.push(tarih[0].trim());
	}

	ekle('contact', LOJISTIK_SOZU, LOJISTIK_SOZU_TAM);

	if (turler.size === 0) {
		// Metin bir şey söylemedi; grubun görevi varsayılan olur. `mixed` grupta
		// tahmin yürütmeyiz — "anlaşılmadı" demek yanlış rozetten iyidir.
		if (amac === 'finance') return { turler: ['finance'], isaretler: [] };
		if (amac === 'operations') return { turler: ['contact'], isaretler: [] };
		return BOS;
	}

	// Sıra sabit: rozetler her satırda aynı düzende çıksın.
	const sira: MesajTuru[] = ['finance', 'appointment', 'contact'];
	return { turler: sira.filter((t) => turler.has(t)), isaretler };
}
