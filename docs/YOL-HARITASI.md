# Verimaya — Yol Haritası

Toplam hedef: **10-14 hafta** (AI destekli solo tempo). Fazlar sıralı; Faz 0-2 bitmeden domain özelliklerine derinlemesine girilmez. Günlük takip Obsidian'da; bu dosya repo içi referanstır ve faz bitişlerinde işaretlenir.

## Faz 0a — Sözleşme + demo frontend (2-3 hafta, zaman kutulu) ✅

- [x] Monorepo iskeleti: pnpm workspaces + Turborepo
- [x] `packages/shared`: zod şemaları (Patient, Appointment, Transaction, InboundMessage, Tenant, User) + endpoint sözleşmesi
- [x] `apps/web`: SvelteKit (Svelte 5, adapter-static SPA) + TanStack Query + Tailwind + shadcn-svelte
- [x] MSW mock API (gerçek `/v1` path'leri, faker ile şemadan demo veri; boş liste / uzun isim / 500 kayıt uç durumları dahil)
- [x] Tasarım sistemi temeli: TickPort warm palette + açık/koyu (`docs/TASARIM.md`), Inter, Tailwind v4 token'ları
- [x] AppShell: CF-dashboard deseni — sol gruplu menü, üst bar (⌘K arama, yenilikler zili)
- [x] Çekirdek ekranlar: hasta listesi/detay (finans özeti + bağlı işlem/randevu), randevu takvimi, finans, AI ile WhatsApp işlem aktarımı, dashboard ("kaldığın yerden devam" deseni)
- [x] `/ozellikler` sayfası (`packages/shared/src/features.ts`'ten render) + `/yenilikler` iskeleti (`changelog.ts`)
- [x] Rol değiştirici ile RBAC görünürlük provası
- [x] Desktop + mobil responsive (gerçek cihazda `--host` testi)
- [x] Demo: kişi/hasta çift kayıt tarama + birleştirme (`/kisiler/cift-kayit`, `/hastalar/cift-kayit`)

## Faz 0b — Gerçek temel (1 hafta) ✅

- [x] Docker Compose: PostgreSQL 16 + Redis
- [x] `apps/api`: NestJS (Fastify) + Drizzle + ilk migrasyonlar
- [x] better-auth: e-posta/şifre + organization + üyelik + roller; admin TOTP 2FA
- [x] RLS + `SET LOCAL app.current_tenant_id` + CI negatif tenant testleri
- [x] CI (lint/typecheck/test) + Coolify hazırlığı (Dockerfile, `docs/DEPLOY-COOLIFY.md`; canlı Coolify deploy henüz yok)

## Faz 1 — Çekirdek domain (2-3 hafta) 🚧

- [x] Patients, appointments, transactions CRUD (NestJS + Drizzle + RLS); contacts + contact_types
- [x] `audit_logs` tablosu + `GET /v1/audit-logs` (cursor sayfalama; yazma şimdilik merge'de)
- [x] Cursor sayfalama + tenant indeksleri; `pg_trgm` GIN indeksleri (patients, contacts)
- [x] `?q=` arama API'si (patients + contacts list; `ILIKE` + trgm indeksleri)
- [~] Hasta detayı: finans aggregate `GET /v1/patients/:id/finance-summary` ✓; dosya local disk stub var, S3/R2 sonra
- [~] **Hasta dosyaları (local upload stub):** `POST` multipart → `UPLOAD_DIR` (varsayılan `.data/uploads`) + `storage_key=local://…`; JSON metadata POST hâlâ `local://pending`; `GET …/files/:fileId/download` yerel dosyayı stream eder; S3/imzalı URL sonra
- [x] **Çift kayıt (gerçek):** `find_duplicate_*` + merge transaction (FK taşıma, audit) — NestJS API + izolasyon testi
- [x] Soft-delete (patients `deleted_at`) + `Idempotency-Key` (mutasyon endpoint'leri)
- [x] Finans kategori + contact type ayarları (`GET/POST/PATCH/DELETE /v1/settings/*`; boş tenant'ta seed)
- [x] **Randevu tipleri (static-by-design):** `GET /v1/settings/appointment-types` — DB tablosu yok; `DEFAULT_APPOINTMENT_TYPE_NAMES` + deterministik id; CRUD bilinçli olarak yok (appointment.appointment_type serbest metin)
- [x] `GET/PATCH /v1/tenants/current` + `GET /v1/members` (organizasyon / ekip ekranları)
- [x] MSW: `PUBLIC_USE_MSW=false` + `resolveApiUrl` ile çekirdek ekranlar gerçek API'ye bağlı; varsayılan artık gerçek API (`PUBLIC_USE_MSW=false`), demo için elle `true` set edilir
- [x] Legacy notlar: `docs/legacy-reference/case-expenses.md`, `dosyalar.md`, `ayarlar.md` — "Durum (Verimaya)" notu eklendi

## Faz 2 — Entegrasyon platformu (1-2 hafta) 🚧

- [x] BullMQ `default` kuyruk + noop worker
- [x] `integration_events`, `outbox_events`, `jobs` tabloları (RLS + grant)
- [x] Queue-first webhook stub (`POST /v1/webhooks/:provider` → 202, idempotency)
- [x] Bull Board (`/v1/admin/queues`; dev veya `ADMIN_QUEUE_TOKEN`)
- [x] Tenant credential tablosu (`tenant_credentials`, ciphertext); AES-GCM sarma (`CryptoService`, `CREDENTIALS_ENCRYPTION_KEY`)
- [x] Backoff + dead-letter (5 deneme, exponential backoff; tükenince `jobs` + `integration_events` → `failed`)
- [x] Sentry + pino + request_id (`SENTRY_DSN` doluysa `@sentry/node` hata yakalar; boşsa no-op; Fastify/pino + `request_id` yanıt gövdesi)

## Faz 3 — WhatsApp finans aktarımı (2 hafta) 🚧

- [x] WAHA webhook → `inbound_messages` kuyruğu (`POST /v1/webhooks/waha`; `inbound_messages` tablosu + RLS; BullMQ `inbound_message.process` noop stub)
- [x] `POST /v1/whatsapp/parse` — `integrations/llm` (`HeuristicLlmClient` veya `LLM_API_KEY` ile OpenAI-uyumlu istemci); çıktı taslak; approve işlem oluşturmaz
- [x] Inbox API: list/get + `process` / `:id/parse` / `approve` / `ignore` (LLM/heuristic; approve yalnızca status — işlem için `POST /v1/transactions`)
- [x] Manuel yapıştır + kuyruk tek ekranda (`/finans/aktar` gerçek API'ye bağlı)
- [x] AI correction kaydı (öğrenme için) — `ai_corrections` tablosu (RLS) + `POST`/`GET /v1/whatsapp/corrections`; `/finans/aktar` düzeltilmiş taslakları kaydeder, `/ayarlar/ai-ogrenme` gerçek veriden hesaplar

## Faz 4 — GHL senkronu (1-2 hafta) 🚧

- [~] Adaptör stub (HTTP yok) + `tenant_credentials` + worker (`provider=ghl`); `ghl.mapper` contact/opportunity + alan çıkarır; `GhlSyncService.processInboundEvent` fixture payload'dan `jobs` sync log (`ghl.inbound.sync`) yazar ve temiz contact'ta tenant-scoped patient upsert eder (`source=ghl`, notes marker `ghl_contact_id=…`); OAuth/HTTP adaptörü ve alan bazlı sahiplik henüz yok
- [~] Webhook-first + periyodik reconciliation iskeleti — `ghl.reconcile` job + `enqueueGhlReconcile`; `ENABLE_INTEGRATION_SCHEDULERS=true` iken tenant başına 6h BullMQ repeatable scheduler; OAuth yokken reconcile yalnızca ledger noop satırı yazar; gerçek API reconciliation / backfill yok

## Faz 5 — Reklam API'leri (1 hafta) 🚧

- [x] `ad_metrics_daily` tablosu (RLS + grant)
- [x] `GET /v1/ad-metrics?from=&to=&provider=` (SessionGuard; boş liste OK)
- [ ] Meta + Google Ads OAuth (tenant bazlı)
- [~] 6 saatlik incremental sync → `ad_metrics_daily` — `ad_metrics.sync` worker: OAuth cred yoksa 1–3 deterministik fixture satırı idempotent upsert; cred varsa OAuth pull bekleniyor (skip); `ENABLE_INTEGRATION_SCHEDULERS=true` ile tenant başına 6h scheduler; gerçek Meta/Google adaptörü yok

## Faz 6 — Dış API + n8n (1 hafta) 🚧

- [x] `api_keys` tablosu + CRUD (create/list/revoke; hash listede yok)
- [x] `ApiKeyGuard` + `AuthOrApiKeyGuard` (`Bearer vk_...` OR session); `patients`, `contacts`, `appointments`, `transactions`, `reports`, `whatsapp` dual-auth kabul ediyor; scope kontrolü (`read`/`write`, metoda göre); `api-keys` CRUD ve `settings` (credentials + webhook-subscriptions) session-only kaldı
- [x] Ayarlar > Bağlantılar > API: anahtar liste/oluştur/iptal ekranı gerçek CRUD'a bağlı
- [x] `Idempotency-Key` (mutasyon endpoint'lerinde; Faz 1'den)
- [x] OpenAPI spec — [`apps/api/openapi.yaml`](./apps/api/openapi.yaml) + runtime `GET /v1/openapi.yaml` ve Scalar UI `GET /v1/docs` (auth yok, salt okunur)
- [x] `webhook_subscriptions` tablosu (RLS) + CRUD (`GET/POST/DELETE /v1/webhook-subscriptions`, session-only) + `enqueueOutbound` → `outbox_events`; BullMQ `outbox.deliver` worker gerçek `fetch` ile `X-Verimaya-Signature: sha256=<hmac>` gönderiyor, hata durumunda `outbox_events.status=failed` + retry (BullMQ backoff); domain hook'lar `transaction.created`, `transaction.updated`, `patient.created`, `appointment.created` olaylarına bağlandı (idempotency replay'lerinde tekrar tetiklenmiyor); Ayarlar > Bağlantılar > API'de gerçek CRUD ekranı (liste/oluştur/sil, olay türü seçimi) MSW demo'da da çalışıyor

## Faz 7 — Rapor, dashboard, PWA, vitrin (1-2 hafta)

- [x] Dönemsel özetler (sunucu aggregate): `GET /v1/reports/summary`, `GET /v1/reports/by-category`, `GET /v1/reports/by-category-detail` (kategori → subtitle kırılımı); web raporlar sayfası MSW kapalıyken bu endpoint'lere bağlı
- [x] Grafikler: aylık bar sunucu aggregate'e bağlı (`GET /v1/reports/monthly`); kategori alt-kırılım (subtitle) drill-down artık `by-category-detail`'e bağlı (MSW açıkken istemci hesaplamasına düşer); dashboard ana sayfa "Net (bu ay)" kartı `GET /v1/reports/summary`'den (MSW kapalıyken) — ayrıca cache katmanı yok, gerekmiyor (hafif sorgu)
- [x] PWA: manifest (`apps/web/static/manifest.webmanifest` + ikonlar) + service worker (`apps/web/static/sw.js`; shell cache-first, `/v1` network-first, navigasyon offline → `static/offline.html`; MSW açıkken kayıt edilmez); AppShell’de hafif `beforeinstallprompt` kurulum bandı (Türkçe, kapatılabilir, yalnız `!USE_MSW`)
- [x] Legacy notlar: `docs/legacy-reference/raporlar.md` — "Durum (Verimaya)" notu eklendi
- [x] Vitrin sayfası (`/vitrin`): TickPort warm neutrals + terracotta hero (marka hero-level, tek başlık, tek cümle, CTA → `/giris`, AppShell dışı, hafif motion); tam CF-marketing vitrin (güven bandı / özellik blokları) sonra

## Faz 8 — Veri göçü ve geçiş (1 hafta)

- [~] ETL dry-run: `apps/api/fixtures/etl-sample.json` + `pnpm --filter @verimaya/api etl:dry-run` (Tracker → Verimaya şekil eşlemesi; `--apply` kapalı/reddeder); plan `apps/api/scripts/etl-stub.md`
- [ ] Fixrav Tracker → Verimaya ETL apply (DB yazma); kendi firmamız ilk tenant; eski sistem salt-okunur
- [ ] 2-4 hafta dahili pilot → dış satış
