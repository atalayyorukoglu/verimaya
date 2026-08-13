# Verimaya — Yapılacaklar (2026-08-11 · pilot-öncesi kapanış → pazar kapısı)

> **Bu dosya tek kaynaktır.** Açık iş yalnız burada durur. İkinci envanter / “tüm açık
> işler” dosyası **yazılmaz** — o sapma üretir.
>
> **Re-base:** `docs/Arşiv/2026-08-09-YAPILACAKLAR.md` (kapananlar + Görüş’ler) +
> `docs/Arşiv/2026-08-10-TUM-ACIK-ISLER.md` (yönelim notu; içeriği buraya emildi).
> Daha eski: `docs/Arşiv/2026-08-03-YAPILACAKLAR.md` (Faz 0–7).
>
> **Durum anı:** branch `main`. DOMAIN-02 merge+deploy (E4 GHL hariç). Prod migrate
> `0047`'ye kadar uygulandı (2026-08-12, psql ile doğrulandı — bkz. Son kapananlar · 0046/0047).
> Panel tek **Kişiler** (soyad sırası + load-more düzeltildi).
> Pilot tenant: `Demo Klinik`. Smoke: `docs/2026-08-09-PROD-SMOKE-REHBERI.md`.
> Web canlı = GHCR `verimaya-web:main` (CI yeşil → imaj → Coolify); Restart eski imajı açar.

---

## Çalışma kuralları

1. **Sırayla ilerle.** Sıra numarası önceliği gösterir; `Bağımlı:` satırı kırmızı çizgidir.
2. **Adım başına tek commit.** Commit mesajı Türkçe, `feat:` / `fix:` / `ops:` / `docs:` önekiyle.
3. **Bitirince:** kutuyu işaretle, **Görüş**'ü doldur (≤ 3 satır; detay commit mesajına),
   sonra kalemi gövdeden **"Son kapananlar"** bölümüne tek satırla taşı. Gövde yalnız açık iş tutar.
4. **Soru sorma, en savunulabilir varsayımı seç**, Görüş'te yaz.
5. **Sır yazma.** Hiçbir token/parola/anahtar değeri koda, teste, commit mesajına girmez.
6. **Bir blokta birden çok numaralı kalem varsa her kalem ayrı commit ve ayrı kabul kriteridir.**
   **Sana tek bir kalem söylendiyse yalnız onu yap, diğerlerine dokunma, soru sorma.**
7. **Sözleşme önce `packages/shared`'da** değişir (AGENTS.md ilke 7); tenant'lı her endpoint'e
   negatif izolasyon testi zorunlu; kullanıcı metni `messages.ts` anahtarıdır (tr + en).
   OpenAPI `apiContract`'tan üretilir — sözleşme değişince `pnpm --filter @verimaya/api
   openapi:generate` zorunlu. Spec'lerde tenant bağlamı yalnız drizzle transaction +
   `SET LOCAL` (`set_config(..., true)`); session-level `set_config(..., false)` YASAK.
8. **Re-base:** Dönem kapanınca veya dosya şişince yeni tarihli dosyaya taşınır; eskisi
   `docs/Arşiv/`'e gider; AGENTS.md + README.md referansları güncellenir.
9. **Panelde “eksik” görünen şey** → buraya kalem aç veya “Bilinçli olarak yapılmayacaklar”a
   yaz. İkinci bir açık-iş dosyası açma.

**Durum işaretleri:** `- [ ]` yapılmadı · `- [x]` yapıldı · `- [~]` kısmi

---

## Panelde göze çarpanlar (unutulmuş değil)

> Sitede/panelde eksik gibi duran yüzeyler. Hepsi ya açık kalemde ya bilinçli ertelemede.

| Yüzey | Durum | Kalem |
|-------|--------|--------|
| `/settings/import-export` → “Faz 8'de” | Özellik yok; yer tutucu bilinçli | Bekleyen · GAP-08 |
| Ads Meta / Google canlı veri | Kod + runbook var; hesap go-live açık | **3. OPS-02** |
| GHL ↔ panel ad/soyad çift yön | Kod var; insan testi yok | **4. DOMAIN-02 E4** |
| “Hastalar bölüm etiketi” ayarı | **Kaldırıldı** — `contact_types` rename ile mükerrerdi | Son kapananlar |
| Dev panel (`/dev`) Nest `/v1/dev` | Bilinçli yok; prod gizli / platform allowlist | GAP-28 (kapandı) |
| Hub `/tr/` `/en/` SEO ağacı | Bilinçli yok (kısmi UI i18n) | Bilinçli yapılmayacaklar |
| Randevu checklist şablonları | Muhtemelen hiç yapılmayacak | GAP-F09-20 (skip adayı) |

---

## Öncelik sırası

### 1. PILOT-01 kapanış — prod smoke + artıklar

> Migration 0028–0038 prod'da. Kalan: insan gözüyle ekran kanıtı.

- [x] **Prod smoke turu** — `docs/2026-08-09-PROD-SMOKE-REHBERI.md` §1–§3 (2026-08-12).
  **Görüş:** kullanıcı turu yaptı, takılan madde bildirmedi. Tur sırasında bulunan panel
  kusurları ayrı kalem olarak açılıp kapandı (bkz. Son kapananlar · panel düzeltmeleri).
- [ ] Pilot boyunca **ikinci organizasyon yaratma** (demo/test org dahil) — devam eden kural.
  **2026-08-12 ihlali:** `Demo Tek Ay Klinik` açıldı; gezinme trafiği artınca auth rate-limit
  kusurunu tetikleyip prod'da oturum kesintisi çıkardı (Son kapananlar · RATE-01). Org silindi,
  kurala dönüldü. Kural pilot boyunca yürürlükte.
- [x] **Tenant adı ✅** (2026-08-13) — rename yapıldı.
  **Görüş:** silme değerlendirildi ve reddedildi — pilot verisi PILOT-01 smoke kanıtının ve
  OPS-02e ölçümünün dayanağı; ayrıca tek org olduğu için silmek panele girişi kilitlerdi.
  Rename sırasında iki tablo ayrışması ortaya çıktı ve kapatıldı (Son kapananlar · Firma adı
  senkronu).
- **PILOT-01 ✅ kapandı** (2026-08-13). Kalan tek satır aşağıdaki *devam eden kural*; iş değil.
- **Bağımlı:** yok.
- **Kabul:** PROD-SMOKE-REHBERI Sonuç "takılan yok".

---

### 2. MARKET-01 — üç stratejik karar (17 Ağustos review öncesi)

> Kod yok; karar işi. Karar metni Görüş + Obsidian `01-kararlar.md`'ye işlenir.

> **Kurumsal gerçek (2026-08-12'de netleşti):** satıcı **Albion Signature (UK)** — faturayı o
> kesiyor. **OrbisMed**, Türkiye'de bir sağlık turizmi acentesi ve **ilk müşteri**.
> ⚠️ `docs/Arşiv/2026-08-02-PROJE-DEGERLENDIRMESI.md` §7.2 OrbisMed'i "ürün sahibinin
> işletmesi" sanıyor — o premis YANLIŞ, arşiv metnine güvenme.

- [x] **(a) Birincil segment: acente.** (2026-08-12)
  **Görüş:** karar erişimle verildi — görüşmelerin çoğu acente tarafında ayarlanabiliyor ve
  ödeyen ilk müşteri (OrbisMed) acente. Ürün bugün iki segmentin kesişimi olan operasyon +
  finansta güçlü; acenteye özel eksik komisyon takibi (PRODUCT-01), kliniğe özel eksik
  e-Nabız/e-Fatura. İlk 20 görüşme yalnız acente.
- [x] **(b) Veri ayrımı + destek erişimi + sınır ötesi aktarım.** (2026-08-12)
  *(Eski başlık "OrbisMed çıkar çatışması" idi; premis yanlış olduğu için yeniden yazıldı —
  ortada çıkar çatışması yok, normal satıcı-müşteri ilişkisi var. Tüzel ayrım da zaten mevcut:
  UK firma ≠ Türkiye'deki acente.)*
  **Karar: şeffaflık modeli.** Platform yöneticisi yetkisi olduğu gibi kalır; taahhüt yazılı
  olarak "destek için erişim açabilirim, açtığım anda bu sizin kendi denetim kaydınıza düşer,
  siz görürsünüz" şeklinde verilir. Sessiz/görünmez erişim yok.
  **Teknik dayanak (kodda karşılığı var):** satır bazlı izolasyon `FORCE ROW LEVEL SECURITY`
  ile; uygulama rolü `NOBYPASSRLS`; tenant'lı her endpoint'te negatif izolasyon testi zorunlu;
  platform üye ekleme işlemi müşterinin tenant'ındaki denetim kaydına yazılıyor
  (`platform.service.ts:280`).
  **Bilinen sınır:** `PLATFORM_ADMIN_EMAILS` listesindeki e-posta `POST /v1/platform/tenants/:id/members`
  ile kendini herhangi bir tenant'a üye ekleyebilir; önceden müşteri onayı istenmiyor. Taahhüt
  bunu gizlemiyor, denetim kaydına dayanıyor.
  **Sınır ötesi aktarım → LEG-02.** UK tüzel kişilik + Türkiye'deki müşteri + sağlık verisi =
  KVKK yurtdışına aktarım maddesi. Bekleyen'deki "AB veri lokasyonu + DPA şablonları" ve
  "Veri işleme envanteri" kalemleri bu karara bağlandı; müşteri sözleşmesinde karşılığı olmalı.
- [x] **(c) Kapasite + feature freeze.** (2026-08-12)
  **Görüş:** haftalık taahhüt **7 saat**, iki sabit blok — Salı 10:00–14:00 görüşme/satış,
  Perşembe 10:00–13:00 pilot desteği + haftalık rapor. Blok dışına randevu konabilir ama
  garanti değil. Kaçan blok aynı hafta telafi; iki hafta üst üste kaçarsa pilot süresi uzar.
  **Freeze kabul edildi:** pilot boyunca yalnız hata + güvenlik + veri düzeltme migration'ı.
  Yeni ekran/alan/entegrasyon/rapor yok; "sonraki sürümde" demek de söz sayılır. İstisna
  yalnız pilotun devamını engelleyen eksik için, kararı ürün tarafı verir ve yazılı olur.
  **Not:** freeze pilot RESMEN başlayınca yürürlükte. 2026-08-12'deki panel düzeltmelerinin
  bir kısmı (org değiştirici, şifre değiştirme) yeni yüzeydi — pilot başlamadığı için ihlal
  sayılmıyor, ama aynı iş pilot içinde ihlal olur.
  **Satış ekibi çıktısı:** çerçeve sayfa olarak yayınlandı (segment + randevu blokları +
  freeze kuralı + "verilerimi görebiliyor musunuz" cevabı + hukuki taahhüt yasağı).
- **Kabul:** ✅ Üç karar da yazılı (2026-08-12). (c)'deki freeze taahhüdü kalem 5'in (PILOT-02)
  giriş şartıydı — karşılandı. Bu blok bir sonraki re-base'de "Son kapananlar"a taşınır.

---

### 3. OPS-02 — Meta + Google Ads go-live + attribution kapanışı

> Runbook: `docs/ADS-META-GOLIVE.md`, `docs/ADS-GOOGLE-GOLIVE.md`.
> OPS-02c / 02c-fx / 02d ✅ (arşivde). Guard kapanmadan Pazarlama sekmesi müşteriye gösterilmez.

- [x] **OPS-02e ✅ — `contacts.source` doluluğu.** Giriş tarafı ✅ (preset + zorunlu + "Bilinmiyor").
  Kapanış: **yeni kayıtlarda kaynak doluluğu ≥ %80** (`ATTRIBUTION_COVERAGE_THRESHOLD`).
  Haftalık ölçüm (DOMAIN-02 sonrası tablo `contacts`; soft-delete + Hasta türü):
  ```sql
  SELECT count(*) FILTER (WHERE source IS NOT NULL) AS dolu, count(*) AS toplam
  FROM contacts
  WHERE deleted_at IS NULL
    AND contact_type_name = 'Hasta'
    AND created_at > now() - interval '30 days';
  ```
  Geçmiş 757 satır kalıcı kaynaksız (legacy — karar arşivde).
  **✅ ÖLÇÜM (2026-08-13): eşik geçildi.** Ham sorgu %2.6 gösteriyordu ama yanıltıcı —
  legacy aktarımın `created_at`'i de 30 gün penceresine düşüyor. Güne göre kırılım:
  `2026-08-07` → 742 kayıt / 1 dolu (toplu legacy aktarımı, kapsam dışı) ·
  `2026-08-12` → 1/1 · `2026-08-13` → 18/18.
  Legacy hariç **19/19 = %100**. Bugünkü 18 kayıt GHL senkronundan geldi ve onlar da
  kaynakla geldi — yani yalnız form değil, senkron yolu da kaynağı dolduruyor.
  **Not:** ölçüm tekrarlanırken `created_at >= '2026-08-08'` ile legacy aktarım hariç
  tutulmalı; yoksa oran kalıcı olarak yanlış düşük görünür.
- [~] **Google go-live** — bağlandı, veri çekti (2026-08-13). Rakamlar Google Ads paneliyle
  uyuşuyor; senkron ikinci kez koşturuldu, toplam artmadı (mükerrer yazma yok). **Kalan:
  7 gün temiz senkron penceresi** — saat 2026-08-13'te başladı.
- [~] **Meta go-live** — bağlandı (2026-08-13). App oluşturuldu, Marketing API + redirect URI
  kuruldu, `META_APP_ID`/`META_APP_SECRET` prod'da. **Kalan: 7 gün temiz senkron penceresi.**
  Not: uygulama Development modunda yeterli — kendi reklam hesabının verisi için App Review
  gerekmiyor.
- [x] **`ENABLE_INTEGRATION_SCHEDULERS=true`** prod'da açıldı (2026-08-13). Bununla
  `ad_metrics.sync` + `ghl.reconcile` 6 saatte bir, `files.sweep_pending` günlük çalışıyor.
- [ ] Hata yüzeyleme + sync penceresi doğrulaması (7 gün dolunca)
- **Bağımlı:** yok; ROAS attribution kapanmadan dışarıya gösterilmez.
- **Kabul:** İki provider 7 gün temiz sync + `attribution_missing` guard yeşil (kapsam ≥ %80).

---

### 4. DOMAIN-02 — kalan: E4 GHL

> Adım ayrıntısı: `docs/Arşiv/2026-08-10-KISILER-BIRLESME-PLANI.md`. Faz A–F + E3 ✅.
> Deploy: `docs/2026-08-10-DOMAIN-02-DEPLOY-RUNBOOK.md`.

- [x] **E4 ✅ (2026-08-13)** — bkz. Son kapananlar · DOMAIN-02 E4. Blok kapandı, PILOT-02 girişi açıldı.

> **Artık (ertelendi, acil değil):** GHL'deki bazı kişilerin ad/soyadı **küçük harf** kayıtlı.
> Senkron kusuru değil — GHL ne tutuyorsa panel onu gösteriyor, doğrusu bu (ad GHL'e ait).
> **Karar (2026-08-13): GHL'de düzeltilecek, kod dokunulmayacak.** Panelde büyütmek sahiplik
> ilkesini büker ve `de Souza` gibi isimleri bozar. Kapasiteye göre yapılır.

---

### 5. PILOT-02 — 2–4 haftalık feature-freeze dahili pilot

> **Bağımlı:** 1 (smoke temiz) + 2(c) (freeze taahhüdü) + 4 (DOMAIN-02 E4 dahil kapanmış).
> KPI: aktif kullanıcı/gün, Tracker’a dönüş, AI taslak kabul/düzeltme/red, finans mutabakat,
> randevu kaçırma, webhook/job fail, destek süresi, haftalık yedek + restore.

> **Plan: `docs/2026-08-13-PILOT-02-PLANI.md`** — tarihler, KPI ölçüm kaynakları, haftalık ritim.

- [x] **Pilot planı + KPI tanımları yazıldı** (2026-08-13).
  **Görüş:** 17 Ağustos – 6 Eylül (3 hafta), OrbisMed'den 2–3 kullanıcı. Sekiz KPI'ın her
  birine ölçüm kaynağı bağlandı; beşi sistemden (audit log, ai_corrections, no_show oranı,
  hata logları), üçü elle (Tracker'a dönüş, finans mutabakat, destek süresi). Elle olanlar
  toplanmazsa o KPI boş kalır — planda açıkça yazılı.
- [ ] **Feature freeze ilan et** — 17 Ağustos'ta yürürlüğe girer; yalnız hata + güvenlik +
  veri düzeltme migration'ı, yeni yüzey yok
- [ ] 3 hafta çalıştır + her Perşembe raporla (20 Ağu · 27 Ağu · 3 Eyl)
- **Kabul:** KPI raporu yazılı; freeze ihlali varsa listelenmiş.

#### Pilot-02 sonu kapıları (ikinci müşteri öncesi ZORUNLU)

- [ ] **WEBHOOK-01 shim kapatma:** `WEBHOOK_IDENTITY_DEFAULT_SECRET=false`; önce tüm
  tenant'larda `tenant_provider_identities` satırı. Runbook: `docs/DEPLOY-COOLIFY.md` § WEBHOOK-01.

---

### 6. MARKET-02 — 30 günlük pazar kapısı

> **Bağımlı:** PILOT-02 verileri.
> Kabul: 20 görüşme, 4–5 rakip demo/fiyat, ≥3 ücretli ön-sipariş/yazılı pilot niyeti,
> fiyat kartı + iptal/taahhüt modeli.

- [ ] Görüşmeleri tamamla
- [ ] Fiyat kartını sabitle
- [ ] Kapı kararını ver

---

## Faz 9 — kalan denetim / ürün artıkları (sıra yok; kapasiteye göre)

- **LEG-02 artığı — anonimizasyon kapsamı: case note gövdeleri + dosya adları.**
  AUDIT-F09-07b `contacts` satırını maskeliyor (ad/soyad/tel/e-posta/`notes`), ama
  `case_notes.body` serbest metni ve `files` dosya adları olduğu gibi kalıyor. Sonuç:
  silme sonrası kişi kartı başlıkta "Anonymized Contact" görünürken notlar sekmesinde
  ad/telefon okunabiliyor — silme pratikte yarım.
  **Karar (2026-08-11): böyle kalsın**, kapsam LEG-02 hukukçu görüşüne bağlanır.
  **Gerekçe:** (1) sağlık kaydı saklama yükümlülüğü ile silme hakkı çatışıyor — hangisi
  öncelikli, hukuk kararı; (2) serbest metin script'le güvenli maskelenemez (notun tamamını
  silmek klinik geçmişi de götürür, isim yakalama mutlaka kaçırır).
  **Seçenekler:** (a) böyle kalsın · (b) notlar + dosyalar da silinsin · (c) dosyalar silinsin,
  notlar saklama süresince kalsın ama erişimi kısıtlansın.
  **Dosyalar:** `apps/api/src/contacts/contact-data-subject.service.ts`. **(M)**
- **GAP-F09-20** Randevu checklist şablonları — skip adayı (Tracker 0 satır). **(L)**

---

## Bekleyen (MARKET-02 sonrası / ikinci müşteri eşiği)

- **GAP-08 — içe/dışa aktarım uygulaması** — kapsam kilitli; panelde yer tutucu ("Faz 8'de").
  İkinci müşteriden önce zorunlu (Açık sorular §9).
- **GAP-25:** Kapsamlı veri silme (`/data/delete-scope`) + wipe.
- **GAP-26:** AI prompt özelleştirme — Açık sorular §6.
- **Marka tescili:** `verimaya.com` / `.com.tr` + Türk Patent 9/35/42/44 (görünen: **"Veri Maya"**).
- **IOS-01:** iOS donmuş; birikmiş drift — çözülürse ilk kalem.
- **PRODUCT-01:** Komisyon takibi discovery (acente segmenti seçilirse).
- **CSP/HSTS** canlıda kanıtlı denetim.
- **Veri işleme envanteri** + **AB veri lokasyonu + DPA şablonları**. **LEG-02'ye bağlı
  (2026-08-12):** satıcı Albion Signature (UK), müşteri Türkiye'de sağlık turizmi acentesi —
  yani sağlık verisinin yurtdışına aktarımı var. KVKK aktarım dayanağı + DPA + aydınlatma
  metni hukukçu görüşü gerektiriyor. Karar dayanağı: MARKET-01 (b).
- **DOC-03b/d artıkları (kullanıcı):** Obsidian `00-proje-ozeti` + `01-kararlar` marka +
  `04-ilerleme-log` — sıradaki vault oturumu.
- **İsteğe bağlı ops:** Coolify `verimaya-web-image` → `verimaya-web`; API GHCR path B.

---

## Bilinçli olarak yapılmayacaklar (MARKET-02 kapısına kadar)

| Konu | Gerekçe |
|------|---------|
| iOS App Store hazırlığı | Pazar doğrulaması yokken yatırım yok |
| Tam i18n/locale ağacı (`/tr/` `/en/`) SEO | Hub UI TR/EN bilinçli kısmi (DOC-03e) |
| TikTok / Instagram entegrasyonları | MARKET-02 öncesi yok |
| Klinik entegrasyonları (e-Nabız, e-Fatura) | Acente segmenti seçilmezse gereksiz |
| Ürün içi karnenin genişletilmesi | Pilotla gelir |
| **Etiketler (Tags) modülü** | Tracker'da doldurulmadı (`ayarlar.md`: "taşınmaz") |
| **Kişilerden toplu case / toplu auto-link** | Tracker tek seferlik; ETL aynı işi yapıyor |
| **Lead / pipeline / satış aşaması app'te** | **DOMAIN-01:** satış GHL'de; app = operasyon |
| **Randevu durumu tenant-CRUD** | Enum kilitli (`ETL-ESLEME` §2.3); talep → FK |
| **Canlı kur çevirici** | Snapshot model (FX-01) |
| **`responsible_party` alanı** | Contact modeli absorbe etti |
| **İkinci “açık işler” MD dosyası** | Tek kaynak kuralı; çift işaret sapması |

---

## Açık sorular / ürün kararı bekleyenler

> Kapalı: silme politikası (soft-delete) · patient merge · kişi notları (= DOMAIN-02 tek model).

3. **Randevu durumu enum kalacak mı?** Tenant kendi durumunu isterse enum → FK. PILOT-02.
4. **Checklist ölü özellik mi?** → GAP-F09-20 skip olabilir.
6. **AI prompt tenant'a açılmalı mı?** (GAP-26)
7. **Tenant düzeyinde izin matrisi?** Tracker 9×5; bizde 8×6. Pilotta ölç; talep yoksa skip.
8. **P2P payer/payee geri gelecek mi?** Freeze öncesi karar ucuz, sonra pahalı.
9. **İçe/dışa aktarım ikinci müşteriden önce mi?** (GAP-08)

---

## Son kapananlar (bu dosya dönemi)

> 2026-08-09 dönemi kapananların tamamı: `docs/Arşiv/2026-08-09-YAPILACAKLAR.md` § Son kapananlar.
> 2026-08-03 ve öncesi: `docs/Arşiv/2026-08-03-YAPILACAKLAR.md`.

- **DOMAIN-02 E4 ✅** (2026-08-13) — GHL ↔ panel ad/soyad doğrulaması. **DOMAIN-02 kapandı.**
  **Görüş:** kalemin "çift yönlü" ifadesi yanlıştı — `ghl.field-ownership.ts` (mimari ilke 5)
  adın sahibini **GHL** olarak tanımlıyor, panel geri yazmaz. Doğrulama tek yönlü yapıldı:
  GHL'de değiştir → panelde ad/soyad ayrı ayrı doğru geliyor (canlı, kullanıcı). Ters yön
  koddan garanti: GHL istemcisinde yazma metodu yok (`getContact`/`listContacts` sadece) +
  geri yazmadığını iddia eden test.
  **Yol boyunca çıkan üç kusur kapatıldı:** (1) `GHL_CLIENT_ID` prod'da boştu → panel
  `client_id=` ile bozuk yetkilendirme linki üretiyordu; env dokümana eklendi. (2) GHL
  Marketplace redirect URI'de kendi markasını reddediyor (`ghl` kelimesi) → callback
  `/v1/integrations/crm/callback`'e taşındı. (3) GHL'in ayrı `firstName`/`lastName` alanları
  yerine birleşik alan okunuyor ve ilk boşluktan yeniden bölünüyordu → `Ancuta Monica` /
  `Naste-0` yanlış bölünüp yazımı bozuluyordu; artık ayrı alanlar olduğu gibi alınıyor.
  Ayrıca elle senkron tetikleyici eklendi (6 saatlik zamanlayıcıyı beklemeden test için).
  `aba9e33` `654bbab` `dec663c` `7026e45`
- **Firma adı senkronu ✅** (2026-08-12) — ad değiştirildi ama panelde eski ad görünmeye devam etti.
  **Görüş:** silinen-organizasyon hatasının aynı kök sebebi — ad iki tabloda. Rename yalnız
  `tenants.name`'i yazıyordu, `/v1/me/organizations` ise better-auth `organization.name`'den
  okuyordu. Artık rename her iki tabloyu aynı transaction'da güncelliyor ve liste domain
  tablosundan okuyor; regresyon testi iki tablonun ayrışmadığını iddia ediyor. `AppShell`'deki
  hardcoded `'Demo Klinik'` yedeği de kaldırıldı (yükleme iskeleti). Slug bilinçli sabit,
  dokunulmadı. `fe34c2e` `b4ce21e`
  **⚠️ Ajan denetimi:** aynı turda Cursor istenmediği hâlde destek metnini değiştirip
  `destek@verimaya.app` diye **var olmayan bir adres uydurdu** ve panele tıklanabilir `mailto:`
  koydu. Denetimde yakalanıp geri alındı; sonra gerçek adres (`destek@verimaya.com`) tek
  sabitten okunacak şekilde eklendi. Ajan çıktısındaki kullanıcıya görünen sabit değerler
  (adres, telefon, URL) doğrulanmadan kabul edilmemeli. `271ff52` `a2fb39e`
- **Migration 0046/0047 prod ✅** (2026-08-12) — soyad index + bölünmemiş isimlerin onarımı.
  **Görüş:** `RUN_MIGRATIONS=true` olduğu için deploy anında kendiliğinden uygulandı (ayrı
  migrate adımı yok — veri değiştiren migration'larda deploy öncesi yedek şart). Doğrulama:
  index var, bölünmemiş kalan 34 satırın tamamı `Otel`/`Transfer`/`Klinik` — yani 0047'nin
  bilinçli hariç tuttuğu kurum tipleri; kişi kaydı kalmadı.
  **Bilinen sınır:** heuristik ilk boşluktan bölüyor, çift isimler (`Ayşe Nur Yılmaz` →
  `Ayşe` / `Nur Yılmaz`) yanlış ayrışıyor. `display_name` dokunulmadığı için tam isim
  kaybolmuyor; düzeltme elle. 0035 ile aynı heuristik.
- **Keyset sayfalama testi ✅** (2026-08-12) — load-more hatasının sınıfı kalıcı kapatıldı.
  **Görüş:** mevcut `contact-list-cursor.spec.ts` yalnız cursor kodlamasını test ediyordu;
  sayfa 2'nin sayfa 1'in devamı olduğunu kanıtlayan test yoktu. 15 kişilik fixture (aynı
  soyad, aynı ad+soyad, NULL soyad, TR harfler, `|` içeren isim), limit=2 ve 5 ile tam
  gezinti; tekrar/atlama yok, son sayfada cursor yok. `aeb3083`
- **Kişiler load-more + soyad sırası ✅** (2026-08-12) — telefon defteri sırası (`last_name`
  ASC) geldi; “Daha fazla yükle” ikinci sayfada 1 kişi görüp duruyordu.
  **Görüş:** sıra değişmişti, sayfa imleci hâlâ `created_at` kullanıyordu — keyset uyumsuz.
  `list()` soyad cursor'ına bağlandı; MSW aynı sözleşmeye çekildi. `fbc8d74` `8c02d3b`
- **CI/deploy kapısı (2. tur) ✅** (2026-08-12) — Coolify restart/redeploy panelde değişiklik
  göstermiyordu.
  **Görüş:** web VPS'te build edilmez; GHCR `:main` yalnız CI yeşil olunca push edilir.
  Prettier → `$effect` içinde `periodKey;` (eslint) → API test (yanlış cursor) → svelte-check
  (`Diğer` preset'ten düşmüş) sırayla kırmızı kaldı; her kırmızı Deploy web'i skip etti.
  Format/`void`/Kaynak select düzeltildi, zincir döndü. Restart ≠ yeni imaj.
  `34626f3` `a0c9964` `cdf7350`
- **Sorumlu alanı 500 ✅** (2026-08-12) — kişi kaydında Sorumlu seçince 500.
  **Görüş:** form `member.id` gönderiyordu, kolon `user.id` bekliyordu. Panel `user_id`
  yolluyor; API her iki id'yi de çözüyor. `7bdced2` `f9b748e` `6313897`
- **Kişiler seçim modu ✅** (2026-08-12) — toplu tür atama checkbox'ları varsayılan gizli.
  **Görüş:** “Toplu işlem” ile açılıyor; kalıcı sütun ara sıra kullanılan işi sürekli
  gürültü yapıyordu. `a70d41b` `3e58344`
- **Sidebar footer telif + Albion ✅** (2026-08-12) — sürüm satırının altına yıl + marka.
  **Görüş:** TickPort footer; metin `messages.ts`. `a680935` `6ab9da6`
- **RATE-01 artığı (CF IP) ✅** (2026-08-12) — `TRUST_PROXY=1` Cloudflare arkasında edge IP'de
  kalıyordu (kota yine paylaşılıyordu).
  **Görüş:** hop artırmak XFF sahteciliğine açık. `TRUST_CF_CONNECTING_IP=true` iken anahtar
  `CF-Connecting-IP`. Prod'da açıldı (2026-08-12) — `TRUST_PROXY=1` de duruyor, `req.ip`/log
  onu kullanmaya devam ediyor. `d14215a`
- **PILOT-01 prod deploy ✅** (2026-08-12) — migration `0044` + `0045` prod'da uygulandı.
  **Görüş:** Coolify API Terminal → `db:migrate`; `0044` kolon düşürdü, `0045` tablo açtı,
  ikisi de psql ile doğrulandı. Not: prod Postgres rolü `postgres`/`verimaya` —
  `DEPLOY-COOLIFY.md`'deki `verimaya` owner rolü kurulumda yok.
- **RATE-01 ✅** (2026-08-12) — prod oturum kesintisi: panelde gezerken atılma + tekrar giriş yapamama.
  **Görüş:** sıkı 10/dk auth limiti `get-session`'ı da sayıyordu; SPA her rota değişiminde onu
  çağırdığı için ~10 gezinme kotayı doldurup 429 → boş oturum → `/login` üretiyordu. Ayrıca
  `trustProxy` yoktu, kota tüm kullanıcılar için tek kovaydı. Limit yalnız kimlik uçlarına
  daraltıldı + `TRUST_PROXY` env'i eklendi. Kusur Faz 8'den beri koddaydı, deploy'dan gelmedi. `34ef59a`
- **Panel düzeltmeleri ✅** (2026-08-12) — smoke turunda bulunan 6 kusur, altı ayrı commit.
  **Görüş:** silinen org listede/login'de görünüyordu (kök sebep: silme `tenants.deleted_at`
  yazıyor, liste better-auth `organization` tablosundan geliyordu) · profil rozeti hardcoded
  `demo@verimaya.app` gösteriyordu · ekip listesinde ad/e-posta boştu · şifre değiştirme yüzeyi
  yoktu. Org değiştirici eklendi (logout ile geçiş yerine). `da3f5ee` `bd74eec` `6cd8526`
  `52234f8` `95cbfe2` `1ebf560`
- **CI/deploy zinciri ✅** (2026-08-12) — web image build'i atlanıyordu.
  **Görüş:** Prettier formatı CI `Lint and format (web)` adımını kırıyordu; `deploy-web.yml`
  gate'i red CI'da build'i atladığı için panelde hiçbir değişiklik görünmüyordu. Format
  düzeltildi, zincir baştan sona döndü. `ca2c65c`
- **SEC-03 artığı ✅** (2026-08-11) — `@fastify/static` GHSA-83w8-p2f5-377r kapandı.
  **Görüş:** override yerine upstream bump yetti (Nest platform-fastify 11.1.29 +
  bull-board 8.6.0 static ^10 istiyor); `fastify` 5.11'e hizalandı. `pnpm audit
  --audit-level high` temiz. `998e163`
- **DOMAIN-02 artığı ✅** (2026-08-11) — "Hastalar bölüm etiketi" ayarı tamamen kaldırıldı.
  **Görüş:** alan mükerrerdi — `contact_types` tenant-CRUD zaten rename sağlıyor — ve
  ayarlar formu dışında hiçbir yerde tüketilmiyordu. Sözleşme + API + UI + OpenAPI temiz,
  kolon migration `0044` ile düştü. `c38e79e`
- **AUDIT-F09-07b ✅** (2026-08-11) — contact KVKK m.11 API yüzeyi.
  **Görüş:** `GET/POST /v1/contacts/:id/data-export|data-deletion-request`, yetki
  `contact:delete` (tam PII dump sıradan `read` değil), ledger tablosu migration `0045`
  (RLS + negatif izolasyon spec'i). Anonimizasyon ad/soyad/tel/e-posta/`notes` maskeler;
  mali kayıt + `contact_id` korunur, hard-delete yok. Panel UI ve hukuk metni bilinçli
  kapsam dışı → kalan kapsam Faz 9 "LEG-02 artığı". `7838e4b`, `f73a905`

---

## Kaynaklar (liste değil — bakılacak yer)

| Soru | Dosya |
|------|--------|
| Önceki dönem kapananları | `docs/Arşiv/2026-08-09-YAPILACAKLAR.md`, `docs/Arşiv/2026-08-03-YAPILACAKLAR.md` |
| Kişiler birleşmesi adımları | `docs/Arşiv/2026-08-10-KISILER-BIRLESME-PLANI.md` |
| DOMAIN-02 deploy | `docs/2026-08-10-DOMAIN-02-DEPLOY-RUNBOOK.md` |
| Prod tıklama | `docs/2026-08-09-PROD-SMOKE-REHBERI.md` |
| Migration A kanıtı | `docs/Arşiv/2026-08-08-PROD-KONTROL-LISTESI.md` |
| Tracker gap | `docs/tracker-verimaya-ozellik-gap.md` |
| Denetim | `AUDIT-REPORT.md` |
| Ads go-live | `docs/ADS-META-GOLIVE.md`, `docs/ADS-GOOGLE-GOLIVE.md` |
| Deploy | `docs/DEPLOY-COOLIFY.md` |
| Mimari / tasarım | `docs/MIMARI.md`, `docs/TASARIM.md`, `AGENTS.md` |
| Eski sistem | `docs/legacy-reference/` |
| Obsidian | `SecondBrain-Remote/03-Areas/VeriMaya/` |
