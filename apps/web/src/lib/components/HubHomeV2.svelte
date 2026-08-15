<script lang="ts">
	import { PUBLIC_APP_URL } from '$lib/env';

	const appLoginUrl = `${PUBLIC_APP_URL}/login`;

	/** TODO(Atalay): gerçek adresle değiştir */
	const contactEmail = 'info@verimaya.com';
	const mailto = `mailto:${contactEmail}?subject=İlk bulgu raporu görüşmesi`;

	const questions = [
		{
			q: 'Geçen ay reklama verdiğiniz paranın kaçı tahsil edilmiş hastaya döndü?',
			a: 'Çoğu sistem lead sayısında durur.'
		},
		{
			q: 'Kaç lead’inize hiç dönülmedi?',
			a: 'Listede duran lead ile takip edilen lead aynı şey değildir.'
		},
		{
			q: 'Klinik başına hakedişiniz ne kadar, nerede yazıyor?',
			a: 'Çoğu acente bu tabloyu hâlâ elle tutar.'
		}
	] as const;

	const chain = [
		{ ad: 'Reklam', not: 'Harcama Google ve Meta’dan okunur' },
		{ ad: 'Lead', not: 'Her lead bir sahibe düşer' },
		{ ad: 'Hasta', not: 'Dosya, randevu, süreç tek yerde' },
		{ ad: 'Tahsilat', not: 'Kasaya giren para kayda girer' },
		{ ad: 'Hakediş', not: 'Klinik başına alacak görünür' },
		{ ad: 'Teşvik', not: 'Dosya ve süre takipte kalır' }
	] as const;

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

	const cycle = [
		{
			ad: 'Ölç',
			not: 'Reklamdan tahsilata her halka tek hesapta: kampanya, temsilci, hekim, hatırlatma — hepsinin bir sayısı olur.'
		},
		{
			ad: 'Teşhis koy',
			not: 'Hasta gelmiyorsa nedeni isim isim çıkar: hangi kampanya boş lead getiriyor, kim geç dönüyor, hangi tedavi planı tutmuyor.'
		},
		{
			ad: 'Müdahale et',
			not: 'Her ay birlikte karar veririz: bütçe nereye kayacak, kim aranacak, ne durdurulacak.'
		},
		{
			ad: 'Tekrar ölç',
			not: 'Ertesi ay aynı sayılara bakılır: müdahale işe yaradı mı? Döngü her ay yeniden kapanır.'
		}
	] as const;

	const privacy = [
		'Her acentenin verisi ayrı tutulur. İzolasyon sözleşmede yazılıdır, denetime açıktır.',
		'Verileriniz yapay zekâ modeli eğitmek için kullanılmaz — ne bizim tarafımızdan, ne kullandığımız sağlayıcılar tarafından. Hangi sağlayıcıları kullandığımız sözleşmede yazılıdır.',
		'Kurucunun sağlık turizmi işletmesi var. Bu yüzden veri izolasyonu sözleşmede ayrıca yazılıdır ve denetlenebilir.'
	] as const;
</script>

<svelte:head>
	<title>Verimaya — Reklamdan tahsilata tek hesap</title>
	<meta
		name="description"
		content="Sağlık turizmi acenteleri için reklam harcamasından tahsilata ve hakedişe kadar tek hesap. İlk bulgu raporu kendi verinizden çıkar."
	/>
</svelte:head>

