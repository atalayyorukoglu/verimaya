<script lang="ts">
	import BrandMark from '$lib/components/BrandMark.svelte';
	import { PUBLIC_SITE_URL } from '$lib/env';

	const title = 'KVKK Aydınlatma Metni — Verimaya';
	const description =
		'Ücretsiz yapay zeka karnesi kapsamında toplanan kişisel verilere ilişkin aydınlatma metni.';
	const canonical = `${PUBLIC_SITE_URL}/kvkk-aydinlatma/`;
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
</svelte:head>

<div class="flex min-h-dvh flex-col bg-bg text-text">
	<header class="flex items-center justify-between px-6 py-6 sm:px-10">
		<a href="/" class="flex items-center gap-2 text-text">
			<BrandMark class="h-6 w-6" title="" />
			<span class="text-sm font-semibold tracking-tight">Verimaya</span>
		</a>
		<a
			href="/yapay-zeka-karnesi/"
			class="text-sm font-medium text-text-muted transition-colors hover:text-text"
		>
			Karnesine dön
		</a>
	</header>

	<main class="mx-auto w-full max-w-2xl flex-1 px-6 pb-16 sm:px-10">
		<p class="text-sm font-medium text-brand">KVKK</p>
		<h1 class="mt-3 text-[clamp(1.75rem,4vw,2.25rem)] font-semibold tracking-tight text-text">
			Aydınlatma metni
		</h1>
		<p
			class="mt-4 rounded-[8px] border border-border bg-surface-2 px-4 py-3 text-sm leading-relaxed text-text-muted"
			role="note"
		>
			<strong class="font-semibold text-text">Taslak — hukukçu onayı bekleniyor.</strong>
			Bu metin yayına çıkmadan önce gözden geçirilmelidir; onaylanmadan üretimde e-posta toplamayın.
		</p>

		<div class="mt-10 space-y-8 text-sm leading-relaxed text-text">
			<section class="space-y-2">
				<h2 class="text-base font-semibold tracking-tight">1. Veri sorumlusu</h2>
				<p class="text-text-muted">
					Verimaya (iletişim: destek için paneldeki iletişim kanalları) ücretsiz yapay zeka karnesi
					kapsamında kişisel verilerinizi aşağıda belirtilen amaçlarla işler.
				</p>
			</section>

			<section class="space-y-2">
				<h2 class="text-base font-semibold tracking-tight">2. İşlenen veriler</h2>
				<ul class="list-disc space-y-1 pl-5 text-text-muted">
					<li>E-posta adresi (sizin girdiğiniz)</li>
					<li>
						Anonim karne oturumu meta verisi (klinik büyüklük bandı, AB/İngiltere maruziyeti cevabı,
						soru etkileşimleri) — IP adresi saklanmaz
					</li>
				</ul>
			</section>

			<section class="space-y-2">
				<h2 class="text-base font-semibold tracking-tight">3. Amaç ve hukuki sebep</h2>
				<p class="text-text-muted">
					Karnenizin özetini e-posta ile iletmek ve (açık rızanızla) ürün bilgilendirmesi yapmak.
					Hukuki sebep: 6698 sayılı KVKK m.5/1 açık rıza.
				</p>
			</section>

			<section class="space-y-2">
				<h2 class="text-base font-semibold tracking-tight">4. Saklama ve aktarım</h2>
				<p class="text-text-muted">
					Veriler, amacın gerektirdiği süre boyunca ve yasal yükümlülükler saklı kalmak kaydıyla
					işlenir. Üçüncü kişilere pazarlama amacıyla satılmaz. Altyapı sağlayıcıları (barındırma)
					işleyen sıfatıyla sınırlı erişebilir.
				</p>
			</section>

			<section class="space-y-2">
				<h2 class="text-base font-semibold tracking-tight">5. Haklarınız</h2>
				<p class="text-text-muted">
					KVKK m.11 kapsamındaki haklarınızı (bilgi talep, düzeltme, silme, itiraz vb.) Verimaya
					iletişim kanalları üzerinden kullanabilirsiniz. Rızanızı istediğiniz zaman geri
					çekebilirsiniz; geri çekme, önceki işlemlerin hukuka uygunluğunu etkilemez.
				</p>
			</section>
		</div>
	</main>
</div>
