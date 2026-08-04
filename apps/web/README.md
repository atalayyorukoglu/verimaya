# Verimaya Web

SvelteKit SPA (Svelte 5 runes). Varsayılan olarak gerçek NestJS API'ye bağlanır; API çalıştırmadan demo görmek için MSW'yi elle açabilirsiniz (`PUBLIC_USE_MSW=true` — tüm `/v1/*` istekleri mock'lanır, faker ile şemadan veri üretilir).

## Ortam değişkenleri

`apps/web/.env.example` dosyasını `.env` olarak kopyalayın:

| Değişken         | Varsayılan              | Açıklama                                                           |
| ---------------- | ----------------------- | ------------------------------------------------------------------ |
| `PUBLIC_API_URL` | `http://localhost:3000` | NestJS API kökeni                                                  |
| `PUBLIC_USE_MSW` | `false`                 | `false`: gerçek API; `true`: API'siz demo — dev'de MSW mock açılır |

## API'siz demo (MSW)

API çalıştırmadan arayüzü görmek için `apps/web/.env`'de `PUBLIC_USE_MSW=true` set edip `pnpm --filter @verimaya/web dev` çalıştırın; alt çubukta demo senaryo/rol seçicisi görünür.

## Gerçek API modu — kontrol listesi

`PUBLIC_USE_MSW=false` (varsayılan) ile çalışmak için sırayla:

- [ ] **Altyapı:** repo kökünde `docker compose up -d` (Postgres + Redis)
- [ ] **Migrasyon:** `pnpm --filter @verimaya/api db:migrate`
- [ ] **API:** `pnpm --filter @verimaya/api dev` → `http://localhost:3000` (health + auth hazır)
- [ ] **Web `.env`:** `PUBLIC_API_URL=` (boş — Vite `/v1` proxy), `PUBLIC_USE_MSW=false`, `PUBLIC_SITE_URL=http://localhost:5173`, `PUBLIC_APP_URL=http://app.localhost:5173`
- [ ] **API `.env`:** `TRUSTED_ORIGINS` içinde `http://localhost:5173` ve `http://app.localhost:5173`
- [ ] **Web dev:** `pnpm --filter @verimaya/web dev` → hub `http://localhost:5173`, panel/login `http://app.localhost:5173`
- [ ] **Giriş:** `http://app.localhost:5173/login` — better-auth (`/v1/auth/*`), oturum çerezi `credentials: include` ile API'ye gider
- [ ] **Organizasyon:** oturumda aktif org yoksa giriş sonrası org seçimi veya ilk org oluşturma ekranı gelir (`authClient.organization.list` / `setActive`)
- [ ] **Doğrulama:** hasta/kişi listeleri, çift kayıt tarama (`/kisiler/cift-kayit`, `/hastalar/cift-kayit`) gerçek `/v1/.../duplicate-groups` ve merge endpoint'lerine gider

MSW kapalıyken alt çubuktaki demo senaryo/rol seçicisi görünmez.

## Geliştirme

```bash
pnpm --filter @verimaya/web dev
pnpm --filter @verimaya/web check
pnpm --filter @verimaya/web build
```

## Mimari notlar

- API istemcisi: `src/lib/api.ts` — `resolveApiUrl`, `credentials: 'include'`
- Auth istemcisi: `src/lib/auth.ts` — better-auth + organization + 2FA
- Org akışı: `src/lib/auth-org.ts` — giriş sonrası aktif tenant
- Path sabitleri: `packages/shared` (`apiPaths`, `listUrl`)
- TanStack Query; doğrudan `fetch` bileşenlerde kullanılmaz
