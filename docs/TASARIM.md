# Verimaya — Tasarım Sistemi

**Karar (2026-07-17, güncellendi 2026-07-20):** Panel **açık + koyu tema** (varsayılan açık), **yalnız Türkçe**. Renk paleti **TickPort / fixrav warm neutrals** (`~/Projects/tickport/poc-sveltekit/src/app.css`); layout/iskelet Cloudflare dashboard desenini korur. Eski CF turuncusu (`#F6821F`) ve soğuk gri zeminler terk edildi.

Kaynak referans: TickPort `--palette-*` → Verimaya `--brand` / `--bg` / `--surface` / … eşlemesi `apps/web/src/routes/layout.css` içinde.

## İki yüz, tek dil

1. **Vitrin (login öncesi):** sıcak nötr zemin + terracotta brand gradient hero, bol alan, büyük başlıklar, bölüm bölüm akan tek sayfa.
2. **Panel (login sonrası):** Cloudflare dashboard düzeni — sol gruplu menü, üstte hızlı arama (⌘K), kart tabanlı içerik; **renkler TickPort paleti**.

Tema değiştirici üst barda (ay/güneş). Varsayılan: **açık**. Tercih `localStorage` (`verimaya:theme`) ile saklanır. Dil değiştirici YOK — tek dil Türkçe.

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

## Özellikler sayfası (`/ozellikler`)

Tek sayfada mevcut + gelecek özellikler; hem kullanıcı için öğrenme noktası hem bizim için yol haritası vitrini. Login gerektirmez (vitrinden linklenir), panel içinden de erişilir.

- Veri kaynağı: `packages/shared/src/features.ts` (tipli liste). Elle HTML yazılmaz; sayfa bu listeden render edilir.
- Her özellik: modül, başlık, 1-2 cümle açıklama, durum rozeti:
  - 🟢 **Yayında** (`--success`) — yanında sürüm/tarih, changelog kaydına link
  - 🟠 **Geliştiriliyor** (`--warning`)
  - ⚪ **Planlandı** (`--text-muted`)
- Gruplama modüle göre; üstte duruma göre filtre.
- Kural: bir özellik "Yayında"ya geçtiğinde aynı commit'te changelog kaydı da eklenir.

## Yenilikler sayfası (`/yenilikler`)

Changelog'un kullanıcıya dönük yüzü; kurallar `docs/CHANGELOG-KURALLARI.md` içinde. Login sonrası üst barda zil ikonu: son girişten sonra yeni sürüm varsa brand renkli nokta.
