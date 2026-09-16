import { klinikBul, sadelestir, tarihleriBul, vizitCikar } from './vizit-cikar';

/**
 * KUCUK-01 — mesajdan **randevu ipucu**. Saf fonksiyon: DB yok, model yok.
 *
 * Neden: Rezervasyon / TNC / Dentgroup gruplarında randevu talebi düz cümleyle
 * geliyor ve kullanıcı bunu elle Randevular ekranına yazıyordu:
 *   "Frankie Simpson Alt üst all on 4 Geliş: 03.03.2025 17.30 Dönüş: 07.03.2025
 *    23.45 randevusunun oluşturulmasını rica ederim."
 *   "Cift cene All on 6 Neodent Implant randevusunun olusturulmasini rica ederim."
 *   "Susan Manyanya Check up randevusu oluşturalım eski hastamiz"
 *
 * Çıkan şey **taslak**: kuyruk kartında "Yeni randevu oluştur" düğmesini ve ön
 * dolu formu besler. Kesin kayıt yalnız kullanıcı kaydedince açılır (AGENTS ilke 6).
 *
 * Tarih yoksa ipucu da yok: tarihsiz bir randevu formu kullanıcıya iş çıkarır,
 * bilgi vermez — mesaj kuyrukta normal şekilde durmaya devam eder.
 */

/** Klinik randevusu İSTENDİĞİNİ söyleyen kalıplar. */
const TALEP =
	/(randevusunun|rezervasyonunun|randevularinin)\s*olusturulmasini|randevu(su|yu|lari)?\s*(olustural|olusturul|acal|alal)|randevu\s*talebi|appointment/;

/**
 * "Randevusunu iptal edelim" de kalıba uyuyor ama yeni randevu değil; iptal /
 * erteleme cümlesinde düğme çıkmasın.
 */
const TALEP_DEGIL = /iptal|ertele|sildik|gelmeyecek|cancel/;

export type RandevuIpucu = {
	/** Mesaja bağlı kişi; saf fonksiyon bilemez, okuma katmanı doldurur. */
	contact_id: string | null;
	/** ISO (UTC). Klinik saati varsa o, yoksa geliş tarihi. */
	starts_at: string | null;
	clinic: string | null;
	/** Formun not alanına düşen mesaj metni. */
	note: string;
};

export type RandevuIpucuGirdi = {
	text: string | null | undefined;
	/** Mesajın geldiği an — yıl yazılmamış tarihler buna göre ileri yuvarlanır. */
	messageDate?: Date | string | null;
	/** Grup adı; klinik buradan da okunabilir (TNC / Dentgroup). */
	chatName?: string | null;
};

const NOT_SINIRI = 2000;

export function randevuIpucuCikar(girdi: RandevuIpucuGirdi): RandevuIpucu | null {
	const text = (girdi.text ?? '').trim();
	if (!text) return null;
	const norm = sadelestir(text);
	if (!TALEP.test(norm)) return null;
	if (TALEP_DEGIL.test(norm)) return null;

	const referans =
		girdi.messageDate instanceof Date
			? girdi.messageDate
			: girdi.messageDate
				? new Date(girdi.messageDate)
				: new Date();
	const messageDate = Number.isNaN(referans.getTime()) ? new Date() : referans;

	const tarihler = tarihleriBul(text, messageDate);
	if (tarihler.length === 0) return null;

	/*
	 * Hangi tarih randevunun BAŞLANGICI?
	 *
	 * Geliş/dönüş uçuş tarihleridir, klinik randevusu değil. Mesajda ayrıca saatli
	 * bir tarih varsa ("18 Eylül saat 10:00", "02 Eylul 15:30 da ameliyat") o klinik
	 * saatidir ve kazanır. Yoksa geliş tarihi kullanılır — hasta o gün şehirde olur,
	 * kullanıcı saati formda düzeltir.
	 */
	const vizit = vizitCikar({ text, messageDate, chatName: girdi.chatName });
	const ucus = new Set(
		[vizit?.draft.arrival_at, vizit?.draft.departure_at].filter((x): x is string => !!x)
	);
	const klinikSaati = tarihler.find((c) => c.timeKnown && !ucus.has(new Date(c.ms).toISOString()));
	const starts_at =
		(klinikSaati ? new Date(klinikSaati.ms).toISOString() : null) ??
		vizit?.draft.arrival_at ??
		new Date(tarihler[0]!.ms).toISOString();

	return {
		contact_id: null,
		starts_at,
		clinic: klinikBul(text, girdi.chatName),
		note: text.length > NOT_SINIRI ? text.slice(0, NOT_SINIRI) : text
	};
}
