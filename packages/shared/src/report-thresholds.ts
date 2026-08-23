/**
 * AI-05 eşik tablosu — hangi değişim **söylenmeye değer**.
 *
 * Karşılaştırma katmanı (`compare=previous`) her metriğin önceki dönemini veriyor. Ama
 * "değişti" ile "söylenmeye değer değişti" aynı şey değil. Bu dosya ikincisini tanımlar.
 *
 * **Neden gerekli:** eşiksiz bir müdahale listesi iki yönden de ölür —
 * ya her küçük dalgalanmayı raporlar (gürültü; kullanıcı listeyi kapatır ve bir daha
 * açmaz), ya da hiçbir şey söylemez. Eşik, bu ikisinin arasındaki tek ayardır.
 *
 * **Kapsam:** yalnız **delta tipi** bulgular (bir metrik geçen döneme göre kötüleşti mi).
 * Değer tipi bulgular — "X en çok referans getiren kişi" — burada değil; onlar sıralama
 * işidir, eşik işi değil.
 *
 * **Yüzde üretmek sunucunun işi değil** (bkz. `report-compare.ts`): sunucu ham rakam
 * döndürür, bu modül karar verir, ekran cümleyi kurar. Model hiçbir aşamada rakam üretmez.
 */

/** Metriğin hangi yöne gitmesi kötü haberdir. */
export type MetricDirection = 'higher_is_worse' | 'lower_is_worse';

export type ReportMetricKey =
	| 'rpt_rate'
	| 'no_show_rate'
	| 'cancel_rate'
	| 'income'
	| 'net'
	| 'outstanding';

export type ReportThreshold = {
	/**
	 * Bu sayıdan az kayda dayanan oran **hiç** yorumlanmaz. 4 ameliyatın 1'i RPT ise oran
	 * %25'tir ama bu bilgi değil gürültüdür; bir sonraki hastada %20'ye düşer.
	 */
	minSample: number;
	/** Bu orandan küçük göreli değişim haber değildir (0.20 = %20). */
	minRelative: number;
	/**
	 * Mutlak değişim, dönem toplamının bu kadarına ulaşmıyorsa haber değildir
	 * (0.05 = dönem toplamının %5'i). **Para eşiği neden mutlak sayı değil:** "500" eşiği
	 * TRY'de anlamsız küçük, GBP'de anlamlı büyük olurdu; ayrıca küçük acenteyle büyük
	 * acentede aynı rakam aynı şeyi ifade etmez. Toplama oranlamak ikisini de çözer.
	 * Dönem toplamı bilinmiyorsa bu kontrol atlanır.
	 */
	minShareOfTotal: number;
	direction: MetricDirection;
	/** Sıralama ağırlığı — aynı büyüklükteki iki değişimden hangisi üste çıkar. */
	weight: number;
};

/**
 * Varsayılan eşikler. **Bilinçli olarak koda gömülü, tenant ayarı değil** — 5-15 kişilik
 * bir acente bu sayıları ayarlamak istemez, ayar ekranı açmak kullanılmayan bir yüzey
 * üretir. Gerçek talep gelirse tenant override'ı eklenir (yapı hazır: tek `Record`).
 *
 * Rakamların gerekçesi:
 * - **Oran metrikleri `minSample: 10`** — 10 olayın altında oran ay ay savrulur.
 * - **`rpt_rate` `minRelative: 0.25`** — RPT en gürültülü metrik (tek hasta oranı ciddi
 *   oynatır) ve yanlış alarmın bedeli en yüksek olan: bir hekimi haksız yere işaret etmek
 *   ilişkiyi bozar. Eşiği bilerek en yüksek tutuldu.
 * - **Para metrikleri `minSample: 5`** — işlem sayısı zaten düşük olur, oran kadar savrulmaz.
 * - **`outstanding` `weight` en yüksek** — açık alacak, üzerine gidilince en hızlı geri
 *   dönen kalem.
 */
