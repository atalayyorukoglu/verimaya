# VeriMaya Yapım Günlüğü

> **Sıfırdan bir SaaS — yazılıma yeni başlayanlar için.**
> Bir sağlık turizmi paneli 17 Temmuz 2026'da boş bir klasördü. Bu belge, o klasörün nasıl
> çalışan bir ürüne dönüştüğünü anlatıyor — kararlarıyla, gerekçeleriyle ve hatalarıyla.

**524** commit · **67** migration · **1.153** test · **37** gün · Hazırlanma: **23 Ağustos 2026**

Web sürümü (okuması daha rahat): <https://claude.ai/code/artifact/82c548a9-d3e6-4a91-8843-9661a53a379f>

---

## İçindekiler

| # | Bölüm |
|---|---|
| 00 | [Bu belge nasıl okunur](#00--bu-belge-nasıl-okunur) |
| 01 | [Fikir nereden çıktı](#01--fikir-nereden-çıktı) |
| 02 | [Çok kiracılı ne demek](#02--çok-kiracılı-ne-demek) |
| 03 | [Stack: her parça ne işe yarar](#03--stack-her-parça-ne-işe-yarar) |
| 04 | [Sözleşme: tek doğru kaynağı](#04--sözleşme-tek-doğru-kaynağı) |
| 05 | [Neden önce sahte veriyle başlandı](#05--neden-önce-sahte-veriyle-başlandı) |
| 06 | [Adım adım ne yazıldı](#06--adım-adım-ne-yazıldı) |
| 07 | [Sekiz değişmez kural](#07--sekiz-değişmez-kural) |
| 08 | [Para neden tam sayı](#08--para-neden-tam-sayı) |
| 09 | [Migration: veritabanı nasıl değişir](#09--migration-veritabanı-nasıl-değişir) |
| 10 | [AI katmanı nasıl eklendi](#10--ai-katmanı-nasıl-eklendi) |
| 11 | [Test felsefesi](#11--test-felsefesi) |
| 12 | [Koddan canlıya giden yol](#12--koddan-canlıya-giden-yol) |
| 13 | [Gerçek hatalar ve dersleri](#13--gerçek-hatalar-ve-dersleri) |
| 14 | [Tekrar eden kararlar](#14--tekrar-eden-kararlar) |
| 15 | [Bu projeyi bugün nasıl okursun](#15--bu-projeyi-bugün-nasıl-okursun) |

---

## 00 — Bu belge nasıl okunur

Bu bir kod dersi değil. Bir **karar** dersi. Yazılımın zor kısmı kod yazmak değil, hangi kodu
yazmayacağına karar vermektir.

Anlatım şöyle ilerliyor: önce bir problem çıkıyor ortaya, sonra o problemi çözmek için ne
seçildiği ve **neden başka bir şey seçilmediği** anlatılıyor. Kod parçaları var ama hepsi
gerçek — bu projeden alındı, hiçbiri örnek olsun diye uydurulmadı.

Teknik bir kelimeyle ilk kez karşılaştığında açıklanıyor. Atlamadan oku, sonra tekrar gelmezler.

> **TERİM — SaaS**
> "Software as a Service", hizmet olarak yazılım. Müşteri programı bilgisayarına kurmuyor;
> tarayıcıdan giriyor, aylık ödüyor. Gmail bir SaaS'tır. VeriMaya da öyle.

Belge boyunca üç tür kutu göreceksin: **TERİM** (bir kelimenin ne demek olduğu), **NEDEN**
(bir kararın gerekçesi), **DERS** (bu projeden çıkan, başka projelere de taşınan kural).

---

## 01 — Fikir nereden çıktı

Türkiye'de saç ekimi, diş ve estetik için yurt dışından hasta getiren acenteler var. İşleri
şöyle: Instagram'da reklam veriyorlar, gelen kişiyle WhatsApp'tan konuşuyorlar, ikna olursa
uçak biletini, otelini, kliniğini, transferini ayarlıyorlar, sonra parayı tahsil ediyorlar.

Bir hasta için dokunulan yer sayısı: reklam platformu, WhatsApp, otel, klinik, havayolu, şoför,
muhasebe. Hepsi ayrı yerde. Küçük bir acentede bu bilgi genelde **bir Excel dosyası ve birkaç
kişinin aklında** duruyor.

Problem şu: hasta sayısı 20'yi geçtiğinde kimse "bu aydan kâr ettik mi" sorusuna cevap
veremiyor. Çünkü gelir bir yerde, gider başka yerde, reklam harcaması üçüncü bir yerde.

### Ama zaten bir sistem vardı

Bu ilk deneme değildi. **Fixrav Tracker** adında, Python (FastAPI) ve React ile yazılmış,
şirketin kendi içinde *çalışan* bir sistem zaten vardı. VeriMaya onun sıfırdan yeniden yazımı.

> **NEDEN**
> **Çalışan bir sistemi sıfırdan yazmak neredeyse her zaman hatadır.** Yazılım dünyasında
> bunun bir adı bile var: "second system effect". Yeniden yazım tahmininden 3 kat uzun sürer,
> eski sistemdeki görünmez iş kurallarını kaybedersin, ve o süre boyunca yeni özellik
> çıkaramazsın.
>
> Burada yine de yapıldı, çünkü değişen şey teknoloji değil **ürünün ne olduğu**ydu: dahili bir
> araçtan satılabilir bir ürüne geçiliyordu. O da tek bir şeyi zorunlu kılıyor — çok
> kiracılılık. Ve çok kiracılılık sonradan eklenebilen bir özellik değil, en alttaki tuğla.

Karar şöyle kayda geçmiş: *"kod taşınmaz, bilgi taşınır."* Eski sistemin şeması ve iş kuralları
`docs/legacy-reference/` altına çıkarıldı, kodun kendisi kopyalanmadı.

> **DERS**
> Yeniden yazıma ancak **ürünün tanımı değiştiyse** girilir — "kod çirkin" ya da "yeni
> teknoloji çıkmış" gerekçe değildir. Girdiysen de eski sistemi çalışır bırak; yenisi bitene
> kadar kimse aç kalmasın.

---

## 02 — Çok kiracılı ne demek

> **TERİM — Multi-tenant (çok kiracılı)**
> Tek bir program kurulumunun birden çok müşteriye aynı anda hizmet vermesi. Her müşteri bir
> "kiracı" (tenant). Apartman gibi düşün: tek bina, çok daire, herkesin kendi anahtarı.

Alternatifi şu: her müşteriye ayrı bir kurulum, ayrı veritabanı. Müstakil ev gibi. Kulağa daha
güvenli geliyor ve öyle de — ama 50 müşteride 50 ayrı veritabanını güncellemek, yedeklemek ve
izlemek gerekiyor. Tek kişilik bir ekip bunun altında kalır.

VeriMaya apartmanı seçti: **tek veritabanı, her satırda hangi kiracıya ait olduğunu söyleyen bir
sütun.**

```sql
-- her iş tablosunda bu sütun var
tenant_id  uuid  NOT NULL
```

### Buradaki tehlike

Aynı tabloda A firmasının hastasıyla B firmasının hastası yan yana duruyor. Tek bir sorguda
`WHERE tenant_id = ...` yazmayı unutursan, A firması B'nin hastalarını görür.

Bu felakettir. Sağlık verisi söz konusu, üstelik rakip firmalar aynı sistemde. Ve unutmak çok
kolay: yüzlerce sorgu var, birinde kaçırman yeter.

### Çözüm: veritabanının kendisine söylemek

> **TERİM — RLS (Row Level Security)**
> Satır düzeyi güvenlik. PostgreSQL'e "bu tabloda kimse kendi kiracısı dışındaki satırları
> göremesin" diye bir kural yazarsın. Kural veritabanının içindedir; uygulama kodu unutsa bile
> veritabanı geçirmez.

```sql
-- migration dosyasından, gerçek kod
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transactions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "transactions_tenant_isolation" ON "transactions"
	FOR ALL
	USING      (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
```

Her istek başında uygulama veritabanına "şu an şu kiracı için çalışıyorum" diyor
(`SET LOCAL app.current_tenant_id`). Ondan sonra yazılan her sorgu — `WHERE` olsun olmasın —
otomatik olarak o kiracıyla sınırlanıyor.

> **DERS**
> Bir güvenlik kuralını **insanın hatırlamasına bırakma.** Hatırlanması gereken kural er geç
> unutulur. Kuralı, unutmanın imkânsız olduğu en alt katmana koy — burada bu katman
> veritabanının kendisi.
>
> Buna "defense in depth" denir: uygulama da filtreler, veritabanı da filtreler. İkisinden biri
> hata yapsa diğeri tutar.

---

## 03 — Stack: her parça ne işe yarar

> **TERİM — Stack**
> Bir projede kullanılan teknolojilerin tamamı. "Yığın" demek; üst üste duran katmanlar gibi.

Aşağıdaki her satır bir seçim ve her seçimin bir bedeli var. Önemli olan listeyi ezberlemek
değil, **hangi problemi çözdüğünü** anlamak.

| Katman | Seçim | Hangi problemi çözüyor |
|---|---|---|
| Dil | TypeScript | Sunucu ve arayüzde tek dil; tipler yanlış kullanımı yazarken yakalar |
| Depo yapısı | pnpm + Turborepo | Sunucu, arayüz ve ortak kod tek depoda; ortak şema kopyalanmaz |
| Sunucu | NestJS + Fastify | Katı klasör/modül düzeni; büyüdükçe dağılmıyor |
| Veritabanı erişimi | Drizzle | SQL'e yakın; RLS gibi ham kontroller gizlenmiyor |
| Veritabanı | PostgreSQL 16 | RLS, JSON, güçlü kısıtlar — üçü de bu projede kritik |
| Kuyruk | BullMQ + Redis | Yavaş işleri arka plana atmak, hata olunca tekrar denemek |
| Giriş | better-auth | Şifre, oturum, 2FA, çoklu organizasyon — sıfırdan yazılmaz |
| Arayüz | SvelteKit | Tarayıcıda çalışan panel; sunucu tarafı bilinçli kapalı |
| İzleme | Sentry + pino | Canlıda hata olunca kullanıcı söylemeden haberin olması |
| Sunucu/dağıtım | Hetzner + Coolify | AB'de veri (KVKK), düşük maliyet, az yönetim yükü |
| Önyüz kalkanı | Cloudflare | Saldırı filtresi, SSL, hız |

### Birkaçının hikâyesi

#### TypeScript — neden her yerde aynı dil

Proje tek kişi tarafından yazılıyor. Sunucuda Python, arayüzde JavaScript olsaydı, aynı kavramı
(mesela "işlem") iki dilde iki kez tanımlaman gerekirdi. Biri değişince öteki sessizce eskir.

Tek dil olunca **bir kere tanımlıyorsun, iki taraf da aynı tanımı kullanıyor.** Bu, 4. bölümün
konusu ve muhtemelen bu projedeki en değerli yapısal karar.

#### Drizzle — neden "kolay" olan seçilmedi

> **TERİM — ORM**
> Object-Relational Mapper. Veritabanı satırlarını programlama diline çeviren araç.
> `SELECT * FROM users` yazmak yerine `User.findAll()` yazarsın.

Popüler ORM'ler SQL'i tamamen gizler. Kolaylık gibi görünür, ama gizlemek istemediğin şeyler de
gizlenir. Bu projede `SET LOCAL`, RLS politikaları ve elle yazılmış kısıtlar var — hepsi ham SQL
gerektiriyor.

Drizzle SQL'e yakın durur. Yazması biraz daha zahmetli, ama ne olduğunu görürsün.

#### Kuyruk — neden gerekli

WhatsApp'tan mesaj geldiğinde yapay zekâya sorup cevap beklemek 3–15 saniye sürebilir. WhatsApp
bu kadar beklemez, "cevap vermedin" deyip mesajı tekrar gönderir. Sonra tekrar. Sonra tekrar.

```text
// yanlış: mesajı alırken işi de yap
webhook geldi → yapay zekâya sor → 12 sn bekle → cevap ver
                                    ↑ WhatsApp burada vazgeçti

// doğru: al, kuyruğa koy, hemen cevap ver
webhook geldi → veritabanına yaz → kuyruğa at → 202 Kabul edildi  (0.05 sn)
                                                 işçi arka planda yapar
```

> **DERS**
> Dışarıdan gelen bir isteğe **her zaman hızlı cevap ver.** Uzun süren işi arka plana at. Bu
> kural bu projede o kadar merkezî ki "değişmez ilke" listesine yazılmış (7. bölüm).

---

## 04 — Sözleşme: tek doğru kaynağı

Bir panel uygulamasında iki taraf var: **sunucu** (veriyi tutan) ve **arayüz** (gösteren).
Aralarında sürekli veri gidip geliyor.

Klasik problem: sunucu bir alanın adını `patient_id`'den `contact_id`'ye çevirir, arayüz haberi
olmaz, ekranda boşluk çıkar. Kimse hata mesajı görmez — sadece bir yer sessizce boş kalır.
(13. bölümde bunun tam olarak başımıza geldiği yer var.)

### Çözüm: şemayı ortada bir yerde bir kez tanımlamak

Projede `packages/shared` diye bir klasör var. İçinde her API isteğinin ve cevabının şekli
**zod** ile tanımlı.

> **TERİM — zod**
> Bir verinin nasıl görünmesi gerektiğini tarif eden kütüphane. İki iş birden yapar:
> (1) çalışma anında gelen veriyi doğrular, (2) TypeScript tipini otomatik üretir. Yani tarif
> hem kontrol hem belge.

```ts
// packages/shared — gerçek kod, kısaltılmış
export const transactionDraftSchema = z.object({
  kind:        transactionKindSchema,        // gelir | gider
  amount:      moneyMinor.positive(),        // kuruş, tam sayı
  currency:    supportedCurrencySchema,      // TRY | GBP | EUR | USD
  title:       z.string().min(1).max(255),
  occurred_on: isoDate,
  contact_id:  uuid.nullable().optional()
});

// tip bedava geliyor — elle yazılmıyor
export type TransactionDraft = z.infer<typeof transactionDraftSchema>;
```

Sunucu da arayüz de bu dosyadan okuyor. Bir alan değişirse **iki taraf da aynı anda değişiyor** —
ve uyumsuz kalan yer derlerken hata veriyor, canlıda değil.

> **NEDEN**
> Projenin kuralı net (AGENTS.md ilke 7): *"Sözleşme değişikliği önce shared'da yapılır."*
> Sunucuda veya arayüzde doğrudan alan eklemek yasak. Kural olmasa herkes kendi tarafına ekler,
> iki taraf yavaşça birbirinden ayrılır.

Bu şemadan ayrıca **OpenAPI** dokümanı üretiliyor — yani API'yi kullanacak birine verilecek
kullanım kılavuzu da elle yazılmıyor, aynı kaynaktan çıkıyor.

---

## 05 — Neden önce sahte veriyle başlandı

Yeni başlayanların çoğu veritabanından başlar: tabloları kurayım, sonra API yazayım, en son
ekranları yaparım. Bu proje tam tersini yaptı.

**İlk faz (0a): hiç sunucu yok.** Sadece tarayıcıda çalışan panel, ve MSW adında bir araçla
üretilen sahte veriler.

> **TERİM — MSW (Mock Service Worker)**
> Arayüzün yaptığı API isteklerini tarayıcıda yakalayıp uydurma cevap dönen araç. Arayüz gerçek
> sunucuyla konuştuğunu sanır; aslında karşıda kimse yoktur.

```text
17–21 Temmuz   Faz 0a  →  ekranlar, menüler, tablolar   (sunucu yok)
21 Temmuz      Faz 0b  →  gerçek API, giriş, RLS        (sunucu geldi)
```

> **NEDEN**
> Çünkü **ne yapacağını görmeden nasıl yapacağına karar veremezsin.**
>
> Ekranları önce yapınca "işlem kaydında hangi alanlar olmalı" sorusunun cevabı kendiliğinden
> çıkıyor — formu çizerken görüyorsun. Veritabanından başlasaydın, tabloları tahminle kurar,
> ekranları yaparken üçünü birden değiştirmek zorunda kalırdın.

Bir yan fayda daha var: 4 günün sonunda gösterilebilir bir şey vardı. Tek kişilik projelerde
motivasyon gerçek bir kaynak; iki hafta boyunca sadece veritabanı şeması yazmak insanı bitirir.

> **DERS**
> **Belirsizliği erken çöz, ama görünür olanı önce yap.** Sahte veriyle çalışan bir ekran,
> mükemmel bir veritabanı şemasından daha çok soru cevaplar.
>
> Dikkat: MSW kalıcı olarak durdu. Bugün hâlâ `PUBLIC_USE_MSW=true` ile açılabiliyor — internet
> olmadan arayüz geliştirmek için. Atılan iskele değil, kalıcı bir alet oldu.

---

## 06 — Adım adım ne yazıldı

Aşağıdaki sıra commit geçmişinden birebir çıkarıldı. Tarihlere dikkat: 37 günde 465 commit.

| Ne zaman | Ne | Neden o sırada |
|---|---|---|
| 17 Tem | Kurallar ve dokümantasyon | Kod yazmadan önce "nasıl yazılacak" kararları — AI ile çalışırken şart |
| 17–21 Tem | Faz 0a: sahte veriyle panel | Ürünü görmek |
| 21 Tem | Faz 0b: API, giriş, RLS, ilk migration | En riskli parça (kiracı izolasyonu) erken kuruldu |
| 21 Tem | Faz 1–2: kişiler, randevu, finans | Ürünün kalbi — en çok kullanılan üç ekran |
| 21–22 Tem | Faz 3–6: WhatsApp kutusu, şifreleme, entegrasyonlar | Çekirdek çalışmadan dış dünyaya bağlanılmaz |
| 22 Tem | Faz 7: raporlar | Rapor, veri birikmeden anlamsız |
| 22 Tem | RM-1…RM-7: reklam/ROAS katmanı | Ayrı bir ürün (RoasMate) buraya taşındı |
| 22 Tem | iOS uygulaması | **Sonra donduruldu** — aşağıya bak |
| 30 Tem | Vitrin sayfası, SEO, ücretsiz karne | Ürün satılacaksa bulunması lazım |
| Ağustos | Denetim, açık kapatma, veri göçü, isimli kalemler | "Faz" mantığı bitti — aşağıya bak |
| 17–23 Ağu | AI katmanı (AI-01…AI-11) | Çekirdek sağlamlaşınca üstüne kondu |

### İki dürüst not

#### iOS donduruldu

22 Temmuz'da bir gün içinde iOS uygulamasının beş ekranı yazıldı. Sonra bırakıldı. Bugün listede
şöyle duruyor: *"IOS-01: iOS donmuş; birikmiş drift."*

> **DERS**
> Bir gün heyecanla yazılan şey, bakımı yapılmazsa iki hafta içinde yüktür. Her yeni platform
> **sürekli bir maliyet**tir, bir seferlik iş değil. Pazar doğrulaması yokken ikinci platform
> açmak, birinciyi de yavaşlatır.
>
> Doğru karar verilmiş: dondurulmuş, silinmemiş, listeye "borç" olarak yazılmış. Görünür borç,
> gizli borçtan iyidir.

#### "Faz" mantığı çöktü

Başta Faz 0, 1, 2… diye numaralı bir plan vardı. Ağustos'ta bu bitti ve yerini isimli kalemler
aldı: `AUDIT-04`, `AI-09`, `OPS-03`, `GAP-F09-24`.

Sebebi basit: fazlar *inşaat* için iyidir — temel, duvar, çatı. Ürün ayağa kalktıktan sonra iş
sıralı olmaktan çıkar. Artık "hangisi önce" sorusunun cevabı fazın numarası değil, değeri ve
riski.

---

## 07 — Sekiz değişmez kural

Projenin `AGENTS.md` dosyasında "değişmez mimari ilkeler" başlığı altında sekiz madde var. Her
biri, ihlal edilirse ne olacağının cevabıdır.

| # | Kural | Olmasaydı |
|---|---|---|
| 1 | Her iş tablosunda `tenant_id` + RLS | Bir firma diğerinin hastasını görür |
| 2 | Webhook önce kuyruğa yazar, sonra işler | Dış sistem beklemez, mesaj tekrar tekrar gelir |
| 3 | Idempotency: aynı olay iki kez işlenmez | Aynı ödeme iki kere kaydedilir |
| 4 | Kayıt kaynağı PostgreSQL'dir | Redis silinince ne olduğunu kimse bilemez |
| 5 | Dış servisler adaptör katmanında | Meta API'si değişince proje geneline yayılır |
| 6 | AI çıkarımı taslaktır, onaysız yazılmaz | Yanlış tutar sessizce muhasebeye girer |
| 7 | Sözleşme `packages/shared`'da | İki taraf yavaşça ayrışır |
| 8 | Önbellek anahtarında `tenant_id` | A firmasının raporu B'ye gösterilir |

> **TERİM — Idempotency**
> Bir işlemi bir kez yapmakla beş kez yapmanın aynı sonucu vermesi. Asansör düğmesi gibi: beş
> kez basmak asansörü beş kez çağırmaz. Ağ üzerinden gelen isteklerde şart, çünkü "cevap
> gelmedi" ile "işlem olmadı" aynı şey değildir.

### Kuralların istisnaları da yazılı

1. kuralın üç istisnası var ve her biri gerekçesiyle kayıtlı. Örneğin `fx_rates` (döviz kurları)
tablosunda `tenant_id` yok — çünkü Euro'nun kuru bütün firmalar için aynı.

> **DERS**
> İstisnayı **gerekçesiyle yaz**. Yazılmamış istisna, altı ay sonra "burada neden böyle yapmışız"
> diye bakılan ve yanlışlıkla "düzeltilen" şeydir. Dosyada şu not var: *"domain iş tablolarına
> emsal değildir."* Yani: bunu bahane edip başka yerde kural çiğneme.

---

## 08 — Para neden tam sayı

Bu, yeni başlayanların neredeyse tamamının düştüğü tuzak. Bilgisayarlar ondalık sayıları tam
tutamaz.

```js
// tarayıcı konsolunda dene, gerçekten böyle
0.1 + 0.2
0.30000000000000004

19.99 * 3
59.97000000000001
```

Tek işlemde fark önemsiz. Ama binlerce işlemi toplayan bir finans raporunda kuruşlar birikir ve
rapor tutmaz. Muhasebeci "bu rakam nereden çıktı" diye sorar, kimse cevap veremez.

### Çözüm: parayı hiç ondalık tutmamak

Kural: **tüm para değerleri kuruş cinsinden tam sayı.**

| Yanlış | Doğru |
|---|---|
| `amount: 2900.50` | `amount: 290050` |
| ondalık sayı — birikimli hata | tam sayı — 290.050 kuruş |

Ekrana basarken 100'e bölünüp biçimlendiriliyor. Hesaplama boyunca hiçbir yerde ondalık yok.

> **NEDEN**
> Aynı mantık tarihlerde de var: tüm zamanlar UTC saklanıyor, gösterirken kiracının saat
> dilimine çevriliyor. Sebep aynı — **tek bir doğru biçim seç, çeviriyi sadece kenarda yap.**
> Ortada iki farklı biçim dolaşırsa, hangisinin ne olduğunu er geç karıştırırsın.

---

## 09 — Migration: veritabanı nasıl değişir

> **TERİM — Migration**
> Veritabanının yapısını değiştiren, numaralı ve sıralı SQL dosyası. Yeni tablo, yeni sütun,
> yeni kural. Bir kez çalışır, kaydı tutulur, bir daha çalışmaz.

Neden dosya? Çünkü veritabanına elle müdahale edersen, o değişiklik senin bilgisayarında olur,
canlıda olmaz. Migration dosyası sıraya girer ve **her ortamda aynı sırayla** çalışır.

```text
apps/api/drizzle/
  0001_init.sql
  0003_app_role.sql
  ...
  0061_maya_questions.sql
  0062_transaction_source_evidence.sql
  0063_default_privileges_no_update.sql   ← en son
```

### Bu projede migration'lar elle yazılıyor

Drizzle'ın bir komutu var (`db:generate`): şemaya bakıp migration'ı otomatik üretiyor. Bu
projede o komut **bilerek engellenmiş** (`apps/api/scripts/db-generate-guard.js`). Gerekçe
ölçülmüş ve yazılmış:

> **NEDEN**
> Otomatik üretici, SQL'de elle yazılmış şeyleri görmüyor. 17 Ağustos'ta yapılan ölçüm: üreteç
> **32 izolasyon politikasını, 32 tablodaki RLS'i ve 30 kısıtı silen** bir migration üretmiş.
>
> Yani "kolaylık" aracı, projenin bütün güvenlik duvarını kaldıran bir dosya yazıyordu. Sessizce.

### Yeni yazılmış bir migration: 0063

Bu belge hazırlanırken eklendi ve iyi bir örnek olduğu için buraya alındı.

Projenin en başında (`0003_app_role.sql`) şöyle bir satır yazılmış: "bundan sonra oluşturulacak
her tabloya uygulama kullanıcısı okuma, yazma, **güncelleme** ve silme yetkisi alsın."

Mantıklı görünüyor. Ama sonra bir denetim kaydı tablosu eklendi — Maya'ya sorulan soruların
kaydı. Bu tablonun *hiç güncellenmemesi* gerekiyor; denetim kaydı yazılır, okunur, değiştirilmez.

```sql
-- migration'da sadece bu yazıldı:
GRANT SELECT, INSERT, DELETE ON maya_questions TO verimaya_app;

-- ama tablo yine de UPDATE aldı — çünkü 0003'teki
-- varsayılan yetki kuralı her yeni tabloya sessizce ekliyordu.
-- Açıkça geri almak gerekti:
REVOKE UPDATE ON maya_questions FROM verimaya_app;
```

Fark edilmesi tesadüf. Peki bir sonraki denetim tablosunda kim hatırlayacak? `0063` bu yüzden
yazıldı: varsayılan yetkiden `UPDATE` tamamen çıkarıldı.

> **DERS**
> **Sessiz açık yerine gürültülü hata.** Artık bir tablo gerçekten güncellenecekse yetkiyi
> açıkça yazman gerekiyor — unutursan uygulama ilk denemede "permission denied" der ve test
> kırılır.
>
> Eskisinde unutmanın bedeli görünmez bir güvenlik açığıydı; yenisinde gürültülü bir hata.
> İkisinden birini seçmek zorundaysan, *yanlış tarafta patlamayanı* seç.

---

## 10 — AI katmanı nasıl eklendi

Ürünün en ayırt edici parçası bu, ve tasarımı tek bir cümleye dayanıyor: **yapay zekâ öneri
yapar, insan karar verir.**

### Akış

```text
WhatsApp mesajı gelir
   ↓
webhook ham mesajı veritabanına yazar, kuyruğa iş atar   (kural 2)
   ↓
işçi mesajı yapay zekâya gönderir
   ↓
yapay zekâ TASLAK üretir  →  insan onayı bekler
   ↓
kullanıcı onaylar         →  işlem kaydı oluşur
```

Kullanıcı gelen kutusunu açtığında taslak zaten hazır bekliyor — kimse "analiz et" düğmesine
basmıyor.

### Modelin uydurmasını ne engelliyor

Bu, üretimde AI kullanan her projenin gerçek problemi. Dil modelleri emin bir tonla yanlış rakam
üretebilir. Sağlık turizminde uydurulmuş bir fiyat, müşteriye verilmiş yanlış bir taahhüttür.

Projede üç ayrı savunma var:

1. **Onay kapısı.** Hiçbir AI çıktısı onaysız kayda geçmiyor. Toplu onay yok — her kart tek tek
   onaylanıyor. Bu, hizmet sözleşmesinin 6.2. maddesi ve maddeye adıyla atıf yapan testlerle
   kanıtlanıyor (`record-suggestions.isolation.spec.ts`).
2. **Kaynak izi.** Taslaktaki her alan, hangi cümleden çıktığını taşıyor. Model uydurma bir
   alıntı verirse sunucu onu düşürüyor — alıntının mesajda gerçekten geçtiği kontrol ediliyor.
3. **Modele rakam ürettirmemek.** Maya'ya "Yılmaz bey ne kadar borçlu" diye sorulduğunda model
   rakamı söylemiyor; sadece *hangi sorgunun çalıştırılacağını* seçiyor. Rakamı PostgreSQL
   veriyor, cümleyi kod kuruyor.

```text
// Modelin üretebildiği TEK şey bu:
{ tool: "contactBalance", params: { contact_ref: "4f2a…" } }

// Rakam buradan gelir:   PostgreSQL
// Cümleyi kuran:         arayüz şablonu
// Modelin gördüğü rakam: yok
```

> **DERS**
> Doğruluğun önemli olduğu yerde **model işaret etsin, sistem söylesin.** Dil modeli "hangi soru
> soruldu"yu anlamakta iyidir; "rakam kaç"ı hatırlamakta değil. İkisini karıştırma.

### Kasıtlı olarak yapılmayan şey

Plandaki bir madde şuydu: "sık reddedilen desenler otomatik olarak prompt'a girsin." Yani sistem
kendi talimatını kendi güncellesin.

Bu madde kapsam dışı bırakıldı. İki gerekçeyle: (1) kendini yazan bir talimat, "onaysız hiçbir
şey kayda geçmez" kuralının tek istisnası olurdu ve en görünmez yerde olurdu; (2) mesajlar
dışarıdan geldiği için, sürekli reddettirilen bir desen sistemin talimatını şekillendirmenin
yolu hâline gelirdi.

Yerine: sistem ölçüyor, öneriyi *gösteriyor*, kullanıcı kendi notunu elle düzenliyor. Aynı
fayda, insan kapısı yerinde.

---

## 11 — Test felsefesi

Projede 1.072 test var. Ama sayı önemli değil — **ne test ettikleri** önemli.

### Zorunlu test: izolasyon

Kural şöyle yazılmış: *"Her kiracılı endpoint için negatif izolasyon testi zorunludur."*

> **TERİM — Negatif test**
> Bir şeyin çalıştığını değil, *çalışmadığını* kanıtlayan test. "A firması B'nin verisini
> görebiliyor mu?" → görmemeli. Test, göremediğini kanıtlar.

Çoğu proje sadece pozitif test yazar: "kayıt oluştu mu, evet." Ama güvenlikte asıl soru olmaması
gerekenin olmadığıdır — ve onu ancak negatif test yakalar.

### En değerli alışkanlık: testi bozarak doğrulamak

Bir test yeşil yanıyorsa, bu testin bir şey ölçtüğü anlamına **gelmez**. Yanlış yazılmış bir test
her koşulda yeşil yanar ve sana boş bir güven verir.

Doğrulama yöntemi basit: **özelliği bilerek boz, testin kırmızıya döndüğünü gör, sonra geri al.**

```ts
// 1. izin kontrolünü bilerek devre dışı bırak
async isToolAllowed(...) {
  if (true) return true;   // ← mutasyon
  ...
}

// 2. testleri koştur
3 failed | 35 passed          // ← koruma gerçek

// 3. geri al
```

Bu projede son eklenen dört özelliğin dördü de bu yöntemle doğrulandı. Bir tanesinde test
kırmızıya dönmeseydi, testin işe yaramadığı anlaşılacaktı.

> **DERS**
> Yeşil test kanıt değildir. **Kırmızıya dönebildiğini görmeden** bir teste güvenme. Buna
> "mutation testing" deniyor ve elle yapılan hâli bile çoğu otomatik araçtan faydalı.

---

## 12 — Koddan canlıya giden yol

Kod bilgisayarda çalışıyor olması bir şey ifade etmiyor. Kullanıcıya ulaşması gerekiyor. O
zincir şöyle:

```text
git push
   ↓
CI  →  testler + tip kontrolü + format + güvenlik taraması
   ↓        kırmızıysa BURADA DURUR
   ↓
sunucu yeni kodu çeker ve derler
   ↓
konteyner başlarken migration'ları koşturur   (RUN_MIGRATIONS=true)
   ↓
eski konteyner kapanır, yenisi devralır
```

> **TERİM — CI (Continuous Integration)**
> Her `push`'ta kodu otomatik derleyip test eden sistem. Amacı: bozuk kodun canlıya gitmesini
> durdurmak.

### Kapının işe yaradığı gün

Bu belge hazırlanırken gerçekten oldu. Yerel bilgisayarda 1.072 test yeşildi, tip kontrolü
temizdi. Push edildi. CI **kırmızı** döndü.

Sebep: üç dosyada kod biçimlendirme hatası. Yerel `pnpm check` komutu biçim kontrolünü
koşturmuyordu; CI ayrıca koşturuyordu.

Önemsiz bir hata. Ama önemli olan şu: **canlıya çıkış otomatik olarak durdu.** Arayüz dağıtımı
CI'ya bağlı ve CI kırmızıyken hiçbir şey deploy edilmedi.

> **DERS**
> CI'nın işi kod kalitesini artırmak değil, **kötü kodun kullanıcıya ulaşmasını engellemek.** O
> gün işini yaptı.
>
> İkinci ders: yerel komut ile CI komutu birbirinden ayrılmışsa, "bende çalışıyordu"
> kaçınılmaz. Düzeltme, yerel komutun CI'nın koşturduğu her şeyi koşturması oldu (OPS-04).

---

## 13 — Gerçek hatalar ve dersleri

Bu bölüm belgenin en faydalı kısmı olabilir. Başarı hikâyeleri öğretmez; hatalar öğretir.

### 1 — Sessizce kaybolan veri

Projenin başında hastalar `patients` adlı ayrı bir tablodaydı. Sonra tasarım değişti (DOMAIN-02):
hasta da tedarikçi de klinik de "kişi"dir, hepsi `contacts` tablosunda durur.

Geçiş yapıldı, tablo taşındı, her şey çalışıyor göründü. Ama bir raporun SQL sorgusu eski alan
adlarını aramaya devam etti:

| Rapor bunu arıyordu | Veri artık burada |
|---|---|
| `patient_id` | `contact_id` |
| `patient_display_name` | `contact_display_name` |

Hata mesajı yok, çökme yok. Rapor çalışıyor, sadece o iki alanın düzeltmelerini **hiç
saymıyordu**. Haftalarca fark edilmedi; ancak o rapor genişletilirken (AI-03) ortaya çıktı.

> **DERS**
> En tehlikeli hata çöken değil, **sessizce yanlış cevap veren**dir. JSON içinde alan adıyla
> arama yapan kod tip denetiminden kaçar — derleyici `data->>'patient_id'` içindeki yazının
> doğruluğunu kontrol edemez.
>
> Böyle yerlerde tek koruma testtir: sonucun *dolu geldiğini* kontrol eden bir test bunu ilk gün
> yakalardı.

### 2 — Varsayılanın sessiz cömertliği

9. bölümdeki `UPDATE` yetkisi hikâyesi. Kısaca: projenin başında verilen makul bir varsayılan,
aylar sonra eklenen bir denetim tablosunu güvensiz hâle getirdi.

> **DERS**
> Varsayılanlar birikir. "Şimdilik hepsine izin verelim" diye yazılan bir satır, iki ay sonra
> kimsenin okumadığı bir dosyada durur ve her yeni şeyi sessizce etkiler. Varsayılanı **cömert
> değil cimri** kur; ihtiyaç olan yer açıkça istesin.

### 3 — "Zaten kırıktı" raporu

Bir iş yapay zekâ ajanına devredildi. Ajan işi bitirdi ve raporladı: *"4 test dosyası düştü, ama
bunlar benden önce de kırıktı, doğruladım."*

Doğrulama yapıldı: testler koşturuldu, **hepsi yeşildi.** Ajanın kendi koşusu sırasında geçici
bir veritabanı çakışması olmuş, o da bunu kalıcı bir sorun sanmıştı.

> **DERS**
> Bir işi devrettiğinde — ister başka bir yazılımcıya, ister bir AI ajanına — **rapor kanıt
> değildir.** Commit'i kendin oku, testi kendin koştur. Özellikle "zaten öyleydi" ve "önceden de
> kırıktı" cümlelerine dikkat et; genelde araştırılmamış bir tahmindirler.

### 4 — İki günlük iOS

6. bölümde geçti. Bir günde yazıldı, sonra terk edildi, şimdi listede borç olarak duruyor.

> **DERS**
> Yazmak ucuz, **bakmak pahalı.** Bir özelliğin maliyeti yazıldığı gün değil, sonraki her ay
> ödenir. Yeni bir platform açmadan önce sorulacak soru "yazabilir miyim" değil, "iki yıl
> bakabilir miyim".

---

## 14 — Tekrar eden kararlar

Bu bölüm 13'ün devamı gibi ama farklı: orada **hatalar** vardı, burada **kurallar**. Hepsi bu
projede birden çok kez karşımıza çıktı; ikinci kez çıktığında kural olduklarını anladık.

Her biri bir cümle, ardından bu projedeki gerçek vakası.

### 1. Model işaret eder, sistem söyler

Dil modeli "hangi soru soruldu"yu anlamakta iyidir, "rakam kaç"ı hatırlamakta değil.

**Vaka:** Maya'ya *"Yılmaz bey ne kadar borçlu"* sorulduğunda model rakamı söylemiyor; yalnız
`contactBalance(contact_ref)` diye bir araç seçiyor. Rakamı PostgreSQL veriyor, cümleyi ekran
kuruyor. Modelin gördüğü rakam **yok**.

Aynı ilke müdahale listesinde de geçerli: cümleler şablon, rakamlar SQL, hiçbir LLM çağrısı yok.
Yanlış bir çıkarım cümlesi kullanıcıyı yanlış işe koşturur — ve bunu fark etmek, yanlış bir
bakiye rakamını fark etmekten çok daha zordur.

### 2. Kullanıcının değiştirebildiği bir ada kod bağlama

**Vaka (iki kez).** Randevu formundaki hekim seçicisinin "ünvanı Hekim olanları göster" diye
filtrelemesi doğal görünüyordu. Ama ünvan listesi tenant'ın yönettiği bir sözlük — biri "Hekim"i
"Doktor" yaparsa filtre **sessizce boşalır**. Hata mesajı yok, sadece boş bir açılır menü.

Aynı tuzak `'RPT'` için de vardı: sunucu koduna gömülseydi, tenant tipi "Revizyon" diye
adlandırdığı gün oran sessizce sıfır görünürdü.

**Çözüm ikisinde de aynı:** sunucu ham veriyi verir (tüm kişiler / ham çapraz sayım), ad bilgisi
etiket ve seçim olarak kullanılır, filtre olarak değil.

### 3. Sessiz açık yerine gürültülü hata

İki tür hatadan birini seçmek zorundaysan, **yanlış tarafta patlamayanı** seç.

**Vaka:** Projenin başında "yeni tablolara okuma/yazma/güncelleme/silme yetkisi ver" diye makul
bir varsayılan konmuştu. Aylar sonra eklenen bir denetim kaydı tablosu — yazılır, güncellenmez
olması gereken bir tablo — bu yüzden sessizce güncellenebilir kaldı.

Varsayılan tersine çevrildi. Artık yetki unutulursa uygulama ilk denemede "permission denied"
der ve test kırılır. Eskisinde unutmanın bedeli görünmez bir açıktı, yenisinde gürültülü bir hata.

### 4. Aynı şey için iki hesap yazma

**Vaka:** Referans değeri raporu "bu hastadan ne kazandık" hesabını kendi yazsaydı, aynı hasta
için **kişi kartında bir rakam, raporda başka rakam** çıkardı. Rapor kendi hesabını yazmadı;
mevcut yardımcıları paylaştı ve eşitlik somut rakamlarla teste bağlandı.

Bu, 13. bölümdeki `patient_id` vakasının önlenmiş hâli. Aynı hastalık, bu sefer erken yakalandı.

### 5. Yeşil test kanıt değildir

Bir test yeşil yanıyorsa, bu testin **bir şey ölçtüğü** anlamına gelmez.

**Vaka:** Bu oturumda eklenen her koruma — izin kapısı, atıf doğrulaması, hata izolasyonu, eşik,
gelir eşitliği — özelliği bilerek bozup testin kırmızıya döndüğü görülerek doğrulandı. Biri
kırmızıya dönmeseydi, o testin işe yaramadığı anlaşılacaktı.

### 6. Elmayla armut aynı listede sıralanmaz

**Vaka:** Müdahale listesi hem *"RPT %30 arttı"* hem *"X 42.000 GBP getirdi"* gösteriyor. İkisine
ortak bir "önem puanı" verip tek listede sıralamak matematiksel olarak mümkün ama anlamsız —
ortak ölçek yok. Bulgular tipe göre gruplandı, sıralama grup içinde yapıldı.

Ölçek uydurmak, ölçmemekten kötüdür: uydurulmuş sıra doğru görünür ve sorgulanmaz.

### 7. Susmak, uydurmaktan iyidir

**Vaka:** Maya bilmediğinde `BILINMIYOR` diyor. Müdahale listesi eşiğin altındaki değişimi
raporlamıyor ve bulgu yoksa boş dönüyor — ekran bunu **iyi haber** olarak gösteriyor.

Sağlık turizminde uydurulmuş bir fiyat, cevapsızlıktan çok daha pahalıdır: müşteriye verilmiş
yanlış bir taahhüt olur.

### 8. Eşiksiz bir uyarı sistemi iki yönden ölür

Ya her dalgalanmayı raporlar (gürültü — kullanıcı kapatır ve bir daha açmaz), ya hiçbir şey
söylemez.

**Vaka:** 4 ameliyatın 1'i RPT ise oran %25'tir. Bu bilgi değil gürültüdür; sonraki hastada
%20'ye düşer. Eşik tablosu oran metriklerinde en az 10 kayıt istiyor, ve RPT'nin eşiği en
yüksek — çünkü **bir hekimi haksız yere işaret etmek ilişkiyi bozar** ve geri alınmaz.

### 9. Veri girilmeyen sistem ölür

**Vaka:** Olay kaydı, bu tip sistemlerin klasik ölüm sebebine karşı tasarlandı: kimse ekstra iş
yapmak istemez, özellikle "hata kaydı" gibi kendini suçlar gibi hissettiren bir iş.

Üç şart kondu: sorunun fark edildiği yerden (hasta dosyasından) tek tıkla girilecek, bağlam
önceden dolu gelecek, ve girilen kayıt görünür bir rapora dönüşecek. Kimsenin bakmadığı bir kayda
kimse veri girmez.

Ayrıca tek departmanla başlandı. Çalışmayan bir döngüyü altı kat büyütmek altı kat çöp üretir.

### 10. Doldurulmayan alan, olmayan alandan kötüdür

**Vaka:** Hekim alanı eklenmeden önce sorulan soru "yazabilir miyiz" değil, *"acente hangi
hekimin ameliyat ettiğini gerçekten biliyor ve kaydediyor mu"* oldu. Klinik atıyorsa ve hekim son
anda değişiyorsa alan boş kalır — ve boş alana dayanan rapor, olmayan rapordan daha zararlıdır,
çünkü doğru görünür.

### 11. Kendi kuralına kendi işinde uy

**Vaka:** Bir günde biten dokuz özelliği changelog'a "Yayında" yazmak cazipti — çalışıyorlardı,
testleri geçiyordu, prod'daydılar. Ama projenin kendi kuralı net: "eklendi + çalışır" iddiası
ancak pilot veya yayın durumunda yazılır. Pilot başlamamıştı, kimse kullanmamıştı.

Hepsi "Kod hazır" yazıldı. Kuralı yazmak kolay; kendi işinde uygulamak zor olan kısım.

### 12. Ünvan yetkiye dönüşmesin — iki sistem olmasın

**Vaka:** Kişilere ünvan eklenirken en ciddi risk, ünvanın ikinci bir yetki sistemi hâline
gelmesiydi. Sistemde zaten bir yetki modeli var. İki cevap olsaydı zamanla ayrışırlardı.

Kural yazıldı (*ünvan hiçbir izin kontrolünde okunmaz*) ve **testle sabitlendi** — ünvanı değişen
kullanıcının izni değişmiyor, ayrıca izin fonksiyonuna parametre eklenmeye çalışılırsa test
kırılıyor. Kuralı yazmak yetmez; kodun onu hatırlaması gerekir.

---

## 15 — Bu projeyi bugün nasıl okursun

Yeni bir yazılımcı bu depoya bakacak olsa, doğru okuma sırası şu. Kodun içine dalmadan önce üç
dosya:

1. `README.md` — proje ne, nasıl çalıştırılır
2. `AGENTS.md` — kurallar ve gerekçeleri. **En önemli dosya budur.** Kodun neden öyle yazıldığı
   burada.
3. `docs/MIMARI.md` — mimari kararlar ve tarihleri

Sonra tek bir özelliği baştan sona takip et. En öğretici olanı WhatsApp akışı, çünkü projedeki
hemen her kavramdan geçiyor:

| Sıra | Dosya | Ne öğretir |
|---|---|---|
| 1 | `webhooks/webhooks.controller.ts` | Kuyruk-önce webhook, idempotency |
| 2 | `whatsapp/inbound-message.processor.ts` | Arka plan işçisi, hata izolasyonu |
| 3 | `integrations/llm/pii-mask.ts` | Dışarı veri göndermeden önce temizleme |
| 4 | `whatsapp/whatsapp.service.ts` | Taslak üretimi ve onay akışı |
| 5 | `*.isolation.spec.ts` | Kiracı izolasyonunun nasıl kanıtlandığı |

### Son söz

Bu projede yazılan kodun büyük kısmı sıradan: form, tablo, liste, rapor. Onu ayakta tutan şey kod
değil, **tekrar edilen birkaç karar**:

- Kuralı unutulabilecek yere değil, unutmanın imkânsız olduğu yere koy
- Tek doğru kaynağı olsun; kopyalanan tanım eskir
- Sessiz açık yerine gürültülü hata
- Yeşil testi, kırmızıya dönebildiğini görmeden kabul etme
- Yapmadığın şeyi de gerekçesiyle yaz

Son madde en çok atlananı. Bu projede "bilinçli olarak yapılmayacaklar" diye bir liste var ve
içinde on iki kalem duruyor — her biri gerekçeli. O liste, yapılanlar listesi kadar değerli: bir
sonraki kişiyi aynı tartışmayı baştan yapmaktan kurtarıyor.

---

*Kaynaklar bu deponun kendisi: `AGENTS.md`, `docs/MIMARI.md`, `docs/2026-08-11-YAPILACAKLAR.md`
ve 465 commit'lik geçmiş. Sayılar 23 Ağustos 2026 itibarıyladır.*
