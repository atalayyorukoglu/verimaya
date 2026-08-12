<script lang="ts">
	import { t } from '$lib/i18n/locale.svelte';
	import {
		monthRangeInTz,
		periodLabel,
		resolvePeriodRange,
		type PeriodKey
	} from '$lib/period-range';

	let {
		periodKey = $bindable(),
		customFrom = $bindable(),
		customTo = $bindable(),
		tenantTimezone
	}: {
		periodKey: PeriodKey;
		customFrom: string;
		customTo: string;
		tenantTimezone: string;
	} = $props();

	let customRangeHydrated = $state(false);

	$effect(() => {
		if (customRangeHydrated || !tenantTimezone) return;
		const r = monthRangeInTz(0, tenantTimezone);
		customFrom = r.from;
		customTo = r.to;
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
</script>

<section class="mb-4 rounded-lg border border-border bg-surface p-3 sm:p-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<p class="text-xs font-medium text-text-muted">{t('reports.period.label')}</p>
		<p class="text-xs font-semibold text-text">{periodText}</p>
	</div>
	<div class="mt-2 flex flex-wrap gap-1.5">
		{#each options as opt (opt.key)}
			<button
				type="button"
				class="cursor-pointer rounded-[6px] px-2.5 py-1.5 text-xs font-medium transition-colors {periodKey ===
				opt.key
					? 'bg-brand text-primary-foreground'
					: 'bg-surface-2 text-text-muted hover:text-text'}"
				onclick={() => setPeriod(opt.key)}
			>
				{opt.label}
			</button>
		{/each}
	</div>
	{#if periodKey === 'ozel'}
		<div class="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
			<label class="grid gap-1 text-xs text-text-muted">
				{t('reports.period.from')}
				<input
					type="date"
					class="h-9 rounded-[6px] border border-border bg-surface-2 px-2 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40"
					bind:value={customFrom}
				/>
			</label>
			<label class="grid gap-1 text-xs text-text-muted">
				{t('reports.period.to')}
				<input
					type="date"
					class="h-9 rounded-[6px] border border-border bg-surface-2 px-2 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40"
					bind:value={customTo}
				/>
			</label>
		</div>
	{/if}
</section>
