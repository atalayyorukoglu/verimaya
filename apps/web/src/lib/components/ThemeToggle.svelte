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
	data-hub-theme-toggle
	data-label-to-light={t('theme.toLight')}
	data-label-to-dark={t('theme.toDark')}
	class="rounded-[6px] p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
	aria-label={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
	title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
	onclick={onToggle}
>
	<Sun class="hidden size-5 dark:block" aria-hidden="true" />
	<Moon class="block size-5 dark:hidden" aria-hidden="true" />
</button>
