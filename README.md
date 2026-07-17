# Verimaya

Türkiye'deki sağlık turizmi acenteleri ve klinikleri için çok kiracılı (multi-tenant) B2B SaaS operasyon platformu: lead/hasta takibi, randevu, finans, raporlama, WhatsApp inbox ve GoHighLevel / reklam API'leri / n8n entegrasyonları.

## Durum

Proje kuruluş aşamasında (Faz 0a). Yol haritası: [`docs/YOL-HARITASI.md`](./docs/YOL-HARITASI.md) — mimari: [`docs/MIMARI.md`](./docs/MIMARI.md).

Proje takibi (yapılanlar/yapılacaklar/kararlar) Obsidian'da tutulur: `SecondBrain-Remote/03-Areas/Verimaya`.

## Stack

| Katman | Teknoloji |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Backend | NestJS (Fastify adapter) + Drizzle ORM |
| Veritabanı | PostgreSQL 16 (RLS ile multi-tenant) |
| Kuyruk / cache | BullMQ + Redis |
| Auth | better-auth (organization eklentisi) |
| Frontend | SvelteKit (Svelte 5, SPA modu) + TanStack Query + Tailwind + shadcn-svelte |
| Gözlem | Sentry + pino |
| Hosting | Hetzner (Almanya) + Coolify, önde Cloudflare |

## Planlanan yapı

```
verimaya/
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # SvelteKit frontend, SPA modu (Faz 0a'da MSW mock ile başlar)
├── packages/
│   └── shared/       # zod şemaları, API sözleşmesi, ortak tipler
├── docs/             # mimari, yol haritası, legacy referans
└── .cursor/rules/    # Cursor AI proje kuralları
```

## Geliştirme

Faz 0a tamamlanana kadar tek komut hedefi:

```bash
pnpm install
pnpm dev   # apps/web — MSW mock'lu frontend
```

Faz 0b'den itibaren `docker compose up` (PostgreSQL + Redis) ve `pnpm dev:api` eklenecek.
