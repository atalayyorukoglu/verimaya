# Verimaya — Yapılacaklar (2026-08-09 · pilot-öncesi kapanış → pazar kapısı)

> **Bu dosya tek kaynaktır.** 2026-08-03 listesinin devamıdır; o dosya Faz 0–7 +
> denetim sonrası kapanan tüm işlerin Görüş'leriyle birlikte
> `docs/Arşiv/2026-08-03-YAPILACAKLAR.md`'de durur. Kapanan işin kanıtı oradadır,
> buraya taşınmaz.
>
> **Durum anı:** branch `main`, HEAD `c41872e` (AUDIT-F09-05). Prod DB `0032`'de
> doğrulandı (2026-08-08, kanıt: `docs/2026-08-08-PROD-KONTROL-LISTESI.md` § A);
> `0033` sıradaki API deploy'uyla gider.
> Pilot tenant: `Demo Klinik` (`afb4a68b…`) — 757 dosya, 548 işlem, 703 randevu.

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

- [ ] **Prod smoke turu** — `docs/2026-08-08-PROD-KONTROL-LISTESI.md` § B1–B4 (soft-delete
  altı ekranda düştü mü), § D1–D2 (işlem/randevu filtreleri gerçek veriyle), § E1–E2
  (no-show oranı %0 değil mi; tutarlılık uyarısı 10–100 bandında mı). Takılan maddeye
  bu dosyada kalem aç; takılan yoksa Sonuç tablosunu işaretle.
