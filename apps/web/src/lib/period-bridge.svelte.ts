import type { PeriodKey } from '$lib/period-range';

/**
 * Sayfa dönemini kabuk başlığına taşıyan köprü.
 *
 * Neden bir köprü: dönem seçimi sayfaya ait (randevular "bu ay" ile açılır, kohort
 * son 12 ay ile) — global tek bir değer yapmak bu varsayılanları ezerdi. Ama mobilde
 * dikey alan çok değerli ve seçici iki satır yiyordu. Çözüm: `PeriodSelector` mount
 * olunca kendini buraya kaydeder, kabuk başlığındaki kompakt denetim aynı değeri
 * okur ve aynı setter'ları çağırır. Tek kaynak sayfada kalır, iki yüzey senkron olur.
 *
 * Kayıt yoksa (dönemi olmayan sayfa) başlıktaki denetim hiç render edilmez.
 */
export type PeriodRegistration = {
	key: PeriodKey;
	from: string;
	to: string;
	timeZone: string;
	setKey: (next: PeriodKey) => void;
	setRange: (from: string, to: string) => void;
};

const state = $state<{ current: PeriodRegistration | null }>({ current: null });

export function registerPeriod(reg: PeriodRegistration) {
	state.current = reg;
}

/**
 * Kaydı yalnız hâlâ bize aitse kaldır. Sayfa geçişinde yeni sayfanın seçicisi eski
 * seçici destroy olmadan mount olabiliyor; koşulsuz temizlik yeni kaydı siler.
 */
export function unregisterPeriod(reg: PeriodRegistration) {
	if (state.current === reg) state.current = null;
}

export function activePeriod(): PeriodRegistration | null {
	return state.current;
}

/**
 * Sayfa/bileşen dönemini köprüye bağlar. Bileşen kurulumunda çağrılmalı ($effect kuralı).
 * `read` her değişimde yeniden okunur; dönerken kayıt kaldırılır.
 */
export function bridgePeriod(read: () => PeriodRegistration) {
	$effect(() => {
		const reg = read();
		registerPeriod(reg);
		return () => unregisterPeriod(reg);
	});
}
