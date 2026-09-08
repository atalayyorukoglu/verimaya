# Verimaya iOS

SwiftUI panel uygulaması. Arayüz web panelinin **kodu okunarak** çıkarıldı
(ekran görüntüsünden değil); veri gerçek `/v1` uçlarından gelir.

Önceki deneme `archive/ios-v1` altında; bırakılma gerekçesi ve tekrarlanmaması
gereken sekiz hata: `archive/ios-v1/ARSIV.md`. **Sekizi de bu sürümde geçerli.**

## Kaynak eşlemesi

| iOS | Web / sözleşme karşılığı |
| --- | --- |
| `Shell/RootView.swift` | `lib/components/AppShell.svelte` (+ oturum kapısı) |
| `Shell/AppState.swift` | `lib/navigation.ts` (`mobileTabItems`), `lib/period-range.ts` |
| `Shell/PeriodPicker.swift` | `lib/components/HeaderPeriodPicker.svelte` |
| `Shell/SearchSheet.swift` | `lib/components/CommandPalette.svelte` |
| `Auth/AuthAPI.swift` | `lib/auth.ts`, `lib/auth-org.ts` (better-auth) |
| `Auth/SessionStore.swift` | `lib/query-scope.svelte` + oturum akışı |
| `Networking/APIClient.swift` | `lib/api.ts` (`apiGet`/`apiSend`, hata gövdesi) |
| `Networking/Endpoints.swift` | `packages/shared/src/api.ts` + `list-query.ts` |
| `Data/Models.swift` | `packages/shared` şemaları |
| `Stores/*.swift` | sayfa başına TanStack Query kullanımı |
| `Screens/*.swift` | `routes/contacts`, `appointments`, `finance`, `finance/ai-transaction`, `reports`, `account` |
| `Design/Tokens.swift` | `docs/TASARIM.md`, `routes/layout.css` |
| `Design/Formatters.swift` | `lib/format.ts` |
| `Design/Strings.swift` | `lib/i18n/messages.ts` (tr), `packages/shared/src/labels.ts` |

Responsive sınıflarda **mobil** hâl esas alındı (`md:` öncesi; `max-md:hidden`
alınmadı, `md:hidden` alındı).

## Sunucu adresi

Sıra **bilinçli** (`Config/AppConfig.swift`):

1. `VERIMAYA_API_URL` ortam değişkeni — yalnız Xcode / test koşucusundan.
2. Info.plist `VerimayaAPIURL` — derlemeye gömülü (`VERIMAYA_API_URL_DEFAULT`,
   varsayılan `https://api.verimaya.com`).
3. `http://localhost:3001` — son çare. Yerel API **3001**'de, 3000'de değil.

Ana ekrandan açılan uygulamada ortam değişkeni yoktur; 2. adım olmazsa uygulama
cihazda localhost'a bağlanır ve hiçbir şey yüklenmez.

## Giriş

Birincil yol better-auth e-posta/şifre:

1. `POST /v1/auth/sign-in/email` — gövde **camelCase**, `Origin: verimaya://ios`
   başlığı **zorunlu** (sunucunun `TRUSTED_ORIGINS` listesinde tanımlı).
2. Jeton **`set-auth-token` yanıt başlığından** alınır. Gövdedeki `token` alanı
   kısa oturum kimliğidir ve Bearer olarak kabul edilmez.
3. `GET /v1/auth/organization/list` → `POST /v1/auth/organization/set-active`.
   **Bu adım atlanamaz:** aktif organizasyon yokken her liste ucu
   `active_organization_required` döner (canlıya karşı doğrulandı).
4. `GET /v1/me` — **düz** nesne (`email`, `display_name`, `tenant_id`, `role`,
   `preferences`); `user`/`session` sarmalayıcısı yok.

Jeton Keychain'de saklanır, açılışta `/v1/me` ile sınanır. 401 → oturum düşer,
giriş ekranına dönülür.

Yedek yol: `vk_` ile başlayan API anahtarı; `/v1/contacts?limit=1` ile doğrulanır.

## Sözleşme kuralları (kodda uygulanan)

- **Sayaçlar sunucudan.** Liste zarfı `{items, next_cursor, total_count}`;
  ekrandaki sayaç `total_count`. Randevu zarfı `total_count` TAŞIMAZ — sayaç
  `status_counts` toplamıdır (web de öyle yapıyor).
- **Süzgeçler sunucuda.** `q`, `from`, `to`, `kind`, `status`, `type_id`,
  `appointment_type` sorgu dizesine gider. Şemalar `.strict()`: bilinmeyen
  anahtar da **boş değer de** 400 döndürür — bu yüzden boş parametre hiç
  yazılmaz (`APIClient.appendIfPresent`, tek nokta).
- **Zaman aşımı:** istek 20 sn, kaynak 30 sn, `waitsForConnectivity = false`.
  `URLError` (timedOut / cannotConnectToHost / networkConnectionLost /
  notConnectedToInternet …) → tek mesaj: *"Sunucuya ulaşılamıyor. Bağlantını
  kontrol et; sunucu bakımda olabilir."*
- **Kişi yazma:** `first_name` + `last_name` gönderilir, `display_name`
  GÖNDERİLMEZ (sunucu türetir). Yeni kişide `contact_type_id` zorunlu; durum
  opsiyonel ve yalnız Hasta tipinde. Varsayılan tür süzgeci "Hasta" — sabit UUID
  değil, ADA göre bulunur (kimlik kiracıya özel).
