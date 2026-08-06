<script lang="ts">
	import ProductPillarPage from '$lib/components/ProductPillarPage.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const mk = (key: string) => t(key as MessageKey);
</script>

<ProductPillarPage
	pageTitle={mk('pillar.tools.calculator.metaTitle')}
	pageDescription={mk('pillar.tools.calculator.metaDesc')}
	canonicalPath="/tools/calculator/"
	eyebrow={mk('pillar.tools.eyebrow')}
	heading={mk('pillar.tools.calculator.heading')}
	problem={mk('pillar.tools.calculator.problem')}
	outcome={mk('pillar.tools.calculator.outcome')}
	body={mk('pillar.tools.calculator.body')}
	features={[]}
	primaryCta={{
		label: mk('pillar.tools.calculator.cta'),
		href: '/marketing/calculator/'
	}}
	secondaryCta={{ label: mk('pillar.tools.ctaSecondary'), href: '/tools/' }}
/>
