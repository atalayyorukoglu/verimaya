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
- **Origin değişimi = API restart** (AUDIT-F09-20, bilinçli): `corsOrigins` (`main.ts`) ve
  better-auth `trustedOrigins` env’i boot’ta okur. Allowlist kurulum geneli (panel tek
  host); tenant’a özel değil. Coolify’da env güncelle → API redeploy/restart. Runtime /
  DB hot-reload yok — güvenlik sınırı env + deploy (AUDIT-REPORT: «Fix: None required»).

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
| `ADMIN_QUEUE_TOKEN` | Bull Board + outbox DLQ admin; boş bırakma |
| `PLATFORM_ADMIN_EMAILS` | Süper admin allowlist (virgülle). Örn. `you@example.com` — `/v1/platform/*` + panel `/dev`. Boşsa kimse platform paneline giremez |
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
| `TRUST_PROXY` | Fastify `req.ip` / log için hop güveni. **Prod: `1`** (Coolify/Traefik tek hop). Varsayılan kapalı. Kör `true` koyma — sahte `X-Forwarded-For` ile kova aşılır. Rate-limit anahtarı için hop sayısını artırma (`2` vb.); Cloudflare öndeyse `TRUST_CF_CONNECTING_IP` tercih edilir (edge IP’ye takılmayı ve saldırgan XFF’ini önler). Alternatif: docker proxy CIDR (ör. `172.16.0.0/12`) |
| `TRUST_CF_CONNECTING_IP` | Rate-limit anahtarını `CF-Connecting-IP`’den çöz. **Prod (Cloudflare önde): `true`**. Varsayılan kapalı — origin’e doğrudan erişilebilirse başlık uydurulup limit aşılır. Yalnızca Cloudflare’in origin’e ulaştığı ve başlığı ezdiği kurulumda aç. |

Opsiyonel: `LLM_*`, Ads OAuth (`META_*`, `GOOGLE_ADS_*`).
Meta Ads canlı: `docs/ADS-META-GOLIVE.md` (redirect URI = `{ADS_OAUTH_REDIRECT_BASE}/v1/integrations/ads/meta/callback`).

### Outbox DLQ (AUDIT-F09-05)

Bull Board’un yanındaki operatör uçları: aynı `X-Admin-Queue-Token` header
(`ADMIN_QUEUE_TOKEN`). `status='dead'` satırları listeler / yeniden kuyruğa alır
(`attempts` korunur).

```bash
# Ölü satırları gör
curl -sS -H "X-Admin-Queue-Token: $ADMIN_QUEUE_TOKEN" \
  "https://api.example/v1/admin/queue/outbox/dead?limit=50"

# Tenant bazlı requeue
curl -sS -X POST -H "X-Admin-Queue-Token: $ADMIN_QUEUE_TOKEN" \
  -H "content-type: application/json" \
  -d '{"tenant_id":"<uuid>","limit":20}' \
  "https://api.example/v1/admin/queue/outbox/requeue"
```

Zamanlanmış işler tükenince `jobs` tablosunda `status='dead'` satırı da yazılır
(sessiz log kaybı yok).

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

## better-auth sürüm yükseltme

**Sorun:** better-auth minor sürümlerde kendi tablolarına kolon/tablo ekleyebilir.
Bizim şema `apps/api/src/db/schema/auth.ts` (Drizzle) + elle numaralı SQL
(`apps/api/drizzle/0001_auth_rls.sql` ve sonrası). Prod’da “sürümü yükselttim,
API ayağa kalktı” yetmez — şema farkı migration olmadan kırılır.

**Kaynak (repo gerçeği):**

