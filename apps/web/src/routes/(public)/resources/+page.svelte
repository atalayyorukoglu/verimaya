<script lang="ts">
	import ProductPillarPage from '$lib/components/ProductPillarPage.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const mk = (key: string) => t(key as MessageKey);

	const features = [
		{
			title: mk('pillar.resources.f.karne.title'),
			description: mk('pillar.resources.f.karne.desc'),
			href: '/yapay-zeka-karnesi/'
		},
		{
			title: mk('pillar.resources.f.features.title'),
			description: mk('pillar.resources.f.features.desc'),
			href: '/features/'
		},
		{
			title: mk('pillar.resources.f.changelog.title'),
			description: mk('pillar.resources.f.changelog.desc'),
			href: '/changelog/'
		}
	];
</script>

<ProductPillarPage
	pageTitle={mk('pillar.resources.metaTitle')}
	pageDescription={mk('pillar.resources.metaDesc')}
	canonicalPath="/resources/"
	eyebrow={mk('pillar.resources.eyebrow')}
	heading={mk('pillar.resources.heading')}
	problem={mk('pillar.resources.problem')}
	outcome={mk('pillar.resources.outcome')}
	{features}
	primaryCta={{ label: mk('pillar.resources.cta'), href: '/yapay-zeka-karnesi/' }}
	secondaryCta={{ label: mk('pillar.resources.ctaSecondary'), href: '/features/' }}
/>
