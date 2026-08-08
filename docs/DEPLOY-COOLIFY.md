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
| `KARNE_LEADS_ENABLED` | Lead POST; prod `true` (LEG-02). Web `PUBLIC_KARNE_LEADS_ENABLED` ile birlikte |
| `RESEND_API_KEY` | Karne özet e-postası; yoksa lead kaydolur ama mail gitmez |
| `KARNE_SUMMARY_FROM` | Örn. `Veri Maya <karne@verimaya.com>` (Resend’de domain verified) |
| `KARNE_SUMMARY_REPLY_TO` | Opsiyonel reply-to |
| `WEBHOOK_IDENTITY_DEFAULT_SECRET` | Pilot WAHA shim. `true` → env paylaşımlı secret kabul; **PILOT-02 sonu `false`** |
| `WEBHOOK_IDENTITY_DEFAULT_TENANT` | Shim açıkken kabul edilen tek tenant UUID; boşsa shim etkisiz |
| `WAHA_WEBHOOK_SECRET` | Shim / lokal HMAC; prod’da asıl kaynak `tenant_provider_identities` |
| `WEBHOOK_SECRET_<PROVIDER>` | Generic provider shim (ör. `WEBHOOK_SECRET_GHL`); aynı PILOT-02 kapanışı |

Opsiyonel: `LLM_*`, Ads OAuth (`META_*`, `GOOGLE_ADS_*`).
Meta Ads canlı: `docs/ADS-META-GOLIVE.md` (redirect URI = `{ADS_OAUTH_REDIRECT_BASE}/v1/integrations/ads/meta/callback`).

### WEBHOOK-01 — tenant kimliği + pilot shim

Kanonik tenant **istemci header’ından değil**, imza doğrulamasından sonra
`tenant_provider_identities` satırından çözülür (migration `0023`/`0024`,
`apps/api/src/webhooks/webhooks.identity.ts`).

İmza kanonu: `HMAC-SHA256(secret, "${ts}.${provider}.${claimedTenantId}.${rawBody}")`
→ header `X-Webhook-Signature: v1=<hex>`. `X-Tenant-Id` yalnız claim’dir; imzaya
bağlıdır ama RLS tenant’ı değildir.

**Pilot shim (tek tenant WAHA):** Coolify’da geçici olarak:

```text
WEBHOOK_IDENTITY_DEFAULT_SECRET=true
WEBHOOK_IDENTITY_DEFAULT_TENANT=<pilot-tenant-uuid>
WAHA_WEBHOOK_SECRET=<aynı-HMAC-secret>
```

Shim yalnız claim == `WEBHOOK_IDENTITY_DEFAULT_TENANT` iken env secret’ı kabul
eder. İkinci tenant veya PILOT-02 sonu: shim’i kapat (`…_DEFAULT_SECRET=false`),
her tenant için identity satırı zorunlu — yoksa webhook 401.

**Identity provision (admin UI yok; migration / SQL + CryptoService):**

1. Secret üret: `openssl rand -hex 32` (WAHA / sağlayıcıya aynı değeri ver).
2. `key_hash` = `sha256(utf8(secret)).hex` (`hashWebhookSecret`).
3. `ciphertext` = `CryptoService.encrypt(secret)` (`CREDENTIALS_ENCRYPTION_KEY`
   ile; AES-GCM). Lokal/ops: Vitest provision kalıbı
   `apps/api/src/webhooks/webhooks.provider.spec.ts` → `provisionIdentity`.
4. Owner veya RLS bağlamında insert:

```sql
SELECT set_config('app.current_tenant_id', '<tenant-uuid>', true);
INSERT INTO tenant_provider_identities
  (tenant_id, provider, ciphertext, key_hash, key_version)
VALUES
  ('<tenant-uuid>', 'waha', '<bytea-ciphertext>', '<sha256-hex>', 1);
```

`provider` WAHA için `waha`; generic için path segment (`ghl`, …).
Rotasyon: yeni satır / upsert + `updated_at` — lookup `updated_at DESC` alır.
PILOT-02 kapanış checklist’i: tüm aktif tenant’larda satır var → shim env
`false` → eski paylaşımlı secret’ı rotate et.

Web build:

| Key | Not |
|---|---|
| `PUBLIC_API_URL` | `https://api.verimaya.com` |
| `PUBLIC_SITE_URL` | `https://verimaya.com` (canonical / OG / hub) |
| `PUBLIC_APP_URL` | `https://app.verimaya.com` (hub → App CTA) |
| `PUBLIC_CRM_URL` | `https://crm.verimaya.com` (hub → CRM CTA; GHL) |
| `PUBLIC_USE_MSW` | `false` |
| `PUBLIC_KARNE_LEADS_ENABLED` | Lead form; prod image `true` (Dockerfile). API `KARNE_LEADS_ENABLED` ile birlikte |

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

## Günlük Postgres yedeği + sunucu dışı kopya (OPS-01 · R2)

**Hedef:** Her gün bir `pg_dump` → gzip → **Cloudflare R2** (`verimaya-pg-backups`).
Aynı Hetzner diskine yalnız tutma. Script: `scripts/ops/pg-backup-to-r2.sh`.

### 1) Cloudflare dashboard (bir kez)

1. Cloudflare → **R2** → **Create bucket**
   - Name: `verimaya-pg-backups`
   - Location: **EU** (mümkünse)
2. R2 → **Manage R2 API Tokens** → **Create API token**
   - Permission: **Object Read & Write**
   - Bucket: yalnız `verimaya-pg-backups`
3. Not et (Coolify/sunucu secret’a):
   - Access Key ID
   - Secret Access Key
   - Endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
     (R2 overview / bucket Settings → S3 API)

### 2) Sunucu: araçlar