| Parça | Yer |
|---|---|
| Auth factory | `apps/api/src/auth/auth.ts` — `betterAuth` + `@better-auth/drizzle-adapter` |
| Plugin’ler | `bearer`, `organization`, `twoFactor` |
| ID biçimi | `advanced.database.generateId: 'uuid'` → PK’lar `uuid` |
| Drizzle tabloları | `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `two_factor` |
| Domain köprüsü | `tenants.id` → `organization.id` (FK); org create/update hook’ları `tenants` yazar |
| Migrate komutu | `pnpm --filter @verimaya/api db:migrate` → `drizzle-kit migrate` |
| SQL + journal | `apps/api/drizzle/NNNN_*.sql` + `apps/api/drizzle/meta/_journal.json` (son numara: journal’daki en yüksek `tag`) |
| Paketler | `apps/api`: `better-auth` + `@better-auth/drizzle-adapter`; `apps/web`: `better-auth` (client) — **üçünü birlikte** yükselt |

Auth tablolarında domain RLS **yok** (kabul: `docs/TEHDIT-MODELI.md` §1). Yeni kolon
için politika gerekmez; **yeni tablo** eklersen `verimaya_app` GRANT’siz kalır —
mevcut desen: `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE … TO verimaya_app;`
(`0003_app_role.sql` default privileges + sonraki migrasyonlardaki açık GRANT).

### Ne zaman gerekir?

| Değişiklik | Şema riski | Ne yap |
|---|---|---|
| **patch** (1.6.23 → 1.6.x patch) | Düşük; yine de changelog oku | Lockfile + smoke (aşağı) |
| **minor** (1.6 → 1.7) | Orta–yüksek; kolon/tablo sık | Bu bölümün tamamı |
| **major** (1.x → 2.x) | Yüksek; breaking API + şema | Staging’de tam regresyon; breaking notes’u satır satır |

Sürüm notlarında “database”, “schema”, “migration”, plugin tablo alanları geçiyorsa
şema farkı **varsay** — CLI ile doğrula.

### Upgrade öncesi

1. **Yedek.** Prod dump + R2 kopyası — yukarıdaki **Günlük Postgres yedeği + sunucu dışı
   kopya (OPS-01 · R2)** bölümü. Restore: **Restore provası (zorunlu)**. Major/minor
   öncesi ekstra elle backup koş (cron bekleme).
2. **Önce yerel / staging.** Prod’a doğrudan `pnpm up` yok.
3. Changelog: better-auth release notes + kullandığımız plugin’ler (`organization`, `twoFactor`).

### Şema farkını çıkarma

Resmi CLI paketi npm’de **`auth`** (docs: [CLI](https://www.better-auth.com/docs/concepts/cli)).
Komut: `generate`. **`migrate` yalnız built-in Kysely adapter içindir** — bizde Drizzle
var; `npx auth migrate` **çalıştırma** (şemayı ORM dışında direkt yazar; journal’ımızı
baypas eder).

CLI sürümünü kütüphane sürümüne **pinle** (`auth@1.6.23` gibi). `auth@latest` veya
`@better-auth/cli` (npm’de eski 1.4.x hattına kilitli kalabiliyor) hedef sürümden sapabilir —
önce kontrol et:

```bash
# Kurulu / hedef kütüphane
node -p "require('./apps/api/node_modules/better-auth/package.json').version"

# CLI sürümü = yukarıdaki major.minor.patch (ör. 1.6.23)
npx auth@1.6.23 --version
```

`createAuth()` DB’ye bağlanır (`getDb()`). Generate için geçici config veya
çalışan local Postgres + `DATABASE_URL` gerekir; yoksa CLI config’i yükleyemez.
Çıktıyı **asla** `auth.ts` üzerine doğrudan yazma — UUID PK, indeksler ve
domain ile uyumlu elle tutulan şemayı ezme riski.

```bash
# Geçici dosyaya üret (path’i doğrula; --config auth factory’nin export ettiği dosyaya işaret etmeli)
# Not: createAuth() factory ise CLI’nin beklediği `auth` export şeklini kontrol et;
# gerekirse geçici bir `auth.config.ts` ile `export const auth = createAuth()` yaz.
npx auth@1.6.23 generate \
  --config apps/api/src/auth/auth.ts \
  --output /tmp/better-auth-schema-gen.ts \
  --yes
