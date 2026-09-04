<script lang="ts">
	import {
		FEATURE_STATUS_BUCKETS,
		features,
		featureStatusBucket,
		featureStatusBucketLabels,
		type FeatureModule,
		type FeatureStatusBucket,
		isFeatureNew
	} from '@verimaya/shared';
	import { featureStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';
	import { useQueryClient } from '@tanstack/svelte-query';
	import {
		isProductModuleEnabled,
		productModuleForFeatureId,
		setProductModuleEnabled
	} from '$lib/product-modules.svelte';

	const queryClient = useQueryClient();
	let preferenceError = $state<string | null>(null);
	let preferenceSavingId = $state<string | null>(null);

	async function onToggleProductModule(moduleId: string, enabled: boolean) {
		preferenceError = null;
		preferenceSavingId = moduleId;
		try {
			await setProductModuleEnabled(moduleId, enabled, queryClient);
		} catch {
			preferenceError = t('toolkit.productModules.saveFailed');
		} finally {
			preferenceSavingId = null;
		}
	}

	const FEATURE_DESCRIPTION_KEYS = {
		'ai-knowledge-base': 'toolkit.feature.ai-knowledge-base.description',
		'ai-record-suggestions': 'toolkit.feature.ai-record-suggestions.description',
		'ai-operation-alerts': 'toolkit.feature.ai-operation-alerts.description',
		'ai-evidence': 'toolkit.feature.ai-evidence.description',
		'ai-accuracy': 'toolkit.feature.ai-accuracy.description',
		'untouched-contacts': 'toolkit.feature.untouched-contacts.description',
		cohorts: 'toolkit.feature.cohorts.description',
		'maya-live-data': 'toolkit.feature.maya-live-data.description',
		'contact-titles': 'toolkit.feature.contact-titles.description',
		'appointment-doctor': 'toolkit.feature.appointment-doctor.description',
		incidents: 'toolkit.feature.incidents.description',
		'referral-value': 'toolkit.feature.referral-value.description',
		'report-compare': 'toolkit.feature.report-compare.description',
		interventions: 'toolkit.feature.interventions.description',
		'maya-open-questions': 'toolkit.feature.maya-open-questions.description',
		'ai-learning-loop': 'toolkit.feature.ai-learning-loop.description',
		'suggestion-whitelist': 'toolkit.feature.suggestion-whitelist.description',
		'referral-chain': 'toolkit.feature.referral-chain.description',
		'multi-title': 'toolkit.feature.multi-title.description',
		'incidents-departments': 'toolkit.feature.incidents-departments.description',
		'maya-voice': 'toolkit.feature.maya-voice.description',
		'in-app-notifications': 'toolkit.feature.in-app-notifications.description',
		'whats-new-surface': 'toolkit.feature.whats-new-surface.description',
		'on-prem': 'toolkit.feature.on-prem.description',
		'campaign-assistant': 'toolkit.feature.campaign-assistant.description',
		'patients-list': 'toolkit.feature.patients-list.description',
		'appointments-calendar': 'toolkit.feature.appointments-calendar.description',
		'finance-ledger': 'toolkit.feature.finance-ledger.description',
		'whatsapp-import': 'toolkit.feature.whatsapp-import.description',
		'ghl-sync': 'toolkit.feature.ghl-sync.description',
		'ads-metrics': 'toolkit.feature.ads-metrics.description',
		'ads-connect': 'toolkit.feature.ads-connect.description',
		'n8n-api': 'toolkit.feature.n8n-api.description',
		'reports-dashboard': 'toolkit.feature.reports-dashboard.description',
		'real-roas': 'toolkit.feature.real-roas.description',
		'truth-calculator': 'toolkit.feature.truth-calculator.description',
		'ad-simulator': 'toolkit.feature.ad-simulator.description',
		'ad-compliance': 'toolkit.feature.ad-compliance.description',
		'marketing-templates': 'toolkit.feature.marketing-templates.description',
		'trust-score': 'toolkit.feature.trust-score.description',
		'campaign-precheck': 'toolkit.feature.campaign-precheck.description',
		'duplicate-scan': 'toolkit.feature.duplicate-scan.description',
		'multi-tenant': 'toolkit.feature.multi-tenant.description',
		'free-ai-scorecard': 'toolkit.feature.free-ai-scorecard.description',
		'in-product-scorecard': 'toolkit.feature.in-product-scorecard.description'
	} as const satisfies Record<string, MessageKey>;

	const FEATURE_TITLE_KEYS = {
		'ai-knowledge-base': 'toolkit.feature.ai-knowledge-base.title',
		'ai-record-suggestions': 'toolkit.feature.ai-record-suggestions.title',
		'ai-operation-alerts': 'toolkit.feature.ai-operation-alerts.title',
		'ai-evidence': 'toolkit.feature.ai-evidence.title',
		'ai-accuracy': 'toolkit.feature.ai-accuracy.title',
		'untouched-contacts': 'toolkit.feature.untouched-contacts.title',
		cohorts: 'toolkit.feature.cohorts.title',
		'maya-live-data': 'toolkit.feature.maya-live-data.title',
		'contact-titles': 'toolkit.feature.contact-titles.title',
		'appointment-doctor': 'toolkit.feature.appointment-doctor.title',
		incidents: 'toolkit.feature.incidents.title',
		'referral-value': 'toolkit.feature.referral-value.title',
		'report-compare': 'toolkit.feature.report-compare.title',
		interventions: 'toolkit.feature.interventions.title',
		'maya-open-questions': 'toolkit.feature.maya-open-questions.title',
		'ai-learning-loop': 'toolkit.feature.ai-learning-loop.title',
		'suggestion-whitelist': 'toolkit.feature.suggestion-whitelist.title',
		'referral-chain': 'toolkit.feature.referral-chain.title',
		'multi-title': 'toolkit.feature.multi-title.title',
		'incidents-departments': 'toolkit.feature.incidents-departments.title',
		'maya-voice': 'toolkit.feature.maya-voice.title',
		'in-app-notifications': 'toolkit.feature.in-app-notifications.title',
		'whats-new-surface': 'toolkit.feature.whats-new-surface.title',
		'on-prem': 'toolkit.feature.on-prem.title',
		'campaign-assistant': 'toolkit.feature.campaign-assistant.title',
		'patients-list': 'toolkit.feature.patients-list.title',
		'appointments-calendar': 'toolkit.feature.appointments-calendar.title',
		'finance-ledger': 'toolkit.feature.finance-ledger.title',
		'whatsapp-import': 'toolkit.feature.whatsapp-import.title',
		'ghl-sync': 'toolkit.feature.ghl-sync.title',
		'ads-metrics': 'toolkit.feature.ads-metrics.title',
		'ads-connect': 'toolkit.feature.ads-connect.title',
		'n8n-api': 'toolkit.feature.n8n-api.title',
		'reports-dashboard': 'toolkit.feature.reports-dashboard.title',
		'real-roas': 'toolkit.feature.real-roas.title',
		'truth-calculator': 'toolkit.feature.truth-calculator.title',
		'ad-simulator': 'toolkit.feature.ad-simulator.title',
		'ad-compliance': 'toolkit.feature.ad-compliance.title',
		'marketing-templates': 'toolkit.feature.marketing-templates.title',
		'trust-score': 'toolkit.feature.trust-score.title',
		'campaign-precheck': 'toolkit.feature.campaign-precheck.title',
		'duplicate-scan': 'toolkit.feature.duplicate-scan.title',
		'multi-tenant': 'toolkit.feature.multi-tenant.title',
		'free-ai-scorecard': 'toolkit.feature.free-ai-scorecard.title',
		'in-product-scorecard': 'toolkit.feature.in-product-scorecard.title'
	} as const satisfies Record<string, MessageKey>;

	const MODULE_LABEL_KEYS = {
		'Hasta Takibi': 'toolkit.module.patientTracking',
		Randevu: 'toolkit.module.appointments',
		Finans: 'toolkit.module.finance',
		WhatsApp: 'toolkit.module.whatsapp',
		Entegrasyonlar: 'toolkit.module.integrations',
		Raporlama: 'toolkit.module.reporting',
		Pazarlama: 'toolkit.module.marketing',
		Platform: 'toolkit.module.platform'
	} as const satisfies Record<FeatureModule, MessageKey>;

	const BUCKET_LABEL_KEYS = {
		yayinda: 'toolkit.filter.yayinda',
		yakinda: 'toolkit.filter.yakinda',
		siradaki: 'toolkit.filter.siradaki',
		'fikir-defteri': 'toolkit.filter.fikirDefteri'
	} as const satisfies Record<FeatureStatusBucket, MessageKey>;

	const modules = [...new Set(features.map((f) => f.module))] as FeatureModule[];

	/** Varsayılan: Yayında olanlar. */
	let statusFilter = $state<FeatureStatusBucket>('yayinda');

	const filtered = $derived(features.filter((f) => featureStatusBucket(f.status) === statusFilter));

	/** "Yeni" rozeti bugüne göre hesaplanır; tarih tek yerde çözülür. */
	const today = new Date().toISOString().slice(0, 10);

	const grouped = $derived(
		modules
			.map((module) => ({
				module,
				items: filtered.filter((f) => f.module === module)
			}))
			.filter((g) => g.items.length > 0)
	);

	function featureTitleKey(id: string): MessageKey {
		return (
			FEATURE_TITLE_KEYS[id as keyof typeof FEATURE_TITLE_KEYS] ?? 'toolkit.feature.fallback.title'
		);
	}

	function featureDescriptionKey(id: string): MessageKey {
		return (
			FEATURE_DESCRIPTION_KEYS[id as keyof typeof FEATURE_DESCRIPTION_KEYS] ??
			'toolkit.feature.fallback.description'
		);
	}
</script>

<svelte:head>
	<title>{t('nav.tools.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<PageHeader title={t('nav.tools.title')} description={t('nav.tools.description')} />

	{#if preferenceError}
		<p class="mb-4 text-sm text-danger" role="alert">{preferenceError}</p>
	{/if}

	<div class="mb-6 flex flex-wrap gap-2">
		<!--
			Dört kova (2026-09-04): Yayında · Yakında · Sıradaki · Fikir Defteri.
			Dahili kodlar (kod-hazir, harici-onay-bekliyor, …) `featureStatusBucket` ile
			eşlenir. Varsayılan Yayında.
		-->
		{#each FEATURE_STATUS_BUCKETS as bucket (bucket)}
			<button
				type="button"
				class="rounded-[6px] border px-3 py-1.5 text-xs font-medium transition-colors {statusFilter ===
				bucket
					? 'border-brand bg-brand-subtle text-brand-text'
					: 'border-border text-text-muted hover:bg-surface-2'}"
				onclick={() => (statusFilter = bucket)}
			>
				{t(BUCKET_LABEL_KEYS[bucket])}
			</button>
		{/each}
	</div>

	<div class="space-y-8">
		{#if grouped.length === 0}
			<p class="text-sm text-text-muted">{t('toolkit.filter.empty')}</p>
		{/if}
		{#each grouped as group (group.module)}
			<section>
				<h2 class="mb-3 text-xs font-semibold tracking-wider text-text-muted uppercase">
					{t(MODULE_LABEL_KEYS[group.module])}
				</h2>
				<ul class="grid gap-3 sm:grid-cols-2">
					{#each group.items as feature (feature.id)}
						{@const productModule = productModuleForFeatureId(feature.id)}
						{@const enabled = productModule ? isProductModuleEnabled(productModule.id) : false}
						{@const bucket = featureStatusBucket(feature.status)}
						<li class="flex min-h-0">
							<div
								class="flex h-full min-h-[7rem] w-full flex-col rounded-lg border border-border bg-surface p-4"
							>
								<div class="flex min-w-0 flex-1 flex-col gap-2">
									<div class="flex flex-wrap items-start justify-between gap-2">
										<h3 class="font-medium text-text">{t(featureTitleKey(feature.id))}</h3>
										<div class="flex shrink-0 items-center gap-1.5">
											{#if isFeatureNew(feature.id, today)}
												<span
													class="rounded-full bg-brand-subtle px-2 py-0.5 text-[11px] font-medium text-brand-text"
												>
													{t('toolkit.new')}
												</span>
											{/if}
											<StatusBadge
												label={featureStatusBucketLabels[bucket]}
												tone={featureStatusTone(feature.status)}
											/>
										</div>
									</div>
									<p class="text-sm text-text-muted">
										{t(featureDescriptionKey(feature.id))}
									</p>
									{#if feature.route}
										<!-- "Listelenmiş" ile "tanıtılmış" arasındaki fark: kullanıcı nereden
										     açacağını bilmeli. Rotası olmayan kalemler yalnız açıklayıcıdır. -->
										<a
											href={feature.route}
											class="inline-flex w-fit items-center gap-1 text-xs font-medium text-brand-text hover:underline"
										>
											{t('toolkit.open')} →
										</a>
									{/if}
									{#if feature.status === 'yayinda' && feature.version}
										<a href="/changelog" class="inline-block text-xs text-info hover:underline">
											{t('features.versionLink', { version: feature.version })}
										</a>
									{/if}
								</div>
								{#if productModule}
									<div class="mt-3 flex justify-end border-t border-border pt-3">
										<button
											type="button"
											role="switch"
											aria-checked={enabled}
											disabled={preferenceSavingId === productModule.id}
											class="inline-flex items-center gap-2 rounded-[6px] border border-border px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-60"
											onclick={() => void onToggleProductModule(productModule.id, !enabled)}
										>
											<span
												class="relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors {enabled
													? 'bg-brand'
													: 'bg-surface-2'}"
												aria-hidden="true"
											>
												<span
													class="absolute top-0.5 size-3 rounded-full bg-white transition-transform {enabled
														? 'left-3.5'
														: 'left-0.5'}"
												></span>
											</span>
											{enabled ? t('toolkit.hideInProducts') : t('toolkit.showInProducts')}
										</button>
									</div>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</div>
