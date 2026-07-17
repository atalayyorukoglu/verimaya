# Verimaya

Türkiye'deki sağlık turizmi acenteleri ve klinikleri için çok kiracılı (multi-tenant) B2B SaaS operasyon platformu: lead/hasta takibi, randevu, finans, raporlama, WhatsApp inbox ve GoHighLevel / reklam API'leri / n8n entegrasyonları.

## Durum

**Faz 0a** — sözleşme + demo frontend. Yol haritası: [`docs/YOL-HARITASI.md`](./docs/YOL-HARITASI.md) — mimari: [`docs/MIMARI.md`](./docs/MIMARI.md) — tasarım: [`docs/TASARIM.md`](./docs/TASARIM.md).

Proje takibi Obsidian'da: `SecondBrain-Remote/03-Areas/Verimaya`.

## Stack

| Katman | Teknoloji |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Backend | NestJS (Fastify adapter) + Drizzle ORM *(Faz 0b)* |
| Veritabanı | PostgreSQL 16 (RLS ile multi-tenant) |
| Kuyruk / cache | BullMQ + Redis |
| Auth | better-auth (organization eklentisi) |
| Frontend | SvelteKit (Svelte 5, SPA) + TanStack Query + Tailwind v4 + shadcn-svelte |
| Gözlem | Sentry + pino |
| Hosting | Hetzner (Almanya) + Coolify, önde Cloudflare |

## Yapı

```
verimaya/
├── apps/
│   ├── api/          # NestJS backend (Faz 0b — şimdilik boş)
│   └── web/          # SvelteKit SPA + MSW mock
├── packages/
│   └── shared/       # zod şemaları, API sözleşmesi
├── docs/
└── .cursor/rules/
```

## Geliştirme

```bash
pnpm install
pnpm dev   # http://localhost:5173 — AppShell + MSW
```

Diğer komutlar: `pnpm check`, `pnpm build`, `pnpm lint`.
