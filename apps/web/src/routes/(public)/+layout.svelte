<script lang="ts">
	import { onMount } from 'svelte';
	import { applyTheme, getStoredTheme } from '$lib/theme';

	let { children } = $props();

	onMount(() => {
		applyTheme(getStoredTheme());
	});
</script>

{@render children()}
