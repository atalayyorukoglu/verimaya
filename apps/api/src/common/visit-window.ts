/**
 * PARA-01 / EVRAK-01 — "bu tarih hangi vizite düşer" sorusunun **tek** cevabı.
 *
 * Aynı pencere üç yerde kullanılıyor: ekin vizite bağlanması
 * (`media-classify.service.ts`), para satırının vizite bağlanması
 * (`transactions.service.ts`, `whatsapp.service.ts`) ve kontrol listesinin
 * kanıt sayması. Üçü ayrı ayrı yazılsaydı bir gün biri ±1, öteki ±2 gün olurdu
 * ve aynı kayıt iki ekranda farklı vizite düşerdi.
 *
 * Saf fonksiyonlar: DB yok, yan etki yok.
 */

/** Vizit penceresinin iki ucuna eklenen pay (gün) — geliş − 2 … dönüş + 2. */
export const VIZIT_PENCERE_GUN = 2;
export const GUN_MS = 24 * 60 * 60 * 1000;

export type VizitAdayi = { id: string; arrivalAt: Date | null; departureAt: Date | null };

/** `contact_visits` satırından kaydın düşebileceği zaman aralığı; tarihsiz vizitte `null`. */
export function vizitPenceresi(v: {
	arrivalAt: Date | null;
	departureAt: Date | null;
}): { start: number; end: number } | null {
	const arrival = v.arrivalAt?.getTime() ?? null;
	const departure = v.departureAt?.getTime() ?? null;
	if (arrival === null && departure === null) return null;
	const start = (arrival ?? departure)! - VIZIT_PENCERE_GUN * GUN_MS;
	const end = (departure ?? arrival)! + VIZIT_PENCERE_GUN * GUN_MS;
	return { start, end };
}

/**
 * Tek aday varsa onu döner; sıfır ya da **birden fazla** adayda `null`.
 *
 * Belirsizlikte boş bırakmak bilinçli: yanlış vizite bağlanmış tutar, hiç
 * bağlanmamış tutardan kötüdür — kontrol listesi yanlış viziti "tamam" işaretler,
 * kâr yanlış vizitte görünür. Kullanıcı kartta elle seçer.
 */
export function tekVizitSec(at: Date, adaylar: VizitAdayi[]): string | null {
	const t = at.getTime();
	const uyanlar = adaylar.filter((v) => {
		const p = vizitPenceresi(v);
		return p !== null && t >= p.start && t <= p.end;
	});
	return uyanlar.length === 1 ? uyanlar[0]!.id : null;
}

/**
 * `occurred_on` gün anahtarından (YYYY-MM-DD) vizit seçer.
 *
 * Para satırında saat yok, yalnız gün var. Günü UTC gün ortasına (12:00) sabitliyoruz:
 * gece yarısına sabitlense yerel saat farkı yüzünden pencerenin dışına düşebilirdi.
 */
export function tarihtenVizitSec(occurredOn: string, adaylar: VizitAdayi[]): string | null {
	const at = new Date(`${occurredOn}T12:00:00.000Z`);
	if (Number.isNaN(at.getTime())) return null;
	return tekVizitSec(at, adaylar);
}
