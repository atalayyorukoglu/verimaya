<script lang="ts">
	import ProductPillarPage from '$lib/components/ProductPillarPage.svelte';
	import { PUBLIC_APP_URL } from '$lib/env';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const mk = (key: string) => t(key as MessageKey);

	// Cross-product overview: each card hands off to the pillar page that owns it,
	// so this page stays a map and never duplicates /operations/ or /sales/ copy.
	const features = [
		{
			title: mk('pillar.features.f.patients.title'),
			description: mk('pillar.features.f.patients.desc'),
			href: '/operations/'
		},
		{
			title: mk('pillar.features.f.appointments.title'),
			description: mk('pillar.features.f.appointments.desc'),
			href: '/operations/'
		},
		{
			title: mk('pillar.features.f.finance.title'),
			description: mk('pillar.features.f.finance.desc'),
			href: '/operations/'
		},
		{
			title: mk('pillar.features.f.sales.title'),
			description: mk('pillar.features.f.sales.desc'),
			href: '/sales/'
		},
		{
			title: mk('pillar.features.f.ai.title'),
			description: mk('pillar.features.f.ai.desc'),
			href: '/operations/'
		},
		{
			title: mk('pillar.features.f.reports.title'),
			description: mk('pillar.features.f.reports.desc'),
			href: '/operations/'
		},
		{
			title: mk('pillar.features.f.ads.title'),
			description: mk('pillar.features.f.ads.desc'),
			href: '/tools/'
		},
		{
			title: mk('pillar.features.f.platform.title'),
			description: mk('pillar.features.f.platform.desc'),
			href: '/resources/'
		}
	];
</script>

<ProductPillarPage
	pageTitle={mk('pillar.features.metaTitle')}
	pageDescription={mk('pillar.features.metaDesc')}
	canonicalPath="/features/"
	eyebrow={mk('pillar.features.eyebrow')}
	heading={mk('pillar.features.heading')}
	problem={mk('pillar.features.problem')}
	body={mk('pillar.features.body')}
	outcome={mk('pillar.features.outcome')}
	{features}
	primaryCta={{ label: mk('pillar.features.cta'), href: PUBLIC_APP_URL, external: true }}
	secondaryCta={{ label: mk('pillar.features.ctaSecondary'), href: '/operations/' }}
/>
