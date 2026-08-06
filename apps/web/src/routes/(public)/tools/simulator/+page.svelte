<script lang="ts">
	import ProductPillarPage from '$lib/components/ProductPillarPage.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const mk = (key: string) => t(key as MessageKey);
</script>

<ProductPillarPage
	pageTitle={mk('pillar.tools.simulator.metaTitle')}
	pageDescription={mk('pillar.tools.simulator.metaDesc')}
	canonicalPath="/tools/simulator/"
	eyebrow={mk('pillar.tools.eyebrow')}
	heading={mk('pillar.tools.simulator.heading')}
	problem={mk('pillar.tools.simulator.problem')}
	outcome={mk('pillar.tools.simulator.outcome')}
	body={mk('pillar.tools.simulator.body')}
	features={[]}
	primaryCta={{
		label: mk('pillar.tools.simulator.cta'),
		href: '/marketing/simulator/'
	}}
	secondaryCta={{ label: mk('pillar.tools.ctaSecondary'), href: '/tools/' }}
/>
