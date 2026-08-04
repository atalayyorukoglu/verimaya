# Verimaya — Yapılacaklar (2026-08-03 · Faz 0–7 + Faz 7 denetim sonrası)

> **Bu dosya tek kaynaktır.** Faz 0–7 (tüm kod fazları + Opus denetimi) tamamlandı.
> Kalan işlerin tamamı **Faz 8 — kod dışı**, **kod-içi güvenlik/hijyen** veya **denetim sonrası** kategorisinde.
>
> Durum anı: branch `main`, HEAD `f52d491` (apex vitrin prerender fix). Opus denetim raporu: `AUDIT-REPORT.md` (38 bulgu, 2 Critical + 12 High + 19 Medium + 4 Low + 1 Info).

---

## Çalışma kuralları

1. **Sırayla ilerle.** Sıra numarası önceliği gösterir; `Bağımlı:` satırı kırmızı çizgidir.
2. **Adım başına tek commit.** Commit mesajı Türkçe, `feat:` / `fix:` / `ops:` / `docs:` önekiyle.
3. **Bitirince bu dosyayı güncelle:** `- [ ]` → `- [x]` ve **Görüş** satırını doldur.
4. **Soru sorma, en savunulabilir varsayımı seç**, Görüş'te yaz.
5. **Sır yazma.** Hiçbir token/parola/anahtar değeri koda, teste, commit mesajına girmez.

**Durum işaretleri:** `- [ ]` yapılmadı · `- [x]` yapıldı · `- [~]` ksmi

---

## Öncelik Sırası

### 1. WEBHOOK-01 — Tenant çözümünü imzalı / provider eşlemesinden yap

> **Durum:** Tasarım hazır (`tenant_provider_identities` tablosu, payload-imza-doğrulama-sonrası tenant_id çözümü).
> Atalay'dan **uygulama kararı** bekliyor. WAHA pilot/kendi firmamız tek tenant olduğu için bugünkü risk düşük,
> ama ikinci tenant eklenmeden **önce** yapılmalı.

- [ ] Uygulama kararı ver → migration + kod + test
- **Dosyalar:** `apps/api/drizzle/`, `apps/api/src/webhooks/`, `packages/shared/`
- **Bağımlı:** yok (tasarım hazır)
- **Kabul:** Geçerli body imzası + değiştirilmiş `X-Tenant-Id` ile hedef tenant'a yazılamıyor (negatif test).

---

### 1A. AUDIT-01 — Opus denetimi: hasta tenant-timezone kaçağı

> **Kaynak:** `AUDIT-REPORT.md` §[CRITICAL] "Patient file-label timezone leak" ve eşlik eden §[MEDIUM] "reports.service.ts computes report date boundaries in UTC, not tenant timezone".
> **Neden pilot-öncesi:** Hasta zaman damgası ve rapor tarih sınırları yanlış tenant zaman dilimini kullanıyor; tüm tenantlar `Europe/Istanbul` varsayılanında olduğu için latent. İkinci tenant eklenmeden kapatılmazsa raporlar ve dosya etiketleri cross-tenant yanlış dönmeye başlar.
> **Varsayım:** Her rapor/aggregasyon giriş noktası, kendi tenant'ının `tenants.timezone` değerini okuyup `tenantDayRange` (zaten `packages/shared/src/calendar-day.ts`'de var) kullanacak. Rapor sınırları UTC sabit kalmasın.

