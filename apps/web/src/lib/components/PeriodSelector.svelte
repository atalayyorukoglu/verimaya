<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fieldClass } from '$lib/api';
	import { t } from '$lib/i18n/locale.svelte';
	import {
		monthRangeInTz,
		periodLabel,
		resolvePeriodRange,
		type PeriodKey
	} from '$lib/period-range';
	import { cn } from '$lib/utils';
	import { bridgePeriod } from '$lib/period-bridge.svelte';

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

	const options = $derived([
		{ key: 'bu-ay' as const, label: t('reports.period.thisMonth') },
		{ key: 'gecen-ay' as const, label: t('reports.period.lastMonth') },
		{ key: 'tum' as const, label: t('reports.period.allTime') },
		{ key: 'ozel' as const, label: t('reports.period.custom') }
	]);

	function setPeriod(next: PeriodKey) {
		periodKey = next;
		if (next === 'ozel') {
			const r = monthRangeInTz(0, tenantTimezone);
			customFrom = r.from;
			customTo = r.to;
		}
	}

	/*
	 * Mobilde bu seçici gizlenir ve yerine kabuk başlığındaki kompakt denetim geçer
	 * (dikey alan). İkisi ayrı durum tutmasın diye sayfa dönemi köprüye kaydedilir:
	 * başlık aynı değeri okur, aynı setter'ları çağırır.
	 */
	bridgePeriod(() => ({
		key: periodKey,
		from: dateRange.from ?? customFrom,
		to: dateRange.to ?? customTo,
		timeZone: tenantTimezone,
		setKey: setPeriod,
		setRange: (from: string, to: string) => {
			customFrom = from;
			customTo = to;
			periodKey = 'ozel';
		}
	}));
</script>

<!-- Mobilde gizli: orada dönem denetimi kabuk başlığında. -->
<section class="mb-4 border-b border-border pb-4 max-md:hidden">
	<div class="mb-0.5 flex items-center justify-between gap-2 text-sm text-text-muted">
		<span class="min-w-0 truncate">{periodText}</span>
		{#if summaryTrailing}
			<div class="shrink-0">{@render summaryTrailing()}</div>
		{/if}
	</div>

	<div
		class="mt-3.5 flex gap-0.5 rounded-[8px] border border-border bg-surface-2 p-0.5"
		role="tablist"
		aria-label={t('reports.period.label')}
	>
		{#each options as opt (opt.key)}
			<button
				type="button"
				role="tab"
				aria-selected={periodKey === opt.key}
				class={cn(
					'min-w-0 flex-1 cursor-pointer rounded-[8px] px-1.5 py-2 text-center text-xs font-semibold transition-colors sm:px-2.5 sm:text-sm',
					periodKey === opt.key
						? 'border border-border bg-surface text-text shadow-xs'
						: 'text-text-faint hover:text-text-muted'
				)}
				onclick={() => setPeriod(opt.key)}
			>
				<span class="line-clamp-1">{opt.label}</span>
			</button>
		{/each}
	</div>

	{#if periodKey === 'ozel'}
		<div class="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
			<label class="grid gap-1 text-xs text-text-muted">
				{t('reports.period.from')}
				<input type="date" class={fieldClass} bind:value={customFrom} />
			</label>
			<label class="grid gap-1 text-xs text-text-muted">
				{t('reports.period.to')}
				<input type="date" class={fieldClass} bind:value={customTo} />
			</label>
		</div>
	{/if}
</section>
