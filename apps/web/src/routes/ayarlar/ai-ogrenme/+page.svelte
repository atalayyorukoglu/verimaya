<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';

	const rows = [
		{ field: 'kind (gelir/gider)', corrections: 12, rate: '18%' },
		{ field: 'amount / currency', corrections: 9, rate: '14%' },
		{ field: 'category', corrections: 21, rate: '32%' },
		{ field: 'contact_label', corrections: 15, rate: '23%' },
		{ field: 'patient match', corrections: 7, rate: '11%' },
		{ field: 'occurred_on', corrections: 4, rate: '6%' }
	];
</script>

<svelte:head>
	<title>AI öğrenme · Ayarlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title="AI öğrenme raporu"
		description="Kullanıcının düzelttiği AI tahminleri — demo sabit veri."
	/>

	<div class="overflow-hidden rounded-lg border border-border bg-surface">
		<table class="w-full text-left text-sm">
			<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
				<tr>
					<th class="px-4 py-2.5 font-medium">Alan</th>
					<th class="px-4 py-2.5 font-medium">Düzeltme</th>
					<th class="px-4 py-2.5 font-medium">Pay</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-border">
				{#each rows as row (row.field)}
					<tr>
						<td class="px-4 py-2.5 font-medium text-text">{row.field}</td>
						<td class="px-4 py-2.5 tabular-nums text-text-muted">{row.corrections}</td>
						<td class="px-4 py-2.5 tabular-nums text-text-muted">{row.rate}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<p class="mt-3 text-xs text-text-faint">
		Faz 3: AI correction kaydı tutulunca bu tablo gerçek veriden beslenir. En sık hata kategoride —
		prompt ve kategori sözlüğü iyileştirmesi için sinyal.
	</p>
</div>
