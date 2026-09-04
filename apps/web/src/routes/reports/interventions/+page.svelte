<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n/locale.svelte';

	onMount(() => {
		void goto('/interventions', { replaceState: true });
	});
</script>

<p class="p-6 text-sm text-text-muted">{t('contacts.redirecting')}</p>
