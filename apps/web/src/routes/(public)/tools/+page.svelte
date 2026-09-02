<script lang="ts">
	import ProductPillarPage from '$lib/components/ProductPillarPage.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const mk = (key: string) => t(key as MessageKey);

	const features = [
		{
			title: mk('pillar.tools.f.templates.title'),
			description: mk('pillar.tools.f.templates.desc'),
			href: '/tools/templates/'
		},
		{
			title: mk('pillar.tools.f.simulator.title'),
			description: mk('pillar.tools.f.simulator.desc'),
			href: '/tools/simulator/'
		},
		{
			title: mk('pillar.tools.f.compliance.title'),
			description: mk('pillar.tools.f.compliance.desc'),
			href: '/tools/compliance/'
		},
		{
			title: mk('pillar.tools.f.calculator.title'),
			description: mk('pillar.tools.f.calculator.desc'),
			href: '/tools/calculator/'
		},
		{
			title: mk('pillar.tools.f.measurement.title'),
			description: mk('pillar.tools.f.measurement.desc'),
			href: '/tools/measurement/'
		},
		{
			title: mk('pillar.tools.f.prelaunch.title'),
			description: mk('pillar.tools.f.prelaunch.desc'),
			href: '/tools/pre-launch/'
		}
	];
</script>

<ProductPillarPage
	pageTitle={mk('pillar.tools.metaTitle')}
	pageDescription={mk('pillar.tools.metaDesc')}
	canonicalPath="/tools/"
	eyebrow={mk('pillar.tools.eyebrow')}
	heading={mk('pillar.tools.heading')}
	problem={mk('pillar.tools.problem')}
	outcome={mk('pillar.tools.outcome')}
	{features}
	primaryCta={{ label: mk('pillar.tools.cta'), href: '/tools/calculator/' }}
	secondaryCta={{ label: mk('pillar.tools.ctaSecondary'), href: '/operations/' }}
/>