- [ ] **Migration `0033` prod'a** (sıradaki API deploy'uyla): yedek → `pnpm db:migrate` → kanıt
  (`outbox_events`'ta `status='dead'` + `dead_lettered_at` kolonları). Runbook: PROD-KONTROL § A.
- [ ] Pilot boyunca **ikinci organizasyon yaratma** (demo/test org dahil) — devam eden kural.
- [ ] **Tenant adı:** `Demo Klinik` rename veya olduğu gibi bırak — karar ver, Görüş'e yaz (ucuz).
- **Bağımlı:** yok.
- **Kabul:** PROD-KONTROL Sonuç tablosu "takılan yok" ile kapandı; prod `0033`'te.

---

### 2. MARKET-01 — üç stratejik karar (17 Ağustos review öncesi)

> Kod yok; karar işi. Karar metni Görüş + Obsidian `01-kararlar.md`'ye işlenir.

- [ ] **(a)** Birincil segment: acente mi klinik mi? (ilk 20 görüşme tek segmente odaklanır)
- [ ] **(b)** OrbisMed çıkar çatışması: veri ayrımı, tüzel ayrım, erişim/audit, referans anlatısı
- [ ] **(c)** Kapasite: haftalık sabit gün/saat + pilot boyunca feature freeze taahhüdü
- **Kabul:** Üç karar yazılı; (c)'deki freeze taahhüdü kalem 4'ün giriş şartıdır.

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

### 4. PILOT-02 — 2–4 haftalık feature-freeze dahili pilot

> **Bağımlı:** 1 (prod smoke temiz) + 2(c) (freeze taahhüdü).
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
- [ ] **AUDIT-F09-02 — per-key API scope map** (breaking): `api_keys.scopes` text[] →
  structured JSONB veya `api_key_scopes` tablosu; `AuthOrApiKeyGuard` + `OrgPermissionGuard`
  güncellenir; `permissions.ts`'e `audit`, `members`, `api_keys`, `webhook_subscriptions`,
  `scorecard` resource'ları; issuance UX'te scope seçimi; mevcut key'ler explicit scope'a
  migrate edilir (n8n key'leri rotate olur); `api-keys.isolation.spec.ts` negatif testlerle
  genişler ("API key ile `/v1/audit-logs` reddedilir").
  **Dosyalar:** `apps/api/src/api-keys/**`, `apps/api/src/common/org-permission.guard.ts`,
  `apps/api/src/auth/**`, `packages/shared/src/api-key.ts`, yeni migration,
  `apps/web/src/routes/settings/**` (issuance UX).

---

### 5. MARKET-02 — 30 günlük pazar kapısı

> **Bağımlı:** PILOT-02 verileri.
> Kabul: 20 müşteri görüşmesi, 4–5 rakip demo/fiyat teklifi, en az 3 ücretli ön-sipariş/yazılı
> pilot niyeti, bir fiyat kartı + iptal/taahhüt modeli.

- [ ] Görüşmeleri tamamla
- [ ] Fiyat kartını sabitle
- [ ] Kapı kararını ver

---

## Faz 9 — kalan denetim işleri (öncelik sırası yok; kapasiteye göre)

- **AUDIT-F09-01** OpenAPI'yi generator'a taşı (`@nestjs/swagger` veya elle YAML → CI'da route'lardan üret). **(M)**
- **AUDIT-F09-06** `tenants` FK davranışı → `restrict` + soft-delete (`tenants.deleted_at`); 10y mali saklama + KVKK silme yetkisi dengesi. **(L)**
- **AUDIT-F09-07** KVKK m.11 data-subject endpoints: `/v1/me/data-export`, `/v1/me/data-deletion-request` + `tenants.data_retention_until`. Anonimleştirme yaklaşımı (silme değil) arşivdeki Açık sorular §1 kararına göre. **(L)**
- **AUDIT-F09-08** Magic-byte MIME sniff (`file-type`/`mmmagic`) + multipart `allowedMimeTypes` allowlist (S3 sürücüsü dahil). GAP-F09-24 ile birlikte gitmeli. **(M)**
- **AUDIT-F09-10** i18n katalog süpürmesi — Türkçe hardcoded metinler `messages.ts`'e. **(L)**
- **AUDIT-F09-20** `corsOrigins` allowlist hot-reload. **(M, düşük öncelik)**

### Faz 9 — Tracker gap P2 (sıra dışı; PILOT-02 geri bildirimi seçer)

- **GAP-F09-14** Sunucu tarafı veri kalitesi raporu (`settings/data-quality` istemci hesaplıyor; GAP-05 ile aynı kök neden). **(M)**
- **GAP-F09-16** WhatsApp içe aktarımda satır içi kayıt oluşturma (kişi/hasta/kategori). **(M)**
- **GAP-F09-17** Kişi toplu tür atama + kişi türü rename (`PATCH /contact-types/:id`). **(S)**
- **GAP-F09-19** Kişiye bağlı not thread'i — Açık sorular §5 kararını bekler. **(M)**
- **GAP-F09-20** Randevu checklist şablonları — skip adayı (Tracker'da 0 satır; §4). **(L)**
- **GAP-F09-22** Case ↔ işlem otomatik bağlama (basitleştirilmiş: yalnız `contact_id`). **(S)**
- **GAP-F09-23** Dosya silme endpoint'i (soft-delete + audit; KVKK). **(M)**
- **GAP-F09-24** Satır içi güvenli dosya önizleme (MIME allowlist + attachment zorlaması kararı
  uygulanmamış; AUDIT-F09-08 ile birlikte). **(M)**

---

## Bekleyen (öncelik sırası yok; MARKET-02 sonrası değerlendirilir)

- **Faz 8 içe/dışa aktarım uygulaması** — kapsam GAP-08 ile kilitlendi (ETL-ESLEME §3 eşlemesi,
  26 sütun kişi şablonu, formül enjeksiyonu sanitizasyonu); ikinci müşteriden önce zorunlu
  (Açık sorular §9).
- **GAP-25:** Kapsamlı veri silme (`/data/delete-scope`) + wipe — "tehlikeli" onayı korunur.
- **GAP-26:** AI prompt özelleştirme — Açık sorular §6.
- **GAP-27:** Toplu `reorder` endpoint'i (kısmen PATCH ile karşılanıyor).
- **GAP-28:** Dev panel gerçek arka uç veya ekranı gizle (bugün yalnız MSW; yanlış izlenim).
- **GAP-29:** Randevu öncesi eksik iletişim bilgisi uyarısı.
- **Marka tescili:** `verimaya.com` / `.com.tr` + Türk Patent 9/35/42/44 (teknik ad `verimaya`;
  görünen marka **"Veri Maya"**).
- **IOS-01:** iOS donmuş; birikmiş drift (DOMAIN-01 enum + marketing adları iOS'a uygulanmadı) —
  iOS çözülürse ilk kapatılacak kalem.
- **PRODUCT-01:** Komisyon takibi discovery (acente segmenti seçilirse).
- **CSP/HSTS başlık denetimi** canlıda kanıtlı; **pnpm audit / Dependabot** CI'da.
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
5. **Kişi notları hasta notlarından ayrı mı?** (GAP-F09-19) Tek "notlar" modeli mi, ayrı mı?
6. **AI prompt tenant'a açılmalı mı?** (GAP-26) Çıkarım kalitesi tenant'a göre değişir → destek yükü.
7. **Tenant düzeyinde izin matrisi isteniyor mu?** Tracker'da 9 özellik × 5 rol; bizde sabit 3 kaynak × 6 rol. Pilotta ölç; talep yoksa skip. AUDIT-F09-02 ile kısmen örtüşür.
8. **P2P payer/payee geri gelecek mi?** Erteledi, iptal değil — `transactions` şemasını değiştirir; **freeze öncesi karar ucuz, sonra pahalı.**
9. **İçe/dışa aktarım ikinci müşteriden önce mi?** (GAP-08 kapsamı hazır; MARKET-02 kapısı geçilmeden yatırım yapılmalı mı?)

---

## Son kapananlar (bu dosya dönemi)

> Kural 3: kapanan kalem buraya tek satırla taşınır; Görüş özeti (commit hash yazılmaz —
> kendi commit'ine self-reference olur; `git log --grep=<kalem-id>` ile bulunur).
> 2026-08-09 öncesi kapananların tamamı `docs/Arşiv/2026-08-03-YAPILACAKLAR.md`'de.

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
- `docs/2026-08-08-PROD-KONTROL-LISTESI.md` — prod smoke listesi (kalem 1'in kanıt yeri)
- `docs/tracker-verimaya-ozellik-gap.md` — Tracker → Verimaya gap analizi (GAP-* kalemlerinin kaynağı)
- `AUDIT-REPORT.md` — Opus denetimi (AUDIT-F09-* kalemlerinin kaynağı)
- `docs/MIMARI.md`, `docs/TASARIM.md` — mimari ve tasarım kararları
- `docs/DEPLOY-COOLIFY.md`, `docs/ETL-KESIM.md`, `docs/ADS-META-GOLIVE.md`, `docs/ADS-GOOGLE-GOLIVE.md` — runbook'lar
- `docs/legacy-reference/` — eski sistem bilgi kaynağı (kod taşınmaz)
- `SecondBrain-Remote/03-Areas/VeriMaya/` — 01-kararlar, 02-yol-haritasi, 04-ilerleme-log, 05-guvenlik-kvkk
- `AGENTS.md` — AI geliştirme rehberi (always-apply)
