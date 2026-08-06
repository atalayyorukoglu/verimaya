<script lang="ts">
	import ProductPillarPage from '$lib/components/ProductPillarPage.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const mk = (key: string) => t(key as MessageKey);
</script>

<ProductPillarPage
	pageTitle={mk('pillar.tools.prelaunch.metaTitle')}
	pageDescription={mk('pillar.tools.prelaunch.metaDesc')}
	canonicalPath="/tools/pre-launch/"
	eyebrow={mk('pillar.tools.eyebrow')}
	heading={mk('pillar.tools.prelaunch.heading')}
	problem={mk('pillar.tools.prelaunch.problem')}
	outcome={mk('pillar.tools.prelaunch.outcome')}
	body={mk('pillar.tools.prelaunch.body')}
	features={[]}
	primaryCta={{
		label: mk('pillar.tools.prelaunch.cta'),
		href: '/marketing/pre-launch/'
	}}
	secondaryCta={{ label: mk('pillar.tools.ctaSecondary'), href: '/tools/' }}
/>