<div class="v2">
	<header class="v2-nav">
		<a href="/" class="v2-brand">Verimaya</a>
		<nav>
			<a href="#zincir">Para zinciri</a>
			<a href="#kohort">Kohort</a>
			<a href="#nasil">Nasıl çalışır</a>
			<a href="#gorusme" class="v2-nav-cta">İlk bulgu raporu</a>
			<a href={appLoginUrl} class="v2-nav-login">Giriş</a>
		</nav>
	</header>

	<main>
		<!-- ── 1. Hero ───────────────────────────────────────── -->
		<section class="v2-hero">
			<div>
				<p class="v2-kicker">Sağlık turizmi acenteleri için</p>
				<h1>Reklam bütçenizin kaç lirası kasaya döndü?</h1>
				<p class="v2-lede">
					Lead saymıyoruz. Reklam harcamasından hasta dosyasına, tahsilata ve hakedişe kadar
					<em>tek hesap</em> tutuyoruz — ve ilk raporu sizin verinizden çıkarıyoruz.
				</p>
				<div class="v2-actions">
					<a class="v2-btn" href="#gorusme">İlk bulgu raporu için görüşme isteyin</a>
					<a class="v2-quiet" href="#nasil">Nasıl çalışıyor? ↓</a>
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
					Üç sayı da mevcut sisteminizdeki veriden çıkar. Kurulum değil, teşhis.
				</p>
			</figure>
		</section>

		<!-- ── 2. Üç soru ────────────────────────────────────── -->
		<section class="v2-section">
			<h2>Bugün kullandığınız sistem bu üçüne cevap veriyor mu?</h2>
			<div class="v2-cards">
				{#each questions as item, i (item.q)}
					<article>
						<span class="v2-num">0{i + 1}</span>
						<h3>{item.q}</h3>
						<p>{item.a}</p>
					</article>
				{/each}
			</div>
			<p class="v2-footnote">
				Üçü de tek hesabın parçası. Cevabınız yoksa yalnız değilsiniz — sektörün büyük kısmı lead
				sayıyor, para saymıyor.
			</p>
		</section>

		<!-- ── 3. Para zinciri ───────────────────────────────── -->
		<section id="zincir" class="v2-section">
			<h2>Kurduğumuz şeyin adı: para zinciri.</h2>
			<p class="v2-prose">
				Reklama giren para ile kasaya giren parayı aynı kayıtta birleştiririz. Zincirin her
				halkasının bir sayısı, her sayının bir sorumlusu olur.
			</p>

			<ol class="v2-chain">
				{#each chain as halka, i (halka.ad)}
					<li>
						<span class="v2-chain-no">{i + 1}</span>
						<strong>{halka.ad}</strong>
						<span class="v2-chain-note">{halka.not}</span>
					</li>
				{/each}
			</ol>

			<div class="v2-notes">
				<p>
					Reklam ve satış tarafı <b>[1] Maya Satış</b>, operasyon tarafı
					<b>[2] Maya Operasyon</b> üzerinde yürür. İki ayrı ürün değil — aynı zincirin iki adımı.
				</p>
				<p>Acente komisyon desteği başvuru dosyanız ve süreleriniz takipte olur.</p>
			</div>
		</section>

		<!-- ── 4. İlk bulgu ──────────────────────────────────── -->
		<section class="v2-quiet-section">
			<h2>İlk görüşmenin sonunda bilmediğiniz bir sayı çıkar.</h2>
			<p>
				Mevcut sisteminizden veriyi alır, doğrularız. Doğrulama biter bitmez üç şey ortaya çıkar:
				kaç çift kayıt var, kaç hastaya 30 günden uzun süredir dokunulmamış, ne kadar bakiye tahsil
				edilmemiş.
			</p>
			<p>Bunlar zaten sizin verinizde duruyor. Eksik olan, bir yerde toplanmış olması.</p>
			<p class="v2-pledge">Bilmediğiniz bir sayı çıkmazsa konuyu kapatırız.</p>
		</section>

		<!-- ── 5. Kohort ─────────────────────────────────────── -->
		<section id="kohort" class="v2-section">
			<h2>Ocak’ın reklamı Ağustos’ta ödenir.<br />Aylık tablo bunu göremez.</h2>
			<p class="v2-prose">
				Reklamı kestiğiniz ay kâr “artmış” görünür: gider durur, eski hastalar ödemeye devam eder.
				Bu, işi öldüren yanlış sinyaldir. Biz her lirayı, lead’in geldiği aya yazarız — Ocak
				reklamının kazandırıp kazandırmadığı ancak böyle görünür.
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

		<!-- ── 6. Aylık döngü ────────────────────────────────── -->
		<section id="nasil" class="v2-dark">
			<div class="v2-dark-inner">
				<h2>Rapor vermiyoruz.<br />Teşhis koyup müdahale ediyoruz.</h2>
				<ol class="v2-cycle">
					{#each cycle as adim, i (adim.ad)}
						<li>
							<span class="v2-cycle-no">0{i + 1}</span>
							<strong>{adim.ad}</strong>
							<span>{adim.not}</span>
						</li>
					{/each}
				</ol>
				<p class="v2-dark-close">
					Kurulumu, veri göçünü ve doğrulamayı biz yaparız. Sonuç: her halkanın bir sayısı, her
					sayının bir sorumlusu, her ayın bir müdahale listesi olur.
				</p>
			</div>
		</section>

		<!-- ── 7. Onay kuyruğu ───────────────────────────────── -->
		<section class="v2-split">
			<div>
				<h2>Kimse forma veri girmez.<br />Hiçbir şey de kimsenin hafızasında kalmaz.</h2>
				<p class="v2-prose">
					Ekibiniz zaten WhatsApp’ta yazıyor: “Ahmet Bey 12 Eylül’e ertelemek istedi.” Sistem bunu
					okur, değişikliği hazırlar ve önünüze koyar. <em
						>Onaylayana kadar hiçbir kayıt değişmez.</em
					>
				</p>
				<p class="v2-prose">
					Onayladığınız her değişikliğin kaynağı kayıtlıdır: hangi mesaj, kim yazdı, kim onayladı,
					ne zaman.
				</p>
				<p class="v2-footnote">
					Yapay zekâ hasta adına konuşmaz, kaydı kendi başına değiştirmez. Öneri üretir; kararı
					insan verir.
				</p>
			</div>

			<figure class="v2-suggest" aria-label="Temsilî güncelleme önerisi">
				<figcaption>
					<span>Onayınızı bekleyen güncelleme</span>
					<span class="v2-tag">temsilî örnek</span>
				</figcaption>
				<p class="v2-suggest-who">Ahmet Yılmaz — Randevu tarihi</p>
				<p class="v2-suggest-diff">
					<span class="v2-old">5 Eylül 2026</span>
					<span class="v2-arrow">→</span>
					<span class="v2-new">12 Eylül 2026</span>
				</p>
				<p class="v2-suggest-src">
					Kaynak: “Ahmet Bey 12 Eylül’e ertelemek istedi”<br />
					<span>Operasyon grubu · 14:32 · Mehmet</span>
				</p>
				<div class="v2-suggest-actions" aria-hidden="true">
					<span class="v2-fake-btn v2-fake-primary">Kabul</span>
					<span class="v2-fake-btn">Reddet</span>
				</div>
			</figure>
		</section>

		<!-- ── 8. Veri ve KVKK ───────────────────────────────── -->
		<section class="v2-section v2-privacy">
			<h2>Veriniz kimseyle komşu değil.</h2>
			<ul>
				{#each privacy as item (item)}
					<li>{item}</li>
				{/each}
			</ul>
			<p class="v2-footnote">
				<a href="/kvkk-aydinlatma/">KVKK aydınlatma metni</a>
			</p>
		</section>

		<!-- ── 9. Kimin için ─────────────────────────────────── -->
		<section class="v2-audience">
			<article class="v2-primary-aud">
				<p class="v2-kicker">Acenteler için</p>
				<h2>Birden fazla klinik, tek hesap.</h2>
				<p>
					Lead, hasta, tahsilat ve hakediş aynı yerde. Hangi kliniğin kazandırdığı, hangi
					kampanyanın para getirdiği ve kimin ne hak ettiği tek tabloda.
				</p>
			</article>
			<aside>
				<p class="v2-kicker">Klinikler için</p>
				<p>Reklam veren kliniklerden gelen talepleri değerlendiriyoruz.</p>
			</aside>
		</section>

		<!-- ── 10. Kapanış ───────────────────────────────────── -->
		<section id="gorusme" class="v2-closing">
			<h2>Anlatmayalım, gösterelim.</h2>
			<p>
				30 dakikalık bir görüşme yapalım. Uygunsa sözleşmeyle veri alır, ilk bulgu raporunuzu
				çıkarırız. Bilmediğiniz bir sayı çıkmazsa konuyu kapatırız.
			</p>
			<a class="v2-btn v2-btn-lg" href={mailto}>Görüşme isteyin</a>
			<p class="v2-closing-mail">{contactEmail}</p>
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
		--wrap: 68rem;

		background: var(--paper);
		color: var(--ink);
		font-family: var(--sans);
		line-height: 1.6;
		-webkit-font-smoothing: antialiased;
	}

	.v2 :global(*) {
		box-sizing: border-box;
	}

	.v2 h1,
	.v2 h2,
	.v2 h3 {
		font-family: var(--serif);
		font-weight: 600;
		letter-spacing: -0.012em;
		margin: 0;
	}

	/* ── Nav ── */
	.v2-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		max-width: var(--wrap);
		margin: 0 auto;
		padding: 1.25rem 1.5rem;
	}
	.v2-brand {
		font-family: var(--serif);
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--ink);
		text-decoration: none;
	}
	.v2-nav nav {
		display: flex;
		align-items: center;
		gap: 1.4rem;
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
	@media (max-width: 860px) {
		.v2-nav nav a:not(.v2-nav-login):not(.v2-nav-cta) {
			display: none;
		}
	}

	/* ── Ortak ── */
	.v2-section {
		max-width: var(--wrap);
		margin: 0 auto;
		padding: 4.5rem 1.5rem;
		border-top: 1px solid var(--line);
	}
	.v2-section h2 {
		font-size: clamp(1.6rem, 3.2vw, 2.3rem);
		line-height: 1.2;
		max-width: 38rem;
		margin-bottom: 1.25rem;
	}
	.v2-prose {
		max-width: 40rem;
		color: var(--ink-2);
		margin: 0 0 1rem;
	}
	.v2-prose em {
		font-style: normal;
		font-weight: 600;
		color: var(--ink);
	}
	.v2-footnote {
		margin: 1.25rem 0 0;
		font-size: 0.85rem;
		color: var(--ink-3);
		max-width: 40rem;
	}
	.v2-footnote a {
		color: var(--green);
	}
	.v2-kicker {
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--green);
		margin: 0 0 0.9rem;
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
	.v2-tag {
		font-weight: 500;
		font-size: 0.72rem;
		color: var(--ink-3);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
		white-space: nowrap;
	}

	/* ── 1. Hero ── */
	.v2-hero {
		display: grid;
		gap: 3rem;
		max-width: var(--wrap);
		margin: 0 auto;
		padding: 4rem 1.5rem 5rem;
		align-items: center;
	}
	@media (min-width: 900px) {
		.v2-hero {
			grid-template-columns: 1.1fr 0.9fr;
		}
	}
	.v2-hero h1 {
		font-size: clamp(2.2rem, 5vw, 3.6rem);
		line-height: 1.08;
		letter-spacing: -0.02em;
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

	/* Rapor kartı */
	.v2-report,
	.v2-suggest {
		margin: 0;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 1.75rem;
		box-shadow:
			0 1px 2px rgba(23, 32, 28, 0.05),
			0 12px 32px -16px rgba(23, 32, 28, 0.18);
	}
	.v2-report figcaption,
	.v2-suggest figcaption {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		font-size: 0.85rem;
		font-weight: 600;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--line);
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

	/* ── 2. Üç soru ── */
	.v2-cards {
		display: grid;
		gap: 1rem;
		margin-top: 2rem;
	}
	@media (min-width: 860px) {
		.v2-cards {
			grid-template-columns: repeat(3, 1fr);
		}
	}
	.v2-cards article {
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 1.5rem;
	}
	.v2-num {
		font-family: var(--serif);
		font-size: 0.85rem;
		color: var(--green);
	}
	.v2-cards h3 {
		font-size: 1.1rem;
		line-height: 1.35;
		margin: 1.75rem 0 0.6rem;
	}
	.v2-cards p {
		margin: 0;
		font-size: 0.9rem;
		color: var(--ink-2);
	}

	/* ── 3. Para zinciri ── */
	.v2-chain {
		list-style: none;
		margin: 2.25rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.75rem;
	}
	@media (min-width: 900px) {
		.v2-chain {
			grid-template-columns: repeat(6, 1fr);
			gap: 0.5rem;
		}
	}
	.v2-chain li {
		position: relative;
		background: var(--green-soft);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 1rem 0.9rem;
	}
	@media (min-width: 900px) {
		.v2-chain li:not(:last-child)::after {
			content: '→';
			position: absolute;
			top: 50%;
			right: -0.65rem;
			transform: translateY(-50%);
			color: var(--green);
			font-size: 0.85rem;
			z-index: 1;
		}
	}
	.v2-chain-no {
		display: block;
		font-family: var(--serif);
		font-size: 0.78rem;
		color: var(--green);
		margin-bottom: 0.4rem;
	}
	.v2-chain strong {
		display: block;
		font-size: 0.98rem;
	}
	.v2-chain-note {
		display: block;
		margin-top: 0.3rem;
		font-size: 0.8rem;
		line-height: 1.45;
		color: var(--ink-2);
	}
	.v2-notes {
		display: grid;
		gap: 0.75rem;
		margin-top: 1.75rem;
	}
	@media (min-width: 900px) {
		.v2-notes {
			grid-template-columns: 1.4fr 1fr;
		}
	}
	.v2-notes p {
		margin: 0;
		padding: 0.9rem 1rem;
		border-left: 2px solid var(--line);
		font-size: 0.88rem;
		color: var(--ink-2);
	}
	.v2-notes b {
		color: var(--ink);
	}

	/* ── 4. İlk bulgu ── */
	.v2-quiet-section {
		max-width: 40rem;
		margin: 0 auto;
		padding: 5.5rem 1.5rem;
		text-align: center;
		border-top: 1px solid var(--line);
	}
	.v2-quiet-section h2 {
		font-size: clamp(1.7rem, 3.6vw, 2.6rem);
		line-height: 1.18;
		margin-bottom: 1.5rem;
	}
	.v2-quiet-section p {
		color: var(--ink-2);
		margin: 0 0 1rem;
	}
	.v2-pledge {
		margin-top: 2rem !important;
		font-family: var(--serif);
		font-size: 1.15rem;
		color: var(--ink) !important;
		border-top: 1px solid var(--line);
		padding-top: 1.5rem;
	}

	/* ── 5. Kohort tablosu ── */
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
		font-size: 0.76rem;
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

	/* ── 6. Döngü (koyu) ── */
	.v2-dark {
		background: #14201b;
		color: #eef1ee;
		margin-top: 1rem;
	}
	.v2-dark-inner {
		max-width: var(--wrap);
		margin: 0 auto;
		padding: 5rem 1.5rem;
	}
	.v2-dark h2 {
		color: #fff;
		font-size: clamp(1.7rem, 3.4vw, 2.5rem);
		line-height: 1.2;
		max-width: 34rem;
	}
	.v2-cycle {
		list-style: none;
		margin: 2.75rem 0 0;
		padding: 0;
		display: grid;
		gap: 1rem;
	}
	@media (min-width: 900px) {
		.v2-cycle {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.v2-cycle li {
		position: relative;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 10px;
		padding: 1.25rem;
	}
	.v2-cycle li:last-child {
		border-color: rgba(160, 214, 186, 0.4);
	}
	.v2-cycle-no {
		font-family: var(--serif);
		font-size: 0.8rem;
		color: #8fc7ac;
	}
	.v2-cycle strong {
		display: block;
		margin: 0.9rem 0 0.4rem;
		font-size: 1.05rem;
		color: #fff;
	}
	.v2-cycle span:last-child {
		font-size: 0.87rem;
		line-height: 1.5;
		color: #b9c4bd;
	}
	.v2-dark-close {
		margin: 2.5rem 0 0;
		max-width: 42rem;
		color: #b9c4bd;
		font-size: 0.95rem;
	}

	/* ── 7. Onay kuyruğu ── */
	.v2-split {
		display: grid;
		gap: 3rem;
		max-width: var(--wrap);
		margin: 0 auto;
		padding: 5rem 1.5rem;
		align-items: center;
	}
	@media (min-width: 900px) {
		.v2-split {
			grid-template-columns: 1.05fr 0.95fr;
		}
	}
	.v2-split h2 {
		font-size: clamp(1.6rem, 3.2vw, 2.3rem);
		line-height: 1.2;
		margin-bottom: 1.25rem;
	}
	.v2-suggest-who {
		margin: 1.25rem 0 0.75rem;
		font-weight: 600;
		font-size: 0.95rem;
	}
	.v2-suggest-diff {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin: 0 0 1rem;
		font-family: var(--serif);
		font-size: 1.15rem;
	}
	.v2-old {
		color: var(--ink-3);
		text-decoration: line-through;
	}
	.v2-arrow {
		color: var(--green);
	}
	.v2-new {
		color: var(--green);
		font-weight: 600;
	}
	.v2-suggest-src {
		margin: 0;
		padding: 0.85rem 1rem;
		background: var(--green-soft);
		border-radius: 6px;
		font-size: 0.85rem;
		color: var(--ink-2);
	}
	.v2-suggest-src span {
		color: var(--ink-3);
		font-size: 0.8rem;
	}
	.v2-suggest-actions {
		display: flex;
		gap: 0.6rem;
		margin-top: 1.25rem;
	}
	.v2-fake-btn {
		flex: 1;
		text-align: center;
		padding: 0.6rem 1rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		font-size: 0.88rem;
		font-weight: 600;
		color: var(--ink-2);
	}
	.v2-fake-primary {
		background: var(--green);
		border-color: var(--green);
		color: #fff;
	}

	/* ── 8. KVKK ── */
	.v2-privacy ul {
		list-style: none;
		margin: 2rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.75rem;
		max-width: 46rem;
	}
	.v2-privacy li {
		position: relative;
		padding: 1rem 1rem 1rem 2.5rem;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 8px;
		color: var(--ink-2);
		font-size: 0.95rem;
	}
	.v2-privacy li::before {
		content: '✓';
		position: absolute;
		left: 1rem;
		top: 1rem;
		color: var(--green);
		font-weight: 700;
	}

	/* ── 9. Kimin için ── */
	.v2-audience {
		display: grid;
		gap: 1.25rem;
		max-width: var(--wrap);
		margin: 0 auto;
		padding: 4.5rem 1.5rem;
		border-top: 1px solid var(--line);
	}
	@media (min-width: 900px) {
		.v2-audience {
			grid-template-columns: 1.55fr 0.85fr;
			align-items: stretch;
		}
	}
	.v2-primary-aud {
		background: var(--green-soft);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 2.25rem;
	}
	.v2-primary-aud h2 {
		font-size: clamp(1.5rem, 3vw, 2.1rem);
		margin-bottom: 1rem;
	}
	.v2-primary-aud p {
		margin: 0;
		color: var(--ink-2);
		max-width: 34rem;
	}
	.v2-audience aside {
		display: flex;
		flex-direction: column;
		justify-content: center;
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 2.25rem;
	}
	.v2-audience aside p:last-child {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.95rem;
	}

	/* ── 10. Kapanış ── */
	.v2-closing {
		background: var(--green);
		color: #fff;
		text-align: center;
		padding: 5rem 1.5rem;
	}
	.v2-closing h2 {
		font-size: clamp(1.8rem, 3.6vw, 2.6rem);
		color: #fff;
		max-width: 28rem;
		margin: 0 auto 1.25rem;
	}
	.v2-closing p {
		max-width: 34rem;
		margin: 0 auto 2rem;
		color: rgba(255, 255, 255, 0.85);
	}
	.v2-closing .v2-btn {
		background: #fff;
		color: var(--green);
	}
	.v2-closing .v2-btn:hover {
		background: #eef3ee;
	}
	.v2-closing-mail {
		margin: 1.25rem auto 0 !important;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.7) !important;
	}

	/* ── Footer ── */
	.v2-footer {
		display: flex;
		justify-content: space-between;
		max-width: var(--wrap);
		margin: 0 auto;
		padding: 1.5rem;
		font-size: 0.85rem;
		color: var(--ink-3);
	}
	.v2-footer a {
		color: var(--ink-3);
	}
</style>
