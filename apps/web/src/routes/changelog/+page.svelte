<script lang="ts">
	import {
		changelog,
		features,
		featureStatusLabels,
		type ChangeType,
		type FeatureStatus
	} from '@verimaya/shared';
	import { formatDate } from '$lib/format';
	import { featureStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const typeLabelKeys = {
		eklendi: 'changelog.kind.yeni',
		degisti: 'changelog.kind.degisti',
		duzeltildi: 'changelog.kind.duzeltildi',
		kaldirildi: 'changelog.kind.kaldirildi',
		guvenlik: 'changelog.kind.guvenlik'
	} as const satisfies Record<ChangeType, MessageKey>;

	const typeTone: Record<ChangeType, string> = {
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
	<title>{t('changelog.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl">
	<PageHeader title={t('changelog.title')} description={t('changelog.description')} />

	{#if changelog.length === 0}
		<p class="text-sm text-text-muted">{t('changelog.empty')}</p>
	{:else}
		<ol class="space-y-8">
			{#each changelog as entry (entry.version)}
				<li>
					<div class="mb-3 flex flex-wrap items-baseline gap-2">
						<h2 class="text-base font-semibold text-text">
							{entry.title ?? t('changelog.versionFallback', { version: entry.version })}
						</h2>
						<span class="text-xs text-text-faint">{entry.version}</span>
						<span class="text-xs text-text-faint">· {formatDate(entry.date)}</span>
					</div>
					<ul class="space-y-3 rounded-lg border border-border bg-surface p-4">
						{#each entry.changes as change, i (`${entry.version}-${i}`)}
							{@const status = featureStatus(change.featureId)}
							<li class="flex gap-3 text-sm">
								<span class="w-20 shrink-0 text-xs font-medium {typeTone[change.type]}">
									{t(typeLabelKeys[change.type])}
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
