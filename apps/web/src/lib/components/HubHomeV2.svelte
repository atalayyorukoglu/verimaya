<script lang="ts">
	import { PUBLIC_APP_URL } from '$lib/env';

	const appLoginUrl = `${PUBLIC_APP_URL}/login`;

	/** TODO(Atalay): gerçek adresle değiştir */
	const contactEmail = 'info@verimaya.com';

	const cohorts = [
		{
			ay: 'Ocak',
			harcama: '100.000',
			a1: '18.400',
			a3: '146.200',
			a6: '288.900',
			a9: '341.500',
			durum: 'olgun'
		},
		{
			ay: 'Şubat',
			harcama: '120.000',
			a1: '22.100',
			a3: '161.800',
			a6: '309.400',
			a9: '—',
			durum: '6. ayında'
		},
		{
			ay: 'Mart',
			harcama: '90.000',
			a1: '14.700',
			a3: '118.300',
			a6: '—',
			a9: '—',
			durum: '3. ayında'
		},
		{ ay: 'Nisan', harcama: '140.000', a1: '31.200', a3: '—', a6: '—', a9: '—', durum: '1. ayında' }
	] as const;
</script>

<svelte:head>
	<title>Verimaya — Reklamdan tahsilata tek hesap</title>
	<meta
		name="description"
		content="Sağlık turizmi acenteleri için reklam harcamasından tahsilata kadar tek hesap. İlk bulgu raporu kendi verinizden çıkar."
	/>
</svelte:head>

