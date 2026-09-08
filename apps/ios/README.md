# Verimaya iOS — mockup arayüz

**Bu teslimde ağ katmanı YOK.** Hiç HTTP isteği atılmaz, `URLSession` kullanılmaz,
API modeli yoktur. Bütün ekranlar `Verimaya/Data/MockData.swift` içindeki sahte
veriyle çalışır. Amaç görünümü onaylatmak; ağ katmanı sonraki turda eklenecek.

Önceki deneme `archive/ios-v1` altında (bırakılma gerekçesi ve tekrarlanmaması
gereken sekiz hata: `archive/ios-v1/ARSIV.md`).

## Kaynak

Arayüz **web panelinin kodu okunarak** çıkarıldı, ekran görüntüsünden değil.
Her dosyanın başındaki yorum hangi web dosyasının karşılığı olduğunu söyler:

| iOS | Web karşılığı |
| --- | --- |
| `Shell/RootView.swift` | `lib/components/AppShell.svelte` |
| `Shell/AppState.swift` | `lib/navigation.ts` (`mobileTabItems`), `lib/period-range.ts` |
| `Shell/PeriodPicker.swift` | `lib/components/HeaderPeriodPicker.svelte`, `PeriodSelector.svelte` |
| `Shell/SearchSheet.swift` | `lib/components/CommandPalette.svelte` |
| `Components/StatusBadge.swift` | `lib/components/StatusBadge.svelte`, `lib/status-tone.ts` |
| `Components/Controls.swift` | `lib/components/PageHeader.svelte`, `ui/button`, `filterFieldClass` |
| `Screens/ContactsView.swift` | `routes/contacts/+page.svelte` |
| `Screens/AppointmentsView.swift` | `routes/appointments/+page.svelte` |
| `Screens/FinanceView.swift` | `routes/finance/+page.svelte`, `BalancesPanel.svelte` |
| `Screens/AITransactionView.swift` | `routes/finance/ai-transaction/+page.svelte` |
| `Screens/ReportsView.swift` | `routes/reports/+page.svelte` |
| `Screens/AccountView.swift` | `routes/account/+page.svelte` |
| `Design/Tokens.swift` | `docs/TASARIM.md`, `routes/layout.css` |
| `Design/Formatters.swift` | `lib/format.ts` |
| `Design/Strings.swift` | `lib/i18n/messages.ts` (tr), `packages/shared/src/labels.ts` |

Responsive sınıflarda **mobil** hâl esas alındı: `md:` öncesi görünüm,
`max-md:hidden` olan öğeler alınmadı, `md:hidden` olanlar alındı.

## Derleme

```bash
cd apps/ios
xcodegen generate
xcodebuild build -scheme Verimaya \
  -destination 'platform=iOS Simulator,id=<simulator-udid>' \
  -derivedDataPath /tmp/vm-dd CODE_SIGNING_ALLOWED=NO
xcodebuild test  -scheme Verimaya -destination '…' -derivedDataPath /tmp/vm-dd CODE_SIGNING_ALLOWED=NO
```

`Verimaya.xcodeproj` üretilmiş dosyadır; elle düzenlenmez, `project.yml` düzenlenir.

## Ekran görüntüsü almak

DEBUG derlemesinde başlangıç durumu launch argümanıyla verilebilir
(`AppState.applyLaunchArguments`), böylece her ekranın görüntüsü elle
dokunmadan alınır:

```bash
xcrun simctl launch <udid> com.verimaya.app -vm-tab reports
xcrun simctl launch <udid> com.verimaya.app -vm-tab finance -vm-route ai
xcrun simctl launch <udid> com.verimaya.app -vm-tab contacts -vm-account-menu 1
xcrun simctl launch <udid> com.verimaya.app -vm-theme dark
xcrun simctl io <udid> screenshot cikti.png
```

Bayraklar: `-vm-tab finance|contacts|appointments|reports`,
`-vm-route ai|account`, `-vm-menu 1`, `-vm-account-menu 1`, `-vm-theme light|dark`.
Sürüm derlemesinde bu kod yoktur.

## Web'de olup burada bilerek OLMAYANLAR

Kural: karşılığı olmayan düğme konmaz. Aşağıdakiler ya sunucu ister ya da
mockup'ta bir ekran karşılığı yok — o yüzden düğmesi de yok.

| Web | Neden yok |
| --- | --- |
| Zil / **Yenilikler** (`/changelog`) | Changelog ekranı yazılmadı; ölü düğme olurdu. |
| **Çıkış yap** | Oturum yok (ağ katmanı yok), basınca gidecek bir giriş ekranı yok. |
| **Organizasyon değiştir** | Tek sahte tenant var; seçenek listesi tek satır olurdu. |
| Menüde **Araçlar / Kaynaklar / Sistem** grupları (`/toolkit`, `/maya`, `/knowledge`, `/settings`, `/dev`) | Bu ekranların hiçbiri mockup kapsamında değil. Menüde yalnız "Ürünler" grubu var. |
| **PWA kurulum bandı** | Tarayıcıya özgü (`beforeinstallprompt`); iOS'ta karşılığı yok. |
| **Demo bandı / MSW anahtarı** | Web'in geliştirme aracı. |
| Masaüstü **sidebar**, ⌘K rozeti, tablo görünümleri | Web'de `md:` üstü; mobil hâl esas alındı. |
| `/finance/commissions` ayrı sayfası | "Hakediş" düğmesi bakiye listesini açar — iki ayrı yüzey yerine tek yüzey. |
| Raporlarda **önceki döneme göre** karşılaştırma (`compare=previous`) | Sunucu hesabı; sahte veride anlamlı bir "önceki dönem" farkı yok. |
| Raporlarda **hekim kırılımı**, **sorumlu bazlı gider**, gerçek **ROAS** | Sunucu uçlarından gelir; mockup'ta hesaplanamıyor (Pazarlama sekmesi web'deki "veri yok" hâlini gösterir). |
| Kişi kartı (`/contacts/[id]`) zaman çizgisi | Ayrı ve büyük bir ekran; bu turun kapsamı liste + kabuk. |

## Farkında olunan diğer farklar

- **Font:** web'de Inter (self-host), burada sistem fontu (SF). Ölçüler
  (14/12/16/18 pt) web'deki `text-sm`/`text-xs`/`text-base`/`text-lg` ile aynı.
- **Sayaçlar:** web'de sunucudan `total_count` gelir (arşiv dersi #1). Ağ
  olmadığı için burada sayaç veri kümesinin tamamını sayar — yüklü sayfayı değil.
- **Süzgeçler:** web'de sunucuda uygulanır (arşiv dersi #2). Mockup'ta istemcide
  uygulanıyor; ağ katmanı gelince süzgeç parametreleri sorguya taşınacak.
- **Saat dilimi:** biçimlendiriciler `Europe/Istanbul` sabitlenmiş
  (`VMFormat.timeZone`); web tarayıcının yerel dilimini kullanır.
