# @verimaya/api

NestJS (Fastify) + Drizzle + better-auth.

## Yerel

```bash
# repo kökünden
pnpm db:up
cp apps/api/.env.example apps/api/.env
pnpm db:migrate
pnpm --filter @verimaya/api dev
```

- Health: `GET http://localhost:3000/v1/health`
- Auth: `http://localhost:3000/v1/auth/*` (better-auth)
- Session: `GET http://localhost:3000/v1/me` (cookie)

Yerel Postgres host portu **5433**. Runtime kullanıcı: `verimaya_app` (RLS). Migrasyon: `verimaya` (owner). Organization oluşturulunca aynı id ile `tenants` satırı yazılır. Admin TOTP: better-auth `twoFactor` (`/v1/auth/two-factor/*`).

## Test

```bash
pnpm --filter @verimaya/api test   # RLS negatif izolasyon
```
