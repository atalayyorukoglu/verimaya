# Verimaya Web

SvelteKit SPA (Svelte 5 runes). Faz 0a'da tüm `/v1/*` istekleri MSW ile mock'lanır; Faz 0b'den itibaren gerçek NestJS API'ye geçilebilir.

## Ortam değişkenleri

`apps/web/.env.example` dosyasını `.env` olarak kopyalayın:

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PUBLIC_API_URL` | `http://localhost:3000` | NestJS API kökeni |
| `PUBLIC_USE_MSW` | `true` | `true`: dev'de MSW mock; `false`: gerçek API |

### MSW'yi kapatıp gerçek API'ye bağlanmak

1. Postgres + Redis: repo kökünde `docker compose up -d`
2. API migrasyon: `pnpm --filter @verimaya/api db:migrate`
3. API sunucusu: `pnpm --filter @verimaya/api dev` → `http://localhost:3000`
4. Web `.env`:

```bash
PUBLIC_API_URL=http://localhost:3000
PUBLIC_USE_MSW=false
```

5. Web dev: `pnpm --filter @verimaya/web dev` → `http://localhost:5173`

Giriş: `/giris` (better-auth, `/v1/auth/*`). Oturum çerezi `credentials: include` ile API'ye gider.

Demo modunda (`PUBLIC_USE_MSW=true`) alt çubuktaki MSW senaryosu ve demo rol seçicisi görünür.

## Geliştirme

```bash
pnpm --filter @verimaya/web dev
pnpm --filter @verimaya/web check
pnpm --filter @verimaya/web build
```

## Mimari notlar

- API istemcisi: `src/lib/api.ts` — `resolveApiUrl`, `credentials: 'include'`
- Auth istemcisi: `src/lib/auth.ts` — better-auth + organization + 2FA
- Path sabitleri: `packages/shared` (`apiPaths`, `listUrl`)
- TanStack Query; doğrudan `fetch` bileşenlerde kullanılmaz
