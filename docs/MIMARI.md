# Verimaya — Mimari

Bu doküman hedef mimariyi ve gerekçeleri tutar. Karar geçmişi Obsidian'da (`03-Areas/Verimaya/01-kararlar.md`).

## Hedef mimari

```text
SvelteKit SPA (+ PWA)             [ileride mobil: önce PWA, gerekirse Capacitor]
        |
        | HTTPS + JWT (Cloudflare önde)
        v
NestJS API (Fastify)
        |
        +--> PostgreSQL 16 (domain data, RLS, audit, outbox, integration_events, jobs)
        |
        +--> Redis (BullMQ broker, rate-limit, lock, kısa süreli cache)
        |
        +--> BullMQ Worker'ları
               - GHL sync            - rapor üretimi
               - Meta/Google import  - outbound webhook teslimi
               - WhatsApp işleme     - AI extraction (taslak üretimi)
```

## Stack gerekçeleri (özet)

- **Uçtan uca TypeScript:** solo + AI geliştirmede tek dil, `packages/shared` üzerinden paylaşılan tip zinciri (API → web → mobil). Tip güvenliği solo geliştiricinin QA'idir.
- **NestJS:** katı konvansiyonlar AI ile üretimde tutarlılık sağlar; modül yapısı entegrasyon adaptör katmanına oturur.
- **Drizzle:** SQL'e yakın; RLS/`SET LOCAL` gibi ham kontrol gerekiyor.
- **SvelteKit SPA (2026-07-17'de React yerine seçildi):** geliştirici tercihi + tickport'taki SvelteKit deneyimi. `adapter-static` ile saf SPA olarak kullanılır; SSR/form actions/sunucu route'ları kapalıdır, tüm iş mantığı API'de kalır. **UI renkleri (2026-07-20):** TickPort warm neutrals paleti — `docs/TASARIM.md`. Bilinen ödünler: React Native bilgi paylaşımı yok (mobil planı zaten PWA-first; gerekirse Capacitor) ve AI kod üretiminde React'e göre daha ince ekosistem (Svelte 5 runes kuralı `.cursor/rules/frontend.mdc` ile sabitlendi).
- **BullMQ + Redis:** rate-limit'li dış API çağrıları, retry/backoff, hazır dashboard (Bull Board).
- **Hetzner + Coolify + Cloudflare:** AB veri lokasyonu (KVKK/GDPR), düşük maliyet, düşük DevOps yükü.

## Değişmez ilkeler

Detaylı hali `AGENTS.md` ve `.cursor/rules/` içinde; özet:

1. Ortak şema multi-tenancy: `tenant_id NOT NULL` + PostgreSQL RLS + CI'da negatif izolasyon testleri.
2. Queue-first webhook + idempotency (`UNIQUE (provider, external_event_id)`).
3. Denetlenebilir kayıt kaynağı PostgreSQL: `jobs`, `integration_events`, `outbox_events`.
4. Provider adaptör katmanı; domain kodu dış servisi bilmez.
5. GHL senkronunda alan bazlı sahiplik; reklam metrikleri `ad_metrics_daily`den okunur.
6. AI çıkarımı taslak/onay akışıyla; otomatik kesin kayıt yok.
7. Cache anahtarlarında `tenant_id`.

## Güvenlik çerçevesi

- Cloudflare (WAF/DDoS/TLS) → Hetzner firewall (yalnız 80/443) → Coolify/Docker network (Postgres/Redis dışa kapalı).
- better-auth: e-posta/şifre + admin'e TOTP 2FA; JWT access/refresh, refresh rotation.
- Tenant credential'ları AES-GCM şifreli, anahtar yalnız deploy secret'ında.
- Günlük otomatik Postgres yedeği + sunucu dışı kopya + aylık restore provası.
- KVKK: veri işleme envanteri, export/silme endpoint'i, LLM'e giden veride PII minimizasyonu.

## Eski sistemle ilişki

Fixrav Tracker (FastAPI + React, `~/Projects/fixrav-web/_projects/fixrav-tracker`) dahili kullanımda çalışmaya devam eder. Şeması ve rota listesi `docs/legacy-reference/` altına çıkarılır; Verimaya şeması bunun düzeltilmiş portudur. Faz 8'de ETL ile veri göçü yapılır, kendi firmamız ilk tenant olur.

## GHL entegrasyon durumu (2026-07-22)

`apps/api/src/integrations/ghl/` fixture-backed stub: `ghl.mapper.ts` contact/opportunity + minimal alanlar (ad/telefon/e-posta/external id) çıkarır. `GhlSyncService.processInboundEvent` tenant context içinde (1) `jobs` tablosuna `ghl.inbound.sync` ledger satırı yazar, (2) temiz contact'ta `patients` upsert eder (`source='ghl'`, notes marker `ghl_contact_id=<id>` — ayrı mapping tablosu/migration yok). `GhlClientStub` HTTP çağırmaz. `ghl.reconcile` OAuth yokken ledger noop satırı yazar. Periyodik 6h scheduler: `ENABLE_INTEGRATION_SCHEDULERS=true` (varsayılan kapalı). Alan bazlı sahiplik (madde 5) gerçek adaptörle gelecek.

## Reklam metrikleri / Ads adaptör katmanı (RM-4, 2026-07-22)

`AdsProviderAdapter` arayüzü (`apps/api/src/integrations/ads/`): `buildAuthorizeUrl`, `exchangeCode`, `pullDailyMetrics` → `NormalizedAdMetricRow` (tenant’siz). Provider uygulamaları: `integrations/meta/meta-ads.adapter.ts`, `integrations/google/google-ads.adapter.ts`. `AdsAdapterRegistry` provider → adapter çözümler; domain / sync kodu Meta veya Google bilmez.

OAuth: `AdsOAuthStateService` state’i `CryptoService` ile şifreler (tenantId+provider+exp); callback’te çözülür. Credential secret’ı `tenant_credentials` tablosunda AES-GCM ciphertext. UI: `GET/DELETE /v1/integrations/ads/*` + `/ayarlar/baglantilar/reklamlar`.

`AdMetricsSyncService` (`ad_metrics.sync`): creds yoksa deterministik fixture upsert; creds varsa ilgili adapter `pullDailyMetrics` → idempotent `ad_metrics_daily` upsert (unique: tenant+provider+date+campaign). Periyodik 6h: `ENABLE_INTEGRATION_SCHEDULERS=true` (varsayılan kapalı). Canlı go-live için uygulama kimlikleri `.env` + harici OAuth konsolları gerekir (`docs/ROASMATE-GECIS.md` RM-4 go-live).

## Pazarlama hesap katmanı ve ROAS tanımı

`packages/shared/src/marketing`: saf, Vitest'li birim-ekonomi fonksiyonları — `truth-calculator`, `ad-simulator`, `compliance`, `templates`, `trust-score`. Para alanları minor unit (kuruş integer); oranlar `number` (Infinity taşıyabilir); Infinity/uygulanamaz para çıktısı `null`. Geçiş planı: `docs/ROASMATE-GECIS.md`.

İki-katman ROAS (UI'da ayrı etiketlenir; karışıklık önlenir):

- **Platform ROAS** = raporlanan dönüşüm değeri ÷ spend (Meta/Google veya manuel girdi).
- **Gerçek ROAS (Verimaya)** = dönem tahsilatı ÷ Ads spend (`transactions` + `ad_metrics_daily`) — RM-3'te canlanır.

Attribution V1: `patient.source`. Kampanya kırılımı V2.

Kritik formüller UI'da yeniden yazılmaz; shared'dan import.
