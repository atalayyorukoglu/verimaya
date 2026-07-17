# Verimaya — Tasarım Sistemi

**Karar (2026-07-17, güncellendi):** Arayüz Cloudflare tasarım dilinden esinlenir; **açık + koyu tema** (varsayılan açık), **yalnız Türkçe**. Referans ekran görüntüleri: `docs/tasarim-referans/` (cloudflare-marketing.png, cloudflare-dashboard.png).

## İki yüz, tek dil

1. **Vitrin (login öncesi):** cloudflare.com tarzı — turuncu gradient hero, bol beyaz alanın koyu karşılığı, büyük başlıklar, bölüm bölüm akan tek sayfa.
2. **Panel (login sonrası):** Cloudflare dashboard tarzı — sol gruplu menü, üstte hızlı arama (⌘K), kart tabanlı içerik, metrik kartlı ana sayfa. (tickport'taki panel hissiyle uyumlu.)

Tema değiştirici üst barda (ay/güneş). Varsayılan: **açık**. Tercih `localStorage` (`verimaya:theme`) ile saklanır. Dil değiştirici YOK — tek dil Türkçe.

## Renk token'ları (koyu tema)

Tailwind config + CSS custom properties olarak tanımlanır; bileşenlerde ham hex kullanılmaz, daima token.

| Token | Değer | Kullanım |
|---|---|---|
| `--brand` | `#F6821F` | Birincil aksiyon, aktif menü, vurgu (Cloudflare turuncusu) |
| `--brand-hover` | `#FF9E42` | Hover durumları |
| `--brand-subtle` | `rgba(246,130,31,0.12)` | Aktif menü zemini, rozet zeminleri |
| `--gradient-hero` | `linear-gradient(135deg, #F6821F, #FBAD41)` | Vitrin hero, CTA bantları |
| `--bg` | `#0B0D0F` | Sayfa zemini |
| `--surface` | `#14171A` | Kartlar, sidebar |
| `--surface-2` | `#1C2024` | Yükseltilmiş öğeler: modal, dropdown, hover satır |
| `--border` | `#2C3136` | Kart/ayraç çizgileri (koyu temada gölge değil border kullanılır) |
| `--text` | `#EDEFF2` | Ana metin |
| `--text-muted` | `#9BA3AB` | İkincil metin, etiketler |
| `--text-faint` | `#6B7280` | Placeholder, devre dışı |
| `--success` | `#3FB950` | Başarı, "Yayında" durumu |
| `--warning` | `#D29922` | Uyarı, "Geliştiriliyor" durumu |
| `--danger` | `#F85149` | Hata, silme |
| `--info` | `#58A6FF` | Bilgi, bağlantılar (panel içi linkler CF'deki gibi mavi) |

Kontrast kuralı: turuncu, büyük alanlarda değil **vurgu olarak** kullanılır (buton, aktif durum, hero). Gövde metni asla turuncu olmaz.

## Renk token'ları (açık tema)

| Token | Değer |
|---|---|
| `--bg` | `#F6F7F8` |
| `--surface` | `#FFFFFF` |
| `--surface-2` | `#EEF0F2` |
| `--border` | `#D8DDE2` |
| `--text` | `#1B1F23` |
| `--text-muted` | `#5B6570` |
| `--text-faint` | `#8B949E` |
| `--success` | `#1A7F37` |
| `--warning` | `#9A6700` |
| `--danger` | `#CF222E` |
| `--info` | `#0969DA` |

Brand token'ları her iki temada aynı (`--brand` / `--brand-hover` / `--brand-subtle`).

## Tipografi ve ölçüler

- Font: **Inter** (self-host, `font-display: swap`); veri tablolarında 13-14px, gövde 14-15px, başlıklar 600 ağırlık.
- Radius: kart 8px, kontrol 6px. Gölge yok denecek kadar az; derinlik border + zemin katmanıyla verilir.
- Boşluk: 4px taban ölçek; kart içi 16-20px, bölüm arası 32-48px (vitrin sayfasında 80-120px).

## Panel iskeleti (AppShell)

Cloudflare dashboard düzeni birebir referans:

- **Sol menü (240px, `--surface`):** üstte tenant/logo, altında gruplu navigasyon. Gruplar: *Ana* (Panel, Hastalar, Randevular), *İletişim* (WhatsApp Inbox), *Finans* (İşlemler, Raporlar), *Bağlantılar* (GHL, Reklamlar, n8n/API), *Yönetim* (Ekip, Ayarlar, Denetim Kaydı). Aktif öğe: `--brand-subtle` zemin + sol turuncu çubuk.
- **Üst bar:** ortada/solda hızlı arama (⌘K — hasta/randevu/işlem arar), sağda "Yenilikler" zili, destek, hesap menüsü.
- **Ana sayfa (login sonrası):** CF'deki "Pick up where you left off" deseni — üstte arama, altta üç kolon hızlı erişim (Son hastalar / Bugünün randevuları / Son mesajlar), en altta metrik kartları (yeni lead, dönüşüm, tahsilat, mesaj hacmi).
- Mobil: alt sekme çubuğu (Panel, Hastalar, Randevular, İşlemler, Menü); Menü tam navigasyon çekmecesini açar. Tablolar kart görünümüne geçer.

## Vitrin sayfası düzeni

Tek uzun sayfa: gradient hero (değer vaadi + tek CTA "Demo talep et") → güven bandı (sektör/rakam) → 3-4 özellik bloğu (ekran görüntüleriyle) → entegrasyon logoları (WhatsApp, GHL, Meta, Google, n8n) → [Özellikler sayfasına link] → alt CTA bandı → footer. Fiyat sayfası MVP'de yok; satış demo üzerinden.

## Özellikler sayfası (`/ozellikler`)

Tek sayfada mevcut + gelecek özellikler; hem kullanıcı için öğrenme noktası hem bizim için yol haritası vitrini. Login gerektirmez (vitrinden linklenir), panel içinden de erişilir.

- Veri kaynağı: `packages/shared/src/features.ts` (tipli liste). Elle HTML yazılmaz; sayfa bu listeden render edilir.
- Her özellik: modül, başlık, 1-2 cümle açıklama, durum rozeti:
  - 🟢 **Yayında** (`--success`) — yanında sürüm/tarih, changelog kaydına link
  - 🟠 **Geliştiriliyor** (`--warning`)
  - ⚪ **Planlandı** (`--text-muted`)
- Gruplama modüle göre (Hasta Takibi, Randevu, Finans, WhatsApp, Entegrasyonlar, Raporlama); üstte duruma göre filtre.
- Kural: bir özellik "Yayında"ya geçtiğinde aynı commit'te changelog kaydı da eklenir — ikisi aynı veri dosyası ailesinden beslenir, tutarsızlık olamaz.

## Yenilikler sayfası (`/yenilikler`)

Changelog'un kullanıcıya dönük yüzü; kurallar `docs/CHANGELOG-KURALLARI.md` içinde. Login sonrası üst barda zil ikonu: son girişten sonra yeni sürüm varsa turuncu nokta.