```

Generate başarısız olursa (factory/export/DB): hedef `better-auth` sürümünün published
örnek Drizzle şemasını / adapter docs’unu hedef checkout’ta oku; yine
`apps/api/src/db/schema/auth.ts` ile kolon kolon karşılaştır — uydurma CLI flag kullanma.

Karşılaştır:

```bash
# Örnek: gen çıktısı ile mevcut şema (manuel diff de olur)
diff -u apps/api/src/db/schema/auth.ts /tmp/better-auth-schema-gen.ts | less
```

Kontrol listesi: yeni/eksik kolon, tip (`uuid` vs `text`), NOT NULL / default,
yeni tablo, index/unique, plugin alanları (`two_factor_*`, `active_organization_id`, …).
**Bizim `uuid` PK kararını bozma** — CLI metin `id` üretebilir; uyumsuzluğu migration’a
çevirirken `uuid` + mevcut veriyi koru.

### Migration yazma

1. Farkı `apps/api/src/db/schema/auth.ts` (+ gerekirse `auth.ts` adapter `schema` map) güncelle.
2. SQL: sıradaki numara = journal’daki son `NNNN` + 1 (ör. son `0032_…` ise `0033_better_auth_…sql`).
3. Ya elle `ALTER TABLE … ADD COLUMN …` yaz **ya da** şema güncelken:

```bash
pnpm --filter @verimaya/api db:generate
```

Üretilen SQL’i gözden geçir (drop/rename/text-id gibi yıkıcı diff varsa red et, elle daralt).
4. Journal: `drizzle-kit generate` yazar; elle SQL ekliyorsan `apps/api/drizzle/meta/_journal.json`
   içine yeni `tag` satırını mevcut desene uyarak ekle (eksik journal → migrate atlar veya kırılır).
5. Yeni **tablo** varsa `verimaya_app` GRANT ekle. Auth tablolarına RLS ekleme —
   TEHDIT-MODELI kabulünü bilinçli bozmadıkça dokunma.
6. Uygula (önce staging/lokal):

```bash
pnpm --filter @verimaya/api db:migrate
```

Prod: yukarıdaki **Migrasyon (tekrar)** — owner `DATABASE_URL`.

### Doğrulama

Migrate + API restart sonrası (staging’de birebir, sonra prod):

```bash
API=https://api.verimaya.com   # staging URL’inle değiştir

curl -sfS "$API/v1/health/ready"

# Auth tabloları ayakta mı (owner psql — kolon adlarını migration’a göre doğrula)
# \d "user"  /  \d session  /  \d two_factor  /  \d organization
```

Uygulama smoke (tarayıcı, `app.` host):

1. **Giriş** — e-posta/şifre (`authClient.signIn.email` → `/v1/auth/…`).
2. **Oturum** — panel açılışı; `GET /v1/me` 200 (aktif org + üyelik).
3. **2FA açıksa** — TOTP doğrulama akışı.
4. **Organizasyon** — çok üyeliğe sahipsen org seç / `setActiveOrganization`; `/v1/me` yeni tenant.
5. **Davet** — settings/team üzerinden davet oluşturma + accept (invitation tablosu).
6. **Çıkış** — `signOut` sonrası korumalı route login’e düşer.

Herhangi biri 5xx / “column does not exist” → sürümü ve migration’ı durdur; restore.

### Geri alma

Drizzle migrasyonları pratikte **down/rollback dosyası taşımıyor**. Şema değişimi
canlıyı kırdıysa:

1. API’yi önceki image / önceki `better-auth` lockfile commit’ine al.
2. Veri/şema geri alma: OPS-01 dump’tan **Restore provası** prosedürü (prod’u
   ezmeden önce staging prova). `ALTER` geri alınması karmaşıksa snapshot restore
   tek güvenilir yol.
3. Yeni migration’ı “ileride düzeltilmiş haliyle” tekrar yaz; journal’ı yarım bırakma.

### Pin politikası (karar açık)

Bugün: `better-auth` / `@better-auth/drizzle-adapter` / web `better-auth` → `^1.6.23`
(caret). `pnpm-lock.yaml` şu an **1.6.23**’e kilitli; Coolify `pnpm install` lockfile
doğruluyor — günlük deploy’da sürpriz minor gelmez.

**Risk:** birinin `pnpm update` / lockfile regenerate etmesi caret ile **1.6.x**’in
daha yenisini (şema değişmiş olabilir) alır; migration yazılmazsa prod auth kırılır.

**Öneri (package.json’a dokunulmadı — seç):**

- **Tercih:** `better-auth` + `@better-auth/drizzle-adapter` (+ web `better-auth`) için
  **exact pin** (`1.6.23`, caret yok) + bilinçli upgrade PR’ı (bu bölümün checklist’i).
  Gerekçe: auth şeması domain’den ayrı; caret’in “convenience” kazancı, tek başına
  giriş kırılmasından ucuz değil.
- **Alternatif:** caret kalsın; kural: lockfile’da `better-auth` değişen her PR’da
  zorunlu şema diff (CLI generate) + migration veya “şema değişmedi” kanıtı. Deploy
  her zaman frozen lockfile.

Kararı ürün sahibi verir; ikisinden biri yazılı süreç olmadan caret tehlikeli.

## OPS-02c — Reklam harcaması `spend_base` backfill

`ad_metrics_daily` satırları `currency` taşıyor ama yabancı para (ör. TRY Ads → GBP tenant)
için `spend_base` boşsa ROAS **"Kur bilgisi eksik"** gösterir.

**Tek kaynak:** Frankfurter **v1/ECB** tarihsel kur (`https://api.frankfurter.dev/v1`).
Ads sync yalnızca `spend_minor` + `currency` yazar — `spend_base` / `fx_*` **yazmaz**.
v2 blended API kullanılmaz (ECB’den sapabilir).

