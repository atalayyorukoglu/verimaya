<script lang="ts">
	import { PUBLIC_APP_URL } from '$lib/env';

	const appLoginUrl = `${PUBLIC_APP_URL}/login`;

	const contactEmail = 'destek@verimaya.com';
	const mailto = `mailto:${contactEmail}?subject=İlk bulgu raporu görüşmesi`;

	const questions = [
		{
			no: '01',
			q: 'Geçen ay reklama verdiğiniz paranın kaçı tahsil edilmiş hastaya döndü?',
			a: 'Çoğu sistem lead sayısında durur.'
		},
		{
			no: '02',
			q: 'Kaç lead’inize hiç dönülmedi?',
			a: 'Listede duran lead ile takip edilen lead aynı şey değildir.'
		},
		{
			no: '03',
			q: 'İş ortağı başına hakediş ne kadar, nerede yazıyor?',
			a: 'Bu tabloyu çoğu firma hâlâ elle tutar.'
		}
	] as const;

	const chain = [
		{ ad: 'Reklam', not: 'Harcama Google ve Meta’dan okunur' },
		{ ad: 'Lead', not: 'Her lead bir sahibe düşer' },
		{ ad: 'Hasta', not: 'Dosya, randevu, süreç tek yerde' },
		{ ad: 'Tahsilat', not: 'Kasaya giren para kayda girer' },
		{ ad: 'Hakediş', not: 'İş ortağı başına alacak görünür' },
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
			durum: 'olgun',
			tone: 'ok'
		},
		{
			ay: 'Şubat',
			harcama: '120.000',
			a1: '22.100',
			a3: '161.800',
			a6: '309.400',
			a9: '—',
			durum: '6. ayında',
			tone: 'mid'
		},
		{
			ay: 'Mart',
			harcama: '90.000',
			a1: '14.700',
			a3: '118.300',
			a6: '—',
			a9: '—',
			durum: '3. ayında',
			tone: 'mid'
		},
		{
			ay: 'Nisan',
			harcama: '140.000',
			a1: '31.200',
			a3: '—',
			a6: '—',
			a9: '—',
			durum: '1. ayında',
			tone: 'new'
		}
	] as const;

	const cycle = [
		{
			no: '01',
			ad: 'Ölç',
			not: 'Reklamdan tahsilata her halka tek hesapta: kampanya, temsilci, hekim, hatırlatma — hepsinin bir sayısı olur.'
		},
		{
			no: '02',
			ad: 'Teşhis koy',
			not: 'Hasta gelmiyorsa nedeni isim isim çıkar: hangi kampanya boş lead getiriyor, kim geç dönüyor, hangi tedavi planı tutmuyor.'
		},
		{
			no: '03',
			ad: 'Müdahale et',
			not: 'Her ay birlikte karar veririz: bütçe nereye kayacak, kim aranacak, ne durdurulacak.'
		},
		{
			no: '04',
			ad: 'Tekrar ölç',
			not: 'Ertesi ay aynı sayılara bakılır: müdahale işe yaradı mı? Döngü her ay yeniden kapanır.'
		}
	] as const;

	const privacy = [
		{
			b: 'İzolasyon',
			t: 'Her firmanın verisi ayrı tutulur. İzolasyon sözleşmede yazılıdır, denetime açıktır.'
		},
		{
			b: 'Model eğitimi',
			t: 'Verileriniz yapay zekâ modeli eğitmek için kullanılmaz — ne bizim tarafımızdan, ne kullandığımız sağlayıcılar tarafından. Hangi sağlayıcıları kullandığımız sözleşmede yazılıdır.'
		},
		{
			b: 'Şeffaflık',
			t: 'Aynı sektörde birden fazla firmayla çalışıyoruz — bunu siz sormadan söylüyoruz. Destek için verinize erişirsek bu sizin denetim kaydınıza düşer; sessiz erişim yok.'
		}
	] as const;

	/** Hero mini grafik — temsilî kohort eğrisi (yükseklik %) */
	const spark = [14, 26, 38, 47, 58, 66, 71, 78, 83, 86, 88, 90];
</script>