SSH (veya Coolify host terminal):

```bash
# AWS CLI (R2 S3-compatible)
command -v aws >/dev/null || (curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o /tmp/awscliv2.zip && unzip -q /tmp/awscliv2.zip -d /tmp && /tmp/aws/install)

# Script’i koy
sudo mkdir -p /opt/verimaya/ops /var/backups/verimaya
# Repodan kopyala veya scp:
#   scripts/ops/pg-backup-to-r2.sh → /opt/verimaya/ops/pg-backup-to-r2.sh
sudo chmod +x /opt/verimaya/ops/pg-backup-to-r2.sh
```

Postgres container adı:

```bash
docker ps --format '{{.Names}}' | grep -i postgres
# örn. …-postgres-…  → PG_CONTAINER=
```

### 3) Env + cron

`/etc/verimaya/backup.env` (root only, `chmod 600`):

```bash
PG_CONTAINER=CHANGE_ME
PG_USER=postgres
PG_DATABASE=verimaya
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_BUCKET=verimaya-pg-backups
AWS_ACCESS_KEY_ID=…
AWS_SECRET_ACCESS_KEY=…
```

Cron (UTC 03:00):

```cron
0 3 * * * . /etc/verimaya/backup.env && /opt/verimaya/ops/pg-backup-to-r2.sh >> /var/log/verimaya-pg-backup.log 2>&1
```

Elle ilk koşu:

```bash
set -a && . /etc/verimaya/backup.env && set +a
/opt/verimaya/ops/pg-backup-to-r2.sh
```

R2’de `pg/pg-….sql.gz` görünmeli.

### 4) Restore prova (zorunlu)

```bash
# indir
aws s3 cp s3://verimaya-pg-backups/pg/pg-YYYYMMDD….sql.gz /tmp/restore.sql.gz \
  --endpoint-url "$R2_ENDPOINT"

# prod’u EZME — ayrı DB
docker exec -i "$PG_CONTAINER" psql -U postgres -c 'CREATE DATABASE verimaya_restore_test;'
gunzip -c /tmp/restore.sql.gz | docker exec -i "$PG_CONTAINER" \
  psql -U postgres -d verimaya_restore_test

docker exec -i "$PG_CONTAINER" psql -U postgres -d verimaya_restore_test -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"

docker exec -i "$PG_CONTAINER" psql -U postgres -c 'DROP DATABASE verimaya_restore_test;'
```

Sonucu aşağıdaki tabloya yaz.

Kontrol listesi:

- [ ] Cron / Coolify schedule: günde ≥1 (UTC sabahı önerilir)
- [ ] Çıktı gzip + tarih damgası
- [ ] Sunucu dışı kopya (R2) — **aynı Hetzner diskinde yalnız tutma**
- [ ] İlk restore prova OK
- [ ] (İsteğe bağlı) Haftalık Hetzner server snapshot

Redis yedeği zorunlu değil (broker); kritik durum Postgres’tedir.

## Restore provası (zorunlu)

**Prova yapılmamış yedek yedek değildir.** Aylık tekrar + her major şema değişiminden sonra.

### Prosedür (staging / ayrı Postgres volume)

1. Son başarılı dump’ı sunucu dışından (R2) indir.
2. Boş bir Postgres’e yükle (prod’u ezme):

```bash
gunzip -c pg-YYYYMMDD….sql.gz | docker exec -i <restore-pg> \
  psql -U postgres -d verimaya_restore_test
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
| 2026-08-07 | `pg-dump-verimaya-1786112976.dmp` (Coolify→R2, 123K) | `verimaya_restore_test` | OK | 37 public tablo; host `pg_restore`; test DB drop edildi. Storage `verimaya-r2-pg`. |
| 2026-07-31 | `pg-20260731T143657Z.sql.gz` | `verimaya_restore_test` (aynı PG, prod dışı DB) | OK | 37 public tablo eşleşti; test DB drop edildi. Sunucu dışı kopya henüz yoktu. |

> Canlı kabul: en az **bir** OK satırı + **R2’de** kopya olmadan OPS-01 kapanmaz.

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

Owner `DATABASE_URL` ile; app runtime `DATABASE_URL_APP` kullanmaya devam eder.
veya `RUN_MIGRATIONS=true`.

## OPS-02c — Reklam harcaması `spend_base` backfill

`ad_metrics_daily` satırları `currency` taşıyor ama yabancı para (ör. TRY Ads → GBP tenant)
için `spend_base` boşsa ROAS **"Kur bilgisi eksik"** gösterir. Bu script Frankfurter
**tarihsel** ECB kurunu bir kez yazar (canlı çevirici değil — `doviz.md` snapshot kuralı).

**Coolify — API container Terminal:**

```bash
# Dry-run: ne yazacağını gösterir, DB'ye yazmaz
node scripts/backfill-ad-spend-fx.js --tenant-id <TENANT_UUID>

# Uygula (idempotent: spend_base dolu satırlara dokunmaz)
node scripts/backfill-ad-spend-fx.js --apply --tenant-id <TENANT_UUID>

# Opsiyonel tarih penceresi
node scripts/backfill-ad-spend-fx.js --apply --tenant-id <TENANT_UUID> \
  --from 2026-04-08 --to 2026-08-01
```

Repo kökünden lokal (yalnız test DB — prod URL'ye lokalden yazma):

```bash
pnpm --filter @verimaya/api ads:fx-backfill -- --tenant-id <uuid>
pnpm --filter @verimaya/api ads:fx-backfill -- --apply --tenant-id <uuid>
```

Env: `DATABASE_URL_APP` (RLS). Hafta sonu/tatil için Frankfurter son ECB gününü döner;
gerçek fetch hatasında satır atlanır ve `missing_rate_keys` raporlanır.
