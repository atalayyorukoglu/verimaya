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
- Domain CRUD: `GET|POST|PATCH|DELETE /v1/patients`, `/v1/contacts`, `/v1/appointments`, `/v1/transactions` (SessionGuard + ActiveOrgGuard; mutasyonlarda opsiyonel `Idempotency-Key`)
- WhatsApp parse stub: `POST http://localhost:3000/v1/whatsapp/parse` — body `{ "message": "..." }` → `{ "records": [...] }` (heuristic; LLM Faz 3)
- Webhook stub: `POST http://localhost:3000/v1/webhooks/:provider` → `202` (queue-first)

Yerel Postgres host portu **5433**, Redis **6379**. Runtime kullanıcı: `verimaya_app` (RLS). Migrasyon: `verimaya` (owner). Organization oluşturulunca aynı id ile `tenants` satırı yazılır. Admin TOTP: better-auth `twoFactor` (`/v1/auth/two-factor/*`).

### Faz 2 — kuyruk altyapısı

Tablolar: `integration_events`, `outbox_events`, `jobs` (RLS + `verimaya_app` grant). BullMQ `default` kuyruğu noop worker ile ayağa kalkar.

### Faz 4 — GHL foundation (stub)

- Tablo: `tenant_credentials` (`tenant_id`, `provider`, `ciphertext` bytea, `key_version`, `created_at`; `UNIQUE(tenant_id, provider)`; RLS).
- Adaptör: `apps/api/src/integrations/ghl/` — `GhlClient` arayüzü + `GhlClientStub` (dış API çağrısı yok).
- Worker: `integration_event.process` + `provider=ghl` → stub işler, `jobs`/`integration_events` durumu güncellenir.

**Credential şifreleme:** OAuth/API token'ları yalnızca `ciphertext` sütununda saklanır; AES-GCM uygulaması ileride eklenecek. Plaintext credential loglanmaz ve API yanıtlarına yazılmaz.

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

WhatsApp parse (oturum + aktif org gerekir; hasta eşleştirmesi tenant hasta listesinden):

```bash
curl -s -X POST http://localhost:3000/v1/whatsapp/parse \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <session-cookie>' \
  -d '{"message":"Sandra 2900 GBP 2. vizit ödemesi alındı"}'
```

## Test

```bash
pnpm --filter @verimaya/api test   # RLS negatif izolasyon
pnpm --filter @verimaya/api check  # tsc
```
