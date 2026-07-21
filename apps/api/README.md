# @verimaya/api

NestJS (Fastify) + Drizzle. Faz 0b iskeleti: health check, `tenants` tablosu, `app.current_tenant_id()` yardımcısı.

## Yerel

```bash
# repo kökünden
pnpm db:up
cp apps/api/.env.example apps/api/.env
pnpm db:migrate
pnpm --filter @verimaya/api dev
# GET http://localhost:3000/v1/health
```

Yerel Postgres host portu **5433** (5432 çakışmalarını önlemek için).
