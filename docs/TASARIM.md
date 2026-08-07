# Verimaya — Tasarım Sistemi

**Karar (2026-07-17, güncellendi 2026-07-20):** Panel **açık + koyu tema** (varsayılan açık), **yalnız Türkçe**. Renk paleti **TickPort / fixrav warm neutrals** (`~/Projects/tickport/poc-sveltekit/src/app.css`); layout/iskelet Cloudflare dashboard desenini korur. Eski CF turuncusu (`#F6821F`) ve soğuk gri zeminler terk edildi.

Kaynak referans: TickPort `--palette-*` → Verimaya `--brand` / `--bg` / `--surface` / … eşlemesi `apps/web/src/routes/layout.css` içinde.

## İki yüz + iki host

1. **Marketing hub (apex `verimaya.com`, login öncesi):** sıcak nötr zemin + terracotta brand gradient hero, bol alan, büyük başlıklar. Kök URL `/` — nginx `hub.html` (prerender). Public rotalar: ücretsiz karne, KVKK aydınlatma (`(public)/`, build-time prerender).
2. **Panel (`app.verimaya.com`, login sonrası):** Cloudflare dashboard düzeni — sol gruplu menü, üstte hızlı arama (⌘K), kart tabanlı içerik; **renkler TickPort paleti**. SPA fallback `index.html`, `noindex`.

Tema değiştirici üst barda (ay/güneş). Varsayılan: **açık**. Tercih `localStorage` (`verimaya:theme`) ile saklanır. **Hub dil değiştirici (2026-08-07):** apex pazarlama yüzünde TR/EN katalog + UI switcher var; panel dil değiştiricisi hâlâ kapalı (varsayılan `tr`). URL locale ağacı (`/tr/`, `/en/`) MARKET-02 sonrasına erteli — aşağıdaki “Dil ve slug”.

## Dil ve slug

**Karar (2026-07-26).** Önceki karar "yalnız Türkçe, i18n altyapısı kurulmaz" idi (2026-07-17). Değişti; eski karar silinmedi, üzerine yazıldı.

### Neden değişti

Rakip taraması, çok dilliliğin bu pazarda **ana satış argümanı** olduğunu gösterdi: Senkron.ai 50+ dil, GreftLens 9 dilde hasta formu, Estesoft çok dilli WhatsApp. Panelin fiili kullanıcısı da büyük oranda Arapça/Rusça/İngilizce konuşan satış temsilcisi. "Yalnız Türkçe" kararı tek satırla üç ayrı yüzeyi birden kapatıyordu.

Zamanlama gerekçesi: i18n iskelesini **şimdi** kurmak ucuz (ekran sayısı az), 40 ekran + iOS yazıldıktan sonra geri dönmek haftalar sürer.

### Üç yüzey, üç ayrı karar

| Yüzey | Slug dili | Locale prefix | Durum |
| --- | --- | --- | --- |
| API (`/v1/...`) | İngilizce — değiştirilemez | yok | ✅ zaten öyleydi |
| Panel (`app.verimaya.com`) | İngilizce | **yok** — dil kullanıcı tercihi | ✅ 2026-07-26'da taşındı |
| Marketing hub (apex) | her dil kendi dilinde | ileride `/tr/` + `/en/` | ✅ prerender + hub UI TR/EN; ⏸ SEO locale ağacı yok |

Panel rotası SEO taşımaz (SPA + `noindex`), dolayısıyla slug dili bir ürün kararı değil kod tutarlılığı kararıdır: şema ve tablo adları İngilizce (`Patient`, `patients`), rota da İngilizce olmalı — aksi halde kalıcı bir çeviri katmanı doğar.

### Metin nasıl yazılır

