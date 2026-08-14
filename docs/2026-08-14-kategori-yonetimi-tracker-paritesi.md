# Kategori yönetimi — Tracker davranış paritesi

Tarih: 2026-08-14

## İncelenen kaynaklar

- Tracker kategori listesi ve kategori detay ekranı
- Tracker finans kategori API istemcisi ve FastAPI router'ı
- Verimaya kategori ekranı, ortak API sözleşmesi, NestJS controller/service ve sıralama testi

## Bulgular

- Verimaya'da kategori CRUD vardı; ancak alt kategoriler virgülle ayrılan tek textarea ile
  düzenleniyor ve kategori sıralama endpoint'i ekranda kullanılmıyordu.
- `PUT /v1/settings/finance-categories/reorder` mutlak `id` / `sort_order` çiftleri alıyor.
  Bu sözleşme gelir ve gider listelerini istemcide bağımsız sıralamak için yeterli.
- Alt kategoriler ayrı kimlikli satırlar değildir; kategori kaydındaki sıralı `string[]`
  sözleşmesidir. Veritabanındaki gerçek kolon tipi `text[]` değil, `jsonb` içinde `string[]`dır
  (`apps/api/src/db/schema/finance-categories.ts`). Dizi sırası her iki durumda da korunur;
  bu iş için migration gerekmez.
- Verilen Tracker kaynak sürümü kategori listesinde tür rozeti olan tek `<ul>` render ediyor.
  Bu çalışmada ürün hedefinde açıkça istendiği üzere gelir ve gider iki bağımsız bölüm olarak
  ele alındı.

## Yapılanlar

- Kategori listesi gelir/gider bölümlerine ayrıldı; her bölümde ilk/son sınırları olan yukarı
  ve aşağı taşıma kontrolleri eklendi.
- Sıralama, TanStack Query önbelleğinde optimistic uygulanıyor; API hatasında önceki snapshot
  geri yükleniyor ve hata ekranda gösteriliyor.
- Virgüllü alt kategori textarea'sı kaldırıldı. Kategori satırı ayrı detay rotasına gider;
  detayda alt kategoriler tek tek eklenir, yeniden adlandırılır, silinir ve sıralanır.
- Her alt kategori işlemi mevcut `PATCH` ile sıralı dizinin tamamını gönderir. Mevcut dolu
  diziler dönüşüme uğramadan aynı sırada açılır.
- Tarayıcı `confirm()` kullanımı kaldırıldı; kategori ve alt kategori silme akışları mevcut
  `Dialog.svelte` ile onay alıyor.
- Ekranın tüm kullanıcı metinleri Türkçe ve İngilizce mesaj kataloğuna taşındı.
- Mobilde işlem kontrolleri en az 44 px dokunma hedefi kullanıyor; satırlar dar ekranda
  taşmayacak şekilde kırılıyor.
- Gelir/gider içi kategori hareketini ve alt kategori dizi sırasının API'de korunmasını
  doğrulayan regresyon testleri eklendi.

## Bilinçli kalan Tracker farkları

- Tracker alt kategorileri ayrı ID'li veritabanı satırları ve ayrı CRUD/reorder endpoint'leri
  olarak tutuyor. Verimaya mevcut gömülü dizi modelini koruyor; alt kategori kimliği yok.
- Bu nedenle Verimaya'da bir alt kategori değişikliği dizinin tamamını atomik `PATCH` eder;
  Tracker her alt kategoriyi ayrı istekle değiştirir.
- Sürükle-bırak yoktur; Tracker ile aynı şekilde yukarı/aşağı kontrolleri kullanılır.
