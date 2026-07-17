<script lang="ts">
	import { getStoredTheme, toggleTheme, type Theme } from '$lib/theme';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';

	let theme = $state<Theme>('light');

	$effect(() => {
		theme = getStoredTheme();
	});

	function onToggle() {
		theme = toggleTheme();
	}
</script>

<button
	type="button"
	class="text-text-muted hover:bg-surface-2 hover:text-text rounded-[6px] p-2 transition-colors"
	aria-label={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
	title={theme === 'dark' ? 'Açık tema' : 'Koyu tema'}
	onclick={onToggle}
>
	{#if theme === 'dark'}
		<Sun class="size-5" />
	{:else}
		<Moon class="size-5" />
	{/if}
</button>
