# Verimaya — AI Geliştirme Rehberi

## Proje nedir?

Türkiye'deki sağlık turizmi firmaları (saç ekimi, diş, estetik klinikleri/acenteleri) için multi-tenant B2B SaaS operasyon platformu. Modüller: hasta/lead takibi, randevu, finans (WhatsApp AI işlem aktarımı dahil), raporlama, GHL + Meta/Google Ads + n8n entegrasyonları. Solo geliştirici + Cursor AI ile ilerler.

Bu proje, `~/Projects/fixrav-web/_projects/fixrav-tracker` (FastAPI + React, dahili kullanımda) ürününün sıfırdan, yeni stack ile yeniden inşasıdır. Eski sistemin şeması ve iş kuralları `docs/legacy-reference/` altında referanstır — kod taşınmaz, bilgi taşınır.

## Stack ve yapı

- pnpm workspaces + Turborepo: `apps/api` (NestJS + Fastify + Drizzle), `apps/web` (SvelteKit + Svelte 5 + TanStack Query (svelte) + Tailwind + shadcn-svelte), `packages/shared` (zod şemaları + API sözleşmesi).
- PostgreSQL 16 + RLS, BullMQ + Redis, better-auth (organization), Sentry + pino.
- Deploy: Hetzner + Coolify, önde Cloudflare. Web, `adapter-static` ile SPA modunda çalışır; SSR kullanılmaz, tüm iş mantığı API'dedir. SvelteKit'in sunucu özellikleri (`+page.server.ts`, form actions, API routes) kullanılmaz.
- Svelte kodu daima **Svelte 5 runes** sözdizimiyle yazılır (`$state`, `$derived`, `$effect`, `$props`); Svelte 4 sözdizimi (`export let`, `$:` reaktif ifadeler, store auto-subscribe ile yeni state) yasaktır.

## Değişmez mimari ilkeler

1. **Multi-tenant:** her iş tablosunda `tenant_id NOT NULL`; RLS her tenant tablosunda aktif; request başında `SET LOCAL app.current_tenant_id`. Aktif tenant JWT/session'dan çözülür, istemciden gelen tenant_id'ye güvenilmez.
2. **Queue-first webhook:** endpoint yalnız imza doğrular, ham payload'ı `integration_events`e yazar, 202 döner; işleme BullMQ worker'da. İş mantığı asla webhook endpoint'inde olmaz.
3. **Idempotency:** `UNIQUE (provider, external_event_id)` (yoksa `payload_hash`); tüm public mutasyon endpoint'leri `Idempotency-Key` header'ını destekler.
4. **Kayıt kaynağı PostgreSQL'dir:** Redis/BullMQ geçicidir; `jobs`, `integration_events`, `outbox_events` tabloları denetlenebilir kaynaktır. Giden webhook'lar outbox üzerinden gider.
5. **Adaptör katmanı:** dış servisler (GHL, Meta, Google, WhatsApp) `apps/api/src/integrations/<provider>/` altında; domain kodu provider'ı bilmez, httpx/fetch'i doğrudan çağırmaz.
6. **AI çıkarımı taslaktır:** WhatsApp mesajından çıkarılan veri insan onayı olmadan kesin kayda yazılmaz.
7. **Sözleşme `packages/shared`'dadır:** API request/response şemaları zod ile burada tanımlanır; api ve web bunlardan türetir. Şema değişikliği önce shared'da yapılır.
8. **Cache anahtarında daima `tenant_id`** bulunur.

## Kod konvansiyonları

- TypeScript strict; `any` yasak (zorunluysa gerekçe yorumuyla).
- Tarihler ISO-8601 UTC; para birimleri minor unit (kuruş/cent) integer.
- API: `/v1` prefix, cursor sayfalama (`?cursor=&limit=`), standart hata gövdesi (`error.code`, `error.message`, `request_id`).
- Dokümantasyon ve commit mesajları Türkçe; kod, tanımlayıcılar ve log mesajları İngilizce.
- UI tek dil **Türkçe** (i18n altyapısı yok). Tema: **açık (varsayılan) + koyu**, üst bardan değiştirilir. Renk: **TickPort warm neutrals** (terracotta `#D97757`); layout CF dashboard deseni — `docs/TASARIM.md`. Changelog/özellik sayfası kuralları: `docs/CHANGELOG-KURALLARI.md`.
- Test: her tenant'lı endpoint için negatif izolasyon testi ("Tenant A, Tenant B verisini göremez") zorunludur.

## Süreç

- Yol haritası `docs/YOL-HARITASI.md`; fazların dışına çıkan işlere başlamadan kullanıcıya sor.
- Önemli mimari kararlar `docs/MIMARI.md`'ye işlenir; proje takibi Obsidian'dadır (`SecondBrain-Remote/03-Areas/Verimaya`), oturum sonunda kullanıcıya log'a düşülecek 1-2 satır özet ver.
- Faz 0a'da backend yazılmaz: frontend MSW mock ile, `packages/shared` sözleşmesi üzerinden geliştirilir.
