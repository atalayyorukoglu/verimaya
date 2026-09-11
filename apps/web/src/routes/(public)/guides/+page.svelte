<script lang="ts">
	import ProductPillarPage from '$lib/components/ProductPillarPage.svelte';
	import { knowledgeGuides } from '$lib/knowledge-guides';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const mk = (key: string) => t(key as MessageKey);

	/**
	 * Rehberler paneldeki `/knowledge` sayfasından geldi. Gövde metinleri henüz
	 * yazılmadığı için detay sayfası YOK — tıklayınca "İçerik yakında." diyen boş
	 * bir ekrana götürmektense başlık ve açıklamayı burada gösteriyoruz.
	 */
	const features = knowledgeGuides.map((guide) => ({
		title: mk(guide.titleKey),
		description: mk(guide.descriptionKey)
	}));
</script>

<ProductPillarPage
	pageTitle={mk('pillar.guides.metaTitle')}
	pageDescription={mk('pillar.guides.metaDesc')}
	canonicalPath="/guides/"
	eyebrow={mk('pillar.guides.eyebrow')}
	heading={mk('pillar.guides.heading')}
	problem={mk('pillar.guides.problem')}
	outcome={mk('pillar.guides.outcome')}
	{features}
	primaryCta={{ label: mk('pillar.guides.cta'), href: '/yapay-zeka-karnesi/' }}
	secondaryCta={{ label: mk('pillar.guides.ctaSecondary'), href: '/case-study/' }}
/>
