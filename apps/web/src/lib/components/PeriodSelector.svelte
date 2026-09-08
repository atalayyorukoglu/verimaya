<script lang="ts">
	/*
	 * Sayfa içi dönem seçici. Dış arayüzü (bindable `periodKey`/`customFrom`/
	 * `customTo`, `tenantTimezone`, `summaryTrailing`) değişmedi; değişen yalnız
	 * görünüş: sekme şeridi + iki tarih kutusu yerine mobildeki `‹ Eylül 2026 ˅ ›`
	 * denetimi (kullanıcı, 2026-09-08). Böylece altı sayfa tek değişiklikle döndü.
	 *
	 * Mobilde gizli kalmaya devam ediyor: aynı denetim kabuk başlığında zaten var,
	 * ikisi yan yana gelince ekranda birebir aynı kutu iki kez görünüyordu
	 * (tarayıcıda doğrulandı).
	 */
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import {
		monthRangeInTz,
		periodLabel,
		resolvePeriodRange,
		type PeriodKey
	} from '$lib/period-range';
	import { bridgePeriod, type PeriodRegistration } from '$lib/period-bridge.svelte';
	import { page } from '$app/state';
	import PeriodControl from '$lib/components/PeriodControl.svelte';

	let {
		periodKey = $bindable(),
		customFrom = $bindable(),
		customTo = $bindable(),
		tenantTimezone,
		summaryTrailing
	}: {
		periodKey: PeriodKey;
		customFrom: string;
		customTo: string;
		tenantTimezone: string;
		summaryTrailing?: Snippet;
	} = $props();

	let customRangeHydrated = $state(false);

	$effect(() => {
		if (customRangeHydrated || !tenantTimezone) return;
		// Parent may pre-fill a range (e.g. cohorts → last 12 months); don't overwrite.
		if (!customFrom || !customTo) {
			const r = monthRangeInTz(0, tenantTimezone);
			customFrom = r.from;
			customTo = r.to;
		}
		customRangeHydrated = true;
	});

	const dateRange = $derived(resolvePeriodRange(periodKey, customFrom, customTo, tenantTimezone));

	const periodText = $derived(
		periodLabel(periodKey, dateRange.from ?? '', dateRange.to ?? '', t('reports.period.allTime'))
	);

	function setPeriod(next: PeriodKey) {
		periodKey = next;
		if (next === 'ozel') {
			const r = monthRangeInTz(0, tenantTimezone);
			customFrom = r.from;
			customTo = r.to;
		}
	}

	function setRange(from: string, to: string) {
		customFrom = from;
		customTo = to;
		periodKey = 'ozel';
	}

	/*
	 * Mobilde kabuk başlığındaki kopya aynı durumu paylaşsın diye sayfa dönemi
	 * köprüye kaydedilir: başlık aynı değeri okur, aynı setter'ları çağırır.
	 */
	bridgePeriod(() => ({
		key: periodKey,
		from: dateRange.from ?? customFrom,
		to: dateRange.to ?? customTo,
		timeZone: tenantTimezone,
		setKey: setPeriod,
		setRange
	}));

	/*
	 * Denetim doğrudan bu kayıtla beslenir — köprüden okumaz. Köprü yalnız aktif
	 * rotanın kaydını döndürüyor; sayfa geçişinin ilk karesinde bu `null` olup
	 * denetimi bir an kaybettiriyordu.
	 */
	const localPeriod = $derived<PeriodRegistration>({
		path: page.url.pathname,
		key: periodKey,
		from: dateRange.from ?? customFrom,
		to: dateRange.to ?? customTo,
		timeZone: tenantTimezone,
		setKey: setPeriod,
		setRange
	});
</script>

<section class="mb-4 border-b border-border pb-4 max-md:hidden">
	<div class="mb-3.5 flex items-center justify-between gap-2 text-sm text-text-muted">
		<span class="min-w-0 truncate">{periodText}</span>
		{#if summaryTrailing}
			<div class="shrink-0">{@render summaryTrailing()}</div>
		{/if}
	</div>

	<PeriodControl period={localPeriod} class="sm:max-w-xs" />
</section>
