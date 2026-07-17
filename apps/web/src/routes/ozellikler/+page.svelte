<script lang="ts">
	import {
		features,
		featureStatusLabels,
		type FeatureModule,
		type FeatureStatus
	} from '@verimaya/shared';
	import { featureStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	const modules = [...new Set(features.map((f) => f.module))] as FeatureModule[];

	let statusFilter = $state<FeatureStatus | 'all'>('all');

	const filtered = $derived(
		features.filter((f) => statusFilter === 'all' || f.status === statusFilter)
	);

	const grouped = $derived(
		modules
			.map((module) => ({
				module,
				items: filtered.filter((f) => f.module === module)
			}))
			.filter((g) => g.items.length > 0)
	);
</script>

<svelte:head>
	<title>Özellikler · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-4xl">
	<PageHeader
		title="Özellikler"
		description="Mevcut ve planlanan yetenekler — veri kaynağı packages/shared/src/features.ts."
	/>

	<div class="mb-6 flex flex-wrap gap-2">
		<button
			type="button"
			class="rounded-[6px] border px-3 py-1.5 text-xs font-medium transition-colors {statusFilter ===
			'all'
				? 'border-brand bg-brand-subtle text-brand'
				: 'border-border text-text-muted hover:bg-surface-2'}"
			onclick={() => (statusFilter = 'all')}
		>
			Tümü
		</button>
		{#each (['yayinda', 'gelistiriliyor', 'planlandi'] as const) as status (status)}
			<button
				type="button"
				class="rounded-[6px] border px-3 py-1.5 text-xs font-medium transition-colors {statusFilter ===
				status
					? 'border-brand bg-brand-subtle text-brand'
					: 'border-border text-text-muted hover:bg-surface-2'}"
				onclick={() => (statusFilter = status)}
			>
				{featureStatusLabels[status]}
			</button>
		{/each}
	</div>

	<div class="space-y-8">
		{#each grouped as group (group.module)}
			<section>
				<h2 class="text-text mb-3 text-sm font-semibold tracking-tight">{group.module}</h2>
				<ul class="space-y-3">
					{#each group.items as feature (feature.id)}
						<li class="border-border bg-surface rounded-lg border p-4">
							<div class="flex flex-wrap items-start justify-between gap-2">
								<h3 class="text-text text-sm font-semibold">{feature.title}</h3>
								<StatusBadge
									label={featureStatusLabels[feature.status]}
									tone={featureStatusTone(feature.status)}
								/>
							</div>
							<p class="text-text-muted mt-2 text-sm leading-relaxed">{feature.description}</p>
							{#if feature.status === 'yayinda' && feature.version}
								<a href="/yenilikler" class="text-info mt-2 inline-block text-xs hover:underline">
									Sürüm {feature.version} yenilikleri
								</a>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</div>
