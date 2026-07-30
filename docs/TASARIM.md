# Verimaya — Tasarım Sistemi

**Karar (2026-07-17, güncellendi 2026-07-20):** Panel **açık + koyu tema** (varsayılan açık), **yalnız Türkçe**. Renk paleti **TickPort / fixrav warm neutrals** (`~/Projects/tickport/poc-sveltekit/src/app.css`); layout/iskelet Cloudflare dashboard desenini korur. Eski CF turuncusu (`#F6821F`) ve soğuk gri zeminler terk edildi.

Kaynak referans: TickPort `--palette-*` → Verimaya `--brand` / `--bg` / `--surface` / … eşlemesi `apps/web/src/routes/layout.css` içinde.

## İki yüz

1. **Vitrin (login öncesi):** sıcak nötr zemin + terracotta brand gradient hero, bol alan, büyük başlıklar, bölüm bölüm akan tek sayfa.
2. **Panel (login sonrası):** Cloudflare dashboard düzeni — sol gruplu menü, üstte hızlı arama (⌘K), kart tabanlı içerik; **renkler TickPort paleti**.

Tema değiştirici üst barda (ay/güneş). Varsayılan: **açık**. Tercih `localStorage` (`verimaya:theme`) ile saklanır. Dil değiştirici arayüzde YOK — yayındaki tek dil Türkçe, ama altyapı iki dilli (aşağı bak).

## Dil ve slug

**Karar (2026-07-26).** Önceki karar "yalnız Türkçe, i18n altyapısı kurulmaz" idi (2026-07-17). Değişti; eski karar silinmedi, üzerine yazıldı.

### Neden değişti

Rakip taraması, çok dilliliğin bu pazarda **ana satış argümanı** olduğunu gösterdi: Senkron.ai 50+ dil, GreftLens 9 dilde hasta formu, Estesoft çok dilli WhatsApp. Panelin fiili kullanıcısı da büyük oranda Arapça/Rusça/İngilizce konuşan satış temsilcisi. "Yalnız Türkçe" kararı tek satırla üç ayrı yüzeyi birden kapatıyordu.

Zamanlama gerekçesi: i18n iskelesini **şimdi** kurmak ucuz (ekran sayısı az), 40 ekran + iOS yazıldıktan sonra geri dönmek haftalar sürer.

### Üç yüzey, üç ayrı karar

| Yüzey | Slug dili | Locale prefix | Durum |
| --- | --- | --- | --- |
| API (`/v1/...`) | İngilizce — değiştirilemez | yok | ✅ zaten öyleydi |
| Panel rotası | İngilizce | **yok** — dil kullanıcı tercihi | ✅ 2026-07-26'da taşındı |
| Vitrin | her dil kendi dilinde | ileride `/tr/` + `/en/` | ⏸ ön koşul eksik |

Panel rotası SEO taşımaz (SPA + `noindex`), dolayısıyla slug dili bir ürün kararı değil kod tutarlılığı kararıdır: şema ve tablo adları İngilizce (`Patient`, `patients`), rota da İngilizce olmalı — aksi halde kalıcı bir çeviri katmanı doğar.

### Metin nasıl yazılır

- Katalog: `apps/web/src/lib/i18n/messages.ts`. `tr` tip kaynağıdır; `en`'de eksik anahtar derleme hatası verir.
- Erişim: `import { t } from '$lib/i18n/locale.svelte'` → `t('nav.patients')`.
- `navigation.ts` etiketleri `labelKey: MessageKey` taşır, ham string taşımaz.
- Yayındaki dil `defaultLocale = 'tr'`. Dil değiştirici arayüze **eklenmedi**; `setLocale()` hazır, açılması ayrı karar.
- Mevcut ekranların Türkçe metinleri henüz kataloğa taşınmadı. Kural yeni ve dokunulan kod için bağlayıcı.

### Vitrin locale ağacı neden kurulmadı

`apps/web/src/routes/+layout.ts` içinde `ssr = false` ve `prerender = false` — vitrin Google'a boş `index.html` iskeleti olarak gidiyor, `<svelte:head>` içeriği hiç render edilmiyor. **Bugün hiç SEO yok**, dolayısıyla locale/slug stratejisi karşılık üretmez.

