# Verimaya iOS

Native SwiftUI app (iOS 17+) for the Verimaya operations panel. Mirrors the
TickPort iOS architecture: XcodeGen, APIClient networking, MainTabView,
Theme.swift warm neutrals, demo/api-key fallback auth.

## Generate & open

```bash
cd apps/ios
xcodegen generate
open Verimaya.xcodeproj
```

Select the **Verimaya** scheme, set your signing team, then Run.

## Environment

| Variable | Purpose |
|----------|---------|
| `VERIMAYA_API_URL` | API root (default `http://localhost:3000`) |

## Auth

- **Primary:** email/şifre → better-auth `set-auth-token` → Keychain → `Authorization: Bearer <token>`.
- **Fallback:** paste a `vk_...` API key (machine-to-machine, single tenant).

## Structure (v1)

Hastalar · Randevular · Finans · Raporlar (Gerçek ROAS) + Ayarlar. Full CRUD.
