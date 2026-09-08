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

Hastalar · Randevular · Finans · **AI işlem** · Raporlar (Gerçek ROAS) + Ayarlar. Full CRUD.

Altı sekme olduğu için iOS son ikisini "Daha Fazla" altına alıyor (Raporlar,
Ayarlar). Beş görünür sekme isteniyorsa Ayarlar'ı sekme çubuğundan çıkarmak
gerekir — bilinçli olarak yapılmadı, ürün kararı.

### AI işlem (WhatsApp gelen kutusu)

`Inbox/` — mesajları listele → ayrıştır → taslakları onayla. Onay para yolu
(MONEY-01): ödeme durumu, ödenen tutar, kur ve karşı taraf açıkça sorulur;
`DraftForm.problem(...)` sunucudaki `approveDraftItemSchema` kurallarını
yansıtır, geçersiz istek gönderilmez. AI-13 "Aynı olay olabilir" uyarısı
sunucunun `group_id` alanından gelir.

## Test

```bash
xcodebuild test -scheme Verimaya -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

Birim testleri API'siz koşar. `VerimayaUITests` canlı bir API ister ve
değişken verilmezse **atlanır**:

```bash
TEST_RUNNER_VERIMAYA_API_URL=http://localhost:3001 \
TEST_RUNNER_VERIMAYA_UITEST_EMAIL=... \
TEST_RUNNER_VERIMAYA_UITEST_PASSWORD=... \
xcodebuild test -scheme Verimaya -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

`TEST_RUNNER_` öneki şart: XCUITest koşucusu ayrı bir süreç, öneksiz değişken ona geçmiyor.