Bu script tarihsel kuru bir kez yazar (canlı çevirici değil — `doviz.md` snapshot kuralı).
**Dry-run asla yazmaz.**

**Coolify — API container Terminal:**

```bash
# Dry-run: ne yazacağını + rate_audit_sample gösterir, DB'ye yazmaz
node scripts/backfill-ad-spend-fx.js --tenant-id <TENANT_UUID>

# İlk yazım (yalnız spend_base IS NULL)
node scripts/backfill-ad-spend-fx.js --apply --tenant-id <TENANT_UUID>

# Yeniden yaz (şüpheli / sapmış snapshot’ları Frankfurter v1 ile düzelt)
node scripts/backfill-ad-spend-fx.js --apply --force --tenant-id <TENANT_UUID>

# Opsiyonel tarih penceresi
node scripts/backfill-ad-spend-fx.js --apply --force --tenant-id <TENANT_UUID> \
  --from 2026-04-08 --to 2026-08-01
```

Repo kökünden lokal (yalnız test DB — prod URL'ye lokalden yazma):

```bash
pnpm --filter @verimaya/api ads:fx-backfill -- --tenant-id <uuid>
pnpm --filter @verimaya/api ads:fx-backfill -- --apply --force --tenant-id <uuid>
```

Env: `DATABASE_URL_APP` (RLS). Hafta sonu/tatil için Frankfurter son ECB gününü döner;
gerçek fetch hatasında satır atlanır ve `missing_rate_keys` raporlanır.

### Yeniden sync sonrası (OPS-02c-fx)

Google Ads son günlerin maliyetini sonradan düzeltir. Sync bir satırın `spend_minor`
veya `currency` değerini değiştirirse FX snapshot'ı (`spend_base` / `base_currency` /
`fx_rate` / `fx_dated`) **otomatik null'lanır** — eski rakamdan çevrilmiş bir tutar
güncelmiş gibi raporlanmasın diye. Sonuç: o dönem için Pazarlama'da "Kur bilgisi eksik"
çıkar. **Her ads sync'ten sonra backfill'i tekrar çalıştır** (varsayılan mod yeter,
`--force` gerekmez — yalnız null satırlara bakar):

```bash
node scripts/backfill-ad-spend-fx.js --apply --tenant-id <TENANT_UUID>
```

`0032_ad_metrics_fx_coherence` bunu DB seviyesinde de garanti eder: `spend_base` varsa
`base_currency` + `fx_rate` + `fx_dated` zorunlu. Kaynağı olmayan bir çevrim — elle
SQL ile bile — tabloya giremez.

## OPS — ETL tenant operasyonel veriyi sıfırla (`etl:reset`)

