<script lang="ts">
	import SiteLogo from '$lib/components/SiteLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LocaleToggle from '$lib/components/LocaleToggle.svelte';
	import HubI18nText from '$lib/components/HubI18nText.svelte';
	import { PUBLIC_APP_URL, PUBLIC_CRM_URL, PUBLIC_SITE_URL } from '$lib/env';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	const appLoginUrl = `${PUBLIC_APP_URL}/login`;
	const title = 'Verimaya — Ne yapmanız gerektiğini söyleyen sistem';
	const description =
		'Kayıt tutan yazılım çok. Verimaya reklamdan tahsilata bütün zinciri okur, nerede para kaybettiğinizi bulur ve o ay ne yapılacağını önünüze koyar.';
	const canonical = `${PUBLIC_SITE_URL}/`;
	const ogImage = `${PUBLIC_SITE_URL}/og/vitrin.png`;

	let menuOpen = $state(false);
	let loginOpen = $state(false);

	const organizationLd = {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: 'Verimaya',
		url: PUBLIC_SITE_URL,
		logo: `${PUBLIC_SITE_URL}/icon-512.png`,
		description
	};

	const navItems = [
		{ href: '/operations/', labelKey: 'hub.nav.webApp' as MessageKey },
		{ href: '/sales/', labelKey: 'hub.nav.crm' as MessageKey },
		{ href: '/tools/', labelKey: 'hub.nav.tools' as MessageKey },
		{ href: '/resources/', labelKey: 'hub.nav.resources' as MessageKey }
	] as const;

	function closeMenu() {
		menuOpen = false;
		loginOpen = false;
	}

	function toggleMenu() {
		menuOpen = !menuOpen;
		if (!menuOpen) loginOpen = false;
	}

	function toggleLogin(e: MouseEvent) {
		e.stopPropagation();
		loginOpen = !loginOpen;
	}

	function onWindowClick() {
		if (loginOpen) loginOpen = false;
	}

	const contactEmail = 'destek@verimaya.com';
	const mailto = `mailto:${contactEmail}?subject=İlk bulgu raporu görüşmesi`;

	const ladder = [
		{ no: '1', ad: 'Kayıt', soru: 'Ne oldu?', kim: 'CRM · ERP · hastane sistemi', bizde: false },
		{
			no: '2',
			ad: 'Etkileşim',
			soru: 'Kiminle konuşuldu?',
			kim: 'WhatsApp · çağrı merkezi',
			bizde: false
		},
		{ no: '3', ad: 'Rapor', soru: 'Sayılar ne?', kim: 'panel · gösterge ekranı', bizde: false },
		{ no: '4', ad: 'Teşhis', soru: 'Neden böyle oldu?', kim: 'burada başlıyoruz', bizde: true },
		{
			no: '5',
			ad: 'Aksiyon',
			soru: 'Ne yapılmalı? Yapıldı mı? İşe yaradı mı?',
			kim: 'sattığımız şey bu',
			bizde: true
		}
	] as const;

	const reads = [
		{
			halka: 'Reklam',
			soru: 'Hangi kampanya boş lead getiriyor, hangisi ödeme yapacak hastayı getiriyor?'
		},
		{ halka: 'Lead', soru: 'Kime kaç saatte dönüldü, kime hiç dönülmedi?' },
		{ halka: 'Temsilci', soru: 'Kim ne yazıyor, hangi cevaplar satışa götürüyor?' },
		{ halka: 'Hasta', soru: 'Hasta hangi aşamada bekliyor, kime hatırlatma gitmedi?' },
		{ halka: 'Hekim / klinik', soru: 'Hangi tedavi planı isabetli, RPT nereden kaynaklanıyor?' },
		{ halka: 'Tahsilat', soru: 'Kim ödedi, kim ödemedi, ne kadar alacağımız var?' },
		{ halka: 'Hakediş', soru: 'Kime ne hak edildi, ne kadarı ödendi?' },
		{ halka: 'Teşvik', soru: 'Hangi dosyanın süresi doluyor?' }
	] as const;

	const actions = [
		{
			baslik: '“Saç ekimi – TR” kampanyasını durdur',
			neden: '3 aydır kohort ortalamasının altında',
			kim: 'Atalay',
			tarih: '20 Ağu'
		},
		{
			baslik: '38 temassız hastayı ara — 12’si 60 günü geçti',
			neden: 'Sıra çıkarıldı, sahipleri atandı',
			kim: 'Operasyon',
			tarih: '22 Ağu'
		},
		{
			baslik: 'İş ortağı hakedişini mutabakata bağla',
			neden: 'İki tarafta iki farklı rakam görünüyor',
			kim: 'Finans',
			tarih: '25 Ağu'
		},
		{
			baslik: '4 teşvik dosyasında süre 60 günün altına indi',
			neden: 'Belge listesi hazır, eksik: 2 dekont',
			kim: 'Operasyon',
			tarih: '18 Ağu'
		}
	] as const;

	const cycle = [
		{
			no: '01',
			ad: 'Ölç',
			not: 'Her halkanın bir sayısı olur.',
			ornek: 'Örn. Lead dönüşü %18 · ortalama yanıt 6 saat'
		},
		{
			no: '02',
			ad: 'Teşhis koy',
			not: 'Sayının arkasındaki neden isim isim çıkar.',
			ornek: 'Örn. 38 hasta 60 gündür temassız'
		},
		{
			no: '03',
			ad: 'Müdahale et',
			not: 'O ay ne yapılacağına birlikte karar veririz.',
			ornek: 'Örn. Temassız 38’i ara — sahipler atandı'
		},
		{
			no: '04',
			ad: 'Tekrar ölç',
			not: 'Ertesi ay tek soru: müdahale işe yaradı mı?',
			ornek: 'Örn. Temassız 38 → 11 · dönüş %18 → %27'
		}
	] as const;

	const privacy = [
		{
			b: 'İzolasyon',
			t: 'Her firmanın verisi ayrı tutulur. İzolasyon sözleşmede yazılıdır, denetime açıktır.'
		},
		{
			b: 'Model eğitimi',
			t: 'Verileriniz yapay zekâ modeli eğitmek için kullanılmaz — ne bizim tarafımızdan, ne kullandığımız sağlayıcılar tarafından.'
		},
		{
			b: 'Aksiyon izi',
			t: 'Hangi öneriyi kimin onayladığı, neyin yapıldığı ve sonucunun ne olduğu geriye dönük izlenebilir.'
		},
		{
			b: 'Şeffaflık',
			t: 'Aynı sektörde birden fazla firmayla çalışıyoruz — bunu siz sormadan söylüyoruz. Destek için verinize erişirsek bu sizin denetim kaydınıza düşer; sessiz erişim yok.'
		}
	] as const;
