<script lang="ts">
	import { getStoredTheme, toggleTheme, type Theme } from '$lib/theme';
	import { t } from '$lib/i18n/locale.svelte';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';

	let theme = $state<Theme>(getStoredTheme());

	function onToggle() {
		theme = toggleTheme();
	}
</script>

<button
	type="button"
	class="rounded-[6px] p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
	aria-label={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
	title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
	onclick={onToggle}
>
	{#if theme === 'dark'}
		<Sun class="size-5" />
	{:else}
		<Moon class="size-5" />
	{/if}
</button>