- **WhatsApp gelen kutusu zarfı `messages`**, `items` değil.
- **Mutasyonlarda `Idempotency-Key`** (AGENTS.md ilke 3).
- Tutarlılık uyarısı metni sunucudan değil, `message_key` ile **katalogdan**
  çözülür.

## Derleme ve test

```bash
cd apps/ios
xcodegen generate
xcodebuild build -scheme Verimaya \
  -destination 'platform=iOS Simulator,id=<udid>' \
  -derivedDataPath /tmp/vm-dd CODE_SIGNING_ALLOWED=NO
```

Birim testleri (ağ istemez):

```bash
xcodebuild test -scheme Verimaya -only-testing:VerimayaTests \
  -destination '…' -derivedDataPath /tmp/vm-dd CODE_SIGNING_ALLOWED=NO
```

UI testleri **canlı API ister**. Değişkenler `TEST_RUNNER_` önekiyle geçirilir —
XCUITest koşucusu ayrı bir süreçtir, öneksiz değişken ona ulaşmaz:

```bash
cd /Users/pablofixrav/Projects/verimaya && pnpm dev:api   # 3001

TEST_RUNNER_VERIMAYA_API_URL=http://localhost:3001 \
TEST_RUNNER_VERIMAYA_UITEST_EMAIL=ios-test@verimaya.local \
TEST_RUNNER_VERIMAYA_UITEST_PASSWORD='…' \
xcodebuild test -scheme Verimaya -destination '…' \
  -derivedDataPath /tmp/vm-dd CODE_SIGNING_ALLOWED=NO
```

Değişken yoksa canlı testler **atlanır** (CI Node tarafında koşuyor, bunları
görmüyor).

### Regresyon testleri (`VerimayaUITests/LiveAPIUITests.swift`)

Üçü de gerçekten yaşanmış hataları koruyor:

1. `testSignInReachesTabsWithoutRawServerError` — giriş sonrası sekmeler geliyor
   ve ekranda "Cannot GET" / ham `/v1/` yolu **yok**.
2. `testContactsCountComesFromTotalCountNotLoadedRows` — sayaç sunucudaki
   `total_count` ile birebir (yüklü satır sayısı değil).
3. `testUnreachableServerReleasesScreenWithin30Seconds` — ulaşılamayan sunucuda
   ekran 30 sn içinde serbest kalıyor. Kimlik bilgisi istemez.

### Ekran görüntüsü almak

`VerimayaUITests/ScreenshotUITests.swift` giriş yapıp her sekmenin görüntüsünü
`.xcresult` içine ek olarak yazar:

```bash
xcodebuild test -scheme Verimaya \
  -only-testing:VerimayaUITests/ScreenshotUITests \
  -resultBundlePath /tmp/vm-shots.xcresult …
xcrun xcresulttool export attachments \
  --path /tmp/vm-shots.xcresult --output-path <klasör>
```

`simctl io screenshot` tek başına yetmiyor: giriş yapılmış oturum gerekiyor ve
imzasız simülatör kurulumunda Keychain kaydı yeniden kurulumda kalmıyor.

DEBUG derlemesinde başlangıç sekmesi launch argümanıyla da verilebilir
(`-vm-tab`, `-vm-route`, `-vm-menu`, `-vm-account-menu`, `-vm-theme`);
sürüm derlemesinde bu kod yoktur.

## Web'de olup burada bilerek OLMAYANLAR

Kural: karşılığı olmayan düğme konmaz (arşiv dersi #8).

| Web | Neden yok |
| --- | --- |
| **Taslak onayı** (`approve-drafts`) | Her taslak için kur, ödeme durumu, ödenen tutar ve karşı taraf zorunlu; o form ayrı bir iş. Ekran taslakları gösterir, onaylamaz. |
| **Şifre değiştirme** (`/account`) | better-auth `change-password` ayrı bir akış (mevcut şifre + diğer oturumları kapatma). Çalışmayan form yerine yokluk. |
| **Yenilikler** (`/changelog`) ve zil | Changelog ekranı yok. |
| Menüde **Araçlar / Kaynaklar / Sistem** (`/toolkit`, `/maya`, `/knowledge`, `/settings`, `/dev`) | Bu ekranların hiçbiri kapsamda değil; çekmecede yalnız "Ürünler". |
| **Sunucu tarafı çift kayıt taraması** | "Çift kayıt tara" yüklü sayfada ad benzerliğine bakar; sunucu ucu ayrı. |
| `/finance/commissions` ayrı sayfası | "Hakediş" düğmesi bakiye yüzeyini açar. |
| Raporlarda **karşılaştırma** (`compare=previous`), **hekim kırılımı**, **sorumlu bazlı gider** | Uçlar var ama ekranda yer kazanmıyor; sonraki tur. |
| **Kişi kartı** (`/contacts/[id]`) zaman çizgisi | Ayrı ve büyük ekran. |
| **PWA bandı, demo/MSW anahtarı, masaüstü sidebar, tablo görünümleri** | Tarayıcıya özgü ya da `md:` üstü. |

## Farkında olunan diğer farklar

- **Font:** web'de Inter, burada sistem fontu (SF). Ölçüler aynı.
- **Arama:** kişi/işlem sunucuda `q` ile aranır; randevu ucu kişi adını
  `contact_involves` ile arar, bu turda son randevular kişi adına göre daraltılır.
- **Saat dilimi:** biçimlendiriciler `Europe/Istanbul` sabitlenmiş
  (`VMFormat.timeZone`); web tarayıcının yerel dilimini kullanır.
- **`MockData.swift` duruyor** ama ekranlar ondan beslenmiyor — SwiftUI
  önizlemeleri ve birim testleri için.
