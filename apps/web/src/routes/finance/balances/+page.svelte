<script lang="ts">
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/locale.svelte';
	import BalancesPanel from '$lib/components/BalancesPanel.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
</script>

<svelte:head>
	<title>{t('finance.balances.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<div class="mb-4">
		<a href={resolve('/finance')} class="text-sm font-medium text-brand hover:underline"
			>{t('finance.balances.back')}</a
		>
	</div>

	<PageHeader title={t('finance.balances.title')} description={t('finance.balances.description')} />

	<BalancesPanel />
</div>