- Katalog: `apps/web/src/lib/i18n/messages.ts`. `tr` tip kaynağıdır; `en`'de eksik anahtar derleme hatası verir.
- Erişim: `import { t } from '$lib/i18n/locale.svelte'` → `t('nav.patients')`.
- `navigation.ts` etiketleri `labelKey: MessageKey` taşır, ham string taşımaz.
- Yayındaki dil `defaultLocale = 'tr'`. Hub’da dil değiştirici **açık** (UI tercihi; SEO için `/tr/`+`/en/` değil). Panelde dil değiştirici kapalı; `setLocale()` hazır.
- Mevcut ekranların Türkçe metinleri henüz kataloğa taşınmadı. Kural yeni ve dokunulan kod için bağlayıcı.

### Host, prerender ve locale sırası

**Gerçek host mimarisi (2026-08):**

- Apex `verimaya.com` / `www` → marketing hub. Nginx `/` → `hub.html` (build script'in prerender hub kopyası).
- `app.verimaya.com` → panel + auth gate (SPA `index.html`).
- Eski `/vitrin` → **301 `/`**; aktif kullanıcı rotası değil.
- `(public)/+layout.ts`: `ssr = true`, `prerender = true`. Kök layout panel için `ssr = false`, `prerender = false` kalır.
- Host yardımcıları: `apps/web/src/lib/host.ts` (`isMarketingHost` / `isAppHost`).

Prerender ön koşulu **karşılandı** — hub ve karne Google'a gerçek HTML gider. Locale/slug ağacı hâlâ kurulmadı; sıra:

1. `/tr/` ve `/en/` ağacını kur, her dil kendi slug'ıyla (`/tr/ozellikler`, `/en/features`).
2. Apex `/` için **Cloudflare'de uçta 302** yönlendirme + `hreflang`. JavaScript ile yönlendirme yapılmaz — SPA istemci yönlendirmesi SEO'yu öldürür.

Çıplak kök (`/` = tek dil, prefix'siz) bilinçli olarak seçilmedi: ikinci dil eklenince ya mevcut linkler kırılır ya aynı sayfa iki URL'de yinelenir. İkisi de prefix'li olunca "hangi dil birincil" sorusu tek satırlık bir yönlendirme kuralına iner — segment kararı (acente / klinik) verilene kadar sabitlenmez.

Pazar deseni: `planports.com/tr/...` ve `estesoft.com.tr/tr/...` — ikisi de her iki dili prefix'liyor.

## Renk token'ları (koyu tema)

Tailwind + CSS custom properties; bileşenlerde ham hex yok, daima token.

| Token | Değer | Kullanım |
|---|---|---|
| `--brand` | `#D97757` | Birincil aksiyon, aktif menü, vurgu (TickPort terracotta) |
| `--brand-hover` | `#E89274` | Hover (koyu temada açık ton) |
| `--brand-subtle` | `rgba(217,119,87,0.18)` | Aktif menü zemini, rozet zeminleri |
| `--gradient-hero` | `linear-gradient(135deg, #D97757, #E8A08A)` | Vitrin hero, CTA bantları |
| `--bg` | `#1A1A19` | Sayfa zemini |
| `--surface` | `#242423` | Kartlar, sidebar |
| `--surface-2` | `#2E2E2D` | Modal, dropdown, hover satır |
| `--border` | `#333332` | Kart/ayraç (gölge değil border) |
| `--text` | `#EDEDEC` | Ana metin |
| `--text-muted` | `#8A8A87` | İkincil metin, etiketler |
| `--text-faint` | `#6E6E6B` | Placeholder, devre dışı |
| `--success` | `#4CAF50` | Başarı, "Yayında" |
| `--warning` | `#D4A017` | Uyarı, "Geliştiriliyor" |
| `--danger` | `#EF5350` | Hata, silme |
| `--info` | `#8A9BB5` | Bilgi / panel linkleri (sıcak palete uyumlu mavi-gri) |

Kontrast kuralı: terracotta büyük alanlarda değil **vurgu** olarak (buton, aktif durum, hero). Gövde metni brand rengi olmaz.

## Renk token'ları (açık tema)

| Token | Değer |
|---|---|
| `--bg` | `#F9F9F8` |
| `--surface` | `#FFFFFF` |
| `--surface-2` | `#F4F4F3` |
| `--border` | `#E5E5E3` |
| `--text` | `#1A1A19` |
| `--text-muted` | `#6B6B68` |
| `--text-faint` | `#9A9A96` |
| `--success` | `#2E7D32` |
| `--warning` | `#9A6700` |
| `--danger` | `#C62828` |
| `--info` | `#5A6E8A` |
| `--brand` | `#D97757` |
| `--brand-hover` | `#C46648` |
| `--brand-subtle` | `rgba(217,119,87,0.14)` |

`--brand` her iki temada aynı; hover tonları temaya göre ayarlanır. Brand üzerindeki metin daima `#FFFFFF` (`--primary-foreground`).

## Tipografi ve ölçüler

- Font: **Inter** (self-host, `font-display: swap`); veri tablolarında 13-14px, gövde 14-15px, başlıklar 600 ağırlık.
- Radius: kart 8px, kontrol 6px. Gölge yok denecek kadar az; derinlik border + zemin katmanıyla verilir.
- Boşluk: 4px taban ölçek; kart içi 16-20px, bölüm arası 32-48px (hub sayfasında 80-120px).

## Panel iskeleti (AppShell)

Cloudflare dashboard **düzeni** referans; **renk** TickPort. Sidebar header/footer **birebir TickPort** (`SiteLogo`, `SidebarVersionFooter` — `~/Projects/tickport/poc-sveltekit`):

- **Genişlik:** `220px`; zemin `--bg` (surface değil).
- **Header (`h-14`, `px-4`):** marka `h-8` + `gap-1`; başlık `text-sm font-semibold`; alt satır `text-[11px]` + `-mt-1.5` (sıkı satır aralığı). Alt satır = tenant adı.
- **Nav:** grup etiketi `text-[10px] uppercase tracking-wider px-3`; öğe `gap-3 px-3 py-2 text-sm font-medium`; ince scroll çubuğu (hover/scroll’da).
- **Footer (`px-4 py-3` + safe-area):** ortalanmış e-posta `text-xs` + `Verimaya · v{sürüm}` satırı.
- **Üst bar:** ⌘K, Yenilikler, destek, hesap.
- Mobil: alt sekme + çekmece aynı header/footer.

## Marketing hub düzeni (apex `/`)

Tek uzun sayfa (`HubHome`): App + CRM CTA'ları → değer vaadi → özellik blokları → entegrasyonlar → alt CTA → footer. Fiyat sayfası MVP'de yok; satış demo üzerinden. Bileşen: `apps/web/src/lib/components/HubHome.svelte`.

## Özellikler sayfası (`/features`)

Tek sayfada mevcut + gelecek özellikler; hem kullanıcı için öğrenme noktası hem bizim için yol haritası özeti. Login gerektirmez (hub'dan linklenir), panel içinden de erişilir.

- Veri kaynağı: `packages/shared/src/features.ts` (tipli liste). Elle HTML yazılmaz; sayfa bu listeden render edilir.
- Her özellik: modül, başlık, 1-2 cümle açıklama, durum rozeti (`docs/CHANGELOG-KURALLARI.md`):
  - 🟢 **Yayında** (`yayinda`, `--success`) — yanında sürüm/tarih, changelog kaydına link
  - 🔵 **Pilotta** (`pilotta`, brand)
  - ⚪ **Kod hazır** (`kod-hazir`, `--info`)
  - 🟠 **Harici onay bekliyor** (`harici-onay-bekliyor`, `--warning`)
- Gruplama modüle göre; üstte duruma göre filtre.
- Kural: bir özellik "Yayında"ya geçtiğinde aynı commit'te changelog kaydı da eklenir; GHL/Ads gibi maddelerde `/features` ve `/changelog` aynı durumu anlatır.

## Yenilikler sayfası (`/changelog`)

Changelog'un kullanıcıya dönük yüzü; kurallar `docs/CHANGELOG-KURALLARI.md` içinde. Login sonrası üst barda zil ikonu: son girişten sonra yeni sürüm varsa brand renkli nokta.