`etl.js` **append-only**: `external_ids`’te eşlemesi olan kayıtlar atlanır; `--force` / update
modu yok. Dolu bir tenant’a yeniden import sessizce hiçbir şey yazmaz. Tekrar ETL
çalıştırmadan önce o tenant’ın import edilmiş operasyonel verisini hard-DELETE etmek gerekir.

Script: `apps/api/scripts/reset-tenant-data.js` (`pnpm --filter @verimaya/api etl:reset`).

**Kapsam (silinir):** `external_ids`, `case_notes`, `files`, `transactions`, `appointments`,
`patients`, `contacts`, `contact_types`, `finance_categories` — FK-güvenli sırada, tek
transaction, soft-delete satırları dahil.

**Kasıtlı korunur:** `tenants`, `tenant_settings` / credentials / provider identities,
üyeler/kullanıcılar, `api_keys`, reklam (`ad_metrics_daily`), kuyruk/outbox, skor kartı vb.
Giriş ve entegrasyon ayarları bozulmaz.

**İki bayraklı güvenlik:** varsayılan dry-run (yazmaz). Yazmak için hem `--apply` hem
`--confirm <tenant-slug>` gerekir; slug `tenants.slug` ile birebir eşleşmezse abort —
yanlış tenant silinmez.

**Coolify — API container Terminal:**

```bash
# Dry-run: tablo başına silinecek satır sayısı (DB'ye yazmaz)
node scripts/reset-tenant-data.js --tenant-id <TENANT_UUID>

# Hard-DELETE (slug tenants.slug ile aynı olmalı)
node scripts/reset-tenant-data.js --apply --confirm <TENANT_SLUG> --tenant-id <TENANT_UUID>
```

**Sıra (reset → import → doğrula):**

```bash
node scripts/reset-tenant-data.js --apply --confirm <TENANT_SLUG> --tenant-id <TENANT_UUID>
# Tracker kaynağı veya fixture — mevcut etl bayrakları
node scripts/etl.js --apply --tenant-id <TENANT_UUID> --tracker-tenant-id <TRACKER_UUID>
# veya: node scripts/etl.js --apply --tenant-id <TENANT_UUID> --fixture ./fixtures/….json
node scripts/etl-verify.js --tenant-id <TENANT_UUID>
```

Env: `DATABASE_URL_APP` (RLS). Script’i prod’a karşı çalıştırmadan önce dry-run JSON özetini
oku; `would_delete_total` beklediğin gibi değilse `--apply` verme.

## OPS — Tek ay demo tenant (`demo:seed-month`)

İkinci bir demo tenant (“Demo Tek Ay Klinik”, slug `demo-tek-ay-klinik`, `base_currency=GBP`)
üretir; yalnızca **bir takvim ayı** (varsayılan: bir önceki ay) için hasta / randevu / işlem /
günlük reklam satırları basar. Amaç Raporlar rakamlarını elle doğrulamak — veri yığını değil.

Script: `apps/api/scripts/seed-demo-month.js` (`pnpm --filter @verimaya/api demo:seed-month`).

**Özellikler:** deterministik UUID (slug’dan); sabit TRY→GBP kuru (`0.0235`, Frankfurter yok);
sonunda panel ile kıyaslanacak `beklenen` JSON (hasta, randevu completion/no-show, gelir/gider/
tahsilat base, reklam spend_base, ROAS). `--owner-email` ile `member` (role `owner`) yoksa
tenant panelde görünmez. Var olan tenant’ta yeniden basmak için `--force` (önce
`etl:reset` `DELETE_ORDER` + `ad_metrics_daily` silinir).

**Coolify — API container Terminal:**

```bash
# Dry-run: beklenen toplamlar + insert sayıları (DB'ye yazmaz)
node scripts/seed-demo-month.js
node scripts/seed-demo-month.js --month 2026-07

# Yaz (owner paneli görebilir)
node scripts/seed-demo-month.js --apply --owner-email you@example.com

# Var olan demo tenant’ı silip yeniden bas
node scripts/seed-demo-month.js --apply --force --owner-email you@example.com --month 2026-07
```

Env: `DATABASE_URL_APP` (RLS). Prod’a karşı çalıştırmadan önce dry-run `beklenen` bloğunu oku.
