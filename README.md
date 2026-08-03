# Verimaya

Türkiye'deki sağlık turizmi acenteleri ve klinikleri için çok kiracılı (multi-tenant) B2B SaaS operasyon platformu: lead/hasta takibi, randevu, finans, raporlama, WhatsApp inbox ve GoHighLevel / reklam API'leri / n8n entegrasyonları.

## Durum

Kod kapsamı pilot seviyesine yakın; güvenlik, veri doğruluğu ve canlı kabul kapıları kapatılıyor. Dahili pilot henüz resmi olarak başlamadı.

**Aktif yapılacaklar listesi (tek kaynak):** [`docs/2026-08-03-YAPILACAKLAR.md`](./docs/2026-08-03-YAPILACAKLAR.md) — fazlı, kabul kriterli.
Gerçek durum ve açık riskler: [`docs/2026-08-02-PROJE-DEGERLENDIRMESI.md`](./docs/2026-08-02-PROJE-DEGERLENDIRMESI.md).
**CURSOR-PLAN** (Adım 1–44) kod olarak kapandı ve arşive alındı: [`docs/CURSOR-PLAN.md`](./docs/CURSOR-PLAN.md).

Mimari: [`docs/MIMARI.md`](./docs/MIMARI.md) — tasarım: [`docs/TASARIM.md`](./docs/TASARIM.md) — Coolify: [`docs/DEPLOY-COOLIFY.md`](./docs/DEPLOY-COOLIFY.md).

## Stack

| Katman | Teknoloji |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Backend | NestJS (Fastify adapter) + Drizzle ORM |
| Veritabanı | PostgreSQL 16 (RLS ile multi-tenant) |
| Kuyruk / cache | BullMQ + Redis |
| Auth | better-auth (organization eklentisi) *(Faz 0b)* |
| Frontend | SvelteKit (Svelte 5, SPA) + TanStack Query + Tailwind v4 + shadcn-svelte |
| Gözlem | Sentry + pino |
| Hosting | Hetzner (Almanya) + Coolify, önde Cloudflare |

## Yapı

```
verimaya/
├── apps/
│   ├── api/          # NestJS + Drizzle
│   └── web/          # SvelteKit SPA + MSW mock
├── packages/
│   └── shared/       # zod şemaları, API sözleşmesi
├── docs/
├── docker-compose.yml
└── .cursor/rules/
```

## Geliştirme

```bash
pnpm install
docker compose up -d          # Postgres 16 (:5433) + Redis (:6379)
pnpm --filter @verimaya/api db:migrate
pnpm dev                      # web http://localhost:5173 (MSW demo, PUBLIC_USE_MSW=true)
pnpm --filter @verimaya/api dev   # api http://localhost:3000
```

Gerçek API ile web: `apps/web/.env` içinde `PUBLIC_USE_MSW=false` — adım adım kontrol listesi [`apps/web/README.md`](./apps/web/README.md#msw-kapalı-mod--kontrol-listesi).

Diğer komutlar: `pnpm check`, `pnpm build`, `pnpm lint`.

API sözleşmesi (OpenAPI 3.1): kaynak [`apps/api/openapi.yaml`](./apps/api/openapi.yaml) — runtime `GET /v1/openapi.yaml` ve Scalar UI `GET /v1/docs`.
