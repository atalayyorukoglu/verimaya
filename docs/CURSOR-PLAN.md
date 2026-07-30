# Verimaya — Cursor Uygulama Planı

Kaynak: `SecondBrain-Remote/03-Areas/VeriMaya/02-yol-haritasi.md` (tek yol haritası kaynağı, 2026-07-30).
Bu dosya o yol haritasının **uygulama sırası**dır — yeni iş üretmez, işaretlenmemiş (`[ ]` / `[~]`) maddeleri
Cursor'ın tek tek çalıştırabileceği atomik adımlara böler. Tamamlanmış (`[x]`) işlere dokunulmaz.

---

## ÇALIŞMA PROTOKOLÜ — Cursor bu bloğu her adımdan önce tekrar oku

1. Adımları sırayla yap. ASLA birden fazla adımı arka arkaya tamamlayıp ilerleme.
2. Bir adımı bitirince DUR. Şunu yaz:
   - Ne yapıldı (1-3 cümle)
   - Hangi dosyalar değişti
   - Nasıl doğrulanır (komut/ekran/test)
   - Bir sonraki adımın numarası ve başlığı
3. Kullanıcı açıkça "onaylandı", "devam", "geç" gibi bir kelime yazmadan sıradaki
   adıma BAŞLAMA.
4. Her adımı kendi git commit'inde bitir (`docs/CURSOR-PLAN.md`'deki adım numarasını
   commit mesajına yaz, örn. "adım 3: vitrin prerender").
5. Adım bitince bu dosyada o adımın başındaki [ ] kutusunu [x] yap.
6. Belirsizlik/çelişki çıkarsa varsayma — durur, kullanıcıya sorar.
7. AGENTS.md, MIMARI.md, TASARIM.md kurallarına her adımda uy (özellikle: panel rota
   slug'ları İngilizce, i18n kuralları, RLS/tenant izolasyonu, queue-first webhook
   deseni, Idempotency-Key).

---

## Verilmiş kararlar — bu planda sabittir, tekrar sorulmaz

| Konu | Karar | Nerede kullanılır |
|---|---|---|
| Karne rotası | **`/yapay-zeka-karnesi`** (vitrin yüzeyi → slug Türkçe; TASARIM.md § Dil ve slug) | Adım 6+ |
| Karne ölçüm sinki | **`apps/api`'de public endpoint** (auth yok, tenant yok, rate-limit + honeypot) | Adım 13-17 |
| E-posta kapısı | **Sonuç gösterildikten sonra**, konumu tek bir sabitle değişebilir (`EMAIL_GATE_POSITION`) | Adım 16 |

## Şartnamede tespit edilen çelişki — Adım 6'dan önce oku

`Ucretsiz-Karne-Sorulari.md` başlığı **"11 Soru"** diyor; içeriği ise §2'de **2 puanlanmayan**
kurulum sorusu + §3'te **10 puanlı** soru = **12 soru** tanımlıyor. §4 "Tavan 40" diyor,
bu da 10 × 4 ile tutarlı.

**Bu planda geçerli sayım: 2 puanlanmayan + 10 puanlı.** Başlıktaki "11" şartnamenin kendi
iç tutarsızlığıdır; toplam puan tavanı (40) ve çıktı ekranı metni ("10 sorudan 7'sinde…")
10 puanlı soruyu doğruluyor. Cursor bu sayımı kullanır, şartname başlığını değil.

---

# BLOK A — Vitrin SEO ön koşulu (yol haritası öncelik #1)

> Neden ilk: `apps/web/src/routes/+layout.ts` içinde `ssr = false` + `prerender = false`.
> Google'a boş `index.html` iskeleti gidiyor. Karne dahil hiçbir huni işi bu açılmadan
> karşılık üretmez (TASARIM.md § Vitrin locale ağacı neden kurulmadı).

### Adım 1 — Kök layout'u SSR-güvenli hale getir

- [x] durum

**Ne yapılacak:** `apps/web/src/routes/+layout.svelte` bugün yalnız istemcide çalıştığı
varsayımıyla yazılmış. Prerender açılmadan **önce** SSR sırasında (Node'da, `window`/`document`/
`localStorage` yokken) patlamayacak hale getirilir. `ssr`/`prerender` değerleri bu adımda
DEĞİŞTİRİLMEZ — bu yalnızca hazırlık.

- `$app/environment`'tan `browser` import edilir; tarayıcıya bağlı her çağrı `browser` guard'ı
  veya `onMount` içine alınır (MSW başlatma, service worker kaydı zaten `onMount`'ta — doğrula).
- `$lib/theme.ts`: `localStorage` guard'ı var ama `document.documentElement` kullanan yol
  SSR'da çağrılmamalı — çağrı noktası `onMount` içinde mi, doğrula.
- `appReady` başlangıç değeri SSR'da `true` üretmeli (aksi halde prerender edilen HTML
  "Yükleniyor…" olarak donar — **bu adımın asıl riski budur**).
- `QueryClientProvider` ve `createQueryClient()` SSR'da bir kez çalışacak; istek atmadığından
  sorun yok, ama `$lib/api.ts` modül düzeyinde `window`/`fetch` bağımlılığı taşıyorsa temizlenir.

**Dokunulacak dosyalar/klasörler:**
- `apps/web/src/routes/+layout.svelte`
- `apps/web/src/lib/theme.ts` (yalnız gerekirse)
- `apps/web/src/lib/api.ts`, `apps/web/src/lib/env.ts` (yalnız modül düzeyi tarayıcı erişimi varsa)

**Kabul kriteri:**
- `pnpm --filter @verimaya/web check` ve `pnpm --filter @verimaya/web build` temiz geçer.
- `pnpm dev` ile panel davranışı değişmemiş (MSW açık ve kapalı modda hasta listesi açılıyor).
- Görsel/işlevsel hiçbir değişiklik yok — bu adım tamamen hazırlık.

**Riskler/dikkat:** `appReady` yanlış kurulursa bir sonraki adımda prerender edilen sayfa
gerçek içerik yerine yükleme metni içerir ve hata sessizdir (build başarılı görünür).
Adım 2'nin kabul kriteri bunu yakalayacak şekilde yazıldı.

---

### Adım 2 — `(public)` rota grubu kur ve `/vitrin`'i taşı

- [x] durum

