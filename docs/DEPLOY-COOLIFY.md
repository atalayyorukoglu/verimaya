# Coolify ilk deploy (Faz 0b)

Hedef: Hetzner üzerinde Coolify ile `apps/api` + Postgres + Redis.

## Önkoşullar

- Coolify kurulu sunucu (Hetzner DE)
- Cloudflare DNS (API subdomain, örn. `api.verimaya.app`)
- GitHub repo bağlı

## Servisler

1. **Postgres 16** — Coolify managed DB veya Docker Compose service; dışa kapalı.
2. **Redis 7** — aynı şekilde iç network.
3. **API** — Dockerfile (ileride) veya Nixpacks; build context monorepo kökü, start: `pnpm --filter @verimaya/api start`.

## Ortam değişkenleri

| Key | Açıklama |
|---|---|
| `DATABASE_URL` | Coolify Postgres connection string |
| `REDIS_URL` | Coolify Redis |
| `BETTER_AUTH_SECRET` | En az 32 karakter rastgele secret |
| `BETTER_AUTH_URL` | Public API URL (`https://api…`) |
| `TRUSTED_ORIGINS` | Web origin(s), virgülle |
| `API_PORT` | `3000` (Coolify port map) |
| `NODE_ENV` | `production` |

## Migrasyon

Deploy hook / release command:

```bash
pnpm --filter @verimaya/api db:migrate
```

## Not

Web (`apps/web`) static SPA — ayrı Coolify static site veya Cloudflare Pages; MSW kapanana kadar (Faz 1) demo frontend local/MSW ile kalabilir.
