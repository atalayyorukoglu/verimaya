# Static deploy (Coolify / Cloudflare)

`adapter-static` + `fallback: index.html` — çıktı: `apps/web/build/` (SvelteKit build).

## Coolify (önerilen)

1. Yeni **Static Site** servisi; repo kökü build context.
2. **Build command:** `pnpm install --frozen-lockfile && pnpm --filter @verimaya/web build`
3. **Publish directory:** `apps/web/build`
4. Ortam: `PUBLIC_API_URL=https://api…`, `PUBLIC_USE_MSW=false`
5. SPA fallback: Coolify/nginx `try_files $uri $uri/ /index.html` (genelde static site şablonunda hazır).

## Alternatif: nginx Dockerfile

Monorepo kökünden:

```dockerfile
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @verimaya/web build

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/build /usr/share/nginx/html
EXPOSE 80
```

`apps/web/nginx.conf` — yalnız ihtiyaç halinde eklenir; Coolify static çoğu senaryoda yeterli.

## Cloudflare Pages

Build: `pnpm --filter @verimaya/web build` · Output: `apps/web/build` · `PUBLIC_*` build-time env.
