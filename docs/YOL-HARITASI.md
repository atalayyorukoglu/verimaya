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

## Faz 0b — Gerçek temel (1 hafta) 🔜

- [ ] Docker Compose: PostgreSQL 16 + Redis
- [ ] `apps/api`: NestJS (Fastify) + Drizzle + ilk migrasyonlar
- [ ] better-auth: e-posta/şifre + organization + üyelik + roller; admin TOTP 2FA
- [ ] RLS + `SET LOCAL app.current_tenant_id` + CI negatif tenant testleri
- [ ] CI (lint/typecheck/test) + Coolify ilk deploy

## Faz 1 — Çekirdek domain (2-3 hafta)

- [ ] Patients, appointments, transactions, audit log (legacy şemadan düzeltilmiş port)
- [ ] Unique/indeks standartları + cursor sayfalama + arama (`pg_trgm`)
- [ ] Hasta detayı: finans aggregate sunucu tarafı; dosya yükleme (`files` + object storage); Contact modeli
- [ ] **Çift kayıt (gerçek):** `find_duplicate_*` + merge transaction (FK taşıma, audit); soft-delete / tombstone; tenant RLS
- [ ] Finans kategori sözlüğü + randevu tip/durum ayarları
- [ ] MSW kapatılır, web gerçek API'ye bağlanır
- [ ] Legacy notlar: `docs/legacy-reference/case-expenses.md`, `dosyalar.md`, `ayarlar.md`

## Faz 2 — Entegrasyon platformu (1-2 hafta)

- [ ] BullMQ worker'ları + Bull Board
- [ ] `integration_events`, `outbox_events`, `jobs` tabloları
- [ ] Şifreli tenant credential tablosu
- [ ] Queue-first webhook + backoff + dead-letter; Sentry + pino + request_id

## Faz 3 — WhatsApp finans aktarımı (2 hafta)

- [ ] WAHA webhook → `inbound_messages` kuyruğu
- [ ] `POST /v1/whatsapp/parse` — gerçek LLM ayrıştırma (taslak/onay akışı)
- [ ] Manuel yapıştır + kuyruk tek ekranda (`/finans/aktar`)
- [ ] AI correction kaydı (öğrenme için)

## Faz 4 — GHL senkronu (1-2 hafta)

- [ ] Webhook-first + periyodik reconciliation; alan bazlı sahiplik; backfill import

## Faz 5 — Reklam API'leri (1 hafta)

- [ ] Meta + Google Ads OAuth (tenant bazlı); 6 saatlik incremental sync → `ad_metrics_daily`

## Faz 6 — Dış API + n8n (1 hafta)

- [ ] `/v1` REST + scope'lu API key + `Idempotency-Key` + OpenAPI
- [ ] `webhook_subscriptions` + HMAC imzalı giden event'ler

## Faz 7 — Rapor, dashboard, PWA, vitrin (1-2 hafta)

- [ ] Grafikler, dönemsel özetler (sunucu aggregate), kategori drill-down; dashboard cache; PWA manifest
- [ ] Legacy notlar: `docs/legacy-reference/raporlar.md`
- [ ] Vitrin sayfası (CF-marketing tarzı: gradient hero, özellik blokları, entegrasyon logoları, demo CTA)

## Faz 8 — Veri göçü ve geçiş (1 hafta)

- [ ] Fixrav Tracker → Verimaya ETL; kendi firmamız ilk tenant; eski sistem salt-okunur
- [ ] 2-4 hafta dahili pilot → dış satış
