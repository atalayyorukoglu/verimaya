# Legacy notlar — Case Expenses / Hasta finansı

Kaynak: Fixrav Tracker (`/case-expenses` = yeniden adlandırılmış Cases/Patients).

## Ne idi?

Ayrı bir "gider modülü" değil; **case (hasta/proje) listesi + detayında finans özeti**. Case'e bağlı gelir/gider işlemleri toplanır; gelir − gider = net. Sağlık turizminde "bu hastaya ne harcandı / ne tahsil edildi" sorusuna cevap verir.

## Legacy özellikler

- Liste: arama, sayfalama, case CRUD, Contact bağlama
- Detay: gelir/gider/net (baz para biriminde kur karşılığıyla), notlar, randevular, işlem listesi, dosyalar
- İzin: `case_finance_detail` ile finans gizlenebilir

## Legacy hataları / pişmanlıklar (taşınmayacak)

1. İşlemler `limit: 50000` tek seferde — büyük tenant'ta yavaşlar
2. Tarih aralığı 8 yıl hardcoded
3. Randevular case + contact için iki istek + istemci birleştirmesi
4. Tutarlar string Decimal; kur çevrimi istemcide
5. Kategori dağılımı yok
6. İsimlendirme kafa karıştırıcı ("Case Expenses" = hasta yönetimi)

## Verimaya düzeltmeleri (Faz 0a demo)

- Hasta detayı (`/hastalar/:id`): finans özeti + kategori dağılımı + bağlı randevu/işlem listeleri
- Sayfalı sorgu (`limit: 20`) + "İşlemlerde aç" (`/finans?hasta=`)
- Minor unit integer; para birimi bazında ayrı satır (otomatik kur toplamı yok — netlik)
- Dosyalar: yer tutucu (storage Faz 1)

## İleri yapılacaklar

| Konu | Faz | Not |
|------|-----|-----|
| Case/randevu dosya yükleme (storage + RLS) | 1 | Detay: `dosyalar.md`; object storage; `files` tablosu |
| Kur karşılığı (`counterparty_amount`) | 1 | Farklı para birimli işlemlerde base currency net |
| Contact modeli + case–contact bağ | 1 | P2P bakiyeler Contact'a taşınır |
| Finans özeti sunucu tarafı (aggregate) | 1/7 | İstemci yerine SQL SUM; cursor ile uyumlu |
| `case_finance_detail` benzeri RBAC | 0b | Finans alanını role göre gizle |
| Hasta listesinde net özet sütunu (opsiyonel) | 7 | Liste performansına dikkat |
