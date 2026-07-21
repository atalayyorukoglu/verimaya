# Legacy notlar — Ayarlar (Settings hub)

> **Durum (Verimaya):** Hub + Kategoriler + Randevu tipleri + Contact türleri gerçek API'ye bağlı (`GET/POST/PATCH/DELETE /v1/settings/*`). API anahtarları kartı (`/ayarlar/baglantilar/api`) artık gerçek `GET/POST/DELETE /v1/api-keys` CRUD'una bağlı. GHL / Reklamlar entegrasyon kartları hâlâ yer tutucu (Faz 4/5). Veri kalitesi ve import/export kartları henüz yok.

Kaynak: Fixrav Tracker `/settings` (`SettingsHub` + alt sayfalar).

## Ne idi?

Organizasyon ayarları **hub + kart ızgarası**. Her kart ayrı alt sayfa. Admin-only / dev-only kartlar var.

| Kart | İçerik |
|------|--------|
| Users | Üye + rol |
| Access control | İzin matrisi |
| Appointments | Tip, durum, checklist şablonları + sıra |
| Contact types | Klinik / otel / transfer vb. |
| Import / export / delete | Önizle → uygula; kategori bazlı silme |
| Audit logs | Denetim |
| Categories | Gelir/gider kategori + alt kategori + sıra |
| System settings | Baz para, org varsayılanları |
| Tags | Coming soon (boş) |
| AI Settings | WhatsApp import prompt |
| AI Öğrenme Raporu | İnsan düzeltmeleri → alan bazlı hata sıklığı |
| Veri Kalitesi | Son 7 gün özet, eksik alan, mükerrer |

## Legacy hataları / pişmanlıklar

1. Hub şişkin — Users/Audit ayrı navigasyonda daha iyi (Verimaya: Ekip + Denetim menüde).
2. Tags hiç doldurulmadı → taşınmaz.
3. Import/export Ayarlar içinde karmaşık ve tehlikeli (toplu silme); Verimaya’da Faz 8 ETL.
4. Checklist çoğu tenant’ta kullanılmıyor — Faz 0a’da derinleştirme yok.
5. `responsible_party` preset’leri Contact types ile örtüşüyor → Contact modeli birleştirir.

## Verimaya kararları

- **Ayarlar = hub** (`/ayarlar`); alt yollar `/ayarlar/...` (eski `/yonetim/ayarlar` kaldırıldı).
- Ekip, Denetim, Bağlantılar (GHL / Reklamlar / API) hub kartları; sidebar’da yok.
- Demo öncelik: hub iskeleti → **Kategoriler CRUD** → randevu tipleri (hafif) → diğer kartlar yer tutucu / salt okunur.
- Tags yok. Import/export kartı “Faz 8” notu.
- AI prompt + öğrenme raporu demo stub (gerçek Faz 3).
- Veri kalitesi: tutarlılık raporlarıyla birleşebilir (Faz 7).

## Faz eşlemesi

| Konu | Faz |
|------|-----|
| Hub + organizasyon formu | 0a demo |
| Kategori sözlüğü (API + UI) | 1 |
| Randevu tip/durum ayarları | 1 |
| Contact türleri | 1 (Contact modeli) |
| İzin matrisi (better-auth) | 0b |
| AI prompt + correction | 3 |
| Veri kalitesi sunucu | 7 |
| İçe/dışa aktarım | 8 |
