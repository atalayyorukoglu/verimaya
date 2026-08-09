<script lang="ts">
	import type { MockScenario } from '$lib/mocks/data';
	import { t } from '$lib/i18n/locale.svelte';

	const scenarios = $derived([
		{ value: 'default' as const, label: 'Demo (~48)' },
		{ value: 'empty' as const, label: t('dev.toolbar.scenario.empty') },
		{ value: 'large' as const, label: t('dev.toolbar.scenario.large') }
	]);

	let scenario = $state<MockScenario>('default');

	$effect(() => {
		const stored = sessionStorage.getItem('verimaya:mock-scenario') as MockScenario | null;
		if (stored === 'empty' || stored === 'large' || stored === 'default') {
			scenario = stored;
		}
	});

	function onScenarioChange(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value as MockScenario;
		scenario = value;
		sessionStorage.setItem('verimaya:mock-scenario', value);
		window.location.reload();
	}
</script>

<div
	class="fixed right-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-3 z-20 flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-2 rounded-[8px] border border-border bg-surface-2/90 px-2.5 py-2 text-xs text-text-muted shadow-lg backdrop-blur sm:left-auto sm:max-w-none md:bottom-3 md:z-50"
>
	<label class="flex items-center gap-1.5">
		<span class="text-text-faint">MSW</span>
		<select
			class="rounded-[6px] border border-border bg-surface px-1.5 py-1 text-text"
			value={scenario}
			onchange={onScenarioChange}
		>
			{#each scenarios as s (s.value)}
				<option value={s.value}>{s.label}</option>
			{/each}
		</select>
	</label>
</div>
