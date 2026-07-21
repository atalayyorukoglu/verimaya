<script lang="ts">
	import type { MockScenario } from '$lib/mocks/data';
	import { getDemoRole, roleLabels, setDemoRole } from '$lib/rbac';
	import type { UserRole } from '@verimaya/shared';

	const SCENARIOS: { value: MockScenario; label: string }[] = [
		{ value: 'default', label: 'Demo (~48)' },
		{ value: 'empty', label: 'Boş liste' },
		{ value: 'large', label: '500 kayıt' }
	];

	const ROLES = Object.keys(roleLabels) as UserRole[];

	let scenario = $state<MockScenario>('default');
	let role = $state<UserRole>('owner');

	$effect(() => {
		const stored = sessionStorage.getItem('verimaya:mock-scenario') as MockScenario | null;
		if (stored === 'empty' || stored === 'large' || stored === 'default') {
			scenario = stored;
		}
		role = getDemoRole();
	});

	function onScenarioChange(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value as MockScenario;
		scenario = value;
		sessionStorage.setItem('verimaya:mock-scenario', value);
		window.location.reload();
	}

	function onRoleChange(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value as UserRole;
		role = value;
		setDemoRole(value);
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
			{#each SCENARIOS as s (s.value)}
				<option value={s.value}>{s.label}</option>
			{/each}
		</select>
	</label>
	<span class="h-4 w-px bg-border" aria-hidden="true"></span>
	<label class="flex items-center gap-1.5">
		<span class="text-text-faint">Rol</span>
		<select
			class="rounded-[6px] border border-border bg-surface px-1.5 py-1 text-text"
			value={role}
			onchange={onRoleChange}
		>
			{#each ROLES as r (r)}
				<option value={r}>{roleLabels[r]}</option>
			{/each}
		</select>
	</label>
</div>
