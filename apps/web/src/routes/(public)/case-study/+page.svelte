<script lang="ts">
	import ProductPillarPage from '$lib/components/ProductPillarPage.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const mk = (key: string) => t(key as MessageKey);

	/**
	 * Vaka sayfası — TEMSİLÎ. Klinik gerçek değil, rakamlar sahada görülen
	 * büyüklüklerden kuruldu. Gerçek müşteri verisi kullanılmaz: hasta verisi
	 * paylaşılamaz, müşteri rakamı ise yazılı izin ister.
	 *
	 * Son kart bilinçli olarak "bu vakada olmayanlar" diyor: sistem işi kişiye
	 * atamıyor, yapıldı işaretlemiyor. Anasayfadaki "birlikte yürütürüz" ile
	 * aynı çizgi.
	 */
	const features = [
		{ title: mk('pillar.case.f.gun0.title'), description: mk('pillar.case.f.gun0.desc') },
		{ title: mk('pillar.case.f.gun3.title'), description: mk('pillar.case.f.gun3.desc') },
		{ title: mk('pillar.case.f.ay1.title'), description: mk('pillar.case.f.ay1.desc') },
		{ title: mk('pillar.case.f.ay2.title'), description: mk('pillar.case.f.ay2.desc') },
		{ title: mk('pillar.case.f.ay3.title'), description: mk('pillar.case.f.ay3.desc') },
		{ title: mk('pillar.case.f.neyok.title'), description: mk('pillar.case.f.neyok.desc') }
	];
</script>

<ProductPillarPage
	pageTitle={mk('pillar.case.metaTitle')}
	pageDescription={mk('pillar.case.metaDesc')}
	canonicalPath="/case-study/"
	eyebrow={mk('pillar.case.eyebrow')}
	heading={mk('pillar.case.heading')}
	problem={mk('pillar.case.problem')}
	body={mk('pillar.case.body')}
	outcome={mk('pillar.case.outcome')}
	{features}
	primaryCta={{ label: mk('pillar.case.cta'), href: '/#gorusme' }}
	secondaryCta={{ label: mk('pillar.case.ctaSecondary'), href: '/tools/' }}
/>
