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
- [x] CI (lint/typecheck/test) + Coolify ilk deploy

## Faz 1 — Çekirdek domain (2-3 hafta) 🚧

- [x] Patients, appointments, transactions CRUD (NestJS + Drizzle + RLS); contacts + contact_types
- [x] `audit_logs` tablosu + `GET /v1/audit-logs` (cursor sayfalama; yazma şimdilik merge'de)
- [x] Cursor sayfalama + tenant indeksleri; `pg_trgm` GIN indeksleri (patients, contacts)
- [x] `?q=` arama API'si (patients + contacts list; `ILIKE` + trgm indeksleri)
- [ ] Hasta detayı: finans aggregate sunucu tarafı; dosya yükleme (`files` tablosu var, object storage + upload API yok)
- [x] **Çift kayıt (gerçek):** `find_duplicate_*` + merge transaction (FK taşıma, audit) — NestJS API + izolasyon testi
- [x] Soft-delete (patients `deleted_at`) + `Idempotency-Key` (mutasyon endpoint'leri)
- [x] Finans kategori + contact type + randevu tip ayarları (`GET /v1/settings/*`; boş tenant'ta seed, randevu tipleri statik)
- [ ] MSW tam kapatma: `PUBLIC_USE_MSW=false` + `resolveApiUrl` altyapısı hazır; çoğu ekran hâlâ MSW'ye bağlı (tenants, settings, merge, inbox, dosyalar…)
- [ ] Legacy notlar: `docs/legacy-reference/case-expenses.md`, `dosyalar.md`, `ayarlar.md`

## Faz 2 — Entegrasyon platformu (1-2 hafta) 🚧

- [x] BullMQ `default` kuyruk + noop worker
- [x] `integration_events`, `outbox_events`, `jobs` tabloları (RLS + grant)
- [x] Queue-first webhook stub (`POST /v1/webhooks/:provider` → 202, idempotency)
- [ ] Bull Board
- [ ] Şifreli tenant credential tablosu
- [ ] Backoff + dead-letter (tam iş akışı)
- [~] Sentry + pino + request_id (kısmen: Fastify/pino + `request_id` yanıt gövdesi ✓; Sentry sonra)

## Faz 3 — WhatsApp finans aktarımı (2 hafta) 🚧

- [ ] WAHA webhook → `inbound_messages` kuyruğu (`inbound_messages` tablosu henüz yok)
- [x] `POST /v1/whatsapp/parse` — sezgisel stub (SessionGuard + ActiveOrgGuard); **gerçek LLM henüz yok**
- [ ] Inbox API (`GET /v1/whatsapp/inbox`, process/approve/ignore) — MSW demo
- [ ] Manuel yapıştır + kuyruk tek ekranda (`/finans/aktar` — yapıştır gerçek API'ye bağlı; kuyruk MSW'de)
- [ ] AI correction kaydı (öğrenme için)

## Faz 4 — GHL senkronu (1-2 hafta)

- [ ] Webhook-first + periyodik reconciliation; alan bazlı sahiplik; backfill import

## Faz 5 — Reklam API'leri (1 hafta) 🚧

- [x] `ad_metrics_daily` tablosu (RLS + grant)
- [x] `GET /v1/ad-metrics?from=&to=&provider=` (SessionGuard; boş liste OK)
- [ ] Meta + Google Ads OAuth (tenant bazlı)
- [ ] 6 saatlik incremental sync → `ad_metrics_daily` (worker stub noop)

## Faz 6 — Dış API + n8n (1 hafta) 🚧

- [x] `api_keys` tablosu + CRUD (create/list/revoke; hash listede yok)
- [x] `ApiKeyGuard` stub (`Bearer vk_...`; global'e bağlı değil)
- [x] `Idempotency-Key` (mutasyon endpoint'lerinde; Faz 1'den)
- [ ] OpenAPI spec
- [ ] `webhook_subscriptions` + HMAC imzalı giden event'ler

## Faz 7 — Rapor, dashboard, PWA, vitrin (1-2 hafta)

- [x] Dönemsel özetler (sunucu aggregate): `GET /v1/reports/summary`, `GET /v1/reports/by-category`; web raporlar sayfası MSW kapalıyken bu endpoint'lere bağlı
- [ ] Grafikler (aylık bar), kategori alt-kırılım drill-down sunucuda; dashboard cache
- [x] PWA manifest (`apps/web/static/manifest.webmanifest`); service worker sonra
- [ ] Legacy notlar: `docs/legacy-reference/raporlar.md` (referans; güncelleme gerekmez)
- [ ] Vitrin sayfası (CF-marketing tarzı: gradient hero, özellik blokları, entegrasyon logoları, demo CTA)

## Faz 8 — Veri göçü ve geçiş (1 hafta)

- [ ] Fixrav Tracker → Verimaya ETL; kendi firmamız ilk tenant; eski sistem salt-okunur
- [ ] 2-4 hafta dahili pilot → dış satış
