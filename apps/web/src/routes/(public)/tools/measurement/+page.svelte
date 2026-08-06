<script lang="ts">
	import ProductPillarPage from '$lib/components/ProductPillarPage.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const mk = (key: string) => t(key as MessageKey);
</script>

<ProductPillarPage
	pageTitle={mk('pillar.tools.measurement.metaTitle')}
	pageDescription={mk('pillar.tools.measurement.metaDesc')}
	canonicalPath="/tools/measurement/"
	eyebrow={mk('pillar.tools.eyebrow')}
	heading={mk('pillar.tools.measurement.heading')}
	problem={mk('pillar.tools.measurement.problem')}
	outcome={mk('pillar.tools.measurement.outcome')}
	body={mk('pillar.tools.measurement.body')}
	features={[]}
	primaryCta={{
		label: mk('pillar.tools.measurement.cta'),
		href: '/marketing/measurement/'
	}}
	secondaryCta={{ label: mk('pillar.tools.ctaSecondary'), href: '/tools/' }}
/>
