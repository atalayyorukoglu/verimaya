# Coolify canlı deploy + yedek/restore (Adım 31)

Hedef: Hetzner + Coolify üzerinde **api + web + Postgres + Redis**; Cloudflare önde;
günlük Postgres yedeği + sunucu dışı kopya; **restore provası kayıtlı**.

> Altyapı işi repo dışındadır. Bu dosya runbook’tur. Canlı kabul kriterleri
> (health 200, panel, prerender, restore kaydı) aşağıda doğrulanmadan Adım 31
> kapanmış sayılmaz.

## Önkoşullar

- [ ] Coolify kurulu Hetzner sunucu (tercihen DE/FI — AB lokasyonu)
- [ ] Cloudflare zone (ör. `verimaya.app`) — DNS proxy **turuncu bulut**
- [ ] GitHub repo Coolify’a bağlı
- [ ] Adım 15 KVKK aydınlatması yayında (`/kvkk-aydinlatma`) — karne e-posta toplar;
      aydınlatma yokken public karneyi açma

## Mimari (güvenlik çerçevesi)

```text
İnternet → Cloudflare (WAF / TLS / DDoS)
         → Hetzner firewall (yalnız 80/443)
         → Coolify reverse proxy
              ├─ web (static / nginx)
              └─ api :3000
                   ├─ Postgres 16 (Docker internal; dışa kapalı)
                   └─ Redis 7   (Docker internal; dışa kapalı)
```

- Hetzner cloud firewall / ufw: inbound yalnız `80`, `443` (+ yönetim için kısıtlı SSH).
- Postgres ve Redis **public port publish etme**; yalnız Coolify internal network.
- R2 bucket private (dosya depolama) — aşağıdaki S3 env’ler.

## Servisler

### 1. Postgres 16

Coolify managed DB veya Compose service.

| Ayar | Değer |
|---|---|
| Image | `postgres:16` |
| Volume | kalıcı volume zorunlu |
| Network | internal only |
| DB / user | uygulama için iki rol önerilir: owner (`verimaya`) migrate; app (`verimaya_app`) RLS |

Uygulama runtime: `DATABASE_URL_APP` = `verimaya_app` (NOBYPASSRLS).
Migrate: `DATABASE_URL` = owner / superuser.

### 2. Redis 7

| Ayar | Değer |
|---|---|
| Image | `redis:7` |
| Persistence | AOF veya RDB (BullMQ için tercih AOF) |
| Network | internal only |
| Auth | mümkünse `requirepass`; `REDIS_URL`’e yaz |

### 3. API

| Ayar | Değer |
|---|---|
| Dockerfile | `apps/api/Dockerfile` |
| Build context | **monorepo kökü** |
| Port | `3000` (`API_PORT`) |
| Health | `GET /v1/health` (liveness), `GET /v1/health/ready` (Postgres+Redis) |
| Domain | örn. `api.verimaya.app` |

**Migrasyon (önerilen):** Pre-deploy / one-shot:

```bash
pnpm --filter @verimaya/api db:migrate
```

Alternatif: `RUN_MIGRATIONS=true` (entrypoint migrate + start).

Volume: `UPLOAD_DIR` mount (local driver veya `local://` legacy satırlar için).

### 4. Web (static)

`apps/web/DEPLOY-STATIC.md` — Coolify Static Site **veya** nginx image.

| Ayar | Değer |
|---|---|
| Build | `pnpm install --frozen-lockfile && pnpm --filter @verimaya/web build` |
| Publish | `apps/web/build` |
| Domain | örn. `app.verimaya.app` veya apex `verimaya.app` |
| Env (build-time) | `PUBLIC_API_URL`, `PUBLIC_SITE_URL`, `PUBLIC_USE_MSW=false` |

Prerender önce, SPA fallback sonda — `try_files $uri $uri/index.html $uri/ /index.html;`

## Ortam değişkenleri (API — zorunlu prod)

| Key | Not |
|---|---|
| `DATABASE_URL` | Owner; migrate |
| `DATABASE_URL_APP` | `verimaya_app`; runtime RLS |
| `REDIS_URL` | Internal Redis |
| `BETTER_AUTH_SECRET` | ≥32 karakter rastgele; Coolify secret |
| `BETTER_AUTH_URL` | Public API URL (`https://api…`) |
| `CREDENTIALS_ENCRYPTION_KEY` | 32-byte hex (64 char) veya base64; **kaybolursa credential’lar okunamaz** |
| `TRUSTED_ORIGINS` | Panel origin(s), virgülle |
| `WEB_PUBLIC_URL` | Public web kökü (OAuth return + karne CORS) |
| `NODE_ENV` | `production` |
| `API_PORT` | `3000` |
| `SENTRY_DSN` | Production Sentry project |
| `STORAGE_DRIVER` | Prod’da tercihen `s3` (R2) |
| `S3_*` | R2 private bucket — aşağıdaki bölüm |
| `ADMIN_QUEUE_TOKEN` | Bull Board; boş bırakma |
| `ENABLE_INTEGRATION_SCHEDULERS` | Pilot sonrası `true` (6h sync + günlük files sweep) |
| `FILES_SWEEP_DRY_RUN` | İlk hafta `true`, sonra kapat |

