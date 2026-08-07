<script lang="ts">
	import { onMount } from 'svelte';
	import { applyTheme, getStoredTheme } from '$lib/theme';
	import { initLocale } from '$lib/i18n/locale.svelte';

	let { children } = $props();

	onMount(() => {
		applyTheme(getStoredTheme());
		initLocale();
	});
</script>

{@render children()}
