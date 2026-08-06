<script lang="ts">
	import ProductPillarPage from '$lib/components/ProductPillarPage.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const mk = (key: string) => t(key as MessageKey);
</script>

<ProductPillarPage
	pageTitle={mk('pillar.tools.templates.metaTitle')}
	pageDescription={mk('pillar.tools.templates.metaDesc')}
	canonicalPath="/tools/templates/"
	eyebrow={mk('pillar.tools.eyebrow')}
	heading={mk('pillar.tools.templates.heading')}
	problem={mk('pillar.tools.templates.problem')}
	outcome={mk('pillar.tools.templates.outcome')}
	body={mk('pillar.tools.templates.body')}
	features={[]}
	primaryCta={{
		label: mk('pillar.tools.templates.cta'),
		href: '/marketing/templates/'
	}}
	secondaryCta={{ label: mk('pillar.tools.ctaSecondary'), href: '/tools/' }}
/>
