<script lang="ts">
	import ProductPillarPage from '$lib/components/ProductPillarPage.svelte';
	import { features as catalogue, featureStatusBucket } from '@verimaya/shared';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const mk = (key: string) => t(key as MessageKey);

	/**
	 * Araçlar = panelin kendi özellik kataloğu (`packages/shared/src/features.ts`).
	 * Pazarlama için ayrı bir liste TUTULMUYOR: metinler de rozetler de panelle
	 * aynı kaynaktan gelir, böylece ikisi ayrışamaz.
	 *
	 * `fikir-defteri` kovası bilinçli olarak dışarıda: FIKIRLER.md'deki fikirler
	 * taahhüt değil, siteye konursa taahhüt gibi okunur.
	 */
	const BUCKET_LABEL_KEYS = {
		yayinda: 'toolkit.filter.yayinda',
		yakinda: 'toolkit.filter.yakinda',
		siradaki: 'toolkit.filter.siradaki',
		'fikir-defteri': 'toolkit.filter.fikirDefteri'
	} as const;

	/** Üyeliksiz açılabilen genel araçlar — panel rotası değil, site rotası. */
	const PUBLIC_TOOL_HREFS: Record<string, string> = {
		'truth-calculator': '/tools/calculator/',
		'ad-simulator': '/tools/simulator/',
		'ad-compliance': '/tools/compliance/',
		'marketing-templates': '/tools/templates/',
		'trust-score': '/tools/measurement/',
		'campaign-precheck': '/tools/pre-launch/'
	};

	const MODULE_ORDER = [
		'Hasta Takibi',
		'Randevu',
		'Finans',
		'WhatsApp',
		'Pazarlama',
		'Raporlama',
		'Entegrasyonlar',
		'Platform'
	];

	/** Çalışan özellik önce görünsün: Yayında → Yakında → Sıradaki. */
	const BUCKET_ORDER = ['yayinda', 'yakinda', 'siradaki'] as const;
	const bucketRank = (status: (typeof catalogue)[number]['status']) =>
		BUCKET_ORDER.indexOf(featureStatusBucket(status) as (typeof BUCKET_ORDER)[number]);

	const listed = catalogue
		.filter((f) => featureStatusBucket(f.status) !== 'fikir-defteri')
		.slice()
		.sort((a, b) => bucketRank(a.status) - bucketRank(b.status));

	const groups = MODULE_ORDER.map((label) => ({
		label,
		features: listed
			.filter((f) => f.module === label)
			.map((f) => {
				const href = PUBLIC_TOOL_HREFS[f.id];
				const title = mk(`toolkit.feature.${f.id}.title`);
				return {
					title: href ? `★ ${title}` : title,
					description: mk(`toolkit.feature.${f.id}.description`),
					badge: mk(BUCKET_LABEL_KEYS[featureStatusBucket(f.status)]),
					href
				};
			})
	})).filter((group) => group.features.length > 0);
</script>

<ProductPillarPage
	pageTitle={mk('pillar.tools.metaTitle')}
	pageDescription={mk('pillar.tools.metaDesc')}
	canonicalPath="/tools/"
	eyebrow={mk('pillar.tools.eyebrow')}
	heading={mk('pillar.tools.heading')}
	problem={mk('pillar.tools.problem')}
	outcome={mk('pillar.tools.outcome')}
	features={[]}
	{groups}
	primaryCta={{ label: mk('pillar.tools.cta'), href: '/tools/calculator/' }}
	secondaryCta={{ label: mk('pillar.tools.ctaSecondary'), href: '/case-study/' }}
/>
