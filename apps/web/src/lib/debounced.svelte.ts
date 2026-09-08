/**
 * Yazarken arama için gecikmeli değer.
 *
 * Liste sayfalarında arama kutusu artık Enter beklemiyor (kullanıcı, 2026-09-08);
 * her tuşta istek atmak yerine yazma durunca tek istek gider. Başlıktaki komut
 * paleti gecikmesiz çalışıyor ve üç uca birden vuruyor — buradaki tek uçlu ve
 * gecikmeli kullanım ondan daha hafif.
 *
 * Kullanım (bileşen kurulumunda çağrılmalı, $effect kuralı):
 *
 *   let qInput = $state('');
 *   const q = debounced(() => qInput);
 *   // sorgu anahtarında q.value
 *
 * `flush()` beklemeyi atlar (Enter'a basılırsa), `cancel()` bekleyeni iptal eder
 * (Temizle'de: gecikmeli değer sonradan gelip temizliği geri almasın).
 */
export function debounced(read: () => string, delayMs = 300) {
	let value = $state(read());
	let timer: ReturnType<typeof setTimeout> | null = null;

	function clearTimer() {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	}

	$effect(() => {
		const next = read();
		// Aynı değere dönüldüyse (yaz-sil) bekleyen işi düşür, gereksiz istek olmasın.
		if (next === value) {
			clearTimer();
			return;
		}
		clearTimer();
		timer = setTimeout(() => {
			value = next;
			timer = null;
		}, delayMs);
		return clearTimer;
	});

	return {
		get value() {
			return value;
		},
		/** Beklemeyi atla — kaynağın o anki değerini hemen uygula. */
		flush() {
			clearTimer();
			value = read();
		},
		/** Bekleyeni iptal et ve verilen değere sabitle. */
		reset(next = '') {
			clearTimer();
			value = next;
		}
	};
}