- [ ] `patients.service.ts:512-519` `getTenantTimezone(db)` → `getTenantTimezone(db, tenantId)` imzasına çevir, `.where(eq(tenants.id, tenantId))` ekle
- [ ] `reports.service.ts:75-82, 458, 461` UTC `startOfDayUtc`/`dayAfterUtc` → tenant-timezone-aware `tenantDayRange` (`packages/shared`)
- [ ] Negatif izolasyon testi: `apps/api/src/tenants/tenants.isolation.spec.ts` (gerçek Postgres, iki tenant, `tenants/current` GET/PATCH — kontrol listesi invariant-1 gereği)
- [ ] Negatif izolasyon testi: `apps/api/src/patients/finance-summary.isolation.spec.ts` veya yeni `appointments/reports-timezone.spec.ts` — aynı tenant'ın `Europe/Istanbul` ve `Europe/London` ayarıyla aynı gün sorgusu farklı satır kümesi döner
- **Dosyalar:** `apps/api/src/patients/patients.service.ts`, `apps/api/src/reports/reports.service.ts`, `apps/api/src/tenants/tenants.controller.ts` (varsa), yeni `tenants.isolation.spec.ts`, yeni reports-timezone spec
- **Bağımlı:** 1 (WEBHOOK-01 — tenant izolasyon kanıtlanmadan testlerin anlamı yok)
- **Kabul:** Tenant B timezone'ı `Europe/London`'a çekildiğinde `GET /v1/reports/summary?from=2026-08-01&to=2026-08-01` Tenant A ile **farklı** satır sayısı döndürür (gerçek Postgres ile).
- **Effort tahmini:** S (mekanik, paylaşılan helper kullanımı).

---

### 1B. AUDIT-02 — Opus denetimi: API-key RBAC bypass

> **Kaynak:** `AUDIT-REPORT.md` §[HIGH] "OrgPermissionGuard short-circuits to `true` for `apiKeyAuth`".
> **Neden pilot-öncesi:** Aynı hata şekli WEBHOOK-01 ile aynı: "ele geçen secret → tenant-admin gücü". API key'ler n8n workflow'larına yapıştırılır, contractör ile paylaşılır, yanlışlıkla commit edilir — pratikte webhook secret'ından daha sık sızar.
> **Reconsiderasyon:** Opus raporu bunu after-pilot'a koymuştu. **Pilot-öncesine alındı**: tek tenant bugün olduğu için hasar yüzeyi dar, ama ikinci tenant eklenmeden önce API key'lerin de tenant kaynağı kanıtlanmalı (AGENTS.md invariant-1).
> **Varsayım:** En az savunulabilir davranış: `AuthOrApiKeyGuard` zaten scope (`read`/`write`) kontrol ediyor; API key yazma yetkisi varsa, resource-level kontrol **yine de** çalışsın (kısa vadeli fix). Uzun vadede per-key resource scope sözlüğüne geçiş (after-pilot).

- [ ] `apps/api/src/common/org-permission.guard.ts:29-31` `if (req.apiKeyAuth) return true` kaldır; API key auth'da da resource kontrolünü çalıştır
- [ ] Mevcut `auth-or-api-key.guard.ts:35-52` scope check'ini koru — kaldırılan şey sadece "skip resource check" satırı
- [ ] Negatif test: `apps/api/src/common/auth-or-api-key.isolation.spec.ts` içinde API key ile `patient:create` izni olmadan bir endpoint'e erişim 403 döner
- **Dosyalar:** `apps/api/src/common/org-permission.guard.ts`, test spec
- **Bağımlı:** yok
- **Kabul:** API key ile login → `GET /v1/audit-logs` (audit için owner-only olmalı) readonly key ile reddedilir; `GET /v1/me` çalışır.
- **Effort tahmini:** S.

---

### 2. SEC-01 (kalan) — OAuth secret rotasyonu + Obsidian temizliği

> **Durum:** SSH, PostgreSQL, Redis, Better Auth, credential encryption sırları döndürüldü.
> ✅ Google OAuth client secret rotate edildi.
> Kalan: Obsidian aktif/revision/yedek kopya temizliği.

- [x] Google OAuth client secret rotate edildi
- [ ] Obsidian `Untitled.md` içindeki sırları kalıcı temizle (aktif + revision + yedek)
- [ ] Repo, vault, terminal geçmişi, deploy notlarında kopya kalmadığını doğrula

---

### 3. LEG-02 — KVKK aydınlatma metni + açık rızanın hukukçu onayı

> **Durum:** Teknik kapı kapalı (LEG-01). Lead toplama flag'leri kapalı.
> Hukuk onayı gelmeden `KARNE_LEADS_ENABLED` + `PUBLIC_KARNE_LEADS_ENABLED` birlikte açılmaz.

