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
| `STORAGE_DRIVER` | `local` (varsayılan) veya `s3` (R2 / S3-uyumlu) |
| `UPLOAD_DIR` | Local driver kökü (volume mount; `s3` geçişinde eski dosyalar için gerekir) |
| `S3_ENDPOINT` | R2: `https://<accountid>.r2.cloudflarestorage.com` |
| `S3_REGION` | R2 için genelde `auto` |
| `S3_BUCKET` | Private bucket adı (ör. `verimaya-files`) |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | R2 API token |
| `S3_FORCE_PATH_STYLE` | R2: boş/`true` bırak; gerekirse `false` |

## Cloudflare R2 (dosya depolama)

Bucket **private** kalır; istemciye doğrudan public URL verilmez. Erişim API proxy stream veya kısa ömürlü presigned URL (TTL 300s) ile.

1. Cloudflare dashboard → R2 → Create bucket (tercihen EU lokasyonu; KVKK/GDPR — `docs/MIMARI.md`).
2. Manage R2 API Tokens → Object Read & Write, yalnız bu bucket.
3. API servisine yukarıdaki `S3_*` + `STORAGE_DRIVER=s3` env'lerini ekle.
4. Persistent volume: `UPLOAD_DIR` hâlâ mount edilsin — `local://` satırlar migrate edilene kadar okunur. Adapter anahtardaki şemaya göre (`local://` / `s3://`) doğru backend'i seçer; karışık satırlar desteklenir.
5. Mevcut local dosyaları taşı:

```bash
# Dry-run (varsayılan) — kaç satır taşınacak
pnpm --filter @verimaya/api files:migrate-s3

# Uygula — R2'ye yükle, storage_key'i s3:// yap; local silinmez
pnpm --filter @verimaya/api files:migrate-s3 -- --apply
```

Script `DATABASE_URL` (owner / RLS bypass) ister; `DATABASE_URL_APP` tüm tenant'ları göremez. İkinci `--apply` 0 dosya taşır (idempotent). Local dosya silme ayrı ve elle.

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
