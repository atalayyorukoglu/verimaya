<script lang="ts">
	import { changelog, features, featureStatusLabels, type FeatureStatus } from '@verimaya/shared';
	import { formatDate } from '$lib/format';
	import { featureStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

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

	const statusByFeatureId = new Map(features.map((f) => [f.id, f.status]));

	function featureStatus(featureId: string | undefined): FeatureStatus | undefined {
		if (!featureId) return undefined;
		return statusByFeatureId.get(featureId);
	}

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
		description="Kullanıcıya dönük değişiklikler — packages/shared/src/changelog.ts. Özellik durumu /features ile aynı taksonomi."
	/>

	{#if changelog.length === 0}
		<p class="text-sm text-text-muted">Henüz kayıt yok.</p>
	{:else}
		<ol class="space-y-8">
			{#each changelog as entry (entry.version)}
				<li>
					<div class="mb-3 flex flex-wrap items-baseline gap-2">
						<h2 class="text-base font-semibold text-text">
							{entry.title ?? `Sürüm ${entry.version}`}
						</h2>
						<span class="text-xs text-text-faint">{entry.version}</span>
						<span class="text-xs text-text-faint">· {formatDate(entry.date)}</span>
					</div>
					<ul class="space-y-3 rounded-lg border border-border bg-surface p-4">
						{#each entry.changes as change, i (`${entry.version}-${i}`)}
							{@const status = featureStatus(change.featureId)}
							<li class="flex gap-3 text-sm">
								<span class="w-20 shrink-0 text-xs font-medium {typeTone[change.type]}">
									{typeLabels[change.type]}
								</span>
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-2">
										<p class="text-xs text-text-muted">{change.module}</p>
										{#if status}
											<StatusBadge
												label={featureStatusLabels[status]}
												tone={featureStatusTone(status)}
											/>
										{/if}
									</div>
									<p class="mt-0.5 leading-relaxed text-text">{change.text}</p>
								</div>
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ol>
	{/if}
</div>
