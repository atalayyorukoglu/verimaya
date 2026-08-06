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

### 4. Web (static) — **önerilen: GHCR image (path B)**

VPS’te `docker build` / pnpm **yapma**. Image GitHub Actions’ta build edilir, Coolify yalnız çeker.
Aksi halde 2 GB kutuda OOM / Sentinel / SSH kopması tekrarlanır.

| Ayar | Değer |
|---|---|
| Kaynak | **Docker Image** (Dockerfile build değil) |
| Image | `ghcr.io/<github-user>/verimaya-web:main` |
| Registry | `ghcr.io` — private package → GitHub PAT (`read:packages`) |
| Domain | **`verimaya.com` + `app.verimaya.com`** (aynı servis) |
| Auto deploy | Coolify **Deploy Webhook** URL → repo secret `COOLIFY_WEB_DEPLOY_WEBHOOK` |

Workflow: [`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml)  
Tetik: `main` push (`apps/web/**`, `packages/shared/**`, lockfile…) veya **Run workflow**.

#### Coolify’da geçiş (web)

1. Web uygulaması → **General** → Build Pack / Source: **Docker Image**.
2. Image name: `ghcr.io/<user>/verimaya-web` · tag: `main` (veya immutable sha).
3. Private GHCR: Registry credentials → GitHub username + PAT (`read:packages`, gerekirse `write` yok).
4. **Git-based auto deploy / Watch Paths build’i kapat** — VPS bir daha build etmesin.
5. Application → Webhooks → Deploy webhook kopyala → GitHub repo **Settings → Secrets**:
   - `COOLIFY_WEB_DEPLOY_WEBHOOK` = webhook URL (`…/deploy?uuid=…`)
   - `COOLIFY_API_TOKEN` = Coolify **Keys & Tokens → API Tokens** (scope: **deploy**)
6. Workflow deploy tetikleyici `Authorization: Bearer` gönderir (yalnız URL yetmez).
7. Actions’ta **Deploy web image** yeşil olsun; sonra siteyi doğrula (`/` hub, `/app/`).

Fallback (eski yol, OOM riski): Dockerfile + monorepo context — yalnız acil / CI kırıkken.

| Eski ayar | Değer |
|---|---|
| Dockerfile | `apps/web/Dockerfile` |
| Build context | **monorepo kökü** |
| Watch Paths | `apps/web/**` · `packages/shared/**` · lockfile… |

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

## Troubleshooting — Sentinel Out Of Sync / deploy timeout

Belirtiler (birlikte sık görülür):

- Coolify sunucu kartı: **Sentinel Out Of Sync** (agent metrik push etmiyor)
- Deploy log: `pnpm install` → *Verifying lockfile against supply-chain policies* 10–20 dk, sonra yavaş npm indirme
- `ApplicationDeploymentJob has timed out` (~1 saat)
- Cleanup: `Connection timed out during banner exchange` (SSH)
- Public HTTPS timeout (Cloudflare DNS resolve, origin 0 byte)

Kök neden genelde: **aynı VPS’te uzun/soğuk Docker build CPU+disk’i dolduruyor** → SSH/Sentinel/nginx/proxy de yanıt vermiyor.

### Acil (Hetzner Console — SSH gerekmez)

1. Hetzner Cloud → sunucu → **Console** aç (SSH değil).
2. `df -h` — disk doluysa `docker system prune -af` (dikkat: unused imajlar silinir).
3. `docker ps` — takılı `coolify-helper` / build container varsa durdur.
4. Gerekirse soft **reboot**.
5. Coolify UI dönünce: web uygulamasında **Redeploy** (Watch Paths yüzünden yalnız web).

### Kalıcı (repo — Dockerfile)

`apps/web/Dockerfile` ve `apps/api/Dockerfile`:

- BuildKit `pnpm` store cache mount (`--mount=type=cache,id=pnpm,…`)
- `pnpm@11.15.1` + `--config.trustLockfile=true` (registry re-verify skip; Coldify’da 15m+ hang’in ana sebebi)

Coolify’da BuildKit açık olmalı (modern Coolify varsayılan). Job timeout’u yetmiyorsa Application → Advanced → timeout’u geçici yükselt; asıl çözüm build süresini kısaltmak.

### Sentinel

Deploy/site düzelince çoğu kez kendiliğinden yeşile döner. Kalırsa: Servers → verimaya-prod → Configurations → Sentinel off/on veya `coolify-sentinel` container restart.


`docs/DEPLOY-COOLIFY.md` önceki R2 bölümü hâlâ geçerli; yukarıdaki S3 env’ler + `files:migrate-s3`.

## Migrasyon (tekrar)

```bash
pnpm --filter @verimaya/api db:migrate
```

veya `RUN_MIGRATIONS=true`.
