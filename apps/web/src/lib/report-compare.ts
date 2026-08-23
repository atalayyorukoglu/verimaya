/**
 * Rapor dönem karşılaştırması — istemci tarafı delta hesabı (VERI-XX).
 *
 * Sunucu yalnız ham rakam döner (`compare=previous` → `previous` bloğu), yüzde/fark
 * üretmez. Sıfıra bölme ve az veri kuralları burada, tek yerde uygulanır:
 *
 * - Önceki dönem 0 ise yüzde gösterilmez ("—" ya da "yeni" — mevcut dönem de 0'sa "—",
 *   büyümüşse "yeni").
 * - Referans kayıt sayısı (`sampleSize` — önceki dönemin dayandığı kayıt adedi, örn.
 *   `transaction_count` ya da bir randevu satırının `total`'ı) 5'ten azsa yüzde
 *   değişimi yanıltıcıdır; ham fark gösterilir.
 * - Aksi halde fark + yüzde.
 */
export type ReportDelta =
	| { kind: 'none' }
	| { kind: 'new' }
	| { kind: 'raw'; diff: number }
	| { kind: 'pct'; diff: number; pct: number };

export const REPORT_DELTA_MIN_SAMPLE = 5;

export function computeReportDelta(
	current: number,
	previous: number,
	sampleSize: number
): ReportDelta {
	const diff = current - previous;
	if (previous === 0) {
		return current === 0 ? { kind: 'none' } : { kind: 'new' };
	}
	if (sampleSize < REPORT_DELTA_MIN_SAMPLE) {
		return { kind: 'raw', diff };
	}
	return { kind: 'pct', diff, pct: diff / Math.abs(previous) };
}