</script>

<svelte:window onclick={onWindowClick} />

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />

	<meta property="og:type" content="website" />
	<meta property="og:locale" content="tr_TR" />
	<meta property="og:site_name" content="Verimaya" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Verimaya" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={ogImage} />

	<!-- eslint-disable-next-line svelte/no-at-html-tags, no-useless-escape -- statik JSON-LD; `<` u+003c'ye escape edilir ki organizationLd'ye ileride dinamik veri eklenirse "</script>" ile tag'den kaçış mümkün olmasın. </script> kaçışı ayrıca parser'ın string'i erken kapatmasını önlüyor -->
	{@html `<script type="application/ld+json">${JSON.stringify(organizationLd).replace(/</g, '\\u003c')}<\/script>`}
</svelte:head>

<div
	class="hub-page v4 relative overflow-hidden bg-bg text-text"
	style="--brand: #f43e01; --brand-hover: #d93601; --brand-subtle: rgba(244, 62, 1, 0.14); --brand-text: #b32e01; --gradient-hero: linear-gradient(135deg, #f43e01, #ff6a33); --primary: var(--brand); --ring: var(--brand)"
>
	<div class="pointer-events-none absolute inset-0" aria-hidden="true">
		<div class="v4-wash absolute inset-0"></div>
		<div class="v4-glow absolute -top-[20%] left-1/2 h-[70vh] w-[120vw] -translate-x-1/2"></div>
		<div class="v4-grain absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"></div>
	</div>

	<header class="relative z-20 px-6 py-6 sm:px-10">
		<div class="mx-auto flex w-full max-w-6xl items-center justify-between">
			<a href="/" class="text-text" onclick={closeMenu}>
				<SiteLogo />
			</a>
			<div class="flex items-center gap-2 sm:gap-5">
				<nav class="hidden items-center gap-5 text-sm font-medium text-text-muted sm:flex sm:gap-6">
					{#each navItems as item (item.href)}
						<a
							href={item.href}
							class="rounded-sm transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
						>
							<HubI18nText key={item.labelKey} />
						</a>
					{/each}
				</nav>
				<LocaleToggle />
				<ThemeToggle />
				<div class="relative">
					<button
						type="button"
						data-hub-login-toggle
						class="inline-flex h-9 items-center gap-1 rounded-[6px] bg-brand px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:px-3.5"
						aria-expanded={loginOpen}
						aria-haspopup="menu"
						onclick={toggleLogin}
					>
						<HubI18nText key="hub.login" />
						<ChevronDown class="size-4 opacity-90" aria-hidden="true" />
					</button>
					<div
						data-hub-login-panel
						class="absolute right-0 z-40 mt-2 w-52 rounded-[8px] border border-border bg-surface py-1 shadow-lg"
						class:hidden={!loginOpen}
						role="menu"
						tabindex="-1"
					>
						<a
							href={appLoginUrl}
							class="block px-3 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
							role="menuitem"
							onclick={closeMenu}
						>
							<HubI18nText key="hub.login.app" />
						</a>
						<a
							href={PUBLIC_CRM_URL}
							class="block px-3 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
							role="menuitem"
							onclick={closeMenu}
						>
							<HubI18nText key="hub.login.crm" />
						</a>
					</div>
				</div>
				<button
					type="button"
					data-hub-menu-toggle
					data-label-open={t('hub.menu.open')}
					data-label-close={t('hub.menu.close')}
					class="inline-flex size-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:hidden"
					aria-expanded={menuOpen}
					aria-controls="hub-mobile-nav"
					aria-label={menuOpen ? t('hub.menu.close') : t('hub.menu.open')}
					onclick={toggleMenu}
				>
					<span data-hub-menu-icon-open class:hidden={menuOpen}>
						<Menu class="size-5" />
					</span>
					<span data-hub-menu-icon-close class:hidden={!menuOpen}>
						<X class="size-5" />
					</span>
				</button>
			</div>
		</div>
		<nav
			id="hub-mobile-nav"
			data-hub-mobile-nav
			class="mx-auto mt-4 w-full max-w-6xl flex-col gap-1 border-t border-border/40 pt-4 sm:hidden {menuOpen
				? 'flex'
				: 'hidden'}"
		>
			{#each navItems as item (item.href)}
				<a
					href={item.href}
					class="rounded-md px-3 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
					onclick={closeMenu}
				>
					<HubI18nText key={item.labelKey} />
				</a>
			{/each}
		</nav>
	</header>

	<main>
		<!-- ── 1. Hero ───────────────────────────────────────── -->
		<section class="v4-hero">
			<div class="v4-hero-glow" aria-hidden="true"></div>
			<div class="v4-hero-in">
				<span class="v4-label">Sağlık turizmi operasyonları için</span>
				<h1>Sisteminiz size <em>ne yapmanız gerektiğini</em> söylüyor mu?</h1>
				<p>
					Kayıt tutan yazılım çok. Verimaya reklamdan tahsilata bütün zinciri okur, nerede para
					kaybettiğinizi bulur ve o ay ne yapılacağını önünüze koyar.
				</p>
				<div class="v4-cta-row">
					<a class="v4-btn" href="#gorusme">İlk bulgu raporu için görüşme isteyin</a>
					<a class="v4-link" href="#merdiven">Nasıl çalışır ↓</a>
				</div>
			</div>
		</section>

		<!-- ── 2. Merdiven ───────────────────────────────────── -->
		<section id="merdiven" class="v4-band v4-ladder-band">
			<div class="v4-in">
				<span class="v4-label">Omurga</span>
				<h2>Mevcut sistemler üçüncü basamakta durur.</h2>
				<p class="v4-lede">
					Kayıt tutar, konuşmaları toplar, rapor çıkarır. Sonra susar. Oysa asıl iş oradan sonra
					başlar: neden böyle olduğu ve ne yapılacağı.
				</p>

				<ol class="v4-ladder">
					{#each ladder as s (s.no)}
						<li class={s.bizde ? 'v4-step v4-step-on' : 'v4-step'}>
							<span class="v4-step-no">{s.no}</span>
							<span class="v4-step-ad">{s.ad}</span>
							<span class="v4-step-soru">{s.soru}</span>
							<span class="v4-step-kim">{s.kim}</span>
						</li>
					{/each}
				</ol>
			</div>
		</section>

		<!-- ── 3. Ne okuyoruz ────────────────────────────────── -->
		<section id="okuruz" class="v4-band">
			<div class="v4-in">
				<span class="v4-label">Teşhisin girdileri</span>
				<h2>Zincirin her halkasına ayrı bakarız.</h2>
				<p class="v4-lede">
					Reklamı biz yönetmesek de kalitesini ölçeriz. Kontrol etmediğimiz halkayı da teşhis ederiz
					— hasta gelmiyorsa nedeni muğlak değil; hangi halkada olduğu bellidir.
				</p>

				<div class="v4-reads">
					{#each reads as r (r.halka)}
						<div class="v4-read">
							<span class="v4-read-k">{r.halka}</span>
							<span class="v4-read-q">{r.soru}</span>
						</div>
					{/each}
				</div>
			</div>
		</section>

		<!-- ── 4. Müdahale listesi ───────────────────────────── -->
		<section id="liste" class="v4-band v4-tint">
			<div class="v4-in v4-two">
				<div>
					<span class="v4-label">Çıktı</span>
					<h2>Ay sonunda rapor değil, liste alırsınız.</h2>
					<p class="v4-lede">
						Her satırda üç şey vardır: ne yapılacak, neden, kim ve ne zaman. Ertesi ay ilk bakılan
						şey bu listenin ne kadarının kapandığıdır.
					</p>
					<p class="v4-note">
						İlk teslimlerde bu listeyi sizinle birlikte biz çıkarıyoruz — bir panel ekranı
						beklemenize gerek yok.
					</p>
				</div>

				<div class="v4-surface">
					<div class="v4-surface-bar">
						<span>Ağustos müdahale listesi</span>
						<span class="v4-chip">temsilî</span>
					</div>
					<ul class="v4-actions">
						{#each actions as a (a.baslik)}
							<li>
								<span class="v4-box" aria-hidden="true"></span>
								<span class="v4-act-body">
									<strong>{a.baslik}</strong>
									<span class="v4-act-why">{a.neden}</span>
								</span>
								<span class="v4-act-meta">
									<span class="v4-owner">{a.kim}</span>
									<span class="v4-date">{a.tarih}</span>
								</span>
							</li>
						{/each}
					</ul>
				</div>
			</div>
		</section>

		<!-- ── 5. Döngü ──────────────────────────────────────── -->
		<section class="v4-band">
			<div class="v4-in">
				<span class="v4-label">Döngü</span>
				<h2>Öneriyi verip çekilmeyiz.</h2>
				<p class="v4-lede">Dördüncü adım olmadan üçüncüsü tahmindir.</p>
				<ol class="v4-cycle">
					{#each cycle as c (c.no)}
						<li>
							<span class="v4-mono">{c.no}</span>
							<strong>{c.ad}</strong>
							<span class="v4-cycle-not">{c.not}</span>
							<span class="v4-cycle-ornek">{c.ornek}</span>
						</li>
					{/each}
				</ol>
			</div>
		</section>

		<!-- ── 6. Veri girişi / onay kuyruğu ─────────────────── -->
		<section class="v4-band v4-tint">
			<div class="v4-in v4-two v4-two-rev">
				<div class="v4-surface">
					<div class="v4-surface-bar">
						<span>Onayınızı bekleyen · 3</span>
						<span class="v4-chip">temsilî</span>
					</div>
					<div class="v4-q-item">
						<p class="v4-q-who">Ahmet Yılmaz — Randevu tarihi</p>
						<p class="v4-diff">
							<span class="v4-old">5 Eylül 2026</span>
							<span class="v4-arrow">→</span>
							<span class="v4-new">12 Eylül 2026</span>
						</p>
						<p class="v4-src">
							“Ahmet Bey 12 Eylül’e ertelemek istedi”
							<span>Operasyon grubu · 14:32 · Mehmet</span>
						</p>
						<div class="v4-q-actions" aria-hidden="true">
							<span class="v4-fake v4-fake-primary">Kabul</span>
							<span class="v4-fake">Reddet</span>
						</div>
					</div>
					<div class="v4-q-item v4-q-muted">
						<span class="v4-q-who">Fatma Demir — Telefon</span>
						<span class="v4-chip">bekliyor</span>
					</div>
					<div class="v4-q-item v4-q-muted">
						<span class="v4-q-who">Ali Kaya — Hasta durumu</span>
						<span class="v4-chip">bekliyor</span>
					</div>
				</div>

				<div>
					<span class="v4-label">Girdi kalitesi</span>
					<h2>Teşhis, veri doğruysa işe yarar.</h2>
					<p class="v4-lede">
						Aksiyon üretmek için zincirin dolu olması gerekir. Bu yüzden veri girişini insana yük
						olmaktan çıkardık: ekibiniz WhatsApp’ta ne yazıyorsa sistem onu okur, değişikliği
						hazırlar, siz onaylarsınız. <b>Onaylayana kadar hiçbir kayıt değişmez.</b>
					</p>
					<p class="v4-lede">
						Onayladığınız her değişikliğin kaynağı kayıtlıdır: hangi mesaj, kim yazdı, kim onayladı,
						ne zaman.
					</p>
					<p class="v4-note">
						Yapay zekâ hasta adına konuşmaz, kaydı kendi başına değiştirmez. Öneri üretir; kararı
						insan verir.
					</p>
				</div>
			</div>
		</section>

		<!-- ── 7. İlk bulgu ──────────────────────────────────── -->
		<section class="v4-center">
			<div class="v4-center-in">
				<span class="v4-label">Kanıt</span>
				<h2>İlk müdahale listesi, ilk görüşmenin sonunda çıkar.</h2>
				<p>
					Mevcut sisteminizden veriyi alır, doğrularız. Doğrulama biter bitmez üç şey görünür: kaç
					hasta sisteme birden fazla kez kaydedilmiş, kaç hastaya 30 günden uzun süredir
					dokunulmamış, ne kadar bakiye tahsil edilmemiş.
				</p>
				<p>
					Üçü de zaten sizin verinizde duruyor. Eksik olan, birinin bakıp “şunu yapalım” demesi.
				</p>
				<p class="v4-pledge">Bilmediğiniz bir şey söyleyemezsek, ücret istemiyoruz.</p>
			</div>
		</section>

		<!-- ── 8. Veri ve KVKK ───────────────────────────────── -->
		<section id="veri" class="v4-band">
			<div class="v4-in">
				<span class="v4-label">Güven</span>
				<h2>Veriniz kimseyle komşu değil.</h2>
				<div class="v4-grid4">
					{#each privacy as p (p.b)}
						<article>
							<span class="v4-mono">{p.b}</span>
							<p>{p.t}</p>
						</article>
					{/each}
				</div>
				<p class="v4-note">
					<a href="/kvkk-aydinlatma/">KVKK aydınlatma metni →</a>
				</p>
			</div>
		</section>

		<!-- ── 9. Kimin için ─────────────────────────────────── -->
		<section class="v4-band">
			<div class="v4-in v4-aud">
				<article class="v4-aud-main">
					<span class="v4-label">Kimin için</span>
					<h2>Hasta yolculuğunu ve para akışını yönetenler için.</h2>
					<p>
						Hastayı reklamla bulan, sürecini yürüten, parasını tahsil eden ve iş ortağının
						hakedişini ödeyen taraf sizseniz doğru yerdesiniz. Kurum tipine göre ikiye ayrılmış iki
						ayrı ürün yok — zincir aynı zincir.
					</p>
					<p>
						Lead, hasta, tahsilat ve hakediş aynı yerde. Hangi iş ortağının kazandırdığı, hangi
						kampanyanın para getirdiği ve kimin ne hak ettiği tek tabloda.
					</p>
				</article>
				<aside>
					<span class="v4-label">Ölçek</span>
					<p>
						Tek marka ile de çalışır, birden fazla şube ve iş ortağıyla da — hepsi tek hesapta.
						Yanında ikinci bir tablo tutmanız gerekmez.
					</p>
				</aside>
			</div>
		</section>

		<!-- ── 10. Kapanış ───────────────────────────────────── -->
		<section id="gorusme" class="v4-closing">
			<div class="v4-closing-in">
				<h2>Anlatmayalım, gösterelim.</h2>
				<p>
					30 dakikalık bir görüşme yapalım. Uygunsa sözleşmeyle veri alır, ilk bulgu raporunuzu ve
					ilk müdahale listenizi çıkarırız. Bilmediğiniz bir şey söyleyemezsek, ücret istemiyoruz.
				</p>
				<a class="v4-btn v4-btn-lg" href={mailto}>Görüşme isteyin</a>
				<p class="v4-closing-mail">{contactEmail}</p>
			</div>
		</section>
	</main>

	<footer class="relative z-10 border-t border-border/40 px-6 py-12 sm:px-10">
		<div class="mx-auto max-w-6xl">
			<div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
				<div>
					<a href="/" class="inline-block text-text">
						<SiteLogo />
					</a>
				</div>
				<div>
					<p class="text-xs font-semibold tracking-wider text-text-faint uppercase">
						<HubI18nText key="hub.footer.links" />
					</p>
					<ul class="mt-4 space-y-2">
						<li><a href="/operations/"><HubI18nText key="hub.nav.webApp" /></a></li>
						<li><a href="/sales/"><HubI18nText key="hub.nav.crm" /></a></li>
						<li><a href="/tools/"><HubI18nText key="hub.nav.tools" /></a></li>
						<li>
							<a href="/resources/"><HubI18nText key="hub.nav.resources" /></a>
						</li>
					</ul>
				</div>
				<div>
					<p class="text-xs font-semibold tracking-wider text-text-faint uppercase">
						<HubI18nText key="hub.footer.resources" />
					</p>
					<ul class="mt-4 space-y-2">
						<li><a href="/features/"><HubI18nText key="nav.features" /></a></li>
						<li><a href="/changelog/"><HubI18nText key="nav.changelog" /></a></li>
						<li>
							<a href="/yapay-zeka-karnesi/"><HubI18nText key="hub.karne.title" /></a>
						</li>
					</ul>
				</div>
				<div>
					<p class="text-xs font-semibold tracking-wider text-text-faint uppercase">
						<HubI18nText key="hub.footer.legal" />
					</p>
					<ul class="mt-4 space-y-2">
						<li>
							<a href="/kvkk-aydinlatma/"><HubI18nText key="hub.footer.kvkk" /></a>
						</li>
					</ul>
				</div>
			</div>
			<div class="mt-10 border-t border-border/40 pt-6 text-center text-xs text-text-faint">
				© {new Date().getFullYear()} Verimaya
			</div>
		</div>
	</footer>
</div>

<style>
	.v4 {
		--tint: color-mix(in srgb, var(--surface-2) 72%, transparent);
		--panel: var(--surface);
		--line: var(--border);
		--line-2: color-mix(in srgb, var(--border) 72%, transparent);
		--ink: var(--text);
		--ink-2: var(--text-muted);
		--ink-3: var(--text-faint);
		--accent: var(--brand);
		--accent-2: var(--brand);
		--sans:
			'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		--mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
		--wrap: 70rem;

		background: var(--bg);
		color: var(--ink);
		font-family: var(--sans);
		line-height: 1.55;
		-webkit-font-smoothing: antialiased;
		font-variant-numeric: tabular-nums;
	}

	.v4-wash {
		background:
			radial-gradient(
				ellipse 80% 50% at 50% -8%,
				color-mix(in srgb, var(--brand) 14%, transparent),
				transparent 72%
			),
			linear-gradient(180deg, color-mix(in srgb, var(--bg) 94%, #f0ebe6) 0%, var(--bg) 45%);
	}

	:global(.dark) .v4-wash {
		background:
			radial-gradient(
				ellipse 80% 50% at 50% -8%,
				color-mix(in srgb, var(--brand) 18%, transparent),
				transparent 72%
			),
			linear-gradient(180deg, color-mix(in srgb, var(--bg) 90%, #2a2420) 0%, var(--bg) 50%);
	}

	.v4-glow {
		background: var(--gradient-hero);
		opacity: 0.1;
		filter: blur(64px);
	}

	:global(.dark) .v4-glow {
		opacity: 0.14;
	}

	.v4-grain {
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
		background-size: 180px 180px;
		mix-blend-mode: multiply;
	}

	:global(.dark) .v4-grain {
		mix-blend-mode: soft-light;
	}

	.v4 main {
		position: relative;
		z-index: 1;
	}

	.v4 :global(*) {
		box-sizing: border-box;
	}

	.v4 :global(a:focus-visible),
	.v4 :global(button:focus-visible) {
		outline: 2px solid var(--brand);
		outline-offset: 3px;
	}

	.v4 h1,
	.v4 h2 {
		margin: 0;
		font-weight: 600;
		letter-spacing: -0.03em;
		line-height: 1.13;
	}

	.v4-in {
		max-width: var(--wrap);
		margin: 0 auto;
		padding: 0 1.5rem;
	}

	.v4-label {
		display: inline-block;
		font-family: var(--mono);
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--accent);
		margin-bottom: 1rem;
	}
	.v4-mono {
		font-family: var(--mono);
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3);
	}

	/* ── Butonlar ── */
	.v4-btn {
		display: inline-block;
		background: var(--accent);
		color: var(--primary-foreground);
		text-decoration: none;
		font-weight: 600;
		font-size: 0.93rem;
		padding: 0.75rem 1.4rem;
		border-radius: 8px;
	}
	.v4-btn:hover {
		filter: brightness(1.08);
	}
	.v4-btn-lg {
		font-size: 1rem;
		padding: 0.9rem 1.9rem;
	}
	.v4-link {
		font-size: 0.93rem;
		color: var(--ink-2);
		text-decoration: none;
	}
	.v4-link:hover {
		color: var(--ink);
	}

	/* ── Hero ── */
	.v4-hero {
		position: relative;
		overflow: hidden;
		border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
	}
	.v4-hero-glow {
		position: absolute;
		top: -30%;
		left: 50%;
		width: 70rem;
		height: 40rem;
		transform: translateX(-50%);
		background: radial-gradient(
			closest-side,
			color-mix(in srgb, var(--brand) 14%, transparent),
			transparent
		);
		pointer-events: none;
	}
	.v4-hero-in {
		position: relative;
		max-width: 52rem;
		margin: 0 auto;
		padding: 7rem 1.5rem 6rem;
		text-align: center;
	}
	.v4-hero h1 {
		font-size: clamp(2.4rem, 5.4vw, 4rem);
	}
	.v4-hero h1 em {
		font-style: normal;
		color: var(--accent-2);
	}
	.v4-hero p {
		margin: 1.6rem auto 0;
		max-width: 40rem;
		font-size: 1.08rem;
		color: var(--ink-2);
	}
	.v4-cta-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		margin-top: 2.25rem;
		flex-wrap: wrap;
	}

	/* ── Bantlar ── */
	.v4-band {
		padding: 5rem 0;
		border-bottom: 1px solid var(--line);
	}
	.v4-tint {
		background: var(--tint);
	}
	.v4-band h2 {
		font-size: clamp(1.65rem, 3vw, 2.3rem);
		max-width: 26ch;
	}
	.v4-lede {
		margin: 0.15rem 0 0;
		font-size: clamp(1.05rem, 1.6vw, 1.2rem);
		line-height: 1.55;
		color: var(--ink-2);
		max-width: 40rem;
	}
	.v4-lede b {
		color: var(--ink);
	}
	.v4-note {
		margin: 1.5rem 0 0;
		font-size: 0.85rem;
		color: var(--ink-3);
		max-width: 44rem;
	}
	.v4-note a {
		color: var(--accent);
		text-decoration: none;
	}

	/* ── Merdiven ── */
	.v4-ladder {
		list-style: none;
		margin: 2.5rem 0 0;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 10px;
		overflow: hidden;
	}
	.v4-step {
		display: grid;
		grid-template-columns: 2rem 1fr;
		align-items: center;
		gap: 0.35rem 1rem;
		padding: 1.1rem 1.25rem;
		border-bottom: 1px solid var(--line-2);
		background: var(--panel);
		opacity: 0.68;
	}
	.v4-step:last-child {
		border-bottom: none;
	}
	.v4-step-no {
		font-family: var(--mono);
		font-size: 0.85rem;
		color: var(--ink-3);
	}
	.v4-step-ad {
		font-weight: 600;
		font-size: 1rem;
		letter-spacing: -0.01em;
	}
	.v4-step-soru {
		grid-column: 2 / -1;
		color: var(--ink-2);
		font-size: 0.95rem;
	}
	.v4-step-kim {
		grid-column: 2 / -1;
		font-family: var(--mono);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.v4-step-on {
		opacity: 1;
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--brand) 12%, var(--panel)),
			var(--panel) 68%
		);
		border-left: 2px solid var(--accent);
	}
	.v4-step-on .v4-step-no,
	.v4-step-on .v4-step-kim {
		color: var(--accent-2);
	}
	.v4-step-on .v4-step-soru {
		color: var(--ink);
	}
	@media (min-width: 880px) {
		.v4-step {
			grid-template-columns: 2.5rem minmax(8rem, 10rem) minmax(0, 1fr) auto;
			align-items: center;
			gap: 0.5rem 1.25rem;
		}
		.v4-step-soru {
			grid-column: auto;
		}
		.v4-step-kim {
			grid-column: auto;
			justify-self: end;
			text-align: right;
		}
	}

	/* ── Ne okuruz ── */
	.v4-reads {
		margin-top: 2.25rem;
		border-top: 1px solid var(--line);
	}
	.v4-read {
		display: grid;
		gap: 0.25rem 1.5rem;
		padding: 0.95rem 0;
		border-bottom: 1px solid var(--line-2);
	}
	@media (min-width: 760px) {
		.v4-read {
			grid-template-columns: 12rem 1fr;
			align-items: baseline;
		}
	}
	.v4-read-k {
		font-family: var(--mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent-2);
	}
	.v4-read-q {
		color: var(--ink-2);
		font-size: 0.98rem;
	}

	/* ── İki sütun ── */
	.v4-two {
		display: grid;
		gap: 3rem;
		align-items: center;
	}
	@media (min-width: 960px) {
		.v4-two {
			grid-template-columns: 1fr 1fr;
		}
		.v4-two-rev {
			grid-template-columns: 1.05fr 0.95fr;
		}
	}
	/* Tek sütuna inince başlık kartın üstüne geçsin — masaüstünde kart solda kalır. */
	@media (max-width: 959.98px) {
		.v4-two-rev > .v4-surface {
			order: 2;
		}
	}

	/* ── Yüzey ── */
	.v4-surface {
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 10px;
		overflow: hidden;
		box-shadow: 0 12px 34px -28px color-mix(in srgb, var(--text) 40%, transparent);
	}
	.v4-surface-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.8rem 1rem;
		border-bottom: 1px solid var(--line);
		background: var(--surface-2);
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--ink-2);
	}
	.v4-chip {
		font-family: var(--mono);
		font-size: 0.63rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.12rem 0.5rem;
		font-weight: 500;
		white-space: nowrap;
	}

	/* ── Müdahale listesi ── */
	.v4-actions {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.v4-actions li {
		display: grid;
		grid-template-columns: 1.1rem 1fr auto;
		gap: 0.85rem;
		align-items: start;
		padding: 1rem;
		border-bottom: 1px solid var(--line-2);
	}
	.v4-actions li:last-child {
		border-bottom: none;
	}
	.v4-box {
		margin-top: 0.15rem;
		width: 1.05rem;
		height: 1.05rem;
		border: 1.5px solid var(--ink-3);
		border-radius: 4px;
	}
	.v4-act-body strong {
		display: block;
		font-size: 0.92rem;
		font-weight: 600;
		line-height: 1.35;
	}
	.v4-act-why {
		display: block;
		margin-top: 0.25rem;
		font-size: 0.8rem;
		color: var(--ink-3);
	}
	.v4-act-meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.3rem;
		white-space: nowrap;
	}
	.v4-owner {
		font-size: 0.75rem;
		color: var(--accent-2);
		border: 1px solid color-mix(in srgb, var(--brand) 30%, transparent);
		background: color-mix(in srgb, var(--brand) 8%, transparent);
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
	}
	.v4-date {
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--ink-3);
	}

	/* ── Döngü ── */
	.v4-cycle {
		list-style: none;
		margin: 2.5rem 0 0;
		padding: 0;
		display: grid;
		gap: 1px;
		background: var(--line);
		border: 1px solid var(--line);
		border-radius: 12px;
		overflow: hidden;
	}
	@media (min-width: 900px) {
		.v4-cycle {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.v4-cycle li {
		background: var(--panel);
		padding: 1.35rem;
	}
	.v4-cycle li:last-child {
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--brand) 10%, var(--panel)),
			var(--panel)
		);
	}
	.v4-cycle strong {
		display: block;
		margin: 0.9rem 0 0.4rem;
		font-size: 1.05rem;
		letter-spacing: -0.02em;
	}
	.v4-cycle-not {
		display: block;
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--ink-2);
	}
	.v4-cycle-ornek {
		display: block;
		margin-top: 0.65rem;
		font-family: var(--mono);
		font-size: 0.72rem;
		letter-spacing: 0.02em;
		line-height: 1.45;
		color: var(--ink-3);
	}

	/* ── Onay kuyruğu ── */
	.v4-q-item {
		padding: 1.1rem 1rem;
		border-bottom: 1px solid var(--line-2);
	}
	.v4-q-item:last-child {
		border-bottom: none;
	}
	.v4-q-muted {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		background: var(--surface-2);
	}
	.v4-q-who {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.v4-diff {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin: 0.7rem 0;
		font-size: 1rem;
	}
	.v4-old {
		color: var(--ink-3);
		text-decoration: line-through;
	}
	.v4-arrow {
		color: var(--accent);
	}
	.v4-new {
		font-weight: 600;
		color: var(--accent-2);
	}
	.v4-src {
		margin: 0;
		font-size: 0.82rem;
		color: var(--ink-2);
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 0.7rem 0.85rem;
	}
	.v4-src span {
		display: block;
		margin-top: 0.3rem;
		font-size: 0.74rem;
		color: var(--ink-3);
	}
	.v4-q-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.9rem;
	}
	.v4-fake {
		flex: 1;
		text-align: center;
		font-size: 0.85rem;
		font-weight: 500;
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 7px;
		color: var(--ink-2);
	}
	.v4-fake-primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--primary-foreground);
		font-weight: 600;
	}

	/* ── Ortalanmış kanıt ── */
	.v4-center {
		padding: 6rem 1.5rem;
		border-bottom: 1px solid var(--line);
		background: radial-gradient(
			ellipse 60% 60% at 50% 0%,
			color-mix(in srgb, var(--brand) 7%, transparent),
			transparent
		);
	}
	.v4-center-in {
		max-width: 42rem;
		margin: 0 auto;
		text-align: center;
	}
	.v4-center h2 {
		font-size: clamp(1.7rem, 3.4vw, 2.5rem);
		margin: 0 auto;
	}
	.v4-center p {
		margin: 1.2rem auto 0;
		color: var(--ink-2);
	}
	.v4-pledge {
		margin-top: 2rem !important;
		padding-top: 1.5rem;
		border-top: 1px solid var(--line);
		color: var(--ink) !important;
		font-size: 1.08rem;
		font-weight: 500;
		letter-spacing: -0.015em;
	}

	/* ── Güven ── */
	.v4-grid4 {
		display: grid;
		gap: 1rem;
		margin-top: 2.25rem;
	}
	@media (min-width: 760px) {
		.v4-grid4 {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (min-width: 1060px) {
		.v4-grid4 {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.v4-grid4 article {
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 1.35rem;
		box-shadow: 0 10px 28px -26px color-mix(in srgb, var(--text) 35%, transparent);
	}
	.v4-grid4 p {
		margin: 0.9rem 0 0;
		font-size: 0.87rem;
		color: var(--ink-2);
	}

	/* ── Kimin için ── */
	.v4-aud {
		display: grid;
		gap: 1rem;
	}
	@media (min-width: 960px) {
		.v4-aud {
			grid-template-columns: 1.6fr 0.9fr;
		}
	}
	.v4-aud-main {
		border: 1px solid color-mix(in srgb, var(--brand) 28%, var(--border));
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--brand) 9%, var(--surface)),
			var(--surface) 65%
		);
		border-radius: 10px;
		padding: 2.25rem;
	}
	.v4-aud-main p {
		margin: 1.15rem 0 0;
		color: var(--ink-2);
		max-width: 36rem;
	}
	.v4-aud aside {
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface);
		padding: 2.25rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
	.v4-aud aside p {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.95rem;
	}

	/* ── Kapanış ── */
	.v4-closing {
		padding: 6.5rem 1.5rem;
		text-align: center;
		background: radial-gradient(
			ellipse 55% 80% at 50% 100%,
			color-mix(in srgb, var(--brand) 15%, transparent),
			transparent
		);
	}
	.v4-closing-in {
		max-width: 40rem;
		margin: 0 auto;
	}
	.v4-closing h2 {
		font-size: clamp(1.9rem, 3.8vw, 2.8rem);
	}
	.v4-closing p {
		margin: 1.3rem auto 2.2rem;
		color: var(--ink-2);
		max-width: 34rem;
	}
	.v4-closing-mail {
		margin: 1.2rem auto 0 !important;
		font-size: 0.82rem;
		color: var(--ink-3) !important;
	}

	.v4 footer ul a {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-decoration: none;
		transition: color 150ms ease;
	}

	.v4 footer ul a:hover {
		color: var(--text);
	}

	@media (max-width: 480px) {
		.v4-hero-in {
			padding-top: 5rem;
			padding-bottom: 4.5rem;
		}

		.v4-band {
			padding: 4rem 0;
		}

		.v4-actions li {
			grid-template-columns: 1.1rem 1fr;
		}

		.v4-act-meta {
			grid-column: 2;
			align-items: flex-start;
			flex-direction: row;
		}

		.v4-aud-main,
		.v4-aud aside {
			padding: 1.5rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.v4 *,
		.v4 *::before,
		.v4 *::after {
			scroll-behavior: auto !important;
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
		}
	}
</style>
