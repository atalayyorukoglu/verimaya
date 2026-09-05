import { page } from '$app/state';
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
	/** Kaydı yapan rota. Sayfa değişince eski kayıt geçersizdir (bkz. `activePeriod`). */
	path: string;
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

/*
 * Kayıt yalnız onu yapan rotada geçerli. Yalnız destroy'da temizlemek yetmiyordu:
 * dönemi olmayan bir sayfaya geçince (ör. Kişiler) eski sayfanın kaydı ayakta
 * kalabiliyor ve başlıkta alakasız bir takvim görünüyordu. Rota karşılaştırması
 * sıraya bağlı değil, deterministik.
 */
export function activePeriod(): PeriodRegistration | null {
	const cur = state.current;
	if (!cur) return null;
	return cur.path === page.url.pathname ? cur : null;
}

/**
 * Sayfa/bileşen dönemini köprüye bağlar. Bileşen kurulumunda çağrılmalı ($effect kuralı).
 * `read` her değişimde yeniden okunur; dönerken kayıt kaldırılır.
 */
export function bridgePeriod(read: () => Omit<PeriodRegistration, 'path'>) {
	$effect(() => {
		const reg: PeriodRegistration = { ...read(), path: page.url.pathname };
		registerPeriod(reg);
		return () => unregisterPeriod(reg);
	});
}
