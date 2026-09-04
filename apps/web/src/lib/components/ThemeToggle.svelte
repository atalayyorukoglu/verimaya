<script lang="ts">
	import { getStoredTheme, toggleTheme, type Theme } from '$lib/theme';
	import { t } from '$lib/i18n/locale.svelte';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';

	let {
		variant = 'icon'
	}: {
		/** `icon` = hub; `menu` = dropdown; `nav` = sidebar satırı */
		variant?: 'icon' | 'menu' | 'nav';
	} = $props();

	let theme = $state<Theme>(getStoredTheme());

	function onToggle(e: MouseEvent) {
		e.stopPropagation();
		theme = toggleTheme();
	}

	const label = $derived(theme === 'dark' ? t('theme.light') : t('theme.dark'));
	const aria = $derived(theme === 'dark' ? t('theme.toLight') : t('theme.toDark'));
</script>

{#if variant === 'menu' || variant === 'nav'}
	<button
		type="button"
		data-hub-theme-toggle
		data-label-to-light={t('theme.toLight')}
		data-label-to-dark={t('theme.toDark')}
		class={variant === 'nav'
			? 'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text'
			: 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-surface-2'}
		aria-label={aria}
		onclick={onToggle}
	>
		{#if theme === 'dark'}
			<Sun class="size-4 shrink-0" aria-hidden="true" />
		{:else}
			<Moon class="size-4 shrink-0" aria-hidden="true" />
		{/if}
		<span class="min-w-0 flex-1 truncate">{label}</span>
	</button>
{:else}
	<button
		type="button"
		data-hub-theme-toggle
		data-label-to-light={t('theme.toLight')}
		data-label-to-dark={t('theme.toDark')}
		class="rounded-[6px] p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
		aria-label={aria}
		title={label}
		onclick={onToggle}
	>
		<Sun class="hidden size-5 dark:block" aria-hidden="true" />
		<Moon class="block size-5 dark:hidden" aria-hidden="true" />
	</button>
{/if}