**Ne yapılacak:** Login öncesi (public, SEO'lu) yüzey ile panel (SPA, `noindex`) yüzeyini
rota düzeyinde ayır. SvelteKit rota grubu URL'i değiştirmez — `/vitrin` yine `/vitrin`.

- `apps/web/src/routes/(public)/` grubu oluşturulur.
- `(public)/+layout.ts`: `export const ssr = true; export const prerender = true;`
- `(public)/+layout.svelte`: AppShell içermeyen sade kabuk (tema class'ı + `{@render children()}`).
- `apps/web/src/routes/vitrin/` → `apps/web/src/routes/(public)/vitrin/` taşınır.
- Kök `+layout.svelte`'teki `isBareRoute` mantığı artık gereksizleşiyorsa sadeleştirilir;
  `/login` hâlâ kök altında olduğu için tümüyle silinmez — dikkatli davran.
- Kök `+layout.ts`'teki `ssr = false; prerender = false;` **olduğu gibi kalır** (panel SPA).

**Dokunulacak dosyalar/klasörler:**
- `apps/web/src/routes/(public)/+layout.ts` (yeni)
- `apps/web/src/routes/(public)/+layout.svelte` (yeni)
- `apps/web/src/routes/(public)/vitrin/+page.svelte` (taşındı)
- `apps/web/src/routes/+layout.svelte` (isBareRoute)

**Kabul kriteri:**
```bash
pnpm --filter @verimaya/web build
test -f apps/web/build/vitrin/index.html && echo VAR
grep -c "Hasta yolculuğunu tek panelde yönetin" apps/web/build/vitrin/index.html   # >= 1
grep -c "Verimaya — Sağlık turizmi operasyon platformu" apps/web/build/vitrin/index.html  # >= 1
```
Üç kontrol de geçmeli. `index.html` içinde "Yükleniyor…" **geçmemeli**.
Ayrıca `pnpm dev` → `/vitrin` ve `/patients` ikisi de eskisi gibi çalışmalı.

**Riskler/dikkat:** `adapter-static` `fallback: 'index.html'` ile çalışıyor; prerender edilen
`build/vitrin/index.html` ile SPA fallback'i **aynı dosya adını** taşır ama farklı dizinde —
karışmadığını yukarıdaki grep ile doğrula. Vitrin `onMount` içinde `visible = true` ile
animasyon açıyor: SSR HTML'inde içerik görünür olmalı (opacity:0 ile gizli kalırsa Google
içeriği görür ama kullanıcı JS kapalıyken boş sayfa görür) — CSS'i buna göre kontrol et.

---

### Adım 3 — Prerender edilen sayfanın gerçekten servis edildiğini garantiye al

- [x] durum

**Ne yapılacak:** Statik deploy'da `try_files $uri $uri/ /index.html` kuralı `/vitrin`
isteğini `build/vitrin/index.html`'e mi düşürüyor yoksa SPA fallback'ine mi — bunu netleştir
ve dokümante et. Ayrıca `robots.txt` ve `sitemap.xml` eklenir.

- `apps/web/static/robots.txt`: public rotalar `Allow`, panel rotaları `Disallow`
  (`/patients`, `/appointments`, `/finance`, `/settings`, `/reports`, `/marketing`, `/contacts`,
  `/login`, `/dev`), `Sitemap:` satırı.
- `apps/web/static/sitemap.xml`: şimdilik yalnız `/vitrin` (Adım 8 sonrası karne eklenecek).
- `apps/web/DEPLOY-STATIC.md`: prerendered rota + SPA fallback bir arada nasıl servis edilir,
  Coolify/nginx kuralı yazılır.
- Panel rotalarının `noindex` aldığını doğrula (kök layout `<svelte:head>`'e
  `<meta name="robots" content="noindex">` — public grupta OLMAMALI).

**Dokunulacak dosyalar/klasörler:**
- `apps/web/static/robots.txt` (yeni), `apps/web/static/sitemap.xml` (yeni)
- `apps/web/DEPLOY-STATIC.md`
- `apps/web/src/routes/+layout.svelte` (noindex meta)

**Kabul kriteri:**
```bash
pnpm --filter @verimaya/web build
npx serve apps/web/build -s   # veya pnpm --filter @verimaya/web preview
curl -s localhost:3000/vitrin | grep -c "Hasta yolculuğunu"   # >= 1
curl -s localhost:3000/patients | grep -c "noindex"           # >= 1
curl -s localhost:3000/robots.txt
```

**Riskler/dikkat:** `-s` (SPA) bayrağıyla servis edilen statik sunucular prerendered dosyayı
ezebilir. Ezerse kural `try_files $uri $uri/index.html $uri/ /index.html` olmalı — sırayı
dokümana yaz.

---

### Adım 4 — Vitrin `<head>` SEO paketi

- [x] durum

**Ne yapılacak:** Prerender açıldığına göre `<svelte:head>` içeriği artık Google'a ulaşıyor.
Vitrin sayfasına canonical, Open Graph, Twitter card ve `Organization` JSON-LD eklenir.

- `PUBLIC_SITE_URL` env değişkeni (`apps/web/.env.example`'a da yazılır) canonical tabanı olur.
- OG görseli `apps/web/static/og/vitrin.png` (yoksa basit bir marka görseli üret, 1200×630).
- `lang="tr"` `app.html`'de doğrulanır.
- Metinler i18n kataloğuna girmez — vitrin yüzeyi ileride `/tr/` + `/en/` ağacına bölünecek
  (TASARIM.md); kataloğa erken taşımak o planı bozar. **Panel metinleri için kural geçerliliğini
  korur.**

**Dokunulacak dosyalar/klasörler:**
- `apps/web/src/routes/(public)/vitrin/+page.svelte`
- `apps/web/src/app.html`, `apps/web/.env.example`, `apps/web/static/og/`

**Kabul kriteri:** Build çıktısında `build/vitrin/index.html` içinde `rel="canonical"`,
`og:title`, `og:image`, `application/ld+json` blokları görünür. JSON-LD
[Rich Results Test](https://search.google.com/test/rich-results) formatında geçerli JSON'dur
(`node -e` ile parse edilerek doğrulanabilir).

**Riskler/dikkat:** `/tr/` + `/en/` ağacı bu planın kapsamında **değil** (TASARIM.md sıra: 1→2→3,
biz 1'i bitiriyoruz). `hreflang` etiketi şimdi eklenmez — ikinci dil yokken yanlış sinyal verir.

---

# BLOK B — Ücretsiz Yapay Zeka Karnesi (yol haritası öncelik #2)

> Kaynak şartname: `Ai Rediness/Fikirler/Ucretsiz-Karne-Sorulari.md`.
> **Kurallar:** login yok · backend yok (ölçüm hariç, Blok C) · `packages/shared`'a dokunulmaz ·
> ayrı üst düzey rota, `/vitrin` altında değil · kullanıcıya **yüzde YOK, bant adı YOK**.

### Adım 5 — Karne içerik veri modeli (kod yok, veri var)

- [ ] durum

**Ne yapılacak:** Şartnamedeki soru metinleri, şıklar ve puanlar tek bir tipli sabit dosyaya
yazılır. UI bu adımda yazılmaz — böylece içerik hatası UI'dan bağımsız denetlenebilir.

`apps/web/src/lib/karne/questions.ts`:
- `type KarneChoice = { id: string; label: string; score: 0 | 2 | 4 }`
- `type KarneQuestion = { id: 's1'..'s10'; criterion: string; title: string; hint?: string; choices: [KarneChoice, KarneChoice, KarneChoice] }`
- `type IntakeQuestion` — 2 puanlanmayan soru (kişi sayısı `1-4|5-15|16+`, AB/UK hastası `evet|hayir|emin-degilim`)
- `S1`–`S10` şartname §3'ten **birebir** aktarılır (soru metni, üç şık, 4/2/0 puanları,
  `criterion` alanına 2.4, 4.6, 4.3, 7.6, 3.5, 3.1, 6.2, 7.4, 8.3, 8.5).
- **S4 istisnası:** ilk İKİ şık da 4 puan ("Yapay zeka kullanmıyoruz" ve "Kullanıyoruz ve
  hastaya açıkça belirtiyoruz"); üçüncü 0. Ara puan yok. Tip bunu engellememeli.
- **S7 örnek listesi:** `hint` alanına *"fiyat teklifi göndermesin", "tıbbi tavsiye vermesin",
  "hasta fotoğrafı işlemesin"* (şartname §3 uyarısı — örneksiz soru boş bakış üretiyor).
- Her sorunun `weakLabel` alanı: çıktı ekranında "sıfır alınan alan" olarak gösterilecek
  **cümle** (şartname §5 örneği: "Hasta bilgisi 4 ayrı yerde, hangisinin güncel olduğu belirsiz").

**Dokunulacak dosyalar/klasörler:**
- `apps/web/src/lib/karne/questions.ts` (yeni)
- `apps/web/src/lib/karne/types.ts` (yeni, istenirse questions.ts içinde)

**Kabul kriteri:** `pnpm --filter @verimaya/web check` temiz. Dosya 10 puanlı + 2 kurulum
sorusu içerir; her puanlı sorunun tam 3 şıkkı ve `criterion` alanı vardır. Metinler şartname
ile **kelimesi kelimesine** eşleşir (elle karşılaştır, özetleme).

**Riskler/dikkat:** `packages/shared`'a **koyma** — yol haritası kuralı. Ürün içi karne
(Adım 36+) shared'da yaşayacak; ikisi ayrı veri kümesidir, ortaklaştırma girişimi yapma.

---

### Adım 6 — `/yapay-zeka-karnesi` rota iskeleti

- [ ] durum

**Ne yapılacak:** `(public)` grubu altında yeni üst düzey rota; prerender edilir, AppShell yok,
login yok. Bu adımda yalnız **iskelet**: giriş ekranı (başlık, ne olduğu, süre vaadi "5 dakika",
"Başla" butonu) + boş adım durumu (`$state` ile `'intro' | 'intake' | 'questions' | 'result'`).

- URL: `/yapay-zeka-karnesi` (karar tablosunda sabit).
- `<svelte:head>`: kendi `title`, `description`, canonical, OG.
- Tasarım TASARIM.md token'larıyla: `--bg`, `--surface`, `--brand` (terracotta vurgu olarak,
  büyük alan değil), Inter, radius 8/6.
- Vitrindeki hero'ya CTA **henüz eklenmez** (Adım 12).

**Dokunulacak dosyalar/klasörler:**
- `apps/web/src/routes/(public)/yapay-zeka-karnesi/+page.svelte` (yeni)
- `apps/web/src/lib/karne/state.svelte.ts` (yeni — akış durumu, Svelte 5 runes)

**Kabul kriteri:** `pnpm dev` → `http://localhost:5173/yapay-zeka-karnesi` açılır, AppShell
görünmez, sol menü yok. `pnpm --filter @verimaya/web build` sonrası
`build/yapay-zeka-karnesi/index.html` vardır ve içinde gerçek başlık metni geçer (prerender
çalışıyor). Açık/koyu tema ikisinde de okunabilir.

**Riskler/dikkat:** Svelte 5 runes zorunlu (`$state`, `$derived`) — `export let` / `$:` yasak
(`.cursor/rules/frontend.mdc`).

---

### Adım 7 — Kurulum soruları (2 puanlanmayan soru)

- [ ] durum

**Ne yapılacak:** Şartname §2'deki iki soru. Puan vermezler; **raporun dilini ve tonunu**
belirlerler.

- "Kliniğinizde kaç kişi çalışıyor?" → `1-4` / `5-15` / `16 ve üzeri`.
  **Bant adı kullanıcıya hiçbir yerde gösterilmez** (§4 uyarısı), yalnız saklanır.
- "Hastalarınız arasında İngiltere veya AB ülkelerinde yaşayanlar var mı?" →
  `Evet` / `Hayır` / `Emin değilim`. `Evet` ise S4 ve S8 çıktıda **kırmızıya** döner
  ve tarihli kanca metni açılır.
- Cevaplar `state.svelte.ts`'te tutulur; `sessionStorage`'a yazılabilir (yenilemede kayıp
  önleme) — `localStorage` kullanma, uzun süreli PII saklamayalım.

**Dokunulacak dosyalar/klasörler:**
- `apps/web/src/routes/(public)/yapay-zeka-karnesi/+page.svelte`
- `apps/web/src/lib/karne/state.svelte.ts`

**Kabul kriteri:** İki soru sırayla cevaplanabiliyor, geri gidilebiliyor, cevapsız ileri
gidilemiyor. Ekranda hiçbir yerde "Başlangıç / Parçalı / Tutarlı / Olgun" kelimeleri geçmiyor.

**Riskler/dikkat:** Bant adının sızması şartnamenin en net yasağı (§4). Grep ile doğrula:
`grep -rn "Parçalı\|Olgun\|Tutarlı" apps/web/src/routes/(public)/yapay-zeka-karnesi/` boş dönmeli.

---

### Adım 8 — 10 puanlı soru akışı (UI)

- [ ] durum

**Ne yapılacak:** Tek soru / tek ekran akışı. Şartname §3 sırası **korunur** (kolay → rahatsız
edici → kendi çıkarına dokunan kapanış). Sıra değiştirilemez; terk noktası ölçümü buna bağlı.

- İlerleme göstergesi: "3 / 10" (yüzde değil).
- Geri / ileri; cevapsız ileri yok.
- S7'de `hint` örnekleri soru metninin altında gösterilir.
- S4'te üç şıkkın ikisi de 4 puan — kullanıcıya puan gösterilmediği için görsel fark yok.
- Klavye erişilebilirliği: şıklar radio grubu, ok tuşlarıyla gezilebilir, `aria-label`'lı.
- Mobilde tek elle doldurulabilir (şıklar min 44px yükseklik).

**Dokunulacak dosyalar/klasörler:**
- `apps/web/src/routes/(public)/yapay-zeka-karnesi/+page.svelte`
- `apps/web/src/lib/components/` altına gerekirse `KarneQuestionCard.svelte`

**Kabul kriteri:** 10 soru baştan sona doldurulabiliyor, geri gidip cevap değiştirilebiliyor,
sonunda sonuç durumuna geçiliyor (sonuç ekranı henüz boş olabilir). Lighthouse erişilebilirlik
skoru ≥ 90.

**Riskler/dikkat:** Soru sırasını "daha akıcı olur" diye değiştirme — şartname §3 sırayı
bilinçli kuruyor ve §6 terk ölçümü bu sıraya dayanıyor.

---

### Adım 9 — Puanlama mantığı (saf fonksiyon + birim testi)

- [ ] durum

**Ne yapılacak:** Puanlama UI'dan ayrı, saf ve test edilebilir bir fonksiyona alınır.

`apps/web/src/lib/karne/score.ts`:
- `scoreKarne(answers, intake) → KarneResult`
- `KarneResult`: `{ zeroCount, answeredCount, zeroQuestions: KarneQuestion[], strongQuestions: KarneQuestion[], euExposure: boolean, topThreeWeak: KarneQuestion[] }`
- Ağırlık **yok** (§4: boyut ağırlıkları ücretsiz sürümde uygulanmaz).
- `zeroCount` = 0 puan alınan soru sayısı → çıktının **tek nicel göstergesi**.
- `topThreeWeak` sıralaması: EU/UK maruziyeti varsa 7.6 (S4) ve 7.4 (S8) öne alınır; sonra
  şartname soru sırası. Belirlenimci olmalı (aynı girdi → aynı çıktı).
- `strongQuestions` = 4 puan alınanlar (§5 kural 3: iyi çıkan alan açıkça söylenir).
- Toplam puan hesaplanır ama **dışarı verilmez** — `KarneResult` içinde `totalScore` alanı
  bulunmaz, bulunursa UI'a sızma riski doğar.

Test: `apps/web`'e `vitest` devDependency eklenir (`packages/shared` deseniyle aynı),
`package.json`'a `"test": "vitest run"`, `turbo.json` `test` görevi zaten var.
`apps/web/src/lib/karne/score.spec.ts`:
- hepsi 4 → `zeroCount === 0`, `strongQuestions.length === 10`
- hepsi 0 → `zeroCount === 10`, `topThreeWeak.length === 3`
- karışık + EU=evet → S4 ve S8 `topThreeWeak`'te öne geçiyor
- S4'ün ilk iki şıkkı da 4 puan üretiyor
- sonuç nesnesinde `totalScore`/`percentage` benzeri alan **yok**

**Dokunulacak dosyalar/klasörler:**
- `apps/web/src/lib/karne/score.ts` (yeni), `score.spec.ts` (yeni)
- `apps/web/package.json`, `apps/web/vite.config.ts` (vitest `test` bloğu)
- `.github/workflows/ci.yml` (web test adımı)

**Kabul kriteri:** `pnpm --filter @verimaya/web test` yeşil, en az 5 test. CI'da web test
adımı çalışıyor.

**Riskler/dikkat:** Vitest'i SvelteKit vite config'ine eklerken `sveltekit()` plugin'i test
ortamında sorun çıkarabilir; saf `.ts` testleri için `environment: 'node'` yeterli.

---

### Adım 10 — Çıktı ekranı

- [ ] durum

**Ne yapılacak:** Şartname §5'in birebir uygulaması. **Bu adımın kuralları pazarlık konusu
değildir** — §5 açıkça öyle diyor.

Gösterilecekler, bu sırayla:
1. **`{zeroCount}` sorudan kaçında kanıt yok** — "10 sorudan 7'sinde kanıtınız yok."
   Tek nicel gösterge budur.
2. **En kritik üçü** — `topThreeWeak`, sayı değil **cümle** (`weakLabel`).
3. **İyi çıkan alan** — `strongQuestions` varsa açıkça yazılır ("S1 ve S5'te durumunuz iyi: …").
   Boşsa bu blok gizlenir.
4. **Tarihli kanca en sonda** — EU/UK = evet ise:
   *"İngiltere/AB'de yaşayan hastalarınız olduğu için … 2 Ağustos 2026'dan itibaren sizi
   kapsıyor."* Satış cümlesiyle değil **yükümlülükle** bitilir.

Gösterilmeyecekler (grep ile doğrulanacak): toplam puan, yüzde, `%` işareti, bant adı
(Başlangıç/Parçalı/Tutarlı/Olgun), 43 kriter, "skorunuz".

**Dokunulacak dosyalar/klasörler:**
- `apps/web/src/routes/(public)/yapay-zeka-karnesi/+page.svelte`
- `apps/web/src/lib/components/KarneResult.svelte` (yeni)

**Kabul kriteri:**
- Üç senaryo elle denenir: (a) hepsi 4, (b) hepsi 0 + EU evet, (c) karışık + EU hayır.
  (a)'da "0 soruda kanıt yok" ve güçlü alanlar; (b)'de üç kritik + tarihli kanca; (c)'de
  kanca **yok**.
- Yüzde denetimi: `KarneResult.svelte` içinde `{...}%` biçiminde bir **veri** çıktısı yok
  (CSS'teki `%` birimleri sayılmaz — gözle doğrula, salt grep'e güvenme).
- `grep -rniE "başlangıç|parçalı|tutarlı|olgun|skorunuz|puanınız" apps/web/src/routes/\(public\)/yapay-zeka-karnesi apps/web/src/lib/components/KarneResult.svelte` → boş.
- `grep -rn "totalScore\|percentage" apps/web/src/lib/karne/` → boş (Adım 9 kuralının kanıtı).

**Riskler/dikkat:** "Her hastaya aynı teşhisi koyan alet, alet değil reklamdır" (§5) — güçlü
alan bloğunu "yer kaplıyor" diye atlama. Bu ürünün güvenilirliğinin tek görünür kanıtı.

---

### Adım 11 — Karne SEO + sitemap + vitrin bağlantısı

- [ ] durum

**Ne yapılacak:** Karne artık çalışıyor; huninin ağzını aç.

- `/yapay-zeka-karnesi` `sitemap.xml`'e eklenir.
- Vitrin hero'suna ikincil CTA: "5 dakikada yapay zeka karnenizi alın" → karne rotası.
  Birincil CTA ("Demo talep et") değişmez — TASARIM.md § Vitrin sayfası düzeni.
- Karne sonuç ekranının altına vitrin/demo bağlantısı (satış cümlesi **tarihli kancadan
  sonra**, ayrı blokta — §5 kural 2'yi bozmayacak şekilde).
- `packages/shared/src/features.ts`'e yeni özellik kaydı + `changelog.ts`'e sürüm kaydı
  (CHANGELOG-KURALLARI.md kural 5: "Yayında"ya geçen özellik aynı commit'te changelog alır).
  **Bu, karnenin kendi kodunun shared'a girmesi değildir** — yalnız vitrin kaydı.

**Dokunulacak dosyalar/klasörler:**
- `apps/web/static/sitemap.xml`
- `apps/web/src/routes/(public)/vitrin/+page.svelte`
- `packages/shared/src/features.ts`, `packages/shared/src/changelog.ts`
- `CHANGELOG.md`

**Kabul kriteri:** Vitrinden tek tıkla karneye gidiliyor; build çıktısında her iki sayfa da
prerendered; `/features` sayfasında yeni kayıt "Yayında" rozetiyle görünüyor ve `/changelog`'da
karşılığı var.

**Riskler/dikkat:** Sürüm numarası CHANGELOG-KURALLARI § Sürümleme'ye uymalı (MINOR = yeni
özellik). Sürümsüz deploy yok.

---

# BLOK C — Karne ölçümü (yol haritası öncelik #3)

> Neden ayrı blok: karne sayfası statik kalır, ama e-posta ve terk verisi bir yere düşmeli.
> Karar: `apps/api`'de **public** (auth yok, tenant yok) uç noktalar. Bu, "her iş tablosunda
> `tenant_id`" ilkesinin **bilinçli ve tek** istisnasıdır — çünkü bu veri henüz bir tenant'a
> ait değil (lead, müşteri değil). İstisna şema dosyasına yorumla yazılır.
>
> Ölçülecek minimum (şartname §6): her sorunun görüntülenme sayısı, cevaplanma sayısı,
> soru başına geçen süre, e-posta bırakma oranı.

### Adım 12 — Ölçüm şeması + migration

- [ ] durum

**Ne yapılacak:** İki tablo, ikisi de tenant'sız, ikisi de RLS'siz — ve bu durum şema
dosyasında gerekçesiyle yazılı.

`apps/api/src/db/schema/karne-events.ts`:
- `karne_sessions`: `id uuid pk`, `started_at`, `last_seen_at`, `band text` (1-4/5-15/16+),
  `eu_exposure text`, `completed boolean default false`, `zero_count int null`,
  `user_agent_family text null`, `referrer text null`
- `karne_events`: `id`, `session_id fk`, `question_id text`, `event_type text`
  (`viewed` | `answered`), `choice_id text null`, `dwell_ms int null`, `created_at`
  → `UNIQUE (session_id, question_id, event_type)` (idempotent tekrar gönderim)
- `karne_leads`: `id`, `session_id fk`, `email text`, `consent_at timestamptz`,
  `created_at` → `UNIQUE (email)`

**PII notu:** IP adresi saklanmaz. `user_agent` ham değil aile (chrome/safari/…) olarak.
Referrer yalnız host. E-posta KVKK kapsamında — Adım 16'da aydınlatma metni gelir.

`pnpm --filter @verimaya/api db:generate` ile migration üretilir (`0015_…`).

**Dokunulacak dosyalar/klasörler:**
- `apps/api/src/db/schema/karne-events.ts` (yeni), `apps/api/src/db/schema/index.ts`
- `apps/api/drizzle/0015_karne_public.sql` (üretilen)
- `docs/MIMARI.md` — "Değişmez ilkeler" altına tek satırlık istisna notu

**Kabul kriteri:** `pnpm --filter @verimaya/api db:migrate` temiz koşar; `\d karne_events`
üç tabloyu da gösterir. Mevcut tenant izolasyon testleri hâlâ yeşil
(`pnpm --filter @verimaya/api test`).

**Riskler/dikkat:** Bu tabloların RLS'siz olması **kasıtlı** — ama başka hiçbir tablo için
emsal değil. MIMARI.md notu bunu açıkça yazsın, yoksa altı ay sonra "demek ki yapılabiliyormuş"
gerekçesi doğar.

---

### Adım 13 — Public ölçüm endpoint'leri

- [ ] durum

**Ne yapılacak:** `apps/api/src/karne/` modülü. Auth yok, `AuthOrApiKeyGuard` yok, tenant
context yok.

- `POST /v1/public/karne/sessions` → `{ band, eu_exposure, referrer_host? }` → `{ session_id }`
- `POST /v1/public/karne/events` → `{ session_id, question_id, event_type, choice_id?, dwell_ms? }`
  → 202, `ON CONFLICT DO NOTHING`
- `POST /v1/public/karne/complete` → `{ session_id, zero_count }` → 204

Koruma:
- Fastify rate-limit: IP başına dakikada 30 istek (mevcut `main.ts` kurulumuna bak, plugin
  yoksa `@fastify/rate-limit` eklenir).
- Gövde boyutu limiti; `question_id` bilinen 12 kimlikten biri olmalı (zod enum) — serbest
  metin kabul edilmez.
- CORS: yalnız `WEB_PUBLIC_URL` origin'i.
- Standart hata gövdesi (`error.code`, `error.message`, `request_id`) — AGENTS.md.

**Dokunulacak dosyalar/klasörler:**
- `apps/api/src/karne/karne.module.ts`, `karne.controller.ts`, `karne.service.ts` (yeni)
- `apps/api/src/app.module.ts`, `apps/api/src/main.ts` (rate-limit)
- `apps/api/openapi.yaml`

**Kabul kriteri:** `curl -X POST localhost:3000/v1/public/karne/sessions -d '{...}'` auth'suz
202/200 döner; aynı event iki kez gönderilince tabloda tek satır kalır; 31. istek 429 döner.
Yeni bir izolasyon testi: public endpoint hiçbir tenant tablosuna yazmıyor.

**Riskler/dikkat:** Bu, dışarıya açılan **kimliksiz yazma** yüzeyidir. Rate-limit ve zod enum
olmadan birleştirme (merge) yapma. Sentry'ye gürültü basmaması için 429'lar `warn` seviyesinde
loglanır.

---

### Adım 14 — Web tarafı event gönderimi

- [ ] durum

**Ne yapılacak:** Karne akışı ölçüm gönderir. Ölçüm **asla kullanıcı akışını bloklamaz**.

- `apps/web/src/lib/karne/telemetry.ts`: `startSession()`, `trackViewed(qid)`,
  `trackAnswered(qid, choiceId, dwellMs)`, `trackComplete(zeroCount)`.
- Tüm çağrılar `void` + `catch` → hata yutulur, kullanıcıya yansımaz.
- `navigator.sendBeacon` tercih edilir (sayfa kapanırken terk verisi kaybolmasın),
  yoksa `fetch(..., { keepalive: true })`.
- `dwell_ms`: soru göründüğü an – cevaplandığı an.
- Ölçüm kapatma anahtarı: `PUBLIC_KARNE_TELEMETRY=false` ile tamamen devre dışı (dev'de
  varsayılan kapalı, prod'da açık).
- `session_id` `sessionStorage`'da.

**Dokunulacak dosyalar/klasörler:**
- `apps/web/src/lib/karne/telemetry.ts` (yeni)
- `apps/web/src/routes/(public)/yapay-zeka-karnesi/+page.svelte`
- `apps/web/.env.example`

**Kabul kriteri:** Karne baştan sona doldurulunca DB'de 1 session + 20 event (10 viewed +
10 answered) + `completed = true` oluşur. 4. soruda sekme kapatılınca 4 viewed + 3 answered
kalır ve `completed = false` — **terk noktası ölçümü budur**. API kapalıyken karne hatasız
çalışmaya devam eder.

**Riskler/dikkat:** Prerender edilen sayfada telemetri modül düzeyinde çalışmamalı (`browser`
guard'ı). SSR sırasında `navigator` yok.

---

### Adım 15 — E-posta yakalama + KVKK aydınlatması

- [ ] durum

**Ne yapılacak:** Karar: **sonuç gösterildikten sonra** iste, konum tek sabitle değişebilsin.

- `POST /v1/public/karne/leads` → `{ session_id, email, consent: true }` → 204.
  Honeypot alanı (`website`, boş olmalı) + rate-limit.
- Web: sonuç ekranının altında "Detaylı raporu e-posta ile alın" bloğu; onay kutusu
  **işaretsiz** başlar; kısa aydınlatma metni + `/kvkk-aydinlatma` bağlantısı.
- Konum sabiti: `apps/web/src/lib/karne/config.ts` →
  `export const EMAIL_GATE_POSITION: 'before-result' | 'after-result' = 'after-result';`
  `before-result` yolu da **kodlanır** (ileride ölçümle A/B yapılabilsin diye), ama varsayılan
  `after-result`.
- E-posta bırakma oranı = `karne_leads` / `karne_sessions.completed`.

**Dokunulacak dosyalar/klasörler:**
- `apps/api/src/karne/karne.controller.ts`, `karne.service.ts`
- `apps/web/src/lib/karne/config.ts` (yeni), `KarneResult.svelte`
- `apps/web/src/routes/(public)/kvkk-aydinlatma/+page.svelte` (yeni, prerendered)

**Kabul kriteri:** E-posta bırakılınca `karne_leads`'e tek satır düşer; aynı e-posta ikinci
kez 204 döner ama yeni satır oluşmaz. Onay kutusu işaretlenmeden gönder butonu pasif.
Honeypot dolu istek 400 döner.

**Riskler/dikkat:** Aydınlatma metni olmadan e-posta toplama KVKK ihlali. Metin hukukçu
onaylı değilse kullanıcıya sor — taslak metinle yayına **çıkma**.

---

### Adım 16 — Ölçüm okuma yüzeyi

- [ ] durum

**Ne yapılacak:** Toplanan veri okunabilir olmadan işe yaramaz. En küçük yeterli çözüm:

- `apps/api/scripts/karne-stats.sql`: soru bazlı görüntülenme/cevaplanma/terk oranı,
  medyan dwell, tamamlama oranı, e-posta oranı, bant + EU dağılımı (şartname §6 eksen 1 ve 3).
- `pnpm --filter @verimaya/api karne:stats` script'i bunu koşup tabloyu terminale basar.
- Panel ekranı **yapılmaz** (bu veri tenant'a ait değil, panelde yeri yok).

**Dokunulacak dosyalar/klasörler:**
- `apps/api/scripts/karne-stats.sql`, `apps/api/scripts/karne-stats.js` (yeni)
- `apps/api/package.json`

**Kabul kriteri:** Birkaç sahte oturum sonrası `pnpm --filter @verimaya/api karne:stats`
her soru için görüntülenme/cevaplanma sayısını ve terk oranını doğru basar.

**Riskler/dikkat:** İlk 10 gerçek doldurma kalibrasyon verisidir (şartname §6) — pilotta
bu çıktıyı düzenli oku, yoksa saha testi ekseni 1 ve 3 boşa gider.

---

# BLOK D — Faz 1 açık ucu: hasta dosyaları object storage (yol haritası öncelik #4)

> Yol haritası Faz 1: `[~] Hasta dosyaları: local upload stub çalışıyor, S3/R2 sonra.`
> Bugün: `apps/api/src/patients/local-file-storage.ts`, `storage_key = 'local://…'`,
> 25 MiB sınırı, `UPLOAD_DIR`. Pilot bunu bekler (ETL dosya meta'sı da buraya bağlanacak).
>
> **Faz 2 notu:** Yol haritası "Faz 1-2'nin açık uçları" diyor ama Faz 2'nin altındaki
> altı maddenin **hepsi `[x]`** — yalnız faz rozeti `🚧` kalmış. Yani Faz 2'de somut açık uç
> yok; rozet Adım 44'te düzeltilir. Faz 2'de gerçekten eksik bir şey görürsen **durup sor**,
> kendiliğinden iş üretme.

### Adım 17 — Depolama portu (arayüz) + local adapter'ı arkasına al

- [ ] durum

**Ne yapılacak:** Adaptör katmanı ilkesi (AGENTS.md madde 5) dosya depolamaya da uygulanır:
domain kodu S3'ü bilmez.

`apps/api/src/storage/`:
- `storage.types.ts`: `FileStoragePort` — `put(key, buf, meta)`, `getStream(key)`,
  `exists(key)`, `remove(key)`, `signedGetUrl(key, ttl)`, `signedPutUrl(key, ttl)`
  (son ikisi local'de `null` döner).
- `local-file.storage.ts`: mevcut `local-file-storage.ts` mantığı **davranış değiştirmeden**
  bu arayüzü uygular.
- `storage.module.ts`: `STORAGE_DRIVER=local|s3` env'ine göre sağlayıcı seçer (bu adımda
  yalnız `local` var).
- `patients.service.ts` doğrudan `local-file-storage`'ı değil portu çağırır.

**Dokunulacak dosyalar/klasörler:**
- `apps/api/src/storage/` (yeni), `apps/api/src/patients/patients.service.ts`,
  `patients.controller.ts`, `apps/api/src/app.module.ts`
- `apps/api/src/patients/local-file-storage.ts` (taşınır)

**Kabul kriteri:** `pnpm --filter @verimaya/api test` yeşil (özellikle
`files.isolation.spec.ts`). Dosya yükleme/indirme UI'dan **aynı** çalışıyor. Davranış
değişikliği sıfır — bu saf refaktör.

**Riskler/dikkat:** `resolveLocalFilePath`'teki path traversal korumaları aynen taşınmalı.
Refaktör sırasında güvenlik kontrolü düşmesi klasik hatadır.

---

### Adım 18 — S3/R2 adapter

- [ ] durum

**Ne yapılacak:** `apps/api/src/storage/s3-file.storage.ts` — Cloudflare R2 (S3 uyumlu)
hedefli, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.

- Env: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
  `S3_FORCE_PATH_STYLE`.
- Anahtar deseni: `s3://{tenantId}/{patientId}/{fileId}` — local ile aynı üç parçalı yapı,
  yalnız şema farklı (`storage_key` sütunu şema taşıyor, geriye dönük uyum bedava).
- Presigned URL TTL varsayılan 5 dk.
- Sunucu üzerinden proxy indirme yolu **korunur** (küçük dosyalar ve denetim için).
- Birim testi: SDK mock'lanarak anahtar üretimi + TTL doğrulanır (ağ çağrısı yok).

**Dokunulacak dosyalar/klasörler:**
- `apps/api/src/storage/s3-file.storage.ts`, `s3-file.storage.spec.ts` (yeni)
- `apps/api/src/storage/storage.module.ts`, `apps/api/package.json`, `.env.example`

**Kabul kriteri:** `STORAGE_DRIVER=s3` + R2 test bucket'ı ile: yükle → listede görün →
indir → sil akışı çalışır. `STORAGE_DRIVER=local` ile davranış hiç değişmemiş.

**Riskler/dikkat:** R2 bucket'ı **public olmamalı**; erişim yalnız presigned URL ile.
Bucket AB bölgesinde (KVKK/GDPR — MIMARI.md § Güvenlik çerçevesi). CORS ayarı presigned
PUT için gerekli.

---

### Adım 19 — Presigned yükleme akışı + tenant izolasyon testi

- [ ] durum

**Ne yapılacak:** Büyük dosya API sunucusundan geçmesin.

- `POST /v1/patients/:id/files/presign` → `{ filename, mime_type, size_bytes }` →
  `{ file_id, upload_url, storage_key }`. Meta satırı `pending` durumunda yazılır.
- `POST /v1/patients/:id/files/:fileId/confirm` → yükleme sonrası meta `ready` olur;
  boyut/mime sunucuda doğrulanır (`headObject`).
- 25 MiB sınırı presign aşamasında uygulanır.
- Web: `apps/web` dosya yükleme bileşeni presigned yola geçer, ilerleme çubuğu.
- **Zorunlu negatif izolasyon testi:** Tenant A, Tenant B'nin `file_id`'si için presign
  veya confirm alamaz (AGENTS.md § Test).

**Dokunulacak dosyalar/klasörler:**
- `apps/api/src/patients/patients.controller.ts`, `patients.service.ts`
- `apps/api/src/patients/files.isolation.spec.ts`
- `packages/shared/src/file.ts` (şema önce burada değişir — AGENTS.md madde 7)
- `apps/web` dosya yükleme bileşeni, `apps/api/openapi.yaml`

**Kabul kriteri:** 20 MB'lık dosya yüklenir ve API sunucusunun bellek/istek boyutu limitine
takılmaz. İzolasyon testi çapraz tenant için 404/403 bekler ve geçer. `Idempotency-Key`
desteklenir.

**Riskler/dikkat:** Şema değişikliği **önce** `packages/shared`'da yapılır, sonra api ve web
türetir. Confirm edilmeyen `pending` satırlar için temizlik işi (24 saat sonra sil) not düşülür
— bu adımda yapılmasa bile `jobs`'a bir TODO satırı bırakma, açıkça kullanıcıya sor.

---

### Adım 20 — Mevcut local dosyaların taşınması + dokümantasyon

- [ ] durum

**Ne yapılacak:** Geçiş yolu ve geri dönüş yolu yazılı olsun.

- `apps/api/scripts/migrate-files-to-s3.js`: `local://` anahtarlı satırları okur, R2'ye
  yükler, `storage_key`'i `s3://`'e günceller. `--dry-run` varsayılan, `--apply` açık istek.
- Karışık durum desteklenir: bazı satırlar `local://`, bazıları `s3://` — port anahtardaki
  şemaya göre doğru adapter'ı seçer.
- `docs/DEPLOY-COOLIFY.md`: R2 env değişkenleri + bucket kurulumu.
- Yol haritasında Faz 1 `[~]` → `[x]` (Obsidian dosyası; kullanıcı onaylarsa güncelle).

**Dokunulacak dosyalar/klasörler:**
- `apps/api/scripts/migrate-files-to-s3.js` (yeni)
- `apps/api/src/storage/storage.module.ts` (şema bazlı adapter seçimi)
- `docs/DEPLOY-COOLIFY.md`, `.env.example`

**Kabul kriteri:** Dry-run kaç dosya taşınacağını doğru sayar; `--apply` sonrası her dosya
indirilebilir ve `storage_key` güncellenmiş. Taşıma iki kez koşulduğunda ikinci koşu 0 dosya
taşır (idempotent).

**Riskler/dikkat:** Taşıma sırasında local dosyalar **silinmez** — doğrulama bitene kadar
kalır. Silme ayrı ve elle.

---

# BLOK E — Faz 3 WhatsApp'ın kalanı (yol haritası öncelik #5)

> Yol haritası: "Zaten büyük ölçüde çalışıyor (`ai_corrections`, taslak/onay). Bu bitince
> ürün içi karnenin otomatik dolduracağı kriterlerin çoğunun altyapısı hazır olur."
> Faz 3'ün alt maddeleri `[x]` ama faz `🚧` — kalan kısım tanımlı değil.

### Adım 21 — Faz 3 kapanış denetimi (kod yazılmaz, liste çıkarılır)

- [ ] durum

**Ne yapılacak:** Kalan iş listesini **varsaymak yerine ölçerek** çıkar. Çıktı: kullanıcıya
sunulacak kısa bir tablo, sonra onun kararına göre Adım 22+ şekillenir.

Denetlenecekler:
1. `POST /v1/webhooks/waha` — imza doğrulaması var mı, yoksa yalnız `X-Tenant-Id` + paylaşılan
   secret'a mı güveniyor? (AGENTS.md madde 2: "endpoint yalnız **imza doğrular**")
2. Giden mesaj yolu var mı? Bugün yalnız gelen (`inbound_messages`) görünüyor.
3. `apps/api/src/integrations/llm/` — gerçek sağlayıcıya bağlı mı, stub mı? PII minimizasyonu
   uygulanıyor mu (MIMARI.md § Güvenlik: "LLM'e giden veride PII minimizasyonu")?
4. `heuristic-parse.ts` ile LLM yolu arasındaki seçim nerede yapılıyor, env ile mi?
5. Dead-letter / retry davranışı `inbound_message.process` için test edilmiş mi?
6. `ai_corrections` kayıtları ürün içi karnenin 4.5/4.6 ve 5.4/7.2 kriterlerini besleyecek
   şekilde sorgulanabiliyor mu (alan bazında)?

**Dokunulacak dosyalar/klasörler:** Hiçbiri (salt okuma). Çıktı: bu dosyaya Adım 21 altına
bulgu tablosu yazılır.

**Kabul kriteri:** Altı maddenin her biri için "var / yok / kısmi + dosya:satır" satırı.
Sonunda kullanıcıya sorulur: hangileri bu turda kapatılacak?

**Riskler/dikkat:** Bu adımda **kod yazma**. Protokol madde 6'nın uygulaması: belirsizlik
varsa ölç ve sor.

---

### Adım 22 — WAHA webhook imza doğrulaması

- [ ] durum

**Ne yapılacak:** (Adım 21 "yok/kısmi" derse.) Queue-first webhook deseninin ilk şartı imza.

- `WAHA_WEBHOOK_SECRET` ile HMAC-SHA256; ham gövde üzerinden (`rawBody` zaten hesaplanıyor).
- Zaman damgası penceresi (±5 dk) ile replay koruması.
- İmza geçersizse 401 ve **kuyruğa hiçbir şey yazılmaz**.
- Var olan idempotency (`provider` + `external_event_id`) korunur.
- Test: geçerli imza → 202 + 1 satır; geçersiz → 401 + 0 satır; aynı event iki kez → 202 + 1 satır.

**Dokunulacak dosyalar/klasörler:**
- `apps/api/src/webhooks/webhooks.controller.ts`, yeni `webhooks.signature.ts`
- `apps/api/src/webhooks/*.spec.ts`, `.env.example`, `apps/api/openapi.yaml`

**Kabul kriteri:** Üç testin üçü de geçer; `pnpm --filter @verimaya/api test` yeşil.

**Riskler/dikkat:** Fastify ham gövdeye erişim için `rawBody` yakalama gerektirir; JSON parser
gövdeyi tüketmeden önce sakla. Mevcut `validateWebhookRequest` bunu yapıyor gibi — kır ma.

---

### Adım 23 — WhatsApp AI ifşa ayarı (kriter 7.6)

- [ ] durum

**Ne yapılacak:** Ürün içi karnenin **en kritik otomatik dolan kriteri** ve aynı zamanda
gerçek bir uyum yükümlülüğü (EU AI Act m.50, 2 Ağustos 2026). Yol haritası Faz 8 bunu açıkça
listeliyor: *"7.6 şeffaflık (WhatsApp AI ifşa ayarı — aynı ekrandan açılabilir)"*.

- `tenant_settings` anahtarı `whatsapp_ai_disclosure`:
  `{ enabled: boolean, text: string, updated_by, updated_at }`
- `packages/shared`'da zod şeması (`tenant.ts` veya yeni `ai-disclosure.ts`).
- `GET/PUT /v1/settings/ai-disclosure` (mevcut `SettingsService` deseniyle).
- `/settings/ai` ekranına kart: açık/kapalı + ifşa metni + "neden önemli" kısa açıklama
  (tarih dahil). Metin i18n kataloğundan (`apps/web/src/lib/i18n/messages.ts`).
- Değişiklik `audit_logs`'a yazılır (karnenin 8.5 "onay zaman damgaları" kriterini besler).

**Dokunulacak dosyalar/klasörler:**
- `packages/shared/src/…` (önce), `apps/api/src/settings/settings.service.ts`,
  `settings.controller.ts`
- `apps/web/src/routes/settings/ai/+page.svelte`, `apps/web/src/lib/i18n/messages.ts`
- `apps/api/openapi.yaml`

**Kabul kriteri:** Ayar açılıp kapanabiliyor; `audit_logs`'ta kayıt oluşuyor; tenant izolasyon
testi (A, B'nin ayarını okuyamaz/yazamaz) geçiyor. `tr` kataloğuna eklenen anahtar `en`'e
eklenmezse **derleme hatası** alındığı doğrulanmış (kuralın çalıştığının kanıtı).

**Riskler/dikkat:** Ayar yalnız bir bayrak değil — Adım 24 onu fiilen uygular. İkisi ayrı
commit ama ayar tek başına yayına çıkarsa "açtım ama hiçbir şey olmuyor" durumu doğar; adım
sırasını bozma.

---

### Adım 24 — İfşa metninin giden mesajda uygulanması

- [ ] durum

**Ne yapılacak:** Ayar açıkken, AI destekli/otomatik giden her WhatsApp mesajının başına
(veya konuşmanın ilk mesajına) ifşa metni eklenir.

- Uygulama noktası giden mesaj yolunda; Adım 21 "giden yol yok" derse bu adım **giden yolun
  kendisiyle birlikte** yeniden boyutlandırılır ve kullanıcıya sorulur.
- İnsanın elle yazdığı mesaja ifşa eklenmez — yalnız AI üretimi.
- Uygulandığı her seferde `audit_logs` satırı (kanıt üretimi).

**Dokunulacak dosyalar/klasörler:**
- `apps/api/src/whatsapp/whatsapp.service.ts`, giden mesaj adaptörü
- `apps/api/src/common/audit-helper.ts` kullanımı

**Kabul kriteri:** Ayar açıkken gönderilen AI mesajı ifşa metnini içerir; kapalıyken içermez;
elle yazılan mesaj her iki durumda da değişmez. Audit kaydı oluşur.

**Riskler/dikkat:** AGENTS.md madde 6 — AI çıkarımı taslaktır, insan onayı olmadan kesin
kayda yazılmaz. Bu adım o kuralı değiştirmez, yalnız **onaylanmış** giden mesaja ifşa ekler.

---

### Adım 25 — LLM sağlayıcı yolu + PII minimizasyonu

- [ ] durum

**Ne yapılacak:** (Adım 21 bulgusuna göre.) `POST /v1/whatsapp/parse`'ın LLM yolu canlıya
hazır hale getirilir.

- `apps/api/src/integrations/llm/` adaptör arayüzü (domain kodu sağlayıcıyı bilmez —
  AGENTS.md madde 5).
- `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` env; sağlayıcı ve **sürüm** loglanır
  (ürün içi karne kriteri 3.2 buradan dolacak).
- PII minimizasyonu: LLM'e gönderilmeden önce telefon/e-posta/TCKN maskelenir; maskeleme
  fonksiyonu ayrı ve test edilir.
- Hata/timeout durumunda `heuristic-parse.ts`'e düşer (graceful degradation).
- Maliyet/token sayımı `jobs` ledger'ına yazılır (karne kriteri 8.5 TCO için).

**Dokunulacak dosyalar/klasörler:**
- `apps/api/src/integrations/llm/`, yeni `pii-mask.ts` + `pii-mask.spec.ts`
- `apps/api/src/whatsapp/whatsapp.service.ts`, `.env.example`, `docs/MIMARI.md`

**Kabul kriteri:** Maskeleme testi telefon/e-posta/TCKN için geçer; LLM sağlayıcısı kapalıyken
parse hâlâ heuristic ile çalışır; kullanılan model ve sürüm `jobs` satırında görünür.

**Riskler/dikkat:** Hasta verisi dış LLM'e gidiyor — KVKK veri işleme envanterine bu akış
yazılmalı (`docs/` altında ilgili not veya Obsidian `05-guvenlik-kvkk.md`). Envanter
güncellenmeden prod'a alma.

---

# BLOK F — Faz 8: ETL apply, pilot, ürün içi karne (yol haritası öncelik #6)

> Yol haritası: *"Pilot ve ürün içi karne aynı anda konuşlanır, ayrı iş değil."*
> Bugün: `etl:dry-run` fixture üzerinden çalışıyor, `--apply` reddediliyor
> (`apps/api/scripts/etl-dry-run.js`, `apps/api/scripts/etl-stub.md`).

## F1 — ETL apply

### Adım 26 — Legacy keşif + alan eşleme tablosu

- [ ] durum

**Ne yapılacak:** `etl-stub.md` § Fazlar 1-2'nin fiilen yapılması. Kod değil, **doğrulanmış
eşleme** üretilir.

- Tracker DB'sinin salt-okunur snapshot'ı alınır (`pg_dump` veya kopya).
- Her tablo için satır sayısı; `docs/legacy-reference/` notlarıyla karşılaştırılır.
- `docs/legacy-reference/ETL-ESLEME.md` yazılır: Tracker sütunu → Verimaya sütunu → dönüşüm
  (para `*100`, tarih UTC, enum eşlemesi) → boş/çakışma durumunda ne yapılacak.
- Sabit listeler (contact türleri, finans kategorileri, randevu türleri) Verimaya
  `DEFAULT_*` seed'leriyle eşleştirilir; eşleşmeyenler listelenir ve **kullanıcıya sorulur**.

**Dokunulacak dosyalar/klasörler:**
- `docs/legacy-reference/ETL-ESLEME.md` (yeni)
- `apps/api/fixtures/etl-sample.json` (gerçek veriden anonimleştirilmiş örnekle genişletilir)

**Kabul kriteri:** Eşleme tablosunda Verimaya'nın her zorunlu (`NOT NULL`) alanı için bir
kaynak veya varsayılan yazılı. Eşleşmeyen enum değeri kalmamış (ya eşlendi ya kullanıcı karar verdi).

**Riskler/dikkat:** Snapshot **salt okunur**; canlı Tracker'a bağlanma. Anonimleştirilmemiş
hasta verisi repoya girmesin.

---

### Adım 27 — External id map tablosu + migration

- [ ] durum

**Ne yapılacak:** ETL'in idempotent olabilmesi için legacy kimlik ↔ Verimaya UUID eşlemesi
kalıcı bir tabloda durmalı. Bugün GHL entegrasyonu bunu `notes` içinde marker ile yapıyor
(`ghl_contact_id=…`) — ETL için bu yetersiz.

`apps/api/src/db/schema/external-ids.ts`:
- `external_ids`: `id`, `tenant_id NOT NULL`, `source text` (`legacy_tracker` | `ghl` | …),
  `entity_type text` (`contact` | `patient` | `appointment` | `transaction` | `file`),
  `external_id text`, `internal_id uuid`, `created_at`
- `UNIQUE (tenant_id, source, entity_type, external_id)`
- RLS **aktif** (tenant tablosu — Blok C'deki istisna buraya uygulanmaz).

**Dokunulacak dosyalar/klasörler:**
- `apps/api/src/db/schema/external-ids.ts`, `index.ts`, yeni migration
- Negatif izolasyon testi: `apps/api/src/db/external-ids.isolation.spec.ts`

**Kabul kriteri:** Migration koşar; Tenant A, Tenant B'nin eşleme satırını göremez (test geçer).

**Riskler/dikkat:** Bu tablo ileride GHL marker'ının da yerini alabilir; ama GHL refaktörünü
bu adıma **karıştırma** (Blok G'de ayrı).

---

### Adım 28 — ETL apply: sözlük + kişiler + hastalar

- [ ] durum

**Ne yapılacak:** `etl-dry-run.js` gerçek yazma yoluna kavuşur — ama yalnız ilk iki katman.

- `TRACKER_DATABASE_URL` + `--tenant-id` + `--apply` zorunlu.
- Sıra: sözlükler (contact_types, finance_categories, appointment_types) → contacts → patients.
- Her insert `ON CONFLICT DO NOTHING` + `external_ids`'e eşleme satırı.
- Batch (1000'lik) ve her batch sonunda ilerleme çıktısı.
- `--dry-run` hâlâ varsayılan; `--apply` açık bayrak.
- Yazma `SET LOCAL app.current_tenant_id` bağlamı içinde (RLS aktif kalır — script RLS'i
  **bypass etmez**).

**Dokunulacak dosyalar/klasörler:**
- `apps/api/scripts/etl-dry-run.js` → `apps/api/scripts/etl.js` olarak yeniden adlandırılır
  (veya `etl-apply.js` eklenir), `apps/api/package.json`
- `apps/api/scripts/etl-stub.md` → güncellenir

**Kabul kriteri:** Boş bir test tenant'ına apply koşulur; kişi ve hasta sayıları Tracker
sayılarıyla eşleşir. **İkinci koşu 0 yeni satır ekler** (idempotency kanıtı).

**Riskler/dikkat:** RLS bypass'ı cazip gelecek (superuser bağlantısı) — yapma. RLS ile
çalışmayan ETL, RLS'in gerçekten doğru kurulmadığını gösterir; hatayı gizleme, düzelt.

---

### Adım 29 — ETL apply: randevu, işlem, dosya meta, case notları

- [ ] durum

**Ne yapılacak:** İlişkili veri katmanı (`etl-stub.md` § Fazlar 4).

- `appointments`: `case_id` → `patient_id` (external_ids üzerinden), `type` → `appointment_type`.
- `transactions`: `amount_major * 100` → minor unit integer; para birimi ve `amount_base`
  kuralları tenant ayarına göre.
- `files`: **meta-only**; `storage_key` Blok D sonrası artık `local://pending` yerine
  gerçek bir hedefe işaret edebilir — ama blob taşıma bu adımın **dışında**, ayrı karar.
- `case_notes`.
- Eksik/kırık FK durumunda satır atlanır ve rapora yazılır (sessizce düşürme yok).

**Dokunulacak dosyalar/klasörler:**
- `apps/api/scripts/etl.js`, `apps/api/scripts/etl-stub.md`

**Kabul kriteri:** Her tür için satır sayısı eşleşir; atlanan satırlar gerekçesiyle listelenir.
İkinci koşu 0 yeni satır. Para alanları örneklem kontrolünde doğru (100 TL → 10000).

**Riskler/dikkat:** Para birimi dönüşümü en klasik sessiz hata kaynağı. En az 5 kaydı elle
karşılaştır, otomatik teste güvenme.

---

### Adım 30 — ETL doğrulama raporu + kesim provası

- [ ] durum

**Ne yapılacak:** `etl-stub.md` § Faz 5-6.

- `pnpm --filter @verimaya/api etl:verify`: satır sayıları, checksum örnekleri, duplicate
  taraması, Tracker rapor özeti ↔ Verimaya `GET /v1/reports` karşılaştırması.
- Farklar tablo halinde; tolerans dışı fark varsa çıkış kodu ≠ 0.
- Kesim (cutover) kontrol listesi `docs/` altına yazılır: Tracker salt-okunur, ETL koşusu,
  doğrulama, DNS/erişim, geri dönüş planı.

**Dokunulacak dosyalar/klasörler:**
- `apps/api/scripts/etl-verify.js` (yeni), `apps/api/package.json`
- `docs/ETL-KESIM.md` (yeni)

**Kabul kriteri:** Verify çıktısı sıfır tolerans dışı fark gösteriyor; kesim listesi baştan
sona okunabilir ve her maddesi "kim yapar / nasıl geri alınır" içeriyor.

**Riskler/dikkat:** Geri dönüş planı olmayan cutover yapma. Tracker dahili kullanımda çalışmaya
devam ediyor (MIMARI.md § Eski sistemle ilişki) — kesim tek yönlü değil.

---

## F2 — Canlı deploy + pilot

### Adım 31 — Coolify canlı deploy + yedek/restore provası

- [ ] durum

**Ne yapılacak:** Yol haritası Faz 0b: *"Coolify hazırlığı (canlı deploy henüz yok)"*.
Pilot bunsuz başlamaz.

- `docs/DEPLOY-COOLIFY.md` ve `apps/web/DEPLOY-STATIC.md` uygulanır: api + web + Postgres +
  Redis servisleri ayağa kalkar.
- Cloudflare önde (WAF/TLS), Hetzner firewall yalnız 80/443, Postgres/Redis dışa kapalı
  (MIMARI.md § Güvenlik çerçevesi).
- **Günlük otomatik Postgres yedeği + sunucu dışı kopya** kurulur.
- **Restore provası yapılır** — yedek geri yüklenip veri doğrulanır. Prova yapılmamış yedek
  yedek değildir.
- Sentry DSN, `BETTER_AUTH_SECRET`, kripto anahtarı deploy secret'ında.

**Dokunulacak dosyalar/klasörler:**
- `docs/DEPLOY-COOLIFY.md`, `.env.example` (dokümantasyon; altyapı işi repo dışında)

**Kabul kriteri:** `https://…/v1/health` 200; panel canlıda açılıyor; `/vitrin` ve
`/yapay-zeka-karnesi` prerendered olarak servis ediliyor (`curl` ile içerik doğrulaması —
Adım 3'ün canlı tekrarı). Restore provası kayıt altına alınmış (tarih + sonuç).

**Riskler/dikkat:** Karne canlıya çıkınca gerçek e-posta toplamaya başlar — Adım 15'in KVKK
aydınlatması yayında olmadan bu adımı tamamlama.

---

### Adım 32 — Pilot kesim: kendi firmamız ilk tenant

- [ ] durum

**Ne yapılacak:** ETL apply canlıda koşulur, kendi firmamız ilk tenant olur, 2-4 haftalık
dahili pilot başlar.

- Prod tenant + org (better-auth) oluşturulur, kullanıcılar davet edilir.
- Adım 28-30 canlı veriyle tekrar edilir (önce dry-run + verify, sonra apply).
- Pilot günlüğü: Obsidian `04-ilerleme-log.md`'ye günlük 1-2 satır.
- Hata/eksik listesi biriktirilir — pilot çıktısı bu listedir.

**Dokunulacak dosyalar/klasörler:** Repo dışı (operasyon); repo tarafında yalnız pilotta
çıkan düzeltmeler.

**Kabul kriteri:** Ekip günlük işini Verimaya üzerinde yapıyor; Tracker'a dönme ihtiyacı
kalan yerler listelenmiş.

**Riskler/dikkat:** Pilot sırasında yeni özellik ekleme dürtüsüne diren — pilot **ölçüm**
dönemidir. Çıkan istekleri listeye yaz, yol haritasına sor.

---

## F3 — Ürün içi Yapay Zeka Karnesi

> Şartname: `Ai Rediness/Fikirler/Olcek-Profili-Spec.md` (43 kriter, 3 bant, profil kilidi).
> Ücretsiz karneden **tamamen ayrı** kod: login arkası, tenant'lı, `packages/shared`'da yaşar.
> Yol haritası: pilotla **aynı anda** konuşlanır.

### Adım 33 — Kriter seti + bant/kurulum veri modeli (shared)

- [ ] durum

**Ne yapılacak:** 43 kriterin tamamı tipli veri olarak `packages/shared/src/scorecard/`
altına girer.

- 8 boyut, ağırlıklar (Strateji ×1,5 · Veri ×1,5 · Teknoloji ×1 · İnsan ×1 · Süreç ×1 ·
  Yönetişim ×1,5 · Risk & Uyum ×1,5 · Ölçüm ×1,5).
- Her kriter: `id` (`1.1`…`8.5`), `dimension`, `text`, `bandApplicability`
  (`1-4` / `5-15` / `16+` → `valid` | `restated` | `na` | `setupGated`), `restatedText?`,
  `setupQuestion?` (S1/S2/S3), `criticalityNote?` (⬆️ / ⬆️⬆️).
- 3 kurulum sorusu (S1 orta kademe → 4.4; S2 ayrı fonksiyon → 4.1, 4.2; S3 yazılı süreç → 5.5).
- Yeni kriterler 3.6, 4.6, 7.6 dahil (v3).
- 0–4 skalası; **N/A bir beyandır** — sessiz silme yok, beyan görünür kalır (§1b).

**Dokunulacak dosyalar/klasörler:**
- `packages/shared/src/scorecard/criteria.ts`, `bands.ts`, `types.ts`, `index.ts` (yeni)

**Kabul kriteri:** `pnpm --filter @verimaya/shared check` temiz. Kriter sayısı **tam 43**
(test ile doğrula). Bant başına geçerli kriter sayıları şartname §6 "Yaklaşık payda"
tablosuyla uyumlu: 1-4 → ~32, 5-15 → ~39, 16+ → ~40-43.

**Riskler/dikkat:** Ücretsiz karnenin `apps/web/src/lib/karne/` verisiyle **birleştirme**.
İkisi farklı ürün; ortaklaştırma ikisini de bozar (biri 10 soru + puan gizli, öbürü 43 kriter
+ yüzde görünür).

---

### Adım 34 — Ölçüm/profil tabloları + profil kilidi

- [ ] durum

**Ne yapılacak:** Şartname §5 — profil ilk ölçümde kilitlenir; sessiz yeniden hesaplama yasak.

- `scorecard_profiles`: `tenant_id`, `band`, `setup_s1/s2/s3`, `locked_at` → tenant başına
  aktif tek profil.
- `scorecard_assessments`: `tenant_id`, `profile_id`, `started_at`, `completed_at`,
  `zero_count`, `percentage numeric` (saklanır ama gösterimi ikincil).
- `scorecard_answers`: `assessment_id`, `criterion_id`, `score 0..4 | null`,
  `na_declared boolean`, `evidence_note text?`, `source text` (`manual` | `auto`),
  `answered_at`.
- Profil değişirse: eski profil arşivlenir, yeni ölçüm **"başlangıç ölçümü"** olarak işaretlenir
  ve kıyaslanamazlık uyarısı taşınır.
- RLS + negatif izolasyon testi zorunlu.

**Dokunulacak dosyalar/klasörler:**
- `apps/api/src/db/schema/scorecard.ts` + migration
- `apps/api/src/scorecard/` modülü iskeleti
- `apps/api/src/scorecard/scorecard.isolation.spec.ts`

**Kabul kriteri:** Migration koşar; profil kilitliyken bant değiştirilmeye çalışılınca API
`409` + açık mesaj döner ve yeni bir "başlangıç ölçümü" önerir. İzolasyon testi geçer.

**Riskler/dikkat:** "Kullanıcı kolaylığı" adına sessiz yeniden hesaplama ekleme — §5 bunu
ürünün tezini bozan hata olarak tanımlıyor.

---

### Adım 35 — Otomatik dolan kriterler (sistemin bildiği cevaplar)

- [ ] durum

**Ne yapılacak:** Yol haritası Faz 8'in çekirdeği. Otomatik dolan kriterler ve kaynakları:

| Kriter | Kaynak | Nasıl |
|---|---|---|
| 2.4 entegrasyon/silo | `tenant_credentials`, `api_keys`, `webhook_subscriptions` | bağlı sistem sayısı |
| 3.2 model/sürüm | `jobs` LLM ledger satırları (Adım 25) | son kullanılan sağlayıcı + sürüm |
| 4.5 hatalı çıktı bildirimi | `ai_corrections` | son 90 günde düzeltme kaydı var mı |
| 4.6 anahtar kişi | `audit_logs` | eylemlerin kullanıcıya göre dağılımı (tek kişi yoğunluğu) |
| 5.4 / 7.2 onay-red oranı | `inbound_messages` + `ai_corrections` | onaylanan / reddedilen taslak oranı |
| 7.6 şeffaflık | `whatsapp_ai_disclosure` (Adım 23) | ayar açık mı |
| 8.5 onay zaman damgaları | `audit_logs` | onay adımlarının insan zamanı tahmini |

- Her otomatik cevap `source = 'auto'` ve **kanıt bağlantısı** taşır (hangi sorgudan geldi).
- Kullanıcı otomatik cevabı **ezebilir** — ezerse `source = 'manual'` olur ve fark görünür kalır.
- Otomatik dolum, veri yoksa cevap **üretmez** (boş bırakır) — uydurma yok.

**Dokunulacak dosyalar/klasörler:**
- `apps/api/src/scorecard/auto-fill.service.ts` + `auto-fill.spec.ts`
- `apps/api/src/scorecard/scorecard.service.ts`

**Kabul kriteri:** Pilot tenant'ında en az **8 kriter** otomatik doluyor; her biri kanıt
bağlantısı taşıyor; boş veri durumunda hiçbiri uydurulmuyor (test). Tenant izolasyonu korunuyor.

**Riskler/dikkat:** 4.6 (anahtar kişi) çıkarımı istatistiksel ve yanılabilir — çıktı
"kesin" değil "sistemin gözlemi" dilinde sunulmalı ve kolay ezilebilmeli.

---

### Adım 36 — Ürün içi karne ekranı

- [ ] durum

**Ne yapılacak:** Panel içinde `/scorecard` (rota **İngilizce** — AGENTS.md § Dil ve slug;
kullanıcıya görünen ad kataloğa `nav.scorecard` olarak eklenir).

Gösterim sırası şartname §6'ya **birebir** uyar:
1. **Kapanan sıfırlar** — "20 sıfırdan 10'u kapandı" (büyük, birincil)
2. Boyut bazında ne değişti
3. **Yüzde — ikincil, küçük**, yanında zorunlu uyarı:
   *"Farklı ölçek bantlarının yüzdeleri birbiriyle kıyaslanmaz. Bu yüzde yalnızca kendi
   önceki ölçümünüzle karşılaştırmak içindir."*
- Bant adları (Başlangıç/Parçalı/Tutarlı/Olgun) burada **görünür** (ücretsiz karnenin aksine),
  ama eşiklerin **geçici** olduğu not düşülür.
- Otomatik dolan kriterler işaretli; N/A beyanları görünür.
- 7.6 kriteri satırından **doğrudan** ifşa ayarına gidilebilir (yol haritası: "aynı ekrandan
  açılabilir").
- Metinler i18n kataloğundan.

**Dokunulacak dosyalar/klasörler:**
- `apps/web/src/routes/scorecard/+page.svelte` (yeni), `apps/web/src/lib/navigation.ts`
- `apps/web/src/lib/i18n/messages.ts`
- `apps/api/openapi.yaml`, `packages/shared` şemaları

**Kabul kriteri:** Pilot tenant'ında karne doldurulabiliyor; otomatik kriterler önceden dolu
geliyor; birincil gösterge "kapanan sıfırlar"; yüzde küçük ve uyarılı. 7.6 satırından ifşa
ayarına geçiş çalışıyor.

**Riskler/dikkat:** Yüzdeyi büyük gösterme dürtüsü — §6 bunu "asıl göstergeyi gizler" diye
reddediyor.

---

### Adım 37 — İkinci ölçüm, arşiv ve saha testi kaydı

- [ ] durum

**Ne yapılacak:** Ürünün ana vaadi "kendi geçmişinle kıyaslan" — ikinci ölçüm olmadan vaat yok.

- Yeni ölçüm başlatma; önceki ölçüm arşivde kalır ve okunabilir.
- Karşılaştırma ekranı: kriter kriter 0→n geçişleri.
- Profil değiştiyse kıyaslama **yapılmaz**, açık uyarı gösterilir (§5 metni birebir).
- Şartname §8 kayıt şablonu `docs/` altına markdown olarak eklenir (saha testi için).

**Dokunulacak dosyalar/klasörler:**
- `apps/web/src/routes/scorecard/` (karşılaştırma görünümü)
- `apps/api/src/scorecard/scorecard.service.ts`
- `docs/SAHA-TESTI-KAYDI.md` (yeni — §8 şablonu)

**Kabul kriteri:** İki ölçüm arasında geçiş görünüyor; profil değiştirilerek üçüncü ölçüm
açıldığında kıyaslama engelleniyor ve uyarı çıkıyor.

**Riskler/dikkat:** Şartname §8'in kritik kısıtı: en az bir saha testi **gözetimsiz** ve
**test edenin olmadığı** ortamda doldurulmalı. Kendi firmamızda doldurmak yalnız aritmetiği
doğrular, anlaşılırlığı doğrulamaz.

---

# BLOK G — Faz 4-5 OAuth adaptörleri (yol haritası öncelik #7)

> Yol haritası: *"Satış öncesi şart değil; pilotta ihtiyaç doğarsa öne alınır."*
> Bu blok bilinçli olarak **sonda**. Pilotta ihtiyaç doğarsa kullanıcı sırayı değiştirir.

## G1 — Meta / Google Ads go-live (kod büyük ölçüde hazır)

> Durum: `MetaAdsAdapter` ve `GoogleAdsAdapter` yazılmış ve testli; `AdsAdapterRegistry`,
> `AdsOAuthStateService`, `/v1/integrations/ads/*`, `/settings/connections/ads` çalışıyor.
> Yol haritasındaki `[ ] Meta + Google Ads OAuth` maddesi **kod değil go-live** işidir
> (`docs/ROASMATE-GECIS.md` RM-4 go-live).

### Adım 38 — Meta Ads go-live

- [ ] durum

**Ne yapılacak:** Meta uygulaması kurulur ve gerçek OAuth uçtan uca doğrulanır.

- Meta for Developers'ta uygulama; `ads_read` izni; redirect URI
  `{ADS_OAUTH_REDIRECT_BASE}/v1/integrations/ads/meta/callback` beyaz listeye eklenir.
- Env: `META_APP_ID`, `META_APP_SECRET`, `ADS_OAUTH_REDIRECT_BASE`, `WEB_PUBLIC_URL`.
- `/settings/connections/ads` üzerinden bağlan → callback → `tenant_credentials`'a AES-GCM
  ciphertext yazıldığı doğrulanır (ham secret loglanmıyor — **log denetimi yap**).
- `ENABLE_INTEGRATION_SCHEDULERS=true` ile 6 saatlik sync gerçek veri çeker;
  `ad_metrics_daily` idempotent upsert (unique: tenant+provider+date+campaign) doğrulanır.

**Dokunulacak dosyalar/klasörler:**
- `.env.example`, `docs/ROASMATE-GECIS.md`, `docs/DEPLOY-COOLIFY.md`
- `apps/api/src/integrations/meta/meta-ads.adapter.ts` (yalnız gerçek API farkı çıkarsa)

**Kabul kriteri:** Bağlan → 7 günlük metrik çekilir → `GET /v1/ad-metrics` gerçek harcamayı
döner → Raporlarda "Platform ROAS" dolu. Sync iki kez koşunca satır sayısı artmıyor.

**Riskler/dikkat:** Token süresi dolduğunda ne olacağı test edilmeli (yenileme veya "yeniden
bağlan" akışı). Secret'ın log'a düşmediğini **gözle doğrula** — bu sessiz bir sızıntı türü.

---

### Adım 39 — Google Ads go-live

- [ ] durum

**Ne yapılacak:** Adım 38'in Google karşılığı.

- Google Cloud projesi + OAuth consent + Ads API developer token (onay süreci **haftalar**
  sürebilir — erken başlat).
- Env: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`,
  `GOOGLE_ADS_LOGIN_CUSTOMER_ID`.
- Aynı uçtan uca doğrulama + idempotency.

**Dokunulacak dosyalar/klasörler:** Adım 38 ile aynı + `integrations/google/`.

**Kabul kriteri:** Adım 38 ile aynı, Google için.

**Riskler/dikkat:** Developer token onayı dış bağımlılık — bu adım takvimde bloke olabilir.
Bloke olursa Adım 40'a geç, buraya sonra dön (bağımlılık yok).

---

## G2 — GHL gerçek adaptörü

> Durum: `apps/api/src/integrations/ghl/` fixture-backed stub. `GhlClientStub` HTTP çağırmaz;
> `ghl.reconcile` OAuth yokken noop ledger satırı yazıyor; hasta eşlemesi `notes` marker'ıyla
> (`ghl_contact_id=…`) yapılıyor — ayrı mapping tablosu yok (MIMARI.md § GHL entegrasyon durumu).

### Adım 40 — GHL OAuth: state, authorize, callback

- [ ] durum

**Ne yapılacak:** Ads tarafındaki desen GHL'e uygulanır — **yeni desen icat etme**,
`AdsOAuthStateService` ve `tenant_credentials` yaklaşımını taklit et.

- `GhlOAuthStateService` (veya mevcut state servisini genelleştir; genelleştirme ayrı
  refaktörse kullanıcıya sor).
- `GET /v1/integrations/ghl/authorize` → 302; `GET /v1/integrations/ghl/callback` → token
  değişimi → `tenant_credentials`'a AES-GCM.
- `GET /v1/integrations/ghl/status`, `DELETE /v1/integrations/ghl`.
- `/settings/connections/ghl` ekranı bağlan/kes düğmeleriyle çalışır hale gelir.

**Dokunulacak dosyalar/klasörler:**
- `apps/api/src/integrations/ghl/` (yeni oauth dosyaları), `ghl.module.ts`
- `apps/web/src/routes/settings/connections/ghl/+page.svelte`
- `packages/shared` (bağlantı durumu şeması), `apps/api/openapi.yaml`

**Kabul kriteri:** Bağlan/kes akışı uçtan uca çalışır; secret şifreli saklanır; state
manipülasyonu reddedilir (test).

**Riskler/dikkat:** Token yenileme (refresh) GHL'de zorunlu — Ads'ten farklı olabilir,
dokümana bak, varsayma.

---

### Adım 41 — GHL HTTP istemcisi (stub → gerçek)

- [ ] durum

**Ne yapılacak:** `GhlClientStub` yerine gerçek istemci; **stub kaldırılmaz**, test için kalır.

- `GhlClient` arayüzü; `GhlHttpClient` (fetch, rate-limit, retry/backoff) + mevcut stub
  test uygulaması olarak.
- Rate-limit ve 429 davranışı BullMQ retry/backoff ile uyumlu.
- Tüm dış çağrılar adaptör katmanında; domain kodu `fetch` çağırmaz (AGENTS.md madde 5).

**Dokunulacak dosyalar/klasörler:**
- `apps/api/src/integrations/ghl/ghl.client.ts` (yeni), `ghl.client.stub.ts` (kalır)
- `ghl.module.ts`, `ghl.sync.service.ts`

**Kabul kriteri:** Env'de credential varken gerçek istemci, yokken stub kullanılıyor.
Mevcut `ghl.sync.isolation.spec.ts` ve `ghl.mapper.spec.ts` yeşil kalıyor.

**Riskler/dikkat:** Testler stub'a bağlı — gerçek istemciyi varsayılan yapıp testleri ağa
bağımlı hale getirme.

---

### Adım 42 — GHL eşleme tablosuna geçiş + alan bazlı sahiplik

- [ ] durum

**Ne yapılacak:** İki borç birlikte kapanır.

- `notes` içindeki `ghl_contact_id=…` marker'ı → Adım 27'de kurulan `external_ids`
  (`source = 'ghl'`). Tek seferlik geçiş script'i + geriye dönük okuma (marker varsa oku,
  yaz yeni tabloya).
- **Alan bazlı sahiplik** (MIMARI.md değişmez ilke 5): hangi alanı GHL, hangisini Verimaya
  sahiplenir — tablo halinde yazılır ve senkron buna uyar. Çakışmada sahibi kazanır,
  diğerinin değeri `audit_logs`'a düşer.

**Dokunulacak dosyalar/klasörler:**
- `apps/api/scripts/migrate-ghl-markers.js` (yeni)
- `apps/api/src/integrations/ghl/ghl.sync.service.ts`, `ghl.mapper.ts`
- `docs/MIMARI.md` (§ GHL entegrasyon durumu güncellenir)

**Kabul kriteri:** Marker'lı kayıtlar `external_ids`'e taşınmış; yeni senkron marker yazmıyor;
sahiplik tablosuna aykırı yazma testte yakalanıyor.

**Riskler/dikkat:** `notes` alanındaki marker'ı silmeden önce taşımayı doğrula — geri dönüşü yok.

---

### Adım 43 — GHL reconcile: gerçek mutabakat

- [ ] durum

**Ne yapılacak:** `ghl.reconcile` noop olmaktan çıkar.

- Belirli bir pencerede (son 7 gün) GHL contact/opportunity listesi çekilir, Verimaya ile
  karşılaştırılır; eksik/farklı kayıtlar raporlanır ve sahiplik kuralına göre düzeltilir.
- Sonuç `jobs` ledger'ına yazılır (sayılar + fark listesi).
- `ENABLE_INTEGRATION_SCHEDULERS=true` ile 6 saatlik periyot.

**Dokunulacak dosyalar/klasörler:**
- `apps/api/src/integrations/ghl/ghl.sync.service.ts`, ilgili spec

**Kabul kriteri:** Kasten bozulmuş bir kayıt reconcile sonrası düzeliyor; ledger satırı fark
sayısını doğru yazıyor; ikinci koşu 0 fark buluyor.

**Riskler/dikkat:** Reconcile iki yönlü yazma yapabilir — sahiplik tablosu (Adım 42) olmadan
bu adımı yapma, veri kaybı riski gerçek.

---

# Kapanış

### Adım 44 — Yol haritası ve dokümanları senkronla

- [ ] durum

**Ne yapılacak:** Tamamlanan işler tek kaynağa işlenir.

- `SecondBrain-Remote/03-Areas/VeriMaya/02-yol-haritasi.md`: kapanan maddeler `[x]`,
  faz rozetleri güncellenir, "Sırada ne var" listesi yeniden yazılır.
- `docs/MIMARI.md`: bu planda alınan kararlar (public karne tabloları istisnası, storage portu,
  GHL eşleme tablosu, ifşa ayarı) işlenir.
- `README.md` § Durum güncellenir.
- `packages/shared/src/features.ts` + `changelog.ts` + `CHANGELOG.md` son hali.
- Obsidian `04-ilerleme-log.md`'ye kapanış özeti.

**Dokunulacak dosyalar/klasörler:** Yukarıdakiler.

**Kabul kriteri:** Yol haritasındaki hiçbir `[ ]`/`[~]` madde bu planda karşılıksız kalmamış;
kalan varsa gerekçesiyle (ertelendi / kapsam dışı) yazılı.

**Riskler/dikkat:** Yol haritası **tek kaynak**; repo içinde ikinci bir yol haritası dosyası
oluşturma (`docs/YOL-HARITASI.md` 2026-07-30'da bilerek silindi).

---

## Bu planda bilinçli olarak YER ALMAYAN işler

Karışıklık olmasın diye açıkça yazılıyor. Bunlar yol haritasında var ama bu planın kapsamı dışında:

- **Vitrin `/tr/` + `/en/` locale ağacı ve Cloudflare 302 yönlendirmesi** — TASARIM.md sırası
  1→2→3; bu plan yalnız 1'i (prerender) bitiriyor. 2 ve 3, segment kararı (acente / klinik)
  verildikten sonra.
- **Faz 9 iOS kalan maddeleri** (smoke testleri, gerçek 2FA, dosya yükleme ekranı, FX alanları,
  offline, WidgetKit, App Store) — ayrı bir görev dosyası var:
  `[[Verimaya — iOS v1 smoke + formal kapanış]]`. Ayrı plan hak ediyor.
- **Mevcut ekranlardaki Türkçe metinlerin i18n kataloğuna toplu taşınması** — AGENTS.md
  "ayrı iş" diyor; kural yalnız yeni ve dokunulan kod için bağlayıcı.
- **`/features` ve `/changelog` sayfalarının prerender edilmesi** — SEO değeri var ama bu
  sayfalar bugün AppShell içinde yaşıyor; public gruba taşımak panel içi erişimi bozabilir.
  Ayrı karar, ayrı adım.

---

> Tüm adımlar bittiğinde bu dosyayı ve değişen her şeyi denetlemek için Opus
> tekrar çağrılacak. O yüzden her adımın commit'i temiz ve adım numarasıyla
> izlenebilir olsun — denetim git log'dan adım adım gidecek.
