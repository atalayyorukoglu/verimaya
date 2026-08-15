<script lang="ts">
	import { PUBLIC_APP_URL } from '$lib/env';

	const appLoginUrl = `${PUBLIC_APP_URL}/login`;

	/** TODO(Atalay): gerçek adresle değiştir */
	const contactEmail = 'info@verimaya.com';
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
		{ halka: 'Reklam', soru: 'Hangi kampanya boş lead getiriyor, hangisi ödeyen hasta?' },
		{ halka: 'Lead', soru: 'Kime kaç saatte dönüldü, kime hiç dönülmedi?' },
		{ halka: 'Temsilci', soru: 'Kim ne yazıyor, hangi cevap kapanışa götürüyor?' },
		{ halka: 'Hasta', soru: 'Hangi aşamada duruyor, kime hatırlatma gitmedi?' },
		{ halka: 'Hekim / klinik', soru: 'Hangi tedavi planı tutuyor, revizyon nerede birikiyor?' },
		{ halka: 'Tahsilat', soru: 'Kim ödedi, kim ödemedi, bakiye nerede duruyor?' },
		{ halka: 'Hakediş', soru: 'Klinik başına ne hak edildi, ne ödendi?' },
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
			baslik: 'X Kliniği hakedişini mutabakata bağla',
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
		{ no: '01', ad: 'Ölç', not: 'Her halkanın bir sayısı olur.' },
		{ no: '02', ad: 'Teşhis koy', not: 'Sayının arkasındaki neden isim isim çıkar.' },
		{ no: '03', ad: 'Müdahale et', not: 'O ay ne yapılacağına birlikte karar veririz.' },
		{ no: '04', ad: 'Tekrar ölç', not: 'Ertesi ay tek soru: müdahale işe yaradı mı?' }
	] as const;

	const privacy = [
		{
			b: 'İzolasyon',
			t: 'Her acentenin verisi ayrı tutulur. İzolasyon sözleşmede yazılıdır, denetime açıktır.'
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
			t: 'Kurucunun sağlık turizmi işletmesi var. Bu yüzden veri izolasyonu sözleşmede ayrıca yazılıdır.'
		}
	] as const;
</script>

<svelte:head>
	<title>Verimaya — Ne yapmanız gerektiğini söyleyen sistem</title>
	<meta
		name="description"
		content="Kayıt tutan yazılım çok. Verimaya reklamdan tahsilata bütün zinciri okur, nerede para kaybettiğinizi bulur ve o ay ne yapılacağını önünüze koyar."
	/>
</svelte:head>

