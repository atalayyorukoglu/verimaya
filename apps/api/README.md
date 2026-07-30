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
- WhatsApp parse: `POST http://localhost:3000/v1/whatsapp/parse` — body `{ "message": "..." }` → `{ "records": [...] }` (`LLM_API_KEY` yoksa heuristic; approve işlem oluşturmaz)
- Webhook stub: `POST http://localhost:3000/v1/webhooks/:provider` → `202` (queue-first)
- WAHA webhook: `POST http://localhost:3000/v1/webhooks/waha` → `202` (`inbound_messages` + kuyruk)
- WhatsApp inbox: `GET /v1/whatsapp/inbox?cursor=&limit=`, `GET /v1/whatsapp/inbox/:id` (SessionGuard + ActiveOrgGuard)
- OpenAPI: `GET http://localhost:3000/v1/openapi.yaml` · Scalar UI: `GET http://localhost:3000/v1/docs` (auth yok)

OpenAPI kaynak dosya: [`openapi.yaml`](./openapi.yaml)

Yerel Postgres host portu **5433**, Redis **6379**. Runtime kullanıcı: `verimaya_app` (RLS). Migrasyon: `verimaya` (owner). Organization oluşturulunca aynı id ile `tenants` satırı yazılır. Admin TOTP: better-auth `twoFactor` (`/v1/auth/two-factor/*`).

### Faz 2 — kuyruk altyapısı

Tablolar: `integration_events`, `outbox_events`, `jobs` (RLS + `verimaya_app` grant). BullMQ `default` kuyruğu noop worker ile ayağa kalkar.

**Varsayılan job seçenekleri:** `attempts: 5`, exponential backoff (1s taban), `removeOnComplete.count: 1000`, `removeOnFail.count: 5000`. Denemeler tükendiğinde worker `jobs` (+ `integration_event.process` için `integration_events`) durumunu `failed` yapar.

**Bull Board:** `GET http://localhost:3000/v1/admin/queues` — yalnızca `NODE_ENV=development` iken veya `ADMIN_QUEUE_TOKEN` tanımlıyken açılır. Geliştirme dışında `X-Admin-Queue-Token: <ADMIN_QUEUE_TOKEN>` header'ı gerekir.

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

WAHA (WhatsApp inbox) — HMAC-SHA256 (`WAHA_WEBHOOK_SECRET`):

| Header | Açıklama |
|--------|----------|
| `X-Webhook-Timestamp` | Unix saniye; sunucu saatiyle ±5 dk |
| `X-Webhook-Signature` | `v1=` + hex(`HMAC-SHA256(secret, "${timestamp}.${rawBody}")`) |
| `X-Tenant-Id` | Aktif tenant UUID |
| `X-External-Event-Id` | Opsiyonel; yoksa payload'dan |

```bash
BODY='{"event":"message","payload":{"id":"msg-001","body":"Sandra 2900 GBP ödeme","from":"120363@g.us","chatName":"Finans"}}'
TS=$(date +%s)
SIG=$(node -e "const c=require('crypto');const b=process.argv[1];const t=process.argv[2];const s=process.env.WAHA_WEBHOOK_SECRET||'dev-waha-webhook-secret';console.log('v1='+c.createHmac('sha256',s).update(t+'.'+b).digest('hex'))" "$BODY" "$TS")
curl -s -X POST http://localhost:3000/v1/webhooks/waha \
  -H 'Content-Type: application/json' \
  -H "X-Webhook-Timestamp: $TS" \
  -H "X-Webhook-Signature: $SIG" \
  -H 'X-Tenant-Id: <tenant-uuid>' \
  -H 'X-External-Event-Id: msg-001' \
  -d "$BODY"
```

WhatsApp parse (oturum + aktif org gerekir; hasta eşleştirmesi tenant hasta listesinden):

```bash
curl -s -X POST http://localhost:3000/v1/whatsapp/parse \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <session-cookie>' \
  -d '{"message":"Sandra 2900 GBP 2. vizit ödemesi alındı"}'
```

## Faz 5 — Reklam metrikleri (stub)

- Tablo: `ad_metrics_daily` (`tenant_id`, `provider` meta|google, `date`, `campaign_id`, `spend_minor`, `impressions`, `clicks`; `UNIQUE(tenant_id, provider, date, campaign_id)`; RLS).
- API: `GET /v1/ad-metrics?from=&to=&provider=` — SessionGuard + ActiveOrgGuard; boş liste geçerli.
- Worker stub: `ad_metrics.sync` ve `integration_event.process` + `provider=meta|google` → noop (6 saatlik incremental sync + OAuth ileride).

## Faz 6 — Dış API + API key (stub)

- Tablo: `api_keys` (`tenant_id`, `name`, `key_prefix`, `key_hash`, `scopes`, `created_at`, `revoked_at`; RLS). Lookup: `app.lookup_api_key(hash)` (SECURITY DEFINER).
- API (oturum): `POST /v1/api-keys` (plaintext key yalnızca create yanıtında), `GET /v1/api-keys` (hash yok), `DELETE /v1/api-keys/:id` (revoke). Mutasyonlarda `Idempotency-Key` desteklenir (Faz 1'den beri domain CRUD'da da vardı).
- `ApiKeyGuard`: `Authorization: Bearer vk_...` → hash doğrulama; **henüz global middleware'e bağlı değil** — route bazında `@UseGuards(ApiKeyGuard)` ile kullanılacak.
- OpenAPI: [`openapi.yaml`](./openapi.yaml) + runtime `GET /v1/openapi.yaml` / Scalar `GET /v1/docs`.

## Gözlemlenebilirlik (Faz 2)

- **Log:** Fastify yerleşik pino (`LOG_LEVEL`, varsayılan `info`); istek kimliği `req.id`.
- **Hata gövdesi:** tüm HTTP hataları `{ error: { code, message }, request_id }` (`packages/shared` `apiErrorSchema`). Global `HttpExceptionFilter` Nest/string/object yanıtlarını bu forma çevirir; `request_id` her zaman Fastify `req.id` (veya exception gövdesindeki değer).
- **Sentry:** `SENTRY_DSN` set ise `@sentry/node` 5xx hatalarını yakalar (`request_id` tag); boşsa no-op.

## Test

```bash
pnpm --filter @verimaya/api test   # RLS negatif izolasyon
pnpm --filter @verimaya/api check  # tsc
```
