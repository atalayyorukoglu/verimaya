# @verimaya/api

NestJS (Fastify) + Drizzle + better-auth + BullMQ.

## Yerel

```bash
# repo kökünden
pnpm db:up          # Postgres + Redis
cp apps/api/.env.example apps/api/.env
pnpm db:migrate
pnpm --filter @verimaya/api dev
```

- Health: `GET http://localhost:3000/v1/health`
- Ready (Postgres + Redis): `GET http://localhost:3000/v1/health/ready`
- Auth: `http://localhost:3000/v1/auth/*` (better-auth)
- Session: `GET http://localhost:3000/v1/me` (cookie)
- Webhook stub: `POST http://localhost:3000/v1/webhooks/:provider` → `202` (queue-first)

Yerel Postgres host portu **5433**, Redis **6379**. Runtime kullanıcı: `verimaya_app` (RLS). Migrasyon: `verimaya` (owner). Organization oluşturulunca aynı id ile `tenants` satırı yazılır. Admin TOTP: better-auth `twoFactor` (`/v1/auth/two-factor/*`).

### Faz 2 — kuyruk altyapısı

Tablolar: `integration_events`, `outbox_events`, `jobs` (RLS + `verimaya_app` grant). BullMQ `default` kuyruğu noop worker ile ayağa kalkar.

Webhook stub header'ları (geliştirme):

| Header | Açıklama |
|--------|----------|
| `X-Webhook-Signature` | `WEBHOOK_STUB_SECRET` ile eşleşmeli |
| `X-Tenant-Id` | Aktif tenant UUID (ileride provider credential'dan çözülecek) |
| `X-External-Event-Id` | Opsiyonel; yoksa payload `id` / hash |

```bash
curl -s -X POST http://localhost:3000/v1/webhooks/ghl \
  -H 'Content-Type: application/json' \
  -H 'X-Webhook-Signature: dev-webhook-secret' \
  -H 'X-Tenant-Id: <tenant-uuid>' \
  -H 'X-External-Event-Id: evt-001' \
  -d '{"type":"contact.created","id":"evt-001"}'
```

## Test

```bash
pnpm --filter @verimaya/api test   # RLS negatif izolasyon
pnpm --filter @verimaya/api check  # tsc
```