<div class="v4">
	<header class="v4-nav">
		<div class="v4-nav-in">
			<a href="/" class="v4-brand">Verimaya</a>
			<nav>
				<a href="#merdiven">Merdiven</a>
				<a href="#okuruz">Ne okuruz</a>
				<a href="#liste">Müdahale listesi</a>
				<a href="#veri">Veri</a>
			</nav>
			<div class="v4-nav-right">
				<a href={appLoginUrl} class="v4-ghost">Giriş</a>
				<a href="#gorusme" class="v4-pill">Görüşme</a>
			</div>
		</div>
	</header>

	<main>
		<!-- ── 1. Hero ───────────────────────────────────────── -->
		<section class="v4-hero">
			<div class="v4-hero-glow" aria-hidden="true"></div>
			<div class="v4-hero-in">
				<span class="v4-label">Sağlık turizmi acenteleri için</span>
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
				<h2>Yazılım beş basamakta durur. Çoğu üçüncüde kalır.</h2>

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

				<p class="v4-note">
					İlk üç basamak size veriyi verir; kararı yine siz verirsiniz. Dördüncü ve beşinci basamak
					bizim işimiz.
				</p>
			</div>
		</section>

		<!-- ── 3. Ne okuyoruz ────────────────────────────────── -->
		<section id="okuruz" class="v4-band">
			<div class="v4-in">
				<span class="v4-label">Teşhisin girdileri</span>
				<h2>Zincirin her halkasına ayrı bakarız.</h2>

				<div class="v4-reads">
					{#each reads as r (r.halka)}
						<div class="v4-read">
							<span class="v4-read-k">{r.halka}</span>
							<span class="v4-read-q">{r.soru}</span>
						</div>
					{/each}
				</div>

				<p class="v4-note">
					Reklamı biz yönetmesek de kalitesini ölçeriz. Kontrol etmediğimiz halkayı da teşhis ederiz
					— hasta gelmiyorsa nedeni adressiz değil, adreslidir.
				</p>
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
				<ol class="v4-cycle">
					{#each cycle as c (c.no)}
						<li>
							<span class="v4-mono">{c.no}</span>
							<strong>{c.ad}</strong>
							<span>{c.not}</span>
						</li>
					{/each}
				</ol>
				<p class="v4-note">Dördüncü adım olmadan üçüncüsü tahmindir.</p>
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
					çift kayıt var, kaç hastaya 30 günden uzun süredir dokunulmamış, ne kadar bakiye tahsil
					edilmemiş.
				</p>
				<p>
					Üçü de zaten sizin verinizde duruyor. Eksik olan, birinin bakıp “şunu yapalım” demesi.
				</p>
				<p class="v4-pledge">Bilmediğiniz bir sayı çıkmazsa konuyu kapatırız.</p>
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
				<p class="v4-note"><a href="/kvkk-aydinlatma/">KVKK aydınlatma metni →</a></p>
			</div>
		</section>

		<!-- ── 9. Kimin için ─────────────────────────────────── -->
		<section class="v4-band">
			<div class="v4-in v4-aud">
				<article class="v4-aud-main">
					<span class="v4-label">Birincil</span>
					<h2>Acenteler için: birden fazla klinik, tek hesap.</h2>
					<p>
						Lead, hasta, tahsilat ve hakediş aynı yerde. Hangi kliniğin kazandırdığı, hangi
						kampanyanın para getirdiği ve kimin ne hak ettiği tek tabloda.
					</p>
				</article>
				<aside>
					<span class="v4-label">Klinikler</span>
					<p>Reklam veren kliniklerden gelen talepleri değerlendiriyoruz.</p>
				</aside>
			</div>
		</section>

		<!-- ── 10. Kapanış ───────────────────────────────────── -->
		<section id="gorusme" class="v4-closing">
			<div class="v4-closing-in">
				<h2>Anlatmayalım, gösterelim.</h2>
				<p>
					30 dakikalık bir görüşme yapalım. Uygunsa sözleşmeyle veri alır, ilk bulgu raporunuzu ve
					ilk müdahale listenizi çıkarırız. Bilmediğiniz bir sayı çıkmazsa konuyu kapatırız.
				</p>
				<a class="v4-btn v4-btn-lg" href={mailto}>Görüşme isteyin</a>
				<p class="v4-closing-mail">{contactEmail}</p>
			</div>
		</section>
	</main>

	<footer class="v4-footer">
		<div class="v4-in v4-footer-in">
			<span>© {new Date().getFullYear()} Verimaya</span>
			<a href="/kvkk-aydinlatma/">KVKK</a>
		</div>
	</footer>
</div>

<style>
	.v4 {
		--bg: #0c0d0c;
		--tint: #121412;
		--panel: #161815;
		--line: #262a26;
		--line-2: #1e211e;
		--ink: #f2f3f0;
		--ink-2: #a6aca4;
		--ink-3: #6e756c;
		--accent: #ff7a45;
		--accent-2: #ffb08a;
		--ok: #5fbf8f;
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

	.v4 :global(*) {
		box-sizing: border-box;
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

	/* ── Nav ── */
	.v4-nav {
		position: sticky;
		top: 0;
		z-index: 20;
		background: rgba(12, 13, 12, 0.78);
		backdrop-filter: saturate(160%) blur(12px);
		border-bottom: 1px solid var(--line);
	}
	.v4-nav-in {
		max-width: var(--wrap);
		margin: 0 auto;
		padding: 0.85rem 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
	}
	.v4-brand {
		font-weight: 600;
		font-size: 0.98rem;
		letter-spacing: -0.02em;
		color: var(--ink);
		text-decoration: none;
	}
	.v4-nav nav {
		display: flex;
		gap: 1.5rem;
		font-size: 0.875rem;
	}
	.v4-nav nav a {
		color: var(--ink-2);
		text-decoration: none;
	}
	.v4-nav nav a:hover {
		color: var(--ink);
	}
	.v4-nav-right {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}
	.v4-ghost {
		font-size: 0.875rem;
		color: var(--ink-2);
		text-decoration: none;
	}
	.v4-pill {
		font-size: 0.85rem;
		font-weight: 500;
		background: var(--accent);
		color: #1a0d06;
		text-decoration: none;
		padding: 0.45rem 0.95rem;
		border-radius: 7px;
	}
	@media (max-width: 900px) {
		.v4-nav nav,
		.v4-ghost {
			display: none;
		}
	}

	/* ── Butonlar ── */
	.v4-btn {
		display: inline-block;
		background: var(--accent);
		color: #1a0d06;
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
		border-bottom: 1px solid var(--line);
	}
	.v4-hero-glow {
		position: absolute;
		top: -30%;
		left: 50%;
		width: 70rem;
		height: 40rem;
		transform: translateX(-50%);
		background: radial-gradient(closest-side, rgba(255, 122, 69, 0.16), transparent);
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
		margin: 1.15rem 0 0;
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
		border-radius: 14px;
		overflow: hidden;
	}
	.v4-step {
		display: grid;
		grid-template-columns: 2.5rem 8rem 1fr;
		align-items: center;
		gap: 0.5rem 1rem;
		padding: 1.1rem 1.25rem;
		border-bottom: 1px solid var(--line-2);
		background: var(--panel);
		opacity: 0.55;
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
		background: linear-gradient(90deg, rgba(255, 122, 69, 0.12), transparent 60%);
		border-left: 2px solid var(--accent);
	}
	.v4-step-on .v4-step-no,
	.v4-step-on .v4-step-kim {
		color: var(--accent-2);
	}
	.v4-step-on .v4-step-soru {
		color: var(--ink);
	}
	@media (max-width: 720px) {
		.v4-step {
			grid-template-columns: 2rem 1fr;
		}
		.v4-step-soru,
		.v4-step-kim {
			grid-column: 2 / -1;
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

	/* ── Yüzey ── */
	.v4-surface {
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 12px;
		overflow: hidden;
	}
	.v4-surface-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.8rem 1rem;
		border-bottom: 1px solid var(--line);
		background: #1b1e1a;
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
		border: 1px solid rgba(255, 122, 69, 0.3);
		background: rgba(255, 122, 69, 0.08);
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
		background: linear-gradient(180deg, rgba(255, 122, 69, 0.1), transparent);
	}
	.v4-cycle strong {
		display: block;
		margin: 0.9rem 0 0.4rem;
		font-size: 1.05rem;
		letter-spacing: -0.02em;
	}
	.v4-cycle span:last-child {
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--ink-2);
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
		background: #131512;
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
		background: #131512;
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
		color: #1a0d06;
		font-weight: 600;
	}

	/* ── Ortalanmış kanıt ── */
	.v4-center {
		padding: 6rem 1.5rem;
		border-bottom: 1px solid var(--line);
		background: radial-gradient(ellipse 60% 60% at 50% 0%, rgba(255, 122, 69, 0.07), transparent);
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
		border-radius: 12px;
		padding: 1.35rem;
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
		border: 1px solid rgba(255, 122, 69, 0.28);
		background: linear-gradient(135deg, rgba(255, 122, 69, 0.09), transparent 65%);
		border-radius: 14px;
		padding: 2.25rem;
	}
	.v4-aud-main p {
		margin: 1.15rem 0 0;
		color: var(--ink-2);
		max-width: 36rem;
	}
	.v4-aud aside {
		border: 1px solid var(--line);
		border-radius: 14px;
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
		background: radial-gradient(ellipse 55% 80% at 50% 100%, rgba(255, 122, 69, 0.15), transparent);
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

	/* ── Footer ── */
	.v4-footer {
		padding: 1.5rem 0;
		border-top: 1px solid var(--line);
		font-size: 0.82rem;
		color: var(--ink-3);
	}
	.v4-footer-in {
		display: flex;
		justify-content: space-between;
	}
	.v4-footer a {
		color: var(--ink-3);
	}
</style>
