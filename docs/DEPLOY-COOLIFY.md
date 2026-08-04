# Coolify canlı deploy + yedek/restore (Adım 31)

Hedef: Hetzner + Coolify üzerinde **api + web + Postgres + Redis**; Cloudflare önde;
günlük Postgres yedeği + sunucu dışı kopya; **restore provası kayıtlı**.

> Altyapı işi repo dışındadır. Bu dosya runbook’tur. Canlı kabul kriterleri
> (health 200, panel, prerender, restore kaydı) aşağıda doğrulanmadan Adım 31
> kapanmış sayılmaz.

## Önkoşullar

- [ ] Coolify kurulu Hetzner sunucu (tercihen DE/FI — AB lokasyonu)
- [ ] Cloudflare zone (ör. `verimaya.com`) — DNS proxy **turuncu bulut**
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
| Domain | örn. `api.verimaya.com` |
| **Watch Paths (zorunlu)** | `apps/api/**` · `packages/shared/**` · `pnpm-lock.yaml` · `pnpm-workspace.yaml` · `package.json` |

> Web-only commit API’yi yeniden build etmesin. Aksi halde her hub/CSS push’u API’yi 5–10 dk “unknown/restarting”a sokar (Coolify: Application → General → Watch Paths).

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
| Dockerfile | `apps/web/Dockerfile` (önerilen) veya Static Site |
| Build context | **monorepo kökü** (Dockerfile) |
| Build | `pnpm install --frozen-lockfile && pnpm --filter @verimaya/web build` |
| Publish | `apps/web/build` (Static Site) |
| Domain | **`verimaya.com` + `app.verimaya.com`** (aynı servis) |
| Env (build-time) | `PUBLIC_API_URL`, `PUBLIC_SITE_URL`, `PUBLIC_APP_URL`, `PUBLIC_CRM_URL`, `PUBLIC_USE_MSW=false`, `PUBLIC_KARNE_LEADS_ENABLED=false` |
| **Watch Paths (zorunlu)** | `apps/web/**` · `packages/shared/**` · `pnpm-lock.yaml` · `pnpm-workspace.yaml` · `package.json` |

> Apex hub = `hub.html` (prerender snapshot, SvelteKit client yok). nginx `/hub.html` üzerinde CSP ile module `import` engelli — yanlış hydrate blank page üretemez.

Prerender önce, SPA fallback sonda — `try_files $uri $uri/index.html $uri/ /index.html;`

#### Domain ayrımı

| Host | Rol |
|---|---|
| `verimaya.com` | Pazarlama hub’ı (`/`: App Verimaya + CRM Verimaya) |
| `app.verimaya.com` | Panel + `/login` (oturum yoksa login, varsa panel) |
| `crm.verimaya.com` | GHL white-label — **Verimaya kodu yok**; DNS CNAME → GHL |

**nginx (imaj içi):** Apex/www host’ta `/` → `hub.html` (prerender hub); app host’ta `/` → SPA `index.html`. Eski `/vitrin` → `301 /`. Cloudflare’de ayrıca `/`→`/vitrin` redirect **gerekmez**.

API CORS / auth:

- `TRUSTED_ORIGINS`: `https://verimaya.com,https://app.verimaya.com` (gerekirse `www`)
- `WEB_PUBLIC_URL`: tercihen `https://verimaya.com` (OAuth return + karne); panel cookie origin `app` ise better-auth `trustedOrigins` her iki hostu kapsamalı

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
| `KARNE_LEADS_ENABLED` | Hukuk/KVKK onayına kadar `false`; yalnız web bayrağıyla birlikte aç |

Opsiyonel: `LLM_*`, Ads OAuth (`META_*`, `GOOGLE_ADS_*`), webhook secret’ları.
Meta Ads canlı: `docs/ADS-META-GOLIVE.md` (redirect URI = `{ADS_OAUTH_REDIRECT_BASE}/v1/integrations/ads/meta/callback`).

Web build:

| Key | Not |
|---|---|
| `PUBLIC_API_URL` | `https://api.verimaya.com` |
| `PUBLIC_SITE_URL` | `https://verimaya.com` (canonical / OG / hub) |
| `PUBLIC_APP_URL` | `https://app.verimaya.com` (hub → App CTA) |
| `PUBLIC_CRM_URL` | `https://crm.verimaya.com` (hub → CRM CTA; GHL) |
| `PUBLIC_USE_MSW` | `false` |
| `PUBLIC_KARNE_LEADS_ENABLED` | Hukuk/KVKK onayına kadar `false`; API bayrağıyla birlikte aç |

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
| 2026-07-31 | `pg-20260731T143657Z.sql.gz` | `verimaya_restore_test` (aynı PG, prod dışı DB) | OK | 37 public tablo eşleşti; test DB drop edildi. Sunucu dışı kopya henüz yok. |

> Canlı kabul: en az **bir** OK satırı olmadan Adım 31 kapanmaz.

## Canlı kabul (curl)

Host’ları kendi domain’inle değiştir:

```bash
API=https://api.verimaya.com
APP=https://app.verimaya.com
SITE=https://verimaya.com

# API
curl -sfS "$API/v1/health" | tee /tmp/vm-health.json
curl -sfS "$API/v1/health/ready"

# Panel SPA (noindex kabuk) — app host
curl -sS "$APP/" | grep -q noindex && echo "spa noindex ok"

# Hub prerender (SEO) — apex kökü
curl -sS "$SITE/" | grep -q "App Verimaya" && echo "hub App CTA ok"
curl -sS "$SITE/" | grep -q "CRM Verimaya" && echo "hub CRM CTA ok"
curl -sS "$SITE/" | grep -q "Hasta yolculuğunu" && echo "hub prerender ok"
curl -sS "$SITE/yapay-zeka-karnesi/" | grep -qiE "karne|yapay.?zeka" && echo "karne prerender ok"
! curl -sS "$SITE/" | grep -q noindex && echo "hub indexable ok"
# Eski path → kök
curl -sSI "$SITE/vitrin/" | grep -qiE 'location:.*/$' && echo "vitrin 301 to root ok"
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
