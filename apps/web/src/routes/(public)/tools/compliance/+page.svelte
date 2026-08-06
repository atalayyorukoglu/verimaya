<script lang="ts">
	import ProductPillarPage from '$lib/components/ProductPillarPage.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const mk = (key: string) => t(key as MessageKey);
</script>

<ProductPillarPage
	pageTitle={mk('pillar.tools.compliance.metaTitle')}
	pageDescription={mk('pillar.tools.compliance.metaDesc')}
	canonicalPath="/tools/compliance/"
	eyebrow={mk('pillar.tools.eyebrow')}
	heading={mk('pillar.tools.compliance.heading')}
	problem={mk('pillar.tools.compliance.problem')}
	outcome={mk('pillar.tools.compliance.outcome')}
	body={mk('pillar.tools.compliance.body')}
	features={[]}
	primaryCta={{
		label: mk('pillar.tools.compliance.cta'),
		href: '/marketing/compliance/'
	}}
	secondaryCta={{ label: mk('pillar.tools.ctaSecondary'), href: '/tools/' }}
/>
