# Legacy notlar — Raporlar

Kaynak: Fixrav Tracker `/reports` (`?tab=summary` | `?tab=category`).

## Ne idi?

İki sekme:

1. **Summary** — Dashboard özet içeriği (aynı bileşen).
2. **Category reports** — Dönem filtresi + işlem filtreleri + kategori kartları; karta tıklayınca alt kategori (subtitle) kırılımı; oradan işlem listesi + hızlı kategori/alt kategori düzenleme.

Dönem seçici global (`ReportPeriodContext`): varsayılan bu ay; ay kaydırma; tüm zamanlar; özel aralık.

## Legacy hataları (taşınmayacak)

1. `limit: 50000` ile tüm işlemleri çekip istemcide aggregate — büyük tenant'ta yavaşlar / bellek.
2. Finans kategorileri için her kategoriye ayrı detail isteği (N+1).
3. Kur karşılığı olmayan işlemler sessizce toplam dışı; dipnot var ama UX zayıf.
4. `responsible_party` serbest metin + sabit preset karışımı — Contact modeliyle örtüşüyor.

## Verimaya (Faz 0a demo)

- Sekmeler: **Özet** | **Kategori**
- Dönem: Bu ay / Geçen ay / Tüm zamanlar / Özel aralık — MSW `from`/`to` ile
- Kategori drill-down: kategori → alt kategori (`subtitle`) → işlem listesi + düzenle
- Özet sekmesinde tutarlılık uyarıları + hasta dağılımları korunur
- `responsible_party` demo dışı (Contact / Faz 1 ile birlikte)

## İleri (Faz 7)

| Konu | Not |
|------|-----|
| Sunucu aggregate | SQL SUM/GROUP BY; cursor ile uyumlu; istemciye ham 50k satır yok |
| Dönem API | `?from=&to=` zorunlu varsayılan (bu ay) |
| Alt kategori sözlüğü | Ayarlar > Kategoriler (income/expense + subcategories) |
| Sorumlu / Contact | Contact modeli sonrası net bakiye + rapor boyutu birleşir |
| Kur | `counterparty_amount` / base currency aggregate |
| RBAC | `transaction_amounts` benzeri tutar gizleme |
