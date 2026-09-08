<script lang="ts">
	/*
	 * Mobil başlıktaki dönem denetimi. Görsel ve davranışın tamamı artık
	 * `PeriodControl`'de — masaüstü sayfaları da aynı bileşeni kullanıyor
	 * (kullanıcı, 2026-09-08: "tüm sayfalardaki tarih seçme alanını mobildeki
	 * gibi yap"). Buradaki tek iş köprüden aktif dönemi okumak.
	 *
	 * Dönemi olmayan sayfada kayıt yoktur; `PeriodControl` hiç render etmez.
	 */
	import { activePeriod } from '$lib/period-bridge.svelte';
	import PeriodControl from '$lib/components/PeriodControl.svelte';
</script>

<PeriodControl period={activePeriod()} variant="header" class="w-full" />