<svelte:head>
	<title>Verimaya — Reklamdan tahsilata tek hesap</title>
	<meta
		name="description"
		content="Sağlık turizmi operasyonları için reklam harcamasından tahsilata ve hakedişe kadar tek hesap. İlk bulgu raporu kendi verinizden çıkar."
	/>
</svelte:head>

<div class="v3">
	<header class="v3-nav">
		<div class="v3-nav-in">
			<a href="/" class="v3-brand">
				<span class="v3-dot"></span>
				Verimaya
			</a>
			<nav>
				<a href="#zincir">Para zinciri</a>
				<a href="#kohort">Kohort</a>
				<a href="#nasil">Nasıl çalışır</a>
				<a href="#guven">Veri</a>
			</nav>
			<div class="v3-nav-right">
				<a href={appLoginUrl} class="v3-ghost">Giriş</a>
				<a href="#gorusme" class="v3-pill">Görüşme isteyin</a>
			</div>
		</div>
	</header>

	<main>
		<!-- ── 1. Hero ───────────────────────────────────────── -->
		<section class="v3-hero">
			<div class="v3-hero-bg" aria-hidden="true"></div>
			<div class="v3-hero-in">
				<div class="v3-hero-copy">
					<span class="v3-label">Sağlık turizmi operasyonları için</span>
					<h1>Reklam bütçenizin kaç lirası kasaya döndü?</h1>
					<p>
						Lead saymıyoruz. Reklam harcamasından hasta dosyasına, tahsilata ve hakedişe kadar tek
						hesap tutuyoruz — ve ilk raporu sizin verinizden çıkarıyoruz.
					</p>
					<div class="v3-cta-row">
						<a class="v3-btn" href="#gorusme">İlk bulgu raporu için görüşme</a>
						<a class="v3-link" href="#nasil">Nasıl çalışır →</a>
					</div>
				</div>

				<!-- Ürün yüzeyi: rapor -->
				<div class="v3-surface v3-surface-hero">
					<div class="v3-surface-bar">
						<span class="v3-surface-title">İlk Bulgu Raporu</span>
						<span class="v3-chip">temsilî</span>
					</div>
					<div class="v3-metrics">
						<div>
							<span class="v3-metric-k">Çift kayıt</span>
							<span class="v3-metric-v">214</span>
						</div>
						<div>
							<span class="v3-metric-k">30+ gün temassız</span>
							<span class="v3-metric-v">38</span>
							<span class="v3-badge v3-badge-risk">risk</span>
						</div>
						<div>
							<span class="v3-metric-k">Açık bakiye</span>
							<span class="v3-metric-v">₺612.400</span>
						</div>
					</div>
					<div class="v3-spark">
						<span class="v3-spark-k">Ocak kohortu — tahsilat birikimi</span>
						<div class="v3-spark-bars" aria-hidden="true">
							{#each spark as h, i (i)}
								<span style:height={`${h}%`}></span>
							{/each}
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- ── 2. Üç soru ────────────────────────────────────── -->
		<section class="v3-band">
			<div class="v3-in">
				<span class="v3-label">Teşhis</span>
				<h2>Bugün kullandığınız sistem bu üçüne cevap veriyor mu?</h2>
				<div class="v3-grid3">
					{#each questions as item (item.no)}
						<article class="v3-card">
							<span class="v3-mono">{item.no}</span>
							<h3>{item.q}</h3>
							<p>{item.a}</p>
						</article>
					{/each}
				</div>
				<p class="v3-note">
					Üçü de tek hesabın parçası. Cevabınız yoksa yalnız değilsiniz — sektörün büyük kısmı lead
					sayıyor, para saymıyor.
				</p>
			</div>
		</section>

		<!-- ── 3. Para zinciri ───────────────────────────────── -->
		<section id="zincir" class="v3-band">
			<div class="v3-in">
				<span class="v3-label">Mekanizma</span>
				<h2>Kurduğumuz şeyin adı: para zinciri.</h2>
				<p class="v3-lede">
					Reklama giren para ile kasaya giren parayı aynı kayıtta birleştiririz. Zincirin her
					halkasının bir sayısı, her sayının bir sorumlusu olur.
				</p>

				<div class="v3-chain" role="list">
					{#each chain as halka, i (halka.ad)}
						<div class="v3-node" role="listitem">
							<span class="v3-mono">{i + 1}</span>
							<strong>{halka.ad}</strong>
							<span class="v3-node-note">{halka.not}</span>
						</div>
					{/each}
				</div>

				<div class="v3-inline-notes">
					<p>
						Reklam ve satış tarafı <b>[1] Maya Satış</b>, operasyon tarafı
						<b>[2] Maya Operasyon</b> üzerinde yürür. İki ayrı ürün değil — aynı zincirin iki adımı.
					</p>
					<p>Acente komisyon desteği başvuru dosyanız ve süreleriniz takipte olur.</p>
				</div>
			</div>
		</section>

		<!-- ── 4. İlk bulgu ──────────────────────────────────── -->
		<section class="v3-band v3-tint">
			<div class="v3-in v3-two">
				<div>
					<span class="v3-label">Kanıt</span>
					<h2>İlk görüşmenin sonunda bilmediğiniz bir sayı çıkar.</h2>
					<p class="v3-lede">
						Mevcut sisteminizden veriyi alır, doğrularız. Doğrulama biter bitmez üç şey ortaya
						çıkar: kaç çift kayıt var, kaç hastaya 30 günden uzun süredir dokunulmamış, ne kadar
						bakiye tahsil edilmemiş.
					</p>
					<p class="v3-lede">
						Bunlar zaten sizin verinizde duruyor. Eksik olan, bir yerde toplanmış olması.
					</p>
					<p class="v3-pledge">Bilmediğiniz bir sayı çıkmazsa konuyu kapatırız.</p>
				</div>

				<div class="v3-surface">
					<div class="v3-surface-bar">
						<span class="v3-surface-title">Doğrulama · adım 3/3</span>
						<span class="v3-chip">temsilî</span>
					</div>
					<ul class="v3-checks">
						<li><span class="v3-tick">✓</span> 4.812 kayıt taşındı</li>
						<li><span class="v3-tick">✓</span> 214 çift kayıt eşleşti</li>
						<li><span class="v3-tick">✓</span> 1.106 işlem kişiye bağlandı</li>
						<li class="v3-open">
							<span class="v3-tick v3-tick-open">!</span> 38 hasta 30+ gündür temassız
						</li>
					</ul>
				</div>
			</div>
		</section>

		<!-- ── 5. Kohort ─────────────────────────────────────── -->
		<section id="kohort" class="v3-band">
			<div class="v3-in">
				<span class="v3-label">Yapısal fark</span>
				<h2>Ocak’ın reklamı Ağustos’ta ödenir. Aylık tablo bunu göremez.</h2>
				<p class="v3-lede">
					Reklamı kestiğiniz ay kâr “artmış” görünür: gider durur, eski hastalar ödemeye devam eder.
					Bu, işi öldüren yanlış sinyaldir. Biz her lirayı, lead’in geldiği aya yazarız.
				</p>

				<div class="v3-surface v3-table-surface">
					<div class="v3-surface-bar">
						<span class="v3-surface-title">Kohort tablosu — ₺</span>
						<span class="v3-chip">temsilî</span>
					</div>
					<div class="v3-scroll">
						<table>
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
										<td class="v3-td-badge">
											<span class={`v3-badge v3-badge-${c.tone}`}>{c.durum}</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
				<p class="v3-note">Boş hücre eksik veri değil, henüz gelmemiş zamandır.</p>
			</div>
		</section>

		<!-- ── 6. Aylık döngü ────────────────────────────────── -->
		<section id="nasil" class="v3-band v3-dark">
			<div class="v3-in">
				<span class="v3-label v3-label-light">Hizmet</span>
				<h2>Rapor vermiyoruz. Teşhis koyup müdahale ediyoruz.</h2>
				<ol class="v3-steps">
					{#each cycle as adim (adim.no)}
						<li>
							<span class="v3-mono v3-mono-light">{adim.no}</span>
							<strong>{adim.ad}</strong>
							<span>{adim.not}</span>
						</li>
					{/each}
				</ol>
				<p class="v3-dark-note">
					Kurulumu, veri göçünü ve doğrulamayı biz yaparız. Sonuç: her halkanın bir sayısı, her
					sayının bir sorumlusu, her ayın bir müdahale listesi olur.
				</p>
			</div>
		</section>

		<!-- ── 7. Onay kuyruğu ───────────────────────────────── -->
		<section class="v3-band">
			<div class="v3-in v3-two v3-two-rev">
				<div class="v3-surface">
					<div class="v3-surface-bar">
						<span class="v3-surface-title">Onayınızı bekleyen · 3</span>
						<span class="v3-chip">temsilî</span>
					</div>

					<div class="v3-queue-item v3-queue-open">
						<p class="v3-queue-who">Ahmet Yılmaz — Randevu tarihi</p>
						<p class="v3-diff">
							<span class="v3-old">5 Eylül 2026</span>
							<span class="v3-arrow">→</span>
							<span class="v3-new">12 Eylül 2026</span>
						</p>
						<p class="v3-src">
							“Ahmet Bey 12 Eylül’e ertelemek istedi”
							<span>Operasyon grubu · 14:32 · Mehmet</span>
						</p>
						<div class="v3-queue-actions" aria-hidden="true">
							<span class="v3-fake v3-fake-primary">Kabul</span>
							<span class="v3-fake">Reddet</span>
						</div>
					</div>

					<div class="v3-queue-item v3-queue-muted">
						<p class="v3-queue-who">Fatma Demir — Telefon</p>
						<span class="v3-badge">bekliyor</span>
					</div>
					<div class="v3-queue-item v3-queue-muted">
						<p class="v3-queue-who">Ali Kaya — Hasta durumu</p>
						<span class="v3-badge">bekliyor</span>
					</div>
				</div>

				<div>
					<span class="v3-label">Veri girişi</span>
					<h2>Kimse forma veri girmez. Hiçbir şey de kimsenin hafızasında kalmaz.</h2>
					<p class="v3-lede">
						Ekibiniz zaten WhatsApp’ta yazıyor: “Ahmet Bey 12 Eylül’e ertelemek istedi.” Sistem bunu
						okur, değişikliği hazırlar ve önünüze koyar. <b
							>Onaylayana kadar hiçbir kayıt değişmez.</b
						>
					</p>
					<p class="v3-lede">
						Onayladığınız her değişikliğin kaynağı kayıtlıdır: hangi mesaj, kim yazdı, kim onayladı,
						ne zaman.
					</p>
					<p class="v3-note">
						Yapay zekâ hasta adına konuşmaz, kaydı kendi başına değiştirmez. Öneri üretir; kararı
						insan verir.
					</p>
				</div>
			</div>
		</section>

		<!-- ── 8. Veri ve KVKK ───────────────────────────────── -->
		<section id="guven" class="v3-band v3-tint">
			<div class="v3-in">
				<span class="v3-label">Güven</span>
				<h2>Veriniz kimseyle komşu değil.</h2>
				<div class="v3-grid3">
					{#each privacy as item (item.b)}
						<article class="v3-card">
							<span class="v3-mono">{item.b}</span>
							<p class="v3-card-body">{item.t}</p>
						</article>
					{/each}
				</div>
				<p class="v3-note"><a href="/kvkk-aydinlatma/">KVKK aydınlatma metni →</a></p>
			</div>
		</section>

		<!-- ── 9. Kimin için ─────────────────────────────────── -->
		<section class="v3-band">
			<div class="v3-in v3-aud">
				<article class="v3-aud-main">
					<span class="v3-label">Kimin için</span>
					<h2>Hasta yolculuğunu ve para akışını yönetenler için.</h2>
					<p>
						Lead, hasta, tahsilat ve hakediş aynı yerde. Hangi iş ortağının kazandırdığı, hangi
						kampanyanın para getirdiği ve kimin ne hak ettiği tek tabloda.
					</p>
				</article>
				<aside class="v3-aud-side">
					<span class="v3-label">Ölçek</span>
					<p>
						Tek marka ile de çalışır, birden fazla şube ve iş ortağıyla da — kurum tipine göre ikiye
						ayrılmış iki ayrı ürün yok.
					</p>
				</aside>
			</div>
		</section>

		<!-- ── 10. Kapanış ───────────────────────────────────── -->
		<section id="gorusme" class="v3-closing">
			<div class="v3-closing-in">
				<h2>Anlatmayalım, gösterelim.</h2>
				<p>
					30 dakikalık bir görüşme yapalım. Uygunsa sözleşmeyle veri alır, ilk bulgu raporunuzu
					çıkarırız. Bilmediğiniz bir sayı çıkmazsa konuyu kapatırız.
				</p>
				<a class="v3-btn v3-btn-lg" href={mailto}>Görüşme isteyin</a>
				<p class="v3-closing-mail">{contactEmail}</p>
			</div>
		</section>
	</main>

	<footer class="v3-footer">
		<div class="v3-in v3-footer-in">
			<span>© {new Date().getFullYear()} Verimaya</span>
			<a href="/kvkk-aydinlatma/">KVKK</a>
		</div>
	</footer>
</div>

<style>
	.v3 {
		--bg: #ffffff;
		--tint: #fafafa;
		--panel: #ffffff;
		--ink: #10100f;
		--ink-2: #55554f;
		--ink-3: #8b8b84;
		--line: #e7e7e3;
		--line-2: #f1f1ee;
		--accent: #c2410c;
		--accent-soft: #fdf2ec;
		--dark: #131311;
		--sans:
			'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		--mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
		--wrap: 72rem;

		background: var(--bg);
		color: var(--ink);
		font-family: var(--sans);
		line-height: 1.55;
		-webkit-font-smoothing: antialiased;
		font-variant-numeric: tabular-nums;
	}

	.v3 :global(*) {
		box-sizing: border-box;
	}

	.v3 h1,
	.v3 h2,
	.v3 h3 {
		margin: 0;
		font-weight: 600;
		letter-spacing: -0.03em;
		line-height: 1.12;
	}

	.v3-in {
		max-width: var(--wrap);
		margin: 0 auto;
		padding: 0 1.5rem;
	}

	/* ── Etiket / mono ── */
	.v3-label {
		display: inline-block;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.11em;
		text-transform: uppercase;
		color: var(--accent);
		margin-bottom: 1rem;
	}
	.v3-label-light {
		color: #e08b62;
	}
	.v3-mono {
		font-family: var(--mono);
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.v3-mono-light {
		color: #7d7d74;
	}

	/* ── Nav ── */
	.v3-nav {
		position: sticky;
		top: 0;
		z-index: 20;
		background: rgba(255, 255, 255, 0.82);
		backdrop-filter: saturate(180%) blur(12px);
		border-bottom: 1px solid var(--line);
	}
	.v3-nav-in {
		max-width: var(--wrap);
		margin: 0 auto;
		padding: 0.85rem 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
	}
	.v3-brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		font-size: 0.98rem;
		letter-spacing: -0.02em;
		color: var(--ink);
		text-decoration: none;
	}
	.v3-dot {
		width: 0.65rem;
		height: 0.65rem;
		border-radius: 3px;
		background: var(--accent);
	}
	.v3-nav nav {
		display: flex;
		gap: 1.5rem;
		font-size: 0.875rem;
	}
	.v3-nav nav a {
		color: var(--ink-2);
		text-decoration: none;
	}
	.v3-nav nav a:hover {
		color: var(--ink);
	}
	.v3-nav-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.v3-ghost {
		font-size: 0.875rem;
		color: var(--ink-2);
		text-decoration: none;
	}
	.v3-pill {
		font-size: 0.85rem;
		font-weight: 500;
		background: var(--ink);
		color: #fff;
		text-decoration: none;
		padding: 0.45rem 0.9rem;
		border-radius: 7px;
	}
	.v3-pill:hover {
		background: #2b2b28;
	}
	@media (max-width: 900px) {
		.v3-nav nav,
		.v3-ghost {
			display: none;
		}
	}

	/* ── Butonlar ── */
	.v3-btn {
		display: inline-block;
		background: var(--accent);
		color: #fff;
		text-decoration: none;
		font-weight: 500;
		font-size: 0.925rem;
		padding: 0.7rem 1.3rem;
		border-radius: 8px;
	}
	.v3-btn:hover {
		filter: brightness(1.08);
	}
	.v3-btn-lg {
		font-size: 1rem;
		padding: 0.85rem 1.8rem;
	}
	.v3-link {
		font-size: 0.925rem;
		color: var(--ink-2);
		text-decoration: none;
	}
	.v3-link:hover {
		color: var(--ink);
	}

	/* ── Hero ── */
	.v3-hero {
		position: relative;
		overflow: hidden;
		border-bottom: 1px solid var(--line);
	}
	.v3-hero-bg {
		position: absolute;
		inset: 0;
		background-image:
			linear-gradient(to right, var(--line-2) 1px, transparent 1px),
			linear-gradient(to bottom, var(--line-2) 1px, transparent 1px);
		background-size: 56px 56px;
		mask-image: radial-gradient(ellipse 70% 70% at 50% 0%, #000 10%, transparent 70%);
	}
	.v3-hero-in {
		position: relative;
		max-width: var(--wrap);
		margin: 0 auto;
		padding: 5rem 1.5rem 5.5rem;
		display: grid;
		gap: 3rem;
		align-items: center;
	}
	@media (min-width: 960px) {
		.v3-hero-in {
			grid-template-columns: 1fr 1fr;
			gap: 4rem;
		}
	}
	.v3-hero h1 {
		font-size: clamp(2.3rem, 4.6vw, 3.5rem);
		max-width: 16ch;
	}
	.v3-hero-copy p {
		margin: 1.35rem 0 0;
		font-size: 1.05rem;
		color: var(--ink-2);
		max-width: 34rem;
	}
	.v3-cta-row {
		display: flex;
		align-items: center;
		gap: 1.35rem;
		margin-top: 2rem;
		flex-wrap: wrap;
	}

	/* ── Ürün yüzeyi ── */
	.v3-surface {
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 12px;
		overflow: hidden;
		box-shadow:
			0 1px 2px rgba(16, 16, 15, 0.04),
			0 18px 40px -24px rgba(16, 16, 15, 0.22);
	}
	.v3-surface-hero {
		transform: translateZ(0);
	}
	.v3-surface-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--line);
		background: var(--tint);
	}
	.v3-surface-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--ink-2);
	}
	.v3-chip {
		font-family: var(--mono);
		font-size: 0.65rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-3);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
		background: #fff;
	}

	.v3-metrics {
		display: grid;
	}
	.v3-metrics > div {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		padding: 0.95rem 1rem;
		border-bottom: 1px solid var(--line-2);
	}
	.v3-metric-k {
		flex: 1;
		font-size: 0.875rem;
		color: var(--ink-2);
	}
	.v3-metric-v {
		font-size: 1.35rem;
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.v3-badge {
		display: inline-block;
		font-size: 0.7rem;
		font-weight: 500;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		border: 1px solid var(--line);
		color: var(--ink-3);
		background: #fff;
		white-space: nowrap;
	}
	.v3-badge-risk {
		color: #b02a1a;
		border-color: #f3d3cc;
		background: #fdf3f1;
	}
	.v3-badge-ok {
		color: #1f6b4a;
		border-color: #cfe6da;
		background: #f1f8f4;
	}
	.v3-badge-mid {
		color: #8a5a12;
		border-color: #eedec4;
		background: #fdf7ec;
	}
	.v3-badge-new {
		color: var(--ink-3);
	}

	.v3-spark {
		padding: 1rem;
	}
	.v3-spark-k {
		display: block;
		font-size: 0.75rem;
		color: var(--ink-3);
		margin-bottom: 0.6rem;
	}
	.v3-spark-bars {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 60px;
	}
	.v3-spark-bars span {
		flex: 1;
		background: var(--accent);
		opacity: 0.28;
		border-radius: 2px 2px 0 0;
	}
	.v3-spark-bars span:nth-last-child(-n + 4) {
		opacity: 0.75;
	}

	/* ── Bantlar ── */
	.v3-band {
		padding: 5rem 0;
		border-bottom: 1px solid var(--line);
	}
	.v3-tint {
		background: var(--tint);
	}
	.v3-band h2 {
		font-size: clamp(1.65rem, 3vw, 2.35rem);
		max-width: 26ch;
	}
	.v3-lede {
		margin: 1.15rem 0 0;
		color: var(--ink-2);
		max-width: 40rem;
	}
	.v3-note {
		margin: 1.5rem 0 0;
		font-size: 0.85rem;
		color: var(--ink-3);
		max-width: 42rem;
	}
	.v3-note a {
		color: var(--accent);
		text-decoration: none;
	}

	/* ── Kartlar ── */
	.v3-grid3 {
		display: grid;
		gap: 1rem;
		margin-top: 2.25rem;
	}
	@media (min-width: 880px) {
		.v3-grid3 {
			grid-template-columns: repeat(3, 1fr);
		}
	}
	.v3-card {
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 1.4rem;
	}
	.v3-card h3 {
		font-size: 1.02rem;
		line-height: 1.35;
		margin: 1.6rem 0 0.5rem;
	}
	.v3-card p {
		margin: 0;
		font-size: 0.875rem;
		color: var(--ink-2);
	}
	.v3-card-body {
		margin-top: 0.9rem !important;
	}

	/* ── Zincir ── */
	.v3-chain {
		display: grid;
		gap: 0.6rem;
		margin-top: 2.25rem;
	}
	@media (min-width: 940px) {
		.v3-chain {
			grid-template-columns: repeat(6, 1fr);
		}
	}
	.v3-node {
		position: relative;
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 0.95rem 0.85rem;
		background: var(--panel);
	}
	@media (min-width: 940px) {
		.v3-node:not(:last-child)::after {
			content: '';
			position: absolute;
			top: 50%;
			right: -0.62rem;
			width: 0.6rem;
			height: 1px;
			background: var(--line);
		}
	}
	.v3-node strong {
		display: block;
		margin: 0.65rem 0 0.25rem;
		font-size: 0.95rem;
		letter-spacing: -0.01em;
	}
	.v3-node-note {
		font-size: 0.78rem;
		line-height: 1.45;
		color: var(--ink-3);
	}
	.v3-inline-notes {
		display: grid;
		gap: 0.6rem;
		margin-top: 1.75rem;
	}
	@media (min-width: 940px) {
		.v3-inline-notes {
			grid-template-columns: 1.5fr 1fr;
		}
	}
	.v3-inline-notes p {
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-2);
		background: var(--accent-soft);
		border: 1px solid #f6e2d6;
		border-radius: 10px;
		padding: 0.85rem 1rem;
	}

	/* ── İki sütun ── */
	.v3-two {
		display: grid;
		gap: 3rem;
		align-items: center;
	}
	@media (min-width: 960px) {
		.v3-two {
			grid-template-columns: 1fr 1fr;
		}
	}
	.v3-pledge {
		margin: 2rem 0 0;
		padding-top: 1.4rem;
		border-top: 1px solid var(--line);
		font-size: 1.05rem;
		font-weight: 500;
		letter-spacing: -0.015em;
	}

	.v3-checks {
		list-style: none;
		margin: 0;
		padding: 0.5rem 0;
	}
	.v3-checks li {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.7rem 1rem;
		font-size: 0.9rem;
		color: var(--ink-2);
		border-bottom: 1px solid var(--line-2);
	}
	.v3-checks li:last-child {
		border-bottom: none;
	}
	.v3-tick {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.15rem;
		height: 1.15rem;
		border-radius: 999px;
		background: #f1f8f4;
		color: #1f6b4a;
		font-size: 0.72rem;
		font-weight: 700;
		flex-shrink: 0;
	}
	.v3-tick-open {
		background: #fdf3f1;
		color: #b02a1a;
	}
	.v3-open {
		color: var(--ink);
		font-weight: 500;
	}

	/* ── Tablo ── */
	.v3-table-surface {
		margin-top: 2.25rem;
	}
	.v3-scroll {
		overflow-x: auto;
	}
	.v3 table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
		min-width: 42rem;
	}
	.v3 th,
	.v3 td {
		text-align: right;
		padding: 0.7rem 1rem;
		border-bottom: 1px solid var(--line-2);
	}
	.v3 thead th {
		font-family: var(--mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-3);
		font-weight: 500;
		background: var(--tint);
	}
	.v3 tbody th {
		text-align: left;
		font-weight: 600;
	}
	.v3 tbody tr:last-child th,
	.v3 tbody tr:last-child td {
		border-bottom: none;
	}
	.v3-td-badge {
		text-align: right;
	}

	/* ── Koyu bant ── */
	.v3-dark {
		background: var(--dark);
		color: #f2f2ef;
		border-bottom-color: var(--dark);
	}
	.v3-dark h2 {
		color: #fff;
	}
	.v3-steps {
		list-style: none;
		margin: 2.5rem 0 0;
		padding: 0;
		display: grid;
		gap: 1px;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		overflow: hidden;
	}
	@media (min-width: 960px) {
		.v3-steps {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.v3-steps li {
		background: var(--dark);
		padding: 1.35rem;
	}
	.v3-steps strong {
		display: block;
		margin: 0.85rem 0 0.4rem;
		font-size: 1.05rem;
		color: #fff;
		letter-spacing: -0.02em;
	}
	.v3-steps span:last-child {
		font-size: 0.85rem;
		line-height: 1.5;
		color: #a3a39b;
	}
	.v3-dark-note {
		margin: 2rem 0 0;
		max-width: 44rem;
		font-size: 0.925rem;
		color: #a3a39b;
	}

	/* ── Onay kuyruğu ── */
	.v3-two-rev > div:first-child {
		order: 0;
	}
	@media (min-width: 960px) {
		.v3-two-rev {
			grid-template-columns: 0.95fr 1.05fr;
		}
	}
	.v3-queue-item {
		padding: 1.1rem 1rem;
		border-bottom: 1px solid var(--line-2);
	}
	.v3-queue-item:last-child {
		border-bottom: none;
	}
	.v3-queue-open {
		background: #fff;
	}
	.v3-queue-muted {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		background: var(--tint);
	}
	.v3-queue-who {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.v3-diff {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin: 0.7rem 0;
		font-size: 1rem;
	}
	.v3-old {
		color: var(--ink-3);
		text-decoration: line-through;
	}
	.v3-arrow {
		color: var(--accent);
	}
	.v3-new {
		font-weight: 600;
		color: var(--accent);
	}
	.v3-src {
		margin: 0;
		font-size: 0.82rem;
		color: var(--ink-2);
		background: var(--tint);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 0.7rem 0.85rem;
	}
	.v3-src span {
		display: block;
		margin-top: 0.3rem;
		font-size: 0.75rem;
		color: var(--ink-3);
	}
	.v3-queue-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.9rem;
	}
	.v3-fake {
		flex: 1;
		text-align: center;
		font-size: 0.85rem;
		font-weight: 500;
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 7px;
		color: var(--ink-2);
		background: #fff;
	}
	.v3-fake-primary {
		background: var(--ink);
		border-color: var(--ink);
		color: #fff;
	}

	/* ── Kimin için ── */
	.v3-aud {
		display: grid;
		gap: 1rem;
	}
	@media (min-width: 960px) {
		.v3-aud {
			grid-template-columns: 1.6fr 0.9fr;
		}
	}
	.v3-aud-main {
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 2.25rem;
		background: var(--accent-soft);
	}
	.v3-aud-main p {
		margin: 1.15rem 0 0;
		color: var(--ink-2);
		max-width: 36rem;
	}
	.v3-aud-side {
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 2.25rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
	.v3-aud-side p {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.95rem;
	}

	/* ── Kapanış ── */
	.v3-closing {
		background: var(--dark);
		color: #fff;
		text-align: center;
		padding: 6rem 1.5rem;
	}
	.v3-closing-in {
		max-width: 40rem;
		margin: 0 auto;
	}
	.v3-closing h2 {
		font-size: clamp(1.9rem, 3.8vw, 2.8rem);
		color: #fff;
	}
	.v3-closing p {
		margin: 1.3rem auto 2.2rem;
		color: #a3a39b;
		max-width: 34rem;
	}
	.v3-closing-mail {
		margin: 1.2rem auto 0 !important;
		font-size: 0.82rem;
		color: #7d7d74 !important;
	}

	/* ── Footer ── */
	.v3-footer {
		padding: 1.5rem 0;
		background: var(--dark);
		color: #7d7d74;
		font-size: 0.82rem;
	}
	.v3-footer-in {
		display: flex;
		justify-content: space-between;
	}
	.v3-footer a {
		color: #7d7d74;
	}
</style>
