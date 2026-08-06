<script lang="ts">
	import ProductPillarPage from '$lib/components/ProductPillarPage.svelte';
	import { PUBLIC_APP_URL } from '$lib/env';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const mk = (key: string) => t(key as MessageKey);

	const features = [
		{ title: mk('pillar.app.f.patients.title'), description: mk('pillar.app.f.patients.desc') },
		{ title: mk('pillar.app.f.duplicates.title'), description: mk('pillar.app.f.duplicates.desc') },
		{ title: mk('pillar.app.f.contacts.title'), description: mk('pillar.app.f.contacts.desc') },
		{
			title: mk('pillar.app.f.appointments.title'),
			description: mk('pillar.app.f.appointments.desc')
		},
		{ title: mk('pillar.app.f.ledger.title'), description: mk('pillar.app.f.ledger.desc') },
		{
			title: mk('pillar.app.f.whatsappImport.title'),
			description: mk('pillar.app.f.whatsappImport.desc')
		},
		{ title: mk('pillar.app.f.invoiceAi.title'), description: mk('pillar.app.f.invoiceAi.desc') },
		{ title: mk('pillar.app.f.balances.title'), description: mk('pillar.app.f.balances.desc') },
		{ title: mk('pillar.app.f.reports.title'), description: mk('pillar.app.f.reports.desc') },
		{ title: mk('pillar.app.f.realRoas.title'), description: mk('pillar.app.f.realRoas.desc') },
		{ title: mk('pillar.app.f.audit.title'), description: mk('pillar.app.f.audit.desc') },
		{ title: mk('pillar.app.f.scorecard.title'), description: mk('pillar.app.f.scorecard.desc') },
		{ title: mk('pillar.app.f.n8n.title'), description: mk('pillar.app.f.n8n.desc') },
		{
			title: mk('pillar.app.f.multiTenant.title'),
			description: mk('pillar.app.f.multiTenant.desc')
		}
	];
</script>

<ProductPillarPage
	pageTitle={mk('pillar.app.metaTitle')}
	pageDescription={mk('pillar.app.metaDesc')}
	canonicalPath="/app/"
	eyebrow={mk('pillar.app.eyebrow')}
	heading={mk('pillar.app.heading')}
	problem={mk('pillar.app.problem')}
	body={mk('pillar.app.body')}
	outcome={mk('pillar.app.outcome')}
	{features}
	primaryCta={{ label: mk('pillar.app.cta'), href: PUBLIC_APP_URL, external: true }}
	secondaryCta={{ label: mk('pillar.app.ctaSecondary'), href: '/features/' }}
/>