<div class="v2">
	<header class="v2-nav">
		<a href="/" class="v2-brand">Verimaya</a>
		<nav>
			<a href="#kohort">Kohort</a>
			<a href="#nasil">Nasıl çalışır</a>
			<a href="#gorusme" class="v2-nav-cta">İlk bulgu raporu</a>
			<a href={appLoginUrl} class="v2-nav-login">Giriş</a>
		</nav>
	</header>

	<main>
		<!-- ── Hero ─────────────────────────────────────────── -->
		<section class="v2-hero">
			<div class="v2-hero-copy">
				<p class="v2-kicker">Sağlık turizmi acenteleri için</p>
				<h1>Reklam bütçenizin kaç lirası kasaya döndü?</h1>
				<p class="v2-lede">
					Lead saymıyoruz. Reklam harcamasından hasta dosyasına ve tahsilata kadar
					<em>tek hesap</em> tutuyoruz — ve ilk raporu sizin verinizden çıkarıyoruz.
				</p>
				<div class="v2-actions">
					<a class="v2-btn" href="#gorusme">İlk bulgu raporunu isteyin</a>
					<a class="v2-quiet" href="#nasil">Nasıl çalışır ↓</a>
				</div>
			</div>

			<figure class="v2-report" aria-label="Temsilî ilk bulgu raporu">
				<figcaption>
					<span>İlk Bulgu Raporu</span>
					<span class="v2-tag">temsilî örnek</span>
				</figcaption>
				<dl>
					<div>
						<dt>Çift kayıt</dt>
						<dd>214</dd>
					</div>
					<div>
						<dt>30+ gün temassız hasta</dt>
						<dd>38</dd>
					</div>
					<div>
						<dt>Tahsil edilmemiş bakiye</dt>
						<dd>₺612.400</dd>
					</div>
				</dl>
				<p class="v2-report-note">
					Üç sayı da mevcut sisteminizdeki veriden çıkar. Kurulum değil, teşhis — bilmediğiniz bir
					sayı çıkmazsa konuyu kapatırız.
				</p>
			</figure>
		</section>

		<!-- ── Kohort ───────────────────────────────────────── -->
		<section id="kohort" class="v2-section">
			<h2>Ocak reklamının hastası Ağustos'ta öder.<br />Aylık tablo bunu göremez.</h2>
			<p class="v2-prose">
				Reklamı kestiğiniz ay kâr "artar" — gider durur, eski hastalar ödemeye devam eder. Aylık
				kâr-zarar tablosu size yanlış sinyal verir. Kohort tablosu her lirayı, lead'in geldiği aya
				yazar; reklamın gerçekten kazandırıp kazandırmadığı ancak böyle görünür.
			</p>
			<div class="v2-table-wrap">
				<table>
					<caption>Kohort tablosu — temsilî veri (₺)</caption>
					<thead>
						<tr>
							<th>Kohort</th>
							<th>Harcama</th>
							<th>1. ay</th>
							<th>3. ay</th>
							<th>6. ay</th>
							<th>9. ay</th>
							<th>Durum</th>
						</tr>
					</thead>
					<tbody>
						{#each cohorts as c (c.ay)}
							<tr>
								<th>{c.ay}</th>
								<td>{c.harcama}</td>
								<td>{c.a1}</td>
								<td>{c.a3}</td>
								<td>{c.a6}</td>
								<td>{c.a9}</td>
								<td class="v2-durum">{c.durum}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="v2-footnote">Boş hücre eksik veri değil, henüz gelmemiş zamandır.</p>
		</section>

		<!-- ── Nasıl çalışır ────────────────────────────────── -->
		<section id="nasil" class="v2-section v2-alt">
			<h2>Rapor vermiyoruz.<br />Teşhis koyup müdahale ediyoruz.</h2>
			<ol class="v2-chain">
				<li>
					<strong>Ölç</strong>
					<span>
						Reklamdan tahsilata her halka tek hesapta: kampanya, temsilci, hekim, hatırlatma —
						hepsinin bir sayısı olur.
					</span>
				</li>
				<li>
					<strong>Teşhis koy</strong>
					<span>
						Hasta gelmiyorsa nedeni isim isim çıkar: hangi kampanya boş lead getiriyor, kim geç
						dönüyor, hangi tedavi planı tutmuyor.
					</span>
				</li>
				<li>
					<strong>Müdahale et</strong>
					<span>
						Her ay birlikte karar veririz: bütçe nereye kayacak, kim aranacak, ne durdurulacak.
					</span>
				</li>
				<li>
					<strong>Tekrar ölç</strong>
					<span>
						Ertesi ay aynı sayılara bakılır: müdahale işe yaradı mı? Döngü her ay yeniden kapanır.
					</span>
				</li>
			</ol>
			<p class="v2-prose">
				Kurulumu, veri göçünü ve doğrulamayı biz yaparız. Sonuç: her halkanın bir sayısı, her
				sayının bir sorumlusu, her ayın bir müdahale listesi olur. Yazılım satın almazsınız — hesabı
				tutulan ve yönetilen bir büyüme hizmeti alırsınız.
			</p>
		</section>

		<!-- ── Güven ────────────────────────────────────────── -->
		<section class="v2-section">
			<h2>Veriniz kimseyle komşu değil</h2>
			<p class="v2-prose">
				Her acentenin verisi ayrı tutulur; izolasyon sözleşmede yazılıdır ve denetime açıktır. Hasta
				verisi yalnız sözleşme ve aydınlatma zemini kurulduktan sonra işlenir — rapor önce, veri
				sonra değil; sözleşme önce, veri sonra.
				<a href="/kvkk-aydinlatma/">KVKK aydınlatma metni</a>.
			</p>
		</section>

		<!-- ── Kapanış ──────────────────────────────────────── -->
		<section id="gorusme" class="v2-closing">
			<h2>Anlatmayalım, gösterelim.</h2>
			<p>
				30 dakikalık bir görüşme planlayalım. Uygunsa sözleşmeyle veri alır, ilk bulgu raporunuzu
				çıkarırız. Bilmediğiniz bir sayı çıkmazsa konuyu kapatırız.
			</p>
			<a class="v2-btn v2-btn-lg" href={`mailto:${contactEmail}?subject=İlk bulgu raporu`}>
				Görüşme isteyin — {contactEmail}
			</a>
		</section>
	</main>

	<footer class="v2-footer">
		<span>© {new Date().getFullYear()} Verimaya</span>
		<a href="/kvkk-aydinlatma/">KVKK</a>
	</footer>
</div>

<style>
	.v2 {
		--paper: #faf7f2;
		--panel: #ffffff;
		--ink: #17201c;
		--ink-2: #4c5a53;
		--ink-3: #8a958f;
		--line: #e3ddd2;
		--green: #175c43;
		--green-hover: #114835;
		--green-soft: #eef3ee;
		--serif: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
		--sans: system-ui, -apple-system, 'Segoe UI', sans-serif;

		background: var(--paper);
		color: var(--ink);
		font-family: var(--sans);
		line-height: 1.6;
		-webkit-font-smoothing: antialiased;
	}

	.v2 :global(*) {
		box-sizing: border-box;
	}

	/* ── Nav ── */
	.v2-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		max-width: 68rem;
		margin: 0 auto;
		padding: 1.25rem 1.5rem;
	}
	.v2-brand {
		font-family: var(--serif);
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--ink);
		text-decoration: none;
		letter-spacing: -0.01em;
	}
	.v2-nav nav {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		font-size: 0.9rem;
	}
	.v2-nav nav a {
		color: var(--ink-2);
		text-decoration: none;
	}
	.v2-nav nav a:hover {
		color: var(--ink);
	}
	.v2-nav-cta {
		color: var(--green) !important;
		font-weight: 600;
	}
	.v2-nav-login {
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.4rem 1rem;
	}
	@media (max-width: 640px) {
		.v2-nav nav a:not(.v2-nav-login):not(.v2-nav-cta) {
			display: none;
		}
	}

	/* ── Hero ── */
	.v2-hero {
		display: grid;
		gap: 3rem;
		max-width: 68rem;
		margin: 0 auto;
		padding: 4rem 1.5rem 5rem;
		align-items: center;
	}
	@media (min-width: 900px) {
		.v2-hero {
			grid-template-columns: 1.1fr 0.9fr;
		}
	}
	.v2-kicker {
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--green);
		margin: 0 0 1rem;
	}
	.v2-hero h1 {
		font-family: var(--serif);
		font-size: clamp(2.2rem, 5vw, 3.6rem);
		line-height: 1.08;
		letter-spacing: -0.015em;
		margin: 0;
		font-weight: 600;
	}
	.v2-lede {
		font-size: 1.1rem;
		color: var(--ink-2);
		max-width: 34rem;
		margin: 1.5rem 0 0;
	}
	.v2-lede em {
		font-style: normal;
		border-bottom: 2px solid var(--green);
	}
	.v2-actions {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		margin-top: 2rem;
		flex-wrap: wrap;
	}
	.v2-btn {
		display: inline-block;
		background: var(--green);
		color: #fff;
		text-decoration: none;
		font-weight: 600;
		font-size: 0.95rem;
		padding: 0.8rem 1.5rem;
		border-radius: 6px;
	}
	.v2-btn:hover {
		background: var(--green-hover);
	}
	.v2-btn-lg {
		font-size: 1.05rem;
		padding: 1rem 2rem;
	}
	.v2-quiet {
		color: var(--ink-2);
		text-decoration: none;
		font-size: 0.95rem;
	}
	.v2-quiet:hover {
		color: var(--ink);
	}

	/* ── Rapor kartı ── */
	.v2-report {
		margin: 0;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 1.75rem;
		box-shadow:
			0 1px 2px rgba(23, 32, 28, 0.05),
			0 12px 32px -16px rgba(23, 32, 28, 0.18);
	}
	.v2-report figcaption {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.85rem;
		font-weight: 600;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--line);
	}
	.v2-tag {
		font-weight: 500;
		font-size: 0.75rem;
		color: var(--ink-3);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
	}
	.v2-report dl {
		margin: 0;
		display: grid;
		gap: 1.1rem;
		padding: 1.25rem 0;
	}
	.v2-report dl div {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
	}
	.v2-report dt {
		color: var(--ink-2);
		font-size: 0.95rem;
	}
	.v2-report dd {
		margin: 0;
		font-family: var(--serif);
		font-size: 1.9rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--green);
	}
	.v2-report-note {
		margin: 0;
		padding-top: 1rem;
		border-top: 1px solid var(--line);
		font-size: 0.85rem;
		color: var(--ink-2);
	}

	/* ── Bölümler ── */
	.v2-section {
		max-width: 68rem;
		margin: 0 auto;
		padding: 4.5rem 1.5rem;
		border-top: 1px solid var(--line);
	}
	.v2-section h2,
	.v2-closing h2 {
		font-family: var(--serif);
		font-size: clamp(1.6rem, 3.2vw, 2.3rem);
		line-height: 1.2;
		letter-spacing: -0.01em;
		margin: 0 0 1.25rem;
		font-weight: 600;
		max-width: 38rem;
	}
	.v2-prose {
		max-width: 40rem;
		color: var(--ink-2);
		margin: 0;
	}
	.v2-prose a {
		color: var(--green);
	}
	.v2-alt {
		background: var(--green-soft);
		max-width: none;
		border-top: none;
	}
	.v2-alt > * {
		max-width: 68rem;
		margin-left: auto;
		margin-right: auto;
	}
	.v2-alt .v2-prose {
		margin-top: 2rem;
		max-width: 40rem;
		margin-left: 0;
	}

	/* ── Kohort tablosu ── */
	.v2-table-wrap {
		margin-top: 2.25rem;
		overflow-x: auto;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 10px;
	}
	.v2 table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.92rem;
		font-variant-numeric: tabular-nums;
		min-width: 40rem;
	}
	.v2 caption {
		text-align: left;
		font-size: 0.8rem;
		color: var(--ink-3);
		padding: 0.9rem 1.25rem 0;
	}
	.v2 th,
	.v2 td {
		text-align: right;
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid var(--line);
	}
	.v2 thead th {
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ink-3);
		font-weight: 600;
	}
	.v2 tbody th {
		text-align: left;
		font-weight: 600;
	}
	.v2 tbody tr:last-child th,
	.v2 tbody tr:last-child td {
		border-bottom: none;
	}
	.v2-durum {
		color: var(--ink-3);
		font-size: 0.85rem;
	}
	.v2-footnote {
		margin: 1rem 0 0;
		font-size: 0.85rem;
		color: var(--ink-3);
	}

	/* ── Zincir ── */
	.v2-chain {
		list-style: none;
		counter-reset: adim;
		margin: 2.25rem auto 0;
		padding: 0;
		display: grid;
		gap: 1rem;
	}
	@media (min-width: 900px) {
		.v2-chain {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.v2-chain li {
		counter-increment: adim;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 1.25rem;
	}
	.v2-chain li::before {
		content: counter(adim, decimal-leading-zero);
		font-family: var(--serif);
		font-size: 0.85rem;
		color: var(--green);
		display: block;
		margin-bottom: 0.75rem;
	}
	.v2-chain strong {
		display: block;
		margin-bottom: 0.35rem;
	}
	.v2-chain span {
		font-size: 0.9rem;
		color: var(--ink-2);
	}

	/* ── Kapanış ── */
	.v2-closing {
		max-width: 44rem;
		margin: 0 auto;
		padding: 5rem 1.5rem 6rem;
		text-align: center;
		border-top: 1px solid var(--line);
	}
	.v2-closing h2 {
		margin-left: auto;
		margin-right: auto;
	}
	.v2-closing p {
		color: var(--ink-2);
		max-width: 36rem;
		margin: 0 auto 2rem;
	}

	/* ── Footer ── */
	.v2-footer {
		display: flex;
		justify-content: space-between;
		max-width: 68rem;
		margin: 0 auto;
		padding: 1.5rem;
		border-top: 1px solid var(--line);
		font-size: 0.85rem;
		color: var(--ink-3);
	}
	.v2-footer a {
		color: var(--ink-3);
	}
</style>
