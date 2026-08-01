# Static deploy (Coolify / Cloudflare / nginx)

`adapter-static` + `fallback: index.html` — çıktı: `apps/web/build/`.

Public rotalar (`(public)/`, örn. `/vitrin/`) **prerender** edilir → `build/vitrin/index.html`.
Panel rotaları SPA fallback’e düşer → `build/index.html` (`noindex`).

## Kritik: `try_files` sırası

SPA fallback (`-s` / `try_files … /index.html`) **prerender dosyasından önce** çalışırsa
`/vitrin` isteği boş SPA kabuğuna gider; SEO içeriği kaybolur.

Doğru sıra (prerender önce, fallback en sonda):

```nginx
try_files $uri $uri/index.html $uri/ /index.html;
```

| İstek | Eşleşme |
|---|---|
| `/vitrin` veya `/vitrin/` | `$uri/index.html` → `vitrin/index.html` |
| `/patients` | dosya yok → `/index.html` (SPA) |
| `/robots.txt` | `$uri` → `robots.txt` |

`npx serve … -s` bu sırayı garanti etmez; lokal doğrulama için aşağıdaki nginx
örneğini veya `pnpm --filter @verimaya/web preview` kullan.

## Coolify (önerilen)

1. Yeni **Static Site** servisi; repo kökü build context.
2. **Build command:** `pnpm install --frozen-lockfile && pnpm --filter @verimaya/web build`
3. **Publish directory:** `apps/web/build`
4. Ortam: `PUBLIC_API_URL=https://api…`, `PUBLIC_USE_MSW=false`
5. SPA + prerender: nginx/Caddy kuralında yukarıdaki `try_files` sırası (Coolify static
   şablonu yalnızca `$uri $uri/ /index.html` ise ` $uri/index.html` eklenmeli).

## nginx (`apps/web/Dockerfile` + `nginx.conf`)

Coolify **Application** (önerilen — `try_files` sırası garantili):

| Ayar | Değer |
|---|---|
| Dockerfile | `apps/web/Dockerfile` |
| Build context | monorepo kökü |
| Port | `80` |
| Domain | `verimaya.com` + `app.verimaya.com` (aynı imaj); nginx apex `/` → hub.html |
| Build args | `PUBLIC_API_URL`, `PUBLIC_SITE_URL`, `PUBLIC_APP_URL`, `PUBLIC_CRM_URL`, `PUBLIC_USE_MSW=false` |

```bash
docker build -f apps/web/Dockerfile \
  --build-arg PUBLIC_API_URL=https://api.verimaya.com \
  --build-arg PUBLIC_SITE_URL=https://verimaya.com \
  --build-arg PUBLIC_APP_URL=https://app.verimaya.com \
  --build-arg PUBLIC_CRM_URL=https://crm.verimaya.com \
  --build-arg PUBLIC_USE_MSW=false \
  .
```

## Cloudflare Pages

Build: `pnpm --filter @verimaya/web build` · Output: `apps/web/build` · `PUBLIC_*` build-time env.

Cloudflare Pages varsayılanı çoğu dosyayı doğru servis eder; `_redirectes` / SPA fallback
ekliyorsan prerender path’lerini (`/vitrin`, `/vitrin/`) istisna tut.

## Doğrulama

```bash
pnpm --filter @verimaya/web build
# prerender içeriği:
grep -c "Hasta yolculuğunu" apps/web/build/vitrin/index.html   # >= 1
test -f apps/web/build/yapay-zeka-karnesi/index.html
# SPA kabuğunda noindex (postbuild inject — layout head fallback'te render olmaz):
grep -c "noindex" apps/web/build/index.html                   # >= 1
# public prerender noindex taşımamalı:
grep -c "noindex" apps/web/build/vitrin/index.html || true    # 0
grep -c "noindex" apps/web/build/yapay-zeka-karnesi/index.html || true  # 0
curl -s https://<host>/robots.txt
curl -s https://<host>/sitemap.xml
# Canlı (Adım 31): docs/DEPLOY-COOLIFY.md § Canlı kabul
curl -sS https://<host>/vitrin | grep -q "Hasta yolculuğunu"
curl -sS https://<host>/yapay-zeka-karnesi | grep -qiE "karne|yapay"
```

Panel rotalarında kök layout da client-side `<meta name="robots" content="noindex">`
ekler (SPA navigasyon); ilk HTML cevabı için `scripts/inject-spa-noindex.mjs` şarttır.
