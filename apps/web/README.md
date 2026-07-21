# Verimaya Web

SvelteKit SPA (Svelte 5 runes). Faz 0a'da tüm `/v1/*` istekleri MSW ile mock'lanır; Faz 0b'den itibaren gerçek NestJS API'ye geçilebilir.

## Ortam değişkenleri

`apps/web/.env.example` dosyasını `.env` olarak kopyalayın:

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PUBLIC_API_URL` | `http://localhost:3000` | NestJS API kökeni |
| `PUBLIC_USE_MSW` | `true` | `true`: dev'de MSW mock; `false`: gerçek API |

## MSW kapalı mod — kontrol listesi

Gerçek API ile çalışmak için sırayla:

- [ ] **Altyapı:** repo kökünde `docker compose up -d` (Postgres + Redis)
- [ ] **Migrasyon:** `pnpm --filter @verimaya/api db:migrate`
- [ ] **API:** `pnpm --filter @verimaya/api dev` → `http://localhost:3000` (health + auth hazır)
- [ ] **Web `.env`:** `PUBLIC_API_URL=http://localhost:3000` ve `PUBLIC_USE_MSW=false`
- [ ] **Web dev:** `pnpm --filter @verimaya/web dev` → `http://localhost:5173`
- [ ] **Giriş:** `/giris` — better-auth (`/v1/auth/*`), oturum çerezi `credentials: include` ile API'ye gider
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
