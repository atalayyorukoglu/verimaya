/**
 * Verimaya marketing para sözleşmesi (minor unit = kuruş/cent integer).
 *
 * - Para girdi/çıktı alanları: `moneyMinor` (kuruş integer).
 * - Sonsuz/uygulanamaz para çıktısı: `null` (`moneyMinor.nullable()`); Infinity yazma.
 * - Oran/olasılık/eşik/adet çıktıları: `z.number()` — Infinity taşıyabilir, dokunma.
 * - Yüzde girdileri (ör. `platformExtraFeePercent`): `z.number()`, 0–100 aralık.
 *
 * Para çıktıları integer kuruş; sonsuz/uygulanamaz durum çağıran tarafta null'a map edilir.
 */

/**
 * Finite sayıyı en yakın integer kuruşa yuvarlar.
 * Non-finite (Infinity/NaN) girdide Number olduğu gibi döner; çağıran katman
 * null'a çevirir (`minorOrNull` tercih edilebilir).
 */
export function roundMinor(value: number): number {
	return Number.isFinite(value) ? Math.round(value) : value;
}

/**
 * Finite ise en yakın integer kuruş; aksi halde `null`
 * (Infinity/NaN → uygulanamaz para çıktısı).
 */
export function minorOrNull(value: number): number | null {
	return Number.isFinite(value) ? Math.round(value) : null;
}