Sıra:

1. Vitrini prerender edilebilir hale getir (o rota için `ssr = true` gerekir).
2. `/tr/` ve `/en/` ağacını kur, her dil kendi slug'ıyla (`/tr/ozellikler`, `/en/features`).
3. `/` için **Cloudflare'de uçta 302** yönlendirme + `hreflang`. JavaScript ile yönlendirme yapılmaz — SPA'da istemci yönlendirmesi SEO'yu öldürür.

Çıplak kök (`/` = tek dil, prefix'siz) bilinçli olarak seçilmedi: ikinci dil eklenince ya mevcut linkler kırılır ya `/ozellikler` ile `/tr/ozellikler` aynı sayfayı sunar (yinelenen içerik). İkisi de prefix'li olunca "hangi dil birincil" sorusu tek satırlık bir yönlendirme kuralına iner ve her gün değiştirilebilir — segment kararı (acente / klinik) verilene kadar sabitlenmemesi gereken şey tam olarak bu.

Pazar deseni de bunu doğruluyor: `planports.com/tr/...` ve `estesoft.com.tr/tr/...` — ikisi de her iki dili prefix'liyor, çıplak kök kullanmıyor.

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
- Boşluk: 4px taban ölçek; kart içi 16-20px, bölüm arası 32-48px (vitrin sayfasında 80-120px).

## Panel iskeleti (AppShell)

Cloudflare dashboard **düzeni** referans; **renk** TickPort. Sidebar header/footer **birebir TickPort** (`SiteLogo`, `SidebarVersionFooter` — `~/Projects/tickport/poc-sveltekit`):

- **Genişlik:** `220px`; zemin `--bg` (surface değil).
- **Header (`h-14`, `px-4`):** marka `h-8` + `gap-1`; başlık `text-sm font-semibold`; alt satır `text-[11px]` + `-mt-1.5` (sıkı satır aralığı). Alt satır = tenant adı.
- **Nav:** grup etiketi `text-[10px] uppercase tracking-wider px-3`; öğe `gap-3 px-3 py-2 text-sm font-medium`; ince scroll çubuğu (hover/scroll’da).
- **Footer (`px-4 py-3` + safe-area):** ortalanmış e-posta `text-xs` + `Verimaya · v{sürüm}` satırı.
- **Üst bar:** ⌘K, Yenilikler, destek, hesap.
- Mobil: alt sekme + çekmece aynı header/footer.

## Vitrin sayfası düzeni

Tek uzun sayfa: gradient hero (değer vaadi + tek CTA "Demo talep et") → güven bandı → özellik blokları → entegrasyon logoları → [Özellikler] → alt CTA → footer. Fiyat sayfası MVP'de yok; satış demo üzerinden.

## Özellikler sayfası (`/features`)

Tek sayfada mevcut + gelecek özellikler; hem kullanıcı için öğrenme noktası hem bizim için yol haritası vitrini. Login gerektirmez (vitrinden linklenir), panel içinden de erişilir.

- Veri kaynağı: `packages/shared/src/features.ts` (tipli liste). Elle HTML yazılmaz; sayfa bu listeden render edilir.
- Her özellik: modül, başlık, 1-2 cümle açıklama, durum rozeti:
  - 🟢 **Yayında** (`--success`) — yanında sürüm/tarih, changelog kaydına link
  - 🟠 **Geliştiriliyor** (`--warning`)
  - ⚪ **Planlandı** (`--text-muted`)
- Gruplama modüle göre; üstte duruma göre filtre.
- Kural: bir özellik "Yayında"ya geçtiğinde aynı commit'te changelog kaydı da eklenir.

## Yenilikler sayfası (`/changelog`)

Changelog'un kullanıcıya dönük yüzü; kurallar `docs/CHANGELOG-KURALLARI.md` içinde. Login sonrası üst barda zil ikonu: son girişten sonra yeni sürüm varsa brand renkli nokta.
