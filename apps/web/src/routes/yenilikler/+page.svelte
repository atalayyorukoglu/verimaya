<script lang="ts">
	import { changelog } from '@verimaya/shared';
	import { formatDate } from '$lib/format';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const typeLabels = {
		eklendi: 'Eklendi',
		degisti: 'Değişti',
		duzeltildi: 'Düzeltildi',
		kaldirildi: 'Kaldırıldı',
		guvenlik: 'Güvenlik'
	} as const;

	const typeTone: Record<keyof typeof typeLabels, string> = {
		eklendi: 'text-success',
		degisti: 'text-info',
		duzeltildi: 'text-warning',
		kaldirildi: 'text-danger',
		guvenlik: 'text-brand'
	};

	$effect(() => {
		const latest = changelog[0]?.version;
		if (latest) {
			localStorage.setItem('verimaya:last-seen-version', latest);
		}
	});
</script>

<svelte:head>
	<title>Yenilikler · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl">
	<PageHeader
		title="Yenilikler"
		description="Kullanıcıya dönük değişiklikler — packages/shared/src/changelog.ts."
	/>

	{#if changelog.length === 0}
		<p class="text-text-muted text-sm">Henüz kayıt yok.</p>
	{:else}
		<ol class="space-y-8">
			{#each changelog as entry (entry.version)}
				<li>
					<div class="mb-3 flex flex-wrap items-baseline gap-2">
						<h2 class="text-text text-base font-semibold">
							{entry.title ?? `Sürüm ${entry.version}`}
						</h2>
						<span class="text-text-faint text-xs">{entry.version}</span>
						<span class="text-text-faint text-xs">· {formatDate(entry.date)}</span>
					</div>
					<ul class="border-border bg-surface space-y-3 rounded-lg border p-4">
						{#each entry.changes as change, i (`${entry.version}-${i}`)}
							<li class="flex gap-3 text-sm">
								<span class="w-20 shrink-0 text-xs font-medium {typeTone[change.type]}">
									{typeLabels[change.type]}
								</span>
								<div>
									<p class="text-text-muted text-xs">{change.module}</p>
									<p class="text-text mt-0.5 leading-relaxed">{change.text}</p>
								</div>
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ol>
	{/if}
</div>