Opsiyonel: `LLM_*`, Ads OAuth (`META_*`, `GOOGLE_ADS_*`), webhook secret’ları.

Web build:

| Key | Not |
|---|---|
| `PUBLIC_API_URL` | `https://api…` |
| `PUBLIC_SITE_URL` | `https://…` (canonical / OG) |
| `PUBLIC_USE_MSW` | `false` |

## Cloudflare R2 (dosya depolama)

Bucket **private**; istemciye public URL yok.

1. R2 → Create bucket (EU lokasyon tercihi).
2. API token: Object Read & Write, yalnız bu bucket.
3. API env: `STORAGE_DRIVER=s3` + `S3_ENDPOINT` / `S3_REGION=auto` / `S3_BUCKET` / keys.
4. `UPLOAD_DIR` volume’u tut — `local://` satırlar migrate edilene kadar.
5. Taşıma:

```bash
pnpm --filter @verimaya/api files:migrate-s3
pnpm --filter @verimaya/api files:migrate-s3 -- --apply
```

## Günlük Postgres yedeği + sunucu dışı kopya

Coolify scheduled job **veya** sunucu cron (örnek):

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="/var/backups/verimaya/pg-${STAMP}.sql.gz"
mkdir -p "$(dirname "$OUT")"
# Coolify internal hostname / credentials — secret'tan oku
docker exec -i <postgres-container> \
  pg_dump -U verimaya -d verimaya --format=plain \
  | gzip -9 > "$OUT"
# Sunucu dışı kopya (Hetzner Storage Box, R2, Backblaze, …)
rclone copy "$OUT" remote:verimaya-pg-backups/
# Yerelde N günden eskiyi sil (sunucu dışı kopya asıl kaynak)
find /var/backups/verimaya -name 'pg-*.sql.gz' -mtime +7 -delete
```

Kontrol listesi:

- [ ] Cron / Coolify schedule: günde ≥1 (UTC sabahı önerilir)
- [ ] Çıktı gzip + tarih damgası
- [ ] Sunucu dışı kopya (Storage Box / R2 / S3) — **aynı Hetzner diskinde yalnız tutma**
- [ ] Alert: son 36s içinde başarılı yedek yoksa bildirim

Redis yedeği zorunlu değil (broker); kritik durum Postgres’tedir.

## Restore provası (zorunlu)

**Prova yapılmamış yedek yedek değildir.** Aylık tekrar + her major şema değişiminden sonra.

### Prosedür (staging / ayrı Postgres volume)

1. Son başarılı dump’ı sunucu dışından indir.
2. Boş bir Postgres’e yükle (prod’u ezme):

```bash
gunzip -c pg-YYYYMMDD….sql.gz | docker exec -i <restore-pg> \
  psql -U verimaya -d verimaya
```

3. Doğrula:

```bash
# satır sayıları (örnek)
psql … -c "select count(*) from patients;"
psql … -c "select count(*) from files;"
psql … -c "select max(created_at) from audit_logs;"
```

4. API’yi geçici `DATABASE_URL*` ile bu instance’a bağlayıp `GET /v1/health/ready` + bir tenant listesi dene (mümkünse).
5. Sonucu aşağıdaki tabloya yaz.

### Restore prova kaydı

| Tarih (UTC) | Dump dosyası | Hedef | Sonuç | Not |
|---|---|---|---|---|
| _örn. 2026-07-30_ | `pg-….sql.gz` | staging PG | OK / FAIL | |

> Canlı kabul: en az **bir** OK satırı olmadan Adım 31 kapanmaz.

## Canlı kabul (curl)

Host’ları kendi domain’inle değiştir:

```bash
API=https://api.example.com
WEB=https://app.example.com

# API
curl -sfS "$API/v1/health" | tee /tmp/vm-health.json
curl -sfS "$API/v1/health/ready"

# Panel SPA (noindex kabuk)
curl -sS "$WEB/" | grep -q noindex && echo "spa noindex ok"

# Public prerender (SEO içerik — SPA kabuğu değil)
curl -sS "$WEB/vitrin" | grep -q "Hasta yolculuğunu" && echo "vitrin prerender ok"
curl -sS "$WEB/yapay-zeka-karnesi" | grep -qiE "karne|yapay.?zeka" && echo "karne prerender ok"
# prerender dosyasında noindex olmamalı:
! curl -sS "$WEB/vitrin" | grep -q noindex && echo "vitrin indexable ok"
```

Ek:

- [ ] Cloudflare SSL Full (strict)
- [ ] Hetzner firewall yalnız 80/443
- [ ] Postgres/Redis dış port yok (`ss -lntp` / Coolify UI)
- [ ] Sentry’ye test hata düşüyor
- [ ] Restore prova tablosunda ≥1 OK

## R2 / local migrate (hatırlatma)

`docs/DEPLOY-COOLIFY.md` önceki R2 bölümü hâlâ geçerli; yukarıdaki S3 env’ler + `files:migrate-s3`.

## Migrasyon (tekrar)

```bash
pnpm --filter @verimaya/api db:migrate
```

veya `RUN_MIGRATIONS=true`.