- [ ] Hukukçu onayını al
- [ ] Onay sonrası iki flag'i birlikte aç

---

### 4. OPS-01 (kalan) — Otomatik sunucu dışı yedek/snapshot düzeni

> **Durum:** Dump/restore provası, Coolify deploy, canlı curl kabulü tamamlandı.
> Kalan: otomatik, sunucu dışı yedekleme (ör. Hetzner snapshot + pg_dump cron).

- [ ] Yedek düzenini kur (ör. günlük pg_dump → S3/R2 + Hetzner snapshot)
- [ ] Tarihli restore provası yap, kanıtla
- [ ] Runbook'u `docs/DEPLOY-COOLIFY.md`'ye ekle

---

### 5. AUDIT-03 — Opus denetimi: operasyonel hijyen paketi

> **Kaynak:** `AUDIT-REPORT.md` §[HIGH] dört madde + §[MEDIUM] iki madde. Hepsi pilot-öncesi gereken operasyonel korumalar. Bağımsız küçük işler; her biri kendi commit'i.
> **Varsayım:** Tek bir madde altında topluyorum çünkü hepsi "küçük, bağımsız, tek-commit" iş — sırayla uygulanır.

- [ ] `apps/api/src/main.ts` — `app.enableShutdownHooks()` ekle (Coolify SIGTERM drain). **S-effort.**
- [ ] `apps/api/src/db/schema/api-keys.ts` + migration — `last_used_at`, `expires_at` kolonları; `app.lookup_api_key` expired olanları filtrelesin; `ApiKeyGuard` her başarılı lookup'ta `last_used_at` güncellesin. **M-effort.**
- [ ] `apps/api/src/main.ts:120-128` Fastify `bodyLimit: MAX_UPLOAD_BYTES` → `bodyLimit: 1 MB` (multipart `fileSize: 25 MB` korunur). **S-effort.**
- [ ] `apps/api/src/main.ts` — `/v1/*` için per-IP/per-tenant token bucket (Redis-backed); `/v1/auth/*` için 10/min throttle. **M-effort.**
- [ ] `apps/api/src/main.ts` + `apps/api/src/queue/bull-board.mount.ts` — OpenAPI/Scalar ve Bull Board prod'da koşulsuz mount. `API_DOCS_TOKEN` veya NODE_ENV gate ile koruma. **S-effort.**
- [ ] `apps/api/src/queue/queue.service.ts` — prod'da `ENABLE_INTEGRATION_SCHEDULERS != 'true'` ise WARN log + readiness probe fail. **S-effort.**
- [ ] better-auth `organization.delete` override (prod'da kapalı). Spec ile kanıtla. **S-effort.**
- [ ] Pino `redact` + Sentry `beforeSend` redaction; LLM hata gövdesi (`openai-compatible-llm.client.ts:120, 176`) loglanmadan önce maskeleme. **S-effort.**
- **Dosyalar:** yukarıdaki her alt-madde kendi dosyasında
- **Bağımlı:** yok (1A ve 1B'den bağımsız)
- **Kabul:** Her alt-madde kendi commit'inde tamam; CI yeşil; docs/DEPLOY-COOLIFY.md yeni env'leri listeler.
- **Effort tahmini:** Toplam ~3 gün (her alt-madde ~S/0.5 gün).

---

### 6. PILOT-01 — ETL dry-run → apply → verify (kendi firmamız ilk tenant)

> **Bağımlı:** 1+1A+1B+2+3+4+5 (WEBHOOK-01, AUDIT-01, AUDIT-02, sırlar temiz, hukuk onayı, yedek, operasyonel hijyen).
> Runbook: `docs/ETL-KESIM.md`.

- [ ] ETL dry-run (Fixrav Tracker → Verimaya)
- [ ] Apply + verify
- [ ] Pilot boyunca **ikinci organizasyon yaratma** (demo/test org'u dahil)

---

### 7. MARKET-01 — Üç stratejik karar (17 Ağustos review öncesi)

- [ ] **(a)** Birincil segment: acente mi klinik mi? (ilk 20 görüşme tek segmente odaklansın)
- [ ] **(b)** OrbisMed çıkar çatışması: veri ayrımı, tüzel ayrım, erişim/audit, referans anlatısı
- [ ] **(c)** Kapasite: Verimaya'ya haftalık sabit gün/saat + pilot boyunca feature freeze

---

### 8. OPS-02 — Meta + Google Ads gerçek hesapla go-live kabulü

> Runbook: `docs/ADS-META-GOLIVE.md`, `docs/ADS-GOOGLE-GOLIVE.md`.

- [ ] Meta: 7 gün veri, idempotent sync, log denetimi
- [ ] Google: aynı
- [ ] Hata yüzeyleme + sync penceresi doğrulaması

---

### 9. PILOT-02 — 2–4 haftalık feature-freeze dahili pilot

> **Bağımlı:** PILOT-01.
> Ölçülecek KPI'lar: aktif kullanıcı/gün, Tracker'a dönüş oranı ve nedeni, AI taslak kabul/düzeltme/red,
> finans mutabakat farkı, randevu kaçırma, webhook/job başarısızlık, ortalama destek süresi,
> haftalık yedek + restore kanıtı.

- [ ] Pilot planını yaz, KPI'ları tanımla
- [ ] Feature freeze ilan et
- [ ] 2–4 hafta çalıştır + raporla

---

### 10. MARKET-02 — 30 günlük pazar kapısı

> **Bağımlı:** PILOT-02 verileri.
> Kabul: 20 müşteri görüşmesi, 4–5 rakip demo/fiyat teklifi, en az 3 ücretli ön-sipariş/yazılı pilot niyeti,
> bir fiyat kartı + iptal/taahhüt modeli.

- [ ] Görüşmeleri tamamla
- [ ] Fiyat kartını sabitle
- [ ] Kapı kararını ver

---

## Faz 9 — denetim sonrası (öncelik sırası yok; pilot-02 sonrası değerlendirilir)

AUDIT-REPORT.md'de Medium/Low/Info olarak işaretlenmiş ve pilot blokajı olmayan bulgular. Yukarıdaki yapılacaklar listesi **kilitli sırayı** taşır; Faz 9 sıralama-dışıdır ve biriken geliştirme kapasitesine göre işlenir.

- **AUDIT-F09-01** OpenAPI'yi generator'a taşı (reconnaissance hedefi olmaktan çıkar); `@nestjs/swagger` veya elle yazılmış YAML'ı CI'da route'lardan üret. **(M)**
- **AUDIT-F09-02** Permission resource modelini genişlet: `audit`, `members`, `api_keys`, `webhook_subscriptions`, `scorecard` resource'larını `permissions.ts`'e ekle; `controller-permissions.spec.ts`'i reflection-based yap. **(M)**
- **AUDIT-F09-03** Per-tenant webhook secret'ları outbox'a da yay (WEBHOOK-01 inbound'u kapsar; outbound `webhook_subscriptions.secretCiphertext` zaten per-subscription, değişiklik yok). **(0 — no-op)**
- **AUDIT-F09-04** `@UseGuards` reflection-based coverage test (idempotency-coverage kalıbı). **(S–M)**
- **AUDIT-F09-05** Outbox + scheduler DLQ; `attempts` artır veya `requeue-from-failed` job. **(M)**
- **AUDIT-F09-06** `tenants` FK davranışı → `restrict` + soft-delete (`tenants.deleted_at`); Türk mali mevzuatı 10y tutma + KVKK silme-yetkisi. **(L)**
- **AUDIT-F09-07** KVKK m.11 data-subject rights endpoints: `/v1/me/data-export`, `/v1/me/data-deletion-request` + `tenants.data_retention_until`. **(L)**
- **AUDIT-F09-08** Magic-byte MIME sniff (`file-type`/`mmmagic`) + multipart `allowedMimeTypes` allowlist (S3 sürücüsü dahil). **(M)**
- **AUDIT-F09-09** KVKK aydınlatma hukuk onayı + lead capture flag turn-on. **(LEG-02 ile paylaşımlı)**
- **AUDIT-F09-10** i18n katalog süpürmesi — Türkçe hardcoded metinleri `messages.ts`'e taşı. **(L)**
- **AUDIT-F09-11** `controller-permissions.spec.ts`'i reflection-based'e çevir. **(M)**
- **AUDIT-F09-12** `tenants` controller için izolasyon spec (AUDIT-01 ile birlikte gidebilir; ayrı tutuldu çünkü bu madde bütünüyle AUDIT-F09 sayımına dahil).
- **AUDIT-F09-13** CORS `allowedHeaders` — webhook header'ları (`X-Webhook-*`, `X-Tenant-Id`) browser'dan gerekirse ekle (bugün yok). **(S)**
- **AUDIT-F09-14** OAuth state TTL düşür (10 dk → 60 sn) + one-time-use. **(S–M)**
- **AUDIT-F09-15** Better-auth şema upgrade yolu `docs/DEPLOY-COOLIFY.md`'ye yaz. **(S)**
- **AUDIT-F09-16** `_tmp_*` sıfır-byte dosyaları temizle + `.gitignore`/.dockerignore ekle. **(S)**
- **AUDIT-F09-17** Contacts duplicate-detection — sayfalama/cap ekle (şu an O(N) bellek). **(M)**
- **AUDIT-F09-18** Per-method vs class-level guard standardizasyonu (`ads.controller.ts`, `ghl.controller.ts`); reflection-based `@UseGuards` coverage. **(S)**
- **AUDIT-F09-19** `tenants.timezone` IANA doğrulaması (`Intl.supportedValuesOf`). **(S)**
- **AUDIT-F09-20** `corsOrigins` allowlist hot-reload (read-at-boot artı prod restart gerektirir). **(M, düşük öncelik)**

---

## Bekleyen (öncelik sırası yok; 10. madde sonrası değerlendirilir)

- **Marka tescili:** `verimaya.com` / `.com.tr` + Türk Patent 9/35/42/44
- **IOS-01:** iOS smoke'u dondur veya resmen kapat (öneri: pilot bitene kadar dondur)
- **PRODUCT-01:** Komisyon takibi discovery (acente segmenti seçilirse)
- **CSP/HSTS başlık denetimi:** canlıda kanıtlı kontrol
- **pnpm audit / Dependabot:** CI'da düzenli güvenlik taraması
- **Hasta verisi export + silme endpoint'i + hesap kapatma runbook'u** (AUDIT-F09-07 ile örtüşür)
- **Veri işleme envanteri (tamamı):** WhatsApp→LLM dışındaki işlemler
- **AB veri lokasyonu envanteri + DPA şablonları (tenant onboarding)**

---

## Bilinçli olarak yapılmayacaklar (MARKET-02 kapısına kadar)

| Konu | Gerekçe |
|------|---------|
| iOS App Store hazırlığı | Pazar doğrulaması yokken yatırım yapılmaz |
| Tam i18n/locale ağacı (`/tr/` `/en/`) | Pre-requisite karşılandı; pazar kapısı sonrası |
| TikTok / Instagram entegrasyonları | MARKET-02 öncesi yatırım yok |
| Klinik entegrasyonları (e-Nabız, e-Fatura) | Acente segmenti seçilmezse gereksiz |
| Ürün içi karnenin genişletilmesi | Pilotla birlikte gelir |

---

## Kaynaklar

- `AUDIT-REPORT.md` — Opus denetimi (38 bulgu; Faz 8 planının kaynağı)
- `docs/2026-08-02-PROJE-DEGERLENDIRMESI.md` — kanıtlı bulgular
- `docs/2026-08-03-KONTROL-RAPORU.md` — Faz 7 denetim çıktısı
- `docs/MIMARI.md` — mimari kararlar
- `docs/TASARIM.md` — tasarım sistemi
- `docs/DEPLOY-COOLIFY.md`, `docs/ETL-KESIM.md`
- `SecondBrain-Remote/03-Areas/VeriMaya/` — 01-kararlar, 02-yol-haritasi, 04-ilerleme-log, 05-guvenlik-kvkk
- `AGENTS.md` — AI geliştirme rehberi (always-apply)