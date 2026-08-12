# Verimaya — Yapılacaklar (2026-08-09 · pilot-öncesi kapanış → pazar kapısı)

> **ARŞİV — 2026-08-11 re-base.** Aktif liste:
> [`docs/2026-08-11-YAPILACAKLAR.md`](../2026-08-11-YAPILACAKLAR.md).
> Bu dosya dönem kapananları + Görüş kanıtı için saklanır; yeni iş buradan üretilmez.
>
> 2026-08-03 dönemi: `docs/Arşiv/2026-08-03-YAPILACAKLAR.md`.
>
> **Durum anı (kapanış):** branch `main`, DOMAIN-02 merge (`cc86b2c`, 2026-08-10). Prod:
> migrate `0033`–`0038` + API/web deploy; panel tek **Kişiler**. E4 GHL testi açık kaldı.
> Smoke: `docs/2026-08-09-PROD-SMOKE-REHBERI.md`. Pilot tenant: `Demo Klinik`.

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
   OpenAPI artık `apiContract`'tan üretilir — sözleşme değişince `pnpm --filter @verimaya/api
   openapi:generate` zorunlu (drift spec'i byte-compare yapıyor). Spec'lerde tenant bağlamı
   yalnız drizzle transaction + `SET LOCAL` (`set_config(..., true)`); session-level
   `set_config(..., false)` YASAK (postgres.js pool sızıntısı → sıralama flake'i, kanıt:
   2026-08-09 flaky-spec düzeltmesi).
8. **Re-base:** Bu dosya dönem kapanınca veya okunamaz boyuta gelince yeni tarihli dosyaya
   taşınır; eskisi `docs/Arşiv/`'e gider, AGENTS.md + README.md referansları güncellenir
   (bu dosya böyle doğdu).

**Durum işaretleri:** `- [ ]` yapılmadı · `- [x]` yapıldı · `- [~]` kısmi

---

## Öncelik sırası

### 1. PILOT-01 kapanış — prod smoke + artıklar

> Prod migration 0028–0032 **tamam** (2026-08-08; kanıt PROD-KONTROL § A1–A6: 757 dosya
> `scheduled`'a eşlendi, randevu tipleri seed'li, `deleted_at` dört tabloda, FX coherence
> constraint aktif). Kalan: insan gözüyle ekran kanıtı.

- [ ] **Prod smoke turu** — `docs/2026-08-09-PROD-SMOKE-REHBERI.md` §1–§3
  (**👤 SEN TIKLA**: soft-delete B, filtre D, sayı E). Takılan maddeye bu dosyada kalem aç;
  takılan yoksa rehberdeki Sonuç'u işaretle. Migration A kanıtı arşiv checklist'te.
- [x] **Migration `0033` + `0034` prod'a** (DOMAIN-02 API deploy ile; `0035`–`0038` aynı turda).
  **Görüş (2026-08-10):** owner `DATABASE_URL` + `RUN_MIGRATIONS`; ardından contacts API yeşil.
- [ ] Pilot boyunca **ikinci organizasyon yaratma** (demo/test org dahil) — devam eden kural.
- [ ] **Tenant adı:** `Demo Klinik` rename veya olduğu gibi bırak — karar ver, Görüş'e yaz (ucuz).
- **Bağımlı:** yok.
- **Kabul:** PROD-SMOKE-REHBERI Sonuç "takılan yok"; prod `0033`'te.

---

### 2. MARKET-01 — üç stratejik karar (17 Ağustos review öncesi)

> Kod yok; karar işi. Karar metni Görüş + Obsidian `01-kararlar.md`'ye işlenir.

- [ ] **(a)** Birincil segment: acente mi klinik mi? (ilk 20 görüşme tek segmente odaklanır)
- [ ] **(b)** OrbisMed çıkar çatışması: veri ayrımı, tüzel ayrım, erişim/audit, referans anlatısı
- [ ] **(c)** Kapasite: haftalık sabit gün/saat + pilot boyunca feature freeze taahhüdü
- **Kabul:** Üç karar yazılı; (c)'deki freeze taahhüdü kalem 5'in (PILOT-02) giriş şartıdır.

---

### 3. OPS-02 — Meta + Google Ads go-live + attribution kapanışı

> Runbook: `docs/ADS-META-GOLIVE.md`, `docs/ADS-GOOGLE-GOLIVE.md`.
> OPS-02c / 02c-fx / 02d ✅ (arşivde): para birimi hatası kapandı, ROAS penceresi +
> `attribution_missing` guard'ı aktif. Guard kapanmadan Pazarlama sekmesi müşteriye gösterilmez.

- [~] **OPS-02e — `patients.source` doluluğu.** Giriş tarafı ✅ (preset select `a3c0f86`,
  zorunlu + "Bilinmiyor" sentinel'i `4205470`). Kapanış şartı veri işi: **yeni dosyalarda
  kaynak doluluğu ≥ %80** (`ATTRIBUTION_COVERAGE_THRESHOLD`). Haftalık ölçüm:
  ```sql
  SELECT count(*) FILTER (WHERE source IS NOT NULL) AS dolu, count(*) AS toplam
  FROM patients
  WHERE deleted_at IS NULL AND created_at > now() - interval '30 days';
  ```
  Geçmiş 757 satır kalıcı kaynaksız (legacy `source` 0/757 boştu — karar arşivde).
- [ ] **Meta go-live:** 7 gün veri, idempotent sync, log denetimi
- [ ] **Google go-live:** aynı (hesap TRY — OPS-02c ile panel artık doğru para biriminde)
- [ ] Hata yüzeyleme + sync penceresi doğrulaması
- **Bağımlı:** yok; ama ROAS rakamı attribution kapanmadan dışarıya gösterilmez.
- **Kabul:** İki provider 7 gün temiz sync + `attribution_missing` guard'ı yeşil (kapsam ≥ %80).

---

### 4. DOMAIN-02 — Hastalar + Kişiler tek modülde birleşme

> **Adım ayrıntısı, kabul kriterleri ve riskler: `docs/2026-08-10-KISILER-BIRLESME-PLANI.md`.**
> Burada tek kalem; oradaki faz kutuları işaretlenir.
>
> **Neden freeze öncesi:** `patients` + `contacts` ayrımı `appointments` (4 FK),
> `transactions` (çift FK) ve raporları etkiliyor; şema kararı pilot başladıktan sonra
> pahalılaşır. 158 dosya `patient` referansı içeriyor.
>
> **§0 kararları kapandı (2026-08-10):** (A) `organizations` sözlük tablosu ·
> (B) `/v1/patients` tek seferde kesilir, alias yok · (C) rapor `source` birincil,
> `medium` ikinci seviye kırılım.

- [x] **Faz A — sözleşme (`packages/shared`)**: `contact.ts` yeni alanlar, `patient.ts`
  devri, kaynak/alt kaynak sözlükleri, `apiPaths` + `apiContract`, bağımlı şemalarda
  `patient_id` → `contact_id`. Kabul: shared test yeşil + `openapi:generate` drift'siz.
- [x] **Faz B1 — `0035_contacts_person_fields.sql`** (genişlet, kırıcı değil) + `organizations` + RLS.
- [x] **Faz C — API** (`contacts.service/controller` devralır, `/v1/patients` kesilir,
  `reports` + GHL + WhatsApp uyarlanır). **En olası regresyon:** raporlarda
  `contact_type_name = 'Hasta'` filtresinin unutulması.
  **Görüş (2026-08-10):** C2–C7 + E2' kapatıldı; `patients/` silindi; api check + 93/93 test +
  openapi drift yeşil. Detay: `docs/2026-08-10-KISILER-BIRLESME-PLANI.md`.
- [x] **Faz D — panel** (`routes/patients` → `routes/contacts`, tek form dialog, i18n).
  **Görüş (2026-08-10):** D1–D7. Thin SPA redirect; liste varsayılan Hasta; form ad/soyad +
  kademeli kaynak/medium/referans; organizations API yok → Firma preserve-only.
  web check 0 · test 42 · lint temiz.
  **§0-A tamamlandı (2026-08-10):** organizations sözlük API + `/settings/organizations` +
  ContactFormDialog canlı firma seçimi/satır içi oluşturma. Detay: plan §0-A.
  **Görüş:** api 451 · shared 92 · web check/test/lint yeşil; openapi 69 ops.
- [x] **Faz B2+B3 — `0036_drop_patients.sql`** (§0-D: taşıma yok, DROP CASCADE; C ile aynı deploy).
  ~~eski B2 veri taşıma + B3 ayrı 0037~~ düştü.
- [~] **Faz E — doğrulama** (E2' ✅; E3 ✅ canlı smoke GHL hariç OK; **kalan: E4 GHL**).
  **Görüş (2026-08-10):** Prod merge+deploy sonrası menü/liste/form/detay/firma/rapor/
  WhatsApp OK. E4 bilinçli ertelendi.
- [x] **Faz F — temizlik** (`patient.ts` silindi; create-patient kesildi; distribution/outbox/
  audit/hata kodu/section_label → contact*; AGENTS+MIMARI+CHANGELOG+Obsidian).
  **Görüş (2026-08-10):** 0038 `contacts_section_label` + audit CHECK; openapi 68 ops;
  shared 92 · api 449 · web check/test/lint yeşil.
- **Bağımlı:** (kapanmış) prod `0034` doğrulandı deploy sırasında `0033`–`0038` ile.
- **Kabul:** planın Faz A–F; E4 GHL testi yeşil olunca "Son kapananlar"a taşınır.
  **Not:** DOMAIN-02 gövdede kalır — E4 bitmeden kapanmaz.

---

### 5. PILOT-02 — 2–4 haftalık feature-freeze dahili pilot

> **Bağımlı:** 1 (prod smoke temiz) + 2(c) (freeze taahhüdü) + 4 (DOMAIN-02 kapanmış —
> şema değişikliği freeze içinde yapılmaz).
> Ölçülecek KPI'lar: aktif kullanıcı/gün, Tracker'a dönüş oranı ve nedeni, AI taslak
> kabul/düzeltme/red, finans mutabakat farkı, randevu kaçırma, webhook/job başarısızlık,
> ortalama destek süresi, haftalık yedek + restore kanıtı.

- [ ] Pilot planını yaz, KPI'ları tanımla (ölçüm sorguları/ekranları plana gömülü olsun)
- [ ] Feature freeze ilan et — kapsam: yalnız hata düzeltme + güvenlik + veri düzeltme
  migration'ı; yeni yüzey yok
- [ ] 2–4 hafta çalıştır + haftalık raporla
- **Kabul:** KPI raporu yazılı; freeze ihlali varsa listelenmiş.

#### Pilot-02 sonu kapıları (multi-tenant / ikinci müşteri öncesi ZORUNLU)

- [ ] **WEBHOOK-01 shim kapatma:** `WEBHOOK_IDENTITY_DEFAULT_SECRET=false`; önce tüm
  tenant'larda `tenant_provider_identities` satırı doğrulanır (yoksa webhook reddedilir).
  Runbook: `docs/DEPLOY-COOLIFY.md` § WEBHOOK-01.

---

### 6. MARKET-02 — 30 günlük pazar kapısı

> **Bağımlı:** PILOT-02 verileri.
> Kabul: 20 müşteri görüşmesi, 4–5 rakip demo/fiyat teklifi, en az 3 ücretli ön-sipariş/yazılı
> pilot niyeti, bir fiyat kartı + iptal/taahhüt modeli.

- [ ] Görüşmeleri tamamla
- [ ] Fiyat kartını sabitle
- [ ] Kapı kararını ver

---

## Faz 9 — kalan denetim işleri (öncelik sırası yok; kapasiteye göre)

- **DOMAIN-02 artığı — "Hastalar bölüm etiketi" ayarının anlamı.** Faz F'de DB kolonu
  `patients_section_label` → `contacts_section_label` oldu (`0038`) ama panel tarafı
  eski dilde kaldı: i18n metni `'"Hastalar" bölüm etiketi'` / `'"Patients" section label'`,
  değişken `patientsLabel`, DOM id `tenant-patients-label`, placeholder `Hastalar`.
  **Bu salt yeniden adlandırma DEĞİL — ürün kararı:** birleşmeden sonra panel bölümü
  "Kişiler"; bu ayar hâlâ "Hastalar"ı mı adlandırıyor, yoksa Kişiler bölümünü mü?
  Tenant'ın kendi terimini seçmesi (ör. "Danışanlar") isteniyorsa etiket Kişiler'e
  bağlanmalı. Karar verilmeden id/anahtar değiştirilirse TestSprite TC006 da kırılır.
  **Dosyalar:** `apps/web/src/routes/settings/organization/+page.svelte`,
  `apps/web/src/lib/i18n/messages.ts`, `testsprite_tests/TC006_*.py`. **(S)**
- **SEC-03 artığı — `@fastify/static` route guard bypass.** Yama yalnız ≥10.1.1'de;
  NestJS peer `^8||^9` + bull-board `^9.1.3` major atlama ister. Tek kalan high advisory.
  Upstream peer aralığı genişleyince veya bull-board yükseltilince kapanır. **(M)**
- **AUDIT-F09-07b** (yeni — F09-07 kapsamında dışı): hasta/contact KVKK m.11 — `/v1/contacts/:id/data-export` + `data-deletion-request`; Açık sorular §1 contact anonimizasyonu (ad/telefon/e-posta maske, mali kayıtlar kalır). Operator/admin aracılı; hasta hesabı yok. **(L)** — LEG-02 hukukçu.

### Faz 9 — Tracker gap P2 (sıra dışı; PILOT-02 geri bildirimi seçer)

- **GAP-F09-20** Randevu checklist şablonları — skip adayı (Tracker'da 0 satır; §4). **(L)**

---

## Bekleyen (öncelik sırası yok; MARKET-02 sonrası değerlendirilir)

- **Faz 8 içe/dışa aktarım uygulaması** — kapsam GAP-08 ile kilitlendi (ETL-ESLEME §3 eşlemesi,
  26 sütun kişi şablonu, formül enjeksiyonu sanitizasyonu); ikinci müşteriden önce zorunlu
  (Açık sorular §9).
- **GAP-25:** Kapsamlı veri silme (`/data/delete-scope`) + wipe — "tehlikeli" onayı korunur.
- **GAP-26:** AI prompt özelleştirme — Açık sorular §6.
- **Marka tescili:** `verimaya.com` / `.com.tr` + Türk Patent 9/35/42/44 (teknik ad `verimaya`;
  görünen marka **"Veri Maya"**).
- **IOS-01:** iOS donmuş; birikmiş drift (DOMAIN-01 enum + marketing adları iOS'a uygulanmadı) —
  iOS çözülürse ilk kapatılacak kalem.
- **PRODUCT-01:** Komisyon takibi discovery (acente segmenti seçilirse).
- **CSP/HSTS başlık denetimi** canlıda kanıtlı.
- **Veri işleme envanteri (tamamı)** + **AB veri lokasyonu envanteri + DPA şablonları**.
- **DOC-03b/d artıkları (kullanıcı tarafı):** Obsidian `00-proje-ozeti.md` + `01-kararlar.md`
  marka satırları ve `04-ilerleme-log.md` — sıradaki vault oturumunda.
- **İsteğe bağlı ops:** Coolify `verimaya-web-image` → `verimaya-web` rename; API için GHCR path B.

---

## Bilinçli olarak yapılmayacaklar (MARKET-02 kapısına kadar)

| Konu | Gerekçe |
|------|---------|
| iOS App Store hazırlığı | Pazar doğrulaması yokken yatırım yapılmaz |
| Tam i18n/locale ağacı (`/tr/` `/en/`) SEO | Hub UI TR/EN switcher bilinçli kısmi (DOC-03e); SEO locale ağacı MARKET-02 sonrası |
| TikTok / Instagram entegrasyonları | MARKET-02 öncesi yatırım yok |
| Klinik entegrasyonları (e-Nabız, e-Fatura) | Acente segmenti seçilmezse gereksiz |
| Ürün içi karnenin genişletilmesi | Pilotla birlikte gelir |
| **Etiketler (Tags) modülü** | Tracker'da da hiç doldurulmadı (`ayarlar.md`: "taşınmaz") |
| **Kişilerden toplu case oluşturma / toplu auto-link** | Tracker'da tek seferlik migrasyon aracı; ETL boru hattı aynı işi yapıyor |
| **Lead / pipeline / satış aşaması yönetimi app tarafında** | **DOMAIN-01:** satış CRM'de (GHL) kalır; app'te patient = operasyon dosyası, lead durumu sync ile gelir |
| **Randevu durumu tenant-CRUD'u** | `ETL-ESLEME.md` §2.3 enum'a kilitledi; talep gelirse enum → FK migrasyonu (§3) |
| **Canlı kur çevirici** | `doviz.md`: raporlar snapshot ile bazda toplanır; FX-01 snapshot modeliyle kapandı |
| **`responsible_party` alanı** | Contact modeli absorbe etti (`raporlar.md`) |

---

## Açık sorular / ürün kararı bekleyenler

> Karar verilenler: ~~§1 silme politikası~~ (soft-delete, hard-delete yok) ve
> ~~§2 patient merge semantiği~~ (randevu/işlemli dosya birleşmez; iki boş dosya alan
> doldurmayla birleşir) — 2026-08-07, uygulandı (GAP-06 / DOMAIN-01 Adım 7).

3. **Randevu durumu enum kalacak mı?** Tenant kendi durumunu isterse enum → FK migrasyonu. PILOT-02 cevaplar.
4. **Checklist ölü özellik mi?** Tracker canlı DB'de 0 satır → GAP-F09-20 tamamen skip olabilir.
5. ~~**Kişi notları hasta notlarından ayrı mı?** (GAP-F09-19)~~ — **kapandı (DOMAIN-02):**
   tek model `case_notes.contact_id`; tür filtresi yok (Hasta/Klinik/Otel/…).
   `contacts.notes` serbest alan ayrı kalır (profil özeti ≠ thread).
6. **AI prompt tenant'a açılmalı mı?** (GAP-26) Çıkarım kalitesi tenant'a göre değişir → destek yükü.
7. **Tenant düzeyinde izin matrisi isteniyor mu?** Tracker'da 9 özellik × 5 rol; bizde
   artık 8 kaynak × 6 rol (AUDIT-F09-02). Pilotta ölç; talep yoksa skip.
8. **P2P payer/payee geri gelecek mi?** Erteledi, iptal değil — `transactions` şemasını değiştirir; **freeze öncesi karar ucuz, sonra pahalı.**
9. **İçe/dışa aktarım ikinci müşteriden önce mi?** (GAP-08 kapsamı hazır; MARKET-02 kapısı geçilmeden yatırım yapılmalı mı?)

---

## Son kapananlar (bu dosya dönemi)

> Kural 3: kapanan kalem buraya tek satırla taşınır; Görüş özeti (commit hash yazılmaz —
> kendi commit'ine self-reference olur; `git log --grep=<kalem-id>` ile bulunur).
> 2026-08-09 öncesi kapananların tamamı `docs/Arşiv/2026-08-03-YAPILACAKLAR.md`'de.

- ✅ **GAP-27** — toplu reorder (2026-08-11). `PUT .../contact-types|appointment-types|
  finance-categories/reorder` absolute-set (`items[{id,sort_order}]`, max 500);
  yabancı id atlanır, `updated` gerçek sayım; idempotency-exempt. Finance zaten PATCH
  `sort_order` ile tek tek yazılıyordu; contact/appointment `sort_order` kolonu + create
  auto-increment vardı. Tipik N ≈ 5–30.
  **Görüş:** Durum enum + checklist (Tracker G-27'nin 4. ayağı) bilinçli dışarıda —
  Verimaya'da status tenant-CRUD yok; checklist skip adayı. shared 102 · api 479 ·
  openapi 74 · MSW handlers.
- ✅ **AUDIT-F09-06** — tenants soft-delete + FK restrict (2026-08-11). Migration `0042`:
  `tenants.deleted_at` + tüm `tenant_id → tenants` CASCADE→RESTRICT + `tenants→organization`
  RESTRICT. better-auth `disableOrganizationDeletion: true` + `beforeDeleteOrganization`
  soft-delete+APIError (defense). `ActiveOrgGuard` soft-deleted tenant'a 403
  `tenant_inactive`. Spec cleanup `purgeTenantFixtures`.
  **Görüş:** AUDIT-REPORT: org delete CASCADE = total data loss + 10y mali saklama
  çatışması. Org hard-delete engellendi (restrict + disable); soft-delete satır+iş verisi
  kalır. Saklama süresi / hangi veri ne kadar tutulur → **LEG-02**. shared 102 · api 479 ·
  openapi 74 · fresh 0000→0042 OK.
- ✅ **AUDIT-F09-02** — per-key API scope map (2026-08-11). `api_keys.scopes` → JSONB
  `resource:action[]`; OrgPermissionGuard short-circuit kaldırıldı (deny-by-default);
  `permissions.ts` +5 kaynak (audit/members/api_keys/webhook_subscriptions/scorecard);
  issuance UX kaynak:eylem; migration `0041`; lokal 0 aktif key (no-op migrate).
  **Görüş:** AUDIT option (b). Legacy `read`→contact|finance|settings:read; `write`→aynı
  yüzeyin CRUD'u — audit/api_keys sessiz genişletilmedi. Session-only: audit-logs, me
  KVKK, members, api-keys, webhooks, scorecard, settings, tenants, ad-metrics.
  shared 99 · api 471 · web check 0 · test 56 · lint · openapi 71 · fresh 0041 OK.
  Commit bekliyor (kullanıcı talimatı: commit yok).
- ✅ **TEST-02** — TestSprite DOMAIN-02’ye (2026-08-10). 15→17 senaryo: TC002/003 Hasta
  tipi `/contacts` (ad/soyad, kaynak→medium); TC007 Klinik+firma; TC009 Referans eden;
  TC014 Sil artık var; TC004 iletişim uyarısı; **TC016** Firmalar; **TC017** dosya sil.
  Statik güncelleme (canlı TestSprite koşusu yok). Doküman:
  `docs/2026-08-09-TESTSPRITE-15-SENARYO.md` (başlık 17).
  **Görüş:** Selector’lar ContactFormDialog / contacts/+page / AppointmentFormDialog /
  ContactFilesPanel / settings/organizations kodundan. Filtre “Tümü” UI’da **Tüm türler**.
- ✅ **AUDIT-F09-07** — KVKK m.11 panel-kullanıcı endpoints (2026-08-10). `GET /v1/me/data-export`,
  `POST /v1/me/data-deletion-request` + `tenants.data_retention_until` (migration `0040`) +
  `data_deletion_requests` RLS. Kapsam = (a) better-auth üye; self-only; hard-delete yok —
  tek org’da name/email anonim; çok-org’da `received` (global mask yok).
  **Görüş:** AUDIT-REPORT Fix yolu `/v1/me` + ActiveOrgGuard → panel user; hasta/contact
  (b) ayrı kalem **AUDIT-F09-07b** (Açık sorular §1 contact alanları). Mali kayıt / audit
  satırı silinmez. shared 95 · api 461 · openapi 71 · fresh mig 0000→0040 OK. Hukukçu: LEG-02.
- ✅ **GAP-29** — Randevu öncesi eksik iletişim uyarısı (2026-08-10). `AppointmentFormDialog`
  kişi seçilince phone/email boşsa uyarı (bloklamaz); i18n tr+en; saf yardımcı + vitest.
  **Görüş:** Yalnız uyarı — kaydetme serbest (bilgi sonradan girilebilir). Metin eksik
  kanalı (telefon / e-posta / ikisi) söyler. shared 92 · api 453 · web check 0 · test 56 ·
  lint temiz; sözleşme değişmedi.
- ✅ **GAP-F09-19** — Kişiye bağlı not thread'i (no-op / zaten var, 2026-08-10). DOMAIN-02
  sonrası `case_notes.contact_id` + `GET/POST/DELETE /v1/contacts/:id/case-notes`; servis
  tür bakmaz; panel `ContactCaseNotesThread` her kişi detayında. §5 → tek model.
  **Görüş:** Eski «hasta notu vs kişi notu» ayrımı patients birleşince düştü; Klinik/Otel'e
  de thread yazılır. `contacts.notes` serbest metin; thread ile çakışmaz. Kod yazılmadı.
- ✅ **GAP-28** — Dev panel üretimde gizlendi (backend yazılmadı). `/dev` MSW-only; kapı
  `isDevPanelEnabled` + wiring `dev-panel-enabled.ts` (`USE_MSW` ∧ `import.meta.env.DEV`);
  nav filtre + rota `→ /`.
  **Görüş (2026-08-10):** Nest `/v1/dev` ürün ihtiyacı yok → bakım borcu yazmak yerine
  gizle (tersine çevrilebilir). Rota silinmedi. web check/test/lint yeşil.
  **Güncelleme (2026-08-11):** Gerçek platform API `/v1/platform/*` +
  `PLATFORM_ADMIN_EMAILS` allowlist; `/dev` paneli `me.platform_admin` (veya MSW+DEV) ile
  açılır; soft-delete org + üye CRUD. Coolify API env şart.
- ✅ **AUDIT-F09-20** — no-op (2026-08-10): `corsOrigins` / better-auth `trustedOrigins`
  boot-time env (`TRUSTED_ORIGINS` + `WEB_PUBLIC_URL`) bilinçli; AUDIT-REPORT «Fix: None
  required. Document.» — DEPLOY-COOLIFY’a restart notu eklendi. Hot-reload / DB allowlist
  uygulanmadı (güvenlik yüzeyi + kurulum geneli, tenant scope yanlış).
  **Görüş:** Panel tek host (`app.verimaya.com`); origin eklemek zaten DNS/Coolify/env
  deploy’u — restart doğru sınır. Önceki no-op: AUDIT-F09-13.
- ✅ **GAP-F09-23** — `DELETE /v1/contacts/:id/files/:fileId` soft-delete (`files.deleted_at` +
  migration `0039`); audit `action=delete`/`entity_type=file` (CHECK zaten vardı); liste/
  preview/download `deleted_at IS NULL`; blob silinmez; sweep soft-deleted'i hariç tutar;
  izin `contact:update`; ikinci silme 404; panel onay + i18n (2026-08-10).
  **Görüş:** Hard-delete yok (Açık sorular §1); ikinci DELETE 404 — contacts/txn/appt
  yumuşak silme deseni (aynı Idempotency-Key replay ≠ ikinci doğal silme). Sweep yalnız
  pending orphan; ready soft-delete blob kalır. shared 92 · api 453 · web check+42 · lint
  temiz; openapi 69 op.
- ✅ **SEC-03 — runtime high advisory kapatma** (2026-08-10). `drizzle-orm` 0.44.7→0.45.2
  (doğrudan); `pnpm-workspace.yaml` overrides: find-my-way 9.7.0, fast-uri 3.1.5/4.1.2,
  nanoid 3.3.18, brace-expansion 1.1.18/5.0.9, js-yaml 4.3.1. Audit 17→7 (high 11→1).
  **Görüş:** Kalan tek high `@fastify/static@9.3.0` — patched yalnız ≥10.1.1 (major);
  Nest peer `^8 || ^9`, bull-board `^9` → major atlama bilinçli ertelendi (ayrı kalem).
  nanoid yalnız postcss/vite (build; API prod değil). shared 92 · api check+449 · web
  check+42 · eslint temiz; `AppShell.svelte` prettier uyumsuzluğu SEC-03 öncesi drift
  (SEC-03 dosyasına dokunulmadı). openapi drift yok.
- ✅ **pnpm audit / Dependabot** — `.github/dependabot.yml` (npm kök `/` tek entry; gha; docker
  `apps/web`+`apps/api`; haftalık; limit 5; minor/patch groups; `ops(deps)` öneki) + CI
  `dependency-audit` job (`continue-on-error`, raporlamalı) (2026-08-10).
  **Görüş:** Ayrı npm dir'leri yok — tek `pnpm-lock.yaml`; audit CI'ı kırmaz (OPS-03
  `workflow_run` conclusion'ına dokunmaz). Ölçüm: 17 bulgu (0 critical / 11 high / 5
  moderate / 1 low) — düzeltme ayrı iş. `name: CI` değişmedi.
- ✅ **OPS-03** — deploy CI kapısı: `deploy-web.yml` artık `push` ile değil, CI
  `workflow_run` (completed + success + head_branch=main + event=push) ile tetiklenir;
  `workflow_dispatch` kaçış kapısı kaldı; paths kapısı son başarılı Deploy koşusunun
  `head_sha`..şu an (fail-open); `:main` etiketi yalnız SHA main tarihçesindeyse
  (2026-08-10). **Görüş:** CI kırmızıyken tamamen blok; multi-commit push + feature
  dispatch'te `:main` basmama düzeltildi — Coolify `:main` çeker.
- ✅ **AUDIT-F09-10** — i18n katalog süpürmesi: uygulama sayfaları + `lib/components`'teki hardcoded TR metinler `t()` + `messages.ts`'e taşındı (336 tr + 336 en anahtar; 33 dosya i18n + 7 dosya prettier-only); Türkçe-karakter grep'i 775→41 (2026-08-09). Görüş: kalan 41 eşleşme bilinçli — `Konsültasyon` kaydedilen randevu tipi varsayılanı (locale'e bağlamak davranış değiştirir) + kod/HTML yorumları (süpürme kapsamı dışı); marketing/** (DOC-03e), (public)/** (hukuki metinler TR-only), dev/** (GAP-28) ve mocks (fixture verisi) kapsam dışı bırakıldı. Web check 0 hata + lint temiz + web 43/43 + API 445/445 yeşil.
- ✅ **GAP-F09-16** — taslak onayında satır içi kayıt: `POST /v1/whatsapp/create-contact|create-patient|create-category` (mevcut service yollarının ince sarmalayıcısı + `@Idempotent`); taslak kartında "yeni …" formları, oluşan kayıt otomatik seçili (2026-08-09). Görüş: subcategory bilinçli yok (düz kategori modeli); create-category izni `finance:create` (permission lock); kategori duplicate'ı artık 409 `duplicate_type_name` (uidx 0004'ten beri vardı, pre-check eklendi). API 445/445 + shared 88 + web check yeşil.
- ✅ **AUDIT-F09-08 + GAP-F09-24** — magic-byte sniff (`file-type`, tek choke point: `putFileContent` + `uploadLocalFileWithDb` → local+S3 ikisi de kapsamda) + allowlist pdf/png/jpeg/webp (`image/jpg` normalize; `image/gif` binaryTypes'tan çıktı); 415 `unsupported_media_type`/`mime_mismatch`. `GET .../files/:fileId/preview` — allowlist inline, legacy attachment, RFC 5987 filename*, nosniff; dosya panelinde önizle (2026-08-09). Görüş: `@fastify/multipart@10`'da `allowedMimeTypes` yok → declared MIME controller'da; appointment files kapsam dışı (bulgu patients'a işaret ediyor); S3 presigned-direct PUT yok, byte'lar API üzerinden geçiyor. API 432/432 + shared 88 + web check yeşil.
- ✅ **GAP-F09-14** — `GET /v1/reports/transaction-duplicates`: tam dönemde SQL `GROUP BY/HAVING` (amount+currency+occurred_on+kind), `total_groups` + 20 grup üst sınırı; `/settings/data-quality`'nin ilk-100-satır istemci taraması kalktı (2026-08-09). Görüş: from/to düz ISO `occurred_on` (summary/consistency deseni; `tenantDayRange` timestamp'ler içindir); Tracker'ın WA-import günlük özeti bilinçli taşınmadı (inbox/taslak modeli farklı). API 423/423 + shared 88 + web check yeşil.
- ✅ **AUDIT-F09-01** — elle `openapi.yaml` bitti: `apiContract`'tan üretim (`scripts/generate-openapi-core.js` + `pnpm --filter @verimaya/api openapi:generate`), vitest drift guard byte-for-byte karşılaştırıyor (route-bazlı teşhis mesajlı); 67 operation, OpenAPI 3.1 (2026-08-09). Görüş: `@nestjs/swagger` bilinçli kullanılmadı (controller'lar DTO metadata'sı taşımıyor, zod parse ediyor); ayrı CI adımı yerine drift spec mevcut test job'unda. API 418/418 yeşil.
- ✅ **GAP-F09-22** — `POST /v1/patients/:id/auto-link-transactions`: hastanın `contact_id`'siyle eşleşen, `patient_id IS NULL` + soft-delete'siz işlemleri bağlar (`updated` gerçek sayım; denormalize `patient_display_name` senkron) (2026-08-09). Görüş: P2P payer/payee eşleşmesi bilinçli yok (alanlar yok); izin `finance:update` (mutasyon transactions'ta, permission lock'a işlendi); idempotency-exempt (sorgu doğal yakınsıyor). API 416/416 + shared 86 + web check yeşil.
- ✅ **GAP-F09-17** — `PATCH /v1/settings/contact-types/:id` rename (409 `duplicate_type_name`, denormalize `contact_type_name` senkronu) + `PATCH /v1/contacts/bulk-type` (max 500 id, yabancı id atlanır, `updated` gerçek sayım); `/contacts`'te çoklu seçim çubuğu, contact-types'ta satır içi rename (2026-08-09). Görüş: `contact_type_id` null desteklenmiyor — kolon NOT NULL, Tracker da null almıyor; iki endpoint de idempotency-exempt (absolute-set). API 409/409 + shared 86 + web check yeşil.
- ✅ **GAP-F09-13** — `GET /v1/audit-logs` filtreleri: `actor_id`, `action`, `entity_type`, `created_from/to` (tenant-timezone takvim günü, `tenantDayRange`), `q` (`entity_label` ILIKE); `/settings/audit`'te filtre çubuğu (2026-08-09). Görüş: Tracker'ın `entity_id` parametresi bilinçli dışarıda — tabloda kolon yok; `q` label araması işlevi karşılıyor. Spec'te session-GUC deseni yakalanıp SET LOCAL'e çevrildi. API 402/402 + shared 84 + web check yeşil.
- ✅ **Flaky spec** — `auth-or-api-key.isolation.spec.ts` sıralama bağımlılığı giderildi (2026-08-09). Görüş: kök neden session-level `set_config(..., false)` + postgres.js pool sızıntısı; test başına fixture + `SET LOCAL` (production deseni) — her test kendi A/B çiftini kuruyor, izolasyon/scope iddiaları aynı. 3× + 2× shuffle + tam paket 394/394 yeşil.
- ✅ **GAP-F09-15** — `GET /v1/whatsapp/corrections-report` alan bazlı GROUP BY (correction_count + distinct_messages, from/to, `.strict()`); `/settings/ai-learning` istemci sayımından rapor API'sine geçti (2026-08-09). Görüş: Tracker'ın value-triple özeti bilinçli ertelendi (display-name çözümü gerekir); prompt tuning için alan frekansı yeterli.
- ✅ **GAP-F09-21** — randevu listesi yanıtına filtreli tam küme `type_counts`/`status_counts` (GAP-03b deseni; cursor sayımda yok, soft-delete hariç); UI'da durum özeti şeridi (2026-08-09). API 390/390 + web check yeşil.
- ✅ **GAP-F09-25** — `appointment_types`/`contact_types` UNIQUE (tenant_id, name) + `tenant_settings` seed bayrakları (finance_categories dahil); 409 `duplicate_type_name` + web i18n anahtarı; migration `0034` (2026-08-09). Görüş: boş liste ≠ "hiç seed edilmedi"; finance aynı geri-yazma bug'ına sahipti → aynı mekanizma. Tam paket 388/388 yeşil.
- ✅ **AUDIT-F09-05** — outbox + zamanlanmış iş DLQ + admin requeue (`dead` status, migration `0033`) (2026-08-09). Spec 11/11 yeşil; `0033` prod'a kalem 1 ile gider.
- ✅ **AUDIT-F09-03** — no-op (2026-08-09): outbound webhook secret zaten per-subscription (`webhook_subscriptions.secretCiphertext`); değişiklik gerekmiyor.

---

## Kaynaklar

- `docs/Arşiv/2026-08-03-YAPILACAKLAR.md` — önceki liste (Faz 0–7 + denetim sonrası kapananlar)
- `docs/Arşiv/2026-08-10-TUM-ACIK-ISLER.md` — yönelim notu (2026-08-11'de aktif listeye emildi;
  panelde göze çarpanlar + "Faz 8" karışıklığı). Kalem durumu artık yalnız
  `docs/2026-08-11-YAPILACAKLAR.md`'dedir.
- `docs/2026-08-10-DOMAIN-02-DEPLOY-RUNBOOK.md` — sıralı prod deploy + canlı kontrol listesi
- `docs/2026-08-09-PROD-SMOKE-REHBERI.md` — kalem 1: tıklama sırası + tutarsızlık notları
- `docs/Arşiv/2026-08-08-PROD-KONTROL-LISTESI.md` — migration A kanıtı (eski checklist)
- `docs/tracker-verimaya-ozellik-gap.md` — Tracker → Verimaya gap analizi (GAP-* kalemlerinin kaynağı)
- `AUDIT-REPORT.md` — Opus denetimi (AUDIT-F09-* kalemlerinin kaynağı)
- `docs/MIMARI.md`, `docs/TASARIM.md` — mimari ve tasarım kararları
- `docs/DEPLOY-COOLIFY.md`, `docs/ETL-KESIM.md`, `docs/ADS-META-GOLIVE.md`, `docs/ADS-GOOGLE-GOLIVE.md` — runbook'lar
- `docs/legacy-reference/` — eski sistem bilgi kaynağı (kod taşınmaz)
- `SecondBrain-Remote/03-Areas/VeriMaya/` — 01-kararlar, 02-yol-haritasi, 04-ilerleme-log, 05-guvenlik-kvkk
- `AGENTS.md` — AI geliştirme rehberi (always-apply)
