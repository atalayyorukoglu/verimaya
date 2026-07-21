# Coolify ilk deploy (Faz 0b)

Hedef: Hetzner üzerinde Coolify ile `apps/api` + Postgres + Redis.

## Önkoşullar

- Coolify kurulu sunucu (Hetzner DE)
- Cloudflare DNS (API subdomain, örn. `api.verimaya.app`)
- GitHub repo bağlı

## Servisler

1. **Postgres 16** — Coolify managed DB veya Docker Compose service; dışa kapalı.
2. **Redis 7** — aynı şekilde iç network.
3. **API** — Dockerfile: `apps/api/Dockerfile`, build context **monorepo kökü** (`docker build -f apps/api/Dockerfile .`).

## API Docker

| Ayar | Değer |
|---|---|
| Dockerfile | `apps/api/Dockerfile` |
| Build context | repo kökü |
| Port | `3000` (`API_PORT`) |
| Start | `node dist/apps/api/src/main.js` (CMD) |

**Opsiyonel migrasyon container start'ta:** `RUN_MIGRATIONS=true` → entrypoint `pnpm db:migrate` çalıştırır, ardından API. Ayrı release hook da kullanılabilir (aşağı).

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
| `RUN_MIGRATIONS` | `true` ise container start'ta migrate (opsiyonel) |

## Migrasyon

Deploy hook / release command (önerilen):

```bash
pnpm --filter @verimaya/api db:migrate
```

Coolify'da API servisi için **Pre-deploy** veya one-shot job olarak çalıştırın; `DATABASE_URL` aynı olmalı.

Alternatif: API servisinde `RUN_MIGRATIONS=true` (entrypoint migrate + start).

## Web (static)

`apps/web/DEPLOY-STATIC.md` — Coolify static site veya Cloudflare Pages; çıktı `apps/web/build`.

MSW kapanana kadar (Faz 1) demo frontend local/MSW ile kalabilir.
