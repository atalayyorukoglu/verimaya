# Verimaya

Türkiye'deki sağlık turizmi acenteleri ve klinikleri için çok kiracılı (multi-tenant) B2B SaaS operasyon platformu: lead/hasta takibi, randevu, finans, raporlama, WhatsApp inbox ve GoHighLevel / reklam API'leri / n8n entegrasyonları.

## Durum

**Faz 0b** tamamlandı (Docker + NestJS + better-auth + RLS + CI). **Faz 1** — çekirdek domain. Yol haritası: [`docs/YOL-HARITASI.md`](./docs/YOL-HARITASI.md) — mimari: [`docs/MIMARI.md`](./docs/MIMARI.md) — tasarım: [`docs/TASARIM.md`](./docs/TASARIM.md) — Coolify: [`docs/DEPLOY-COOLIFY.md`](./docs/DEPLOY-COOLIFY.md).

Proje takibi Obsidian'da: `SecondBrain-Remote/03-Areas/Verimaya`.

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