export const REPORT_THRESHOLDS: Record<ReportMetricKey, ReportThreshold> = {
	rpt_rate: {
		minSample: 10,
		minRelative: 0.25,
		minShareOfTotal: 0,
		direction: 'higher_is_worse',
		weight: 1.0
	},
	no_show_rate: {
		minSample: 10,
		minRelative: 0.2,
		minShareOfTotal: 0,
		direction: 'higher_is_worse',
		weight: 0.7
	},
	cancel_rate: {
		minSample: 10,
		minRelative: 0.2,
		minShareOfTotal: 0,
		direction: 'higher_is_worse',
		weight: 0.7
	},
	income: {
		minSample: 5,
		minRelative: 0.15,
		minShareOfTotal: 0.05,
		direction: 'lower_is_worse',
		weight: 0.9
	},
	net: {
		minSample: 5,
		minRelative: 0.15,
		minShareOfTotal: 0.05,
		direction: 'lower_is_worse',
		weight: 1.0
	},
	outstanding: {
		minSample: 5,
		minRelative: 0.15,
		minShareOfTotal: 0.05,
		direction: 'higher_is_worse',
		weight: 1.2
	}
};

/**
 * Ekranda yüzde göstermek için gereken en az kayıt sayısı. Eşik tablosundaki
 * `minSample`'lardan **ayrı ve daha gevşek** olması bilinçli: ekran bilgi verir
 * (kullanıcı bağlamı görüyor), müdahale listesi ise iddia eder. İddianın eşiği daha
 * yüksektir. `computeReportDelta` bunu kullanır.
 */
export const REPORT_DELTA_MIN_SAMPLE = 5;

/** Bulgu neden listeye girmedi. `null` = girdi. */
export type ReportSkipReason =
	| 'insufficient_sample'
	| 'no_previous'
	| 'change_too_small'
	| 'share_too_small'
	| 'improved';

export type ReportFindingInput = {
	current: number;
	previous: number;
	/** Bu oranın/rakamın dayandığı kayıt adedi (randevu sayısı, işlem sayısı…). */
	sampleSize: number;
	/**
	 * Dönem toplamı — mutlak eşik bunun oranı olarak uygulanır. Bilinmiyorsa geç;
	 * o zaman yalnız göreli eşik çalışır.
	 */
	periodTotal?: number;
};

export type ReportFinding = {
	reportable: boolean;
	skip_reason: ReportSkipReason | null;
	/** İşaretli göreli değişim (negatif = düştü). */
	relative_change: number;
	/** Sıralama puanı — yalnız `reportable` olduğunda anlamlı. Büyük olan üste. */
	severity: number;
};

/**
 * Bir metrik değişiminin müdahale listesine girip girmeyeceğine karar verir.
 *
 * **İyileşme listeye girmez.** Müdahale listesi "neye bakılmalı" listesidir; iyi haber
 * müdahale gerektirmez. İyi haberi göstermek isteyen ekran `relative_change`'i zaten
 * elinde tutuyor.
 */
export function evaluateFinding(
	metric: ReportMetricKey,
	input: ReportFindingInput
): ReportFinding {
	const rule = REPORT_THRESHOLDS[metric];
	const { current, previous, sampleSize, periodTotal } = input;

	const relative = previous === 0 ? 0 : (current - previous) / Math.abs(previous);
	const base: Omit<ReportFinding, 'reportable' | 'skip_reason'> = {
		relative_change: relative,
		severity: 0
	};

	if (sampleSize < rule.minSample) {
		return { ...base, reportable: false, skip_reason: 'insufficient_sample' };
	}
	// Önceki dönem 0 ise göreli değişim tanımsız. "Sonsuz artış" demek yerine susuyoruz —
	// ekran isterse "yeni" diye gösterir, ama müdahale listesi bunu bulgu saymaz.
	if (previous === 0) {
		return { ...base, reportable: false, skip_reason: 'no_previous' };
	}

	const worsened = rule.direction === 'higher_is_worse' ? relative > 0 : relative < 0;
	if (!worsened) {
		return { ...base, reportable: false, skip_reason: 'improved' };
	}

	const magnitude = Math.abs(relative);
	if (magnitude < rule.minRelative) {
		return { ...base, reportable: false, skip_reason: 'change_too_small' };
	}

	if (rule.minShareOfTotal > 0 && periodTotal !== undefined && periodTotal > 0) {
		const share = Math.abs(current - previous) / Math.abs(periodTotal);
		if (share < rule.minShareOfTotal) {
			return { ...base, reportable: false, skip_reason: 'share_too_small' };
		}
	}

	return {
		...base,
		reportable: true,
		skip_reason: null,
		severity: magnitude * rule.weight
	};
}

/** Bulguları önem sırasına dizer (büyük `severity` üstte). Girdi dizisi değiştirilmez. */
export function sortFindingsBySeverity<T extends { severity: number }>(
	findings: readonly T[]
): T[] {
	return [...findings].sort((a, b) => b.severity - a.severity);
}
