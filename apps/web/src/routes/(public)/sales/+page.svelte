<script lang="ts">
	import ProductPillarPage from '$lib/components/ProductPillarPage.svelte';
	import { PUBLIC_CRM_URL } from '$lib/env';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const mk = (key: string) => t(key as MessageKey);

	const features = [
		{
			title: mk('pillar.crm.f.leadCapture.title'),
			description: mk('pillar.crm.f.leadCapture.desc')
		},
		{ title: mk('pillar.crm.f.pipeline.title'), description: mk('pillar.crm.f.pipeline.desc') },
		{ title: mk('pillar.crm.f.automation.title'), description: mk('pillar.crm.f.automation.desc') },
		{
			title: mk('pillar.crm.f.multichannel.title'),
			description: mk('pillar.crm.f.multichannel.desc')
		},
		{
			title: mk('pillar.crm.f.salesReports.title'),
			description: mk('pillar.crm.f.salesReports.desc')
		},
		{ title: mk('pillar.crm.f.appSync.title'), description: mk('pillar.crm.f.appSync.desc') },
		{ title: mk('pillar.crm.f.ads.title'), description: mk('pillar.crm.f.ads.desc') }
	];
</script>

<ProductPillarPage
	pageTitle={mk('pillar.crm.metaTitle')}
	pageDescription={mk('pillar.crm.metaDesc')}
	canonicalPath="/crm/"
	eyebrow={mk('pillar.crm.eyebrow')}
	heading={mk('pillar.crm.heading')}
	problem={mk('pillar.crm.problem')}
	outcome={mk('pillar.crm.outcome')}
	{features}
	primaryCta={{ label: mk('pillar.crm.cta'), href: PUBLIC_CRM_URL, external: true }}
	secondaryCta={{ label: mk('pillar.crm.ctaSecondary'), href: '/app/' }}
/>
