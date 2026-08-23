# VeriMaya Kullanım Rehberi

> **Panel kullanım rehberi — Ağustos 2026.**
> Ekran ekran değil, **iş iş** anlatıyor. Her bölüm günlük işinizde karşınıza çıkan bir soruyla
> başlıyor.

Web sürümü (telefonda okunur, ekibe paylaşılabilir):
<https://claude.ai/code/artifact/89d13e13-f3ec-4457-a158-9c1117f1d9a6>

Geliştirici tarafı için ayrı belge var: [`YAPIM-GUNLUGU.md`](./YAPIM-GUNLUGU.md).

---

## İçindekiler

1. [Menüde ne var](#1--menüde-ne-var)
2. [Bir hasta baştan sona](#2--bir-hasta-baştan-sona)
3. [WhatsApp: sistem okur, siz onaylarsınız](#3--whatsapp-sistem-okur-siz-onaylarsınız)
4. [Bu hastadan kazandık mı](#4--bu-hastadan-kazandık-mı)
5. [Maya AI'a soru sormak](#5--maya-aia-soru-sormak)
6. [Bir şey ters gittiğinde](#6--bir-şey-ters-gittiğinde)
7. [Ay sonu: neye bakmalı](#7--ay-sonu-neye-bakmalı)
8. [Kim ne görebilir](#8--kim-ne-görebilir)
9. [Dikkat edilecek beş şey](#9--dikkat-edilecek-beş-şey)

---

## 1 — Menüde ne var

> *"Nereden başlayacağım?"*

| Menü | Ne için |
|---|---|
| `Panel` | Günün özeti |
| `Kişiler` | Hasta, klinik, otel, personel — **hepsi burada** |
| `Randevular` | Takvim, operasyon alarmları, AI önerileri |
| `Finans` | Gelir/gider işlemleri · `AI ile İşlem` alt sayfası |
| `Bakiyeler` | Kimden ne alacağımız var |
| `Raporlar` | Özet, referanslar, müdahale listesi, AI isabet |
| `Maya AI` | Soru sorup cevap almak |
| `Ayarlar` | Ünvanlar, kategoriler, bilgi bankası, yetkiler |

**Kafa karıştıran tek şey:** *Hasta* diye ayrı bir menü yok. Hasta da klinik de otel de şoför de
"kişi"dir; hepsi `Kişiler` altında durur, birbirinden **tip** ile ayrılır. Hasta listesi görmek
için tipe göre filtreleyin.

---

## 2 — Bir hasta baştan sona

> *"Yeni hasta geldi, ne yapacağım?"*

1. **Kişiyi açın.** `Kişiler → Yeni`. Tip *Hasta*. Kim getirdiyse **"Referans veren"** alanını
   doldurun — bu alan sonra en değerli raporunuzu besleyecek (bölüm 7).
2. **Randevuyu girin.** `Randevular → Yeni`. Klinik, otel, transfer ve **hekim** seçilebilir.
   Hekimi girerseniz sonra "hangi hekimde sorun çıkıyor" sorusuna cevap alırsınız.
3. **Parayı kaydedin.** `Finans → Yeni`. Tahsilat gelir, klinik/otel/uçuş ödemeleri gider.
   **"Vaka" alanına hastayı yazın** — dosya kârı bu alandan hesaplanıyor.
4. **Sorun çıkarsa yazın.** Hasta kartındaki *Olaylar* bölümü (bölüm 6).

> **⚠ DİKKAT**
> 3. adımdaki **"Vaka"** alanı boş kalırsa o gider hiçbir hasta dosyasına düşmez. İşlem kaydı
> doğru görünür, ama "bu hastadan kazandık mı" sorusu eksik cevaplanır. Klinik ödemesi girerken
> en çok atlanan alan budur.

---

## 3 — WhatsApp: sistem okur, siz onaylarsınız

> *"Mesajları tek tek elle mi gireceğim?"*

Hayır. WhatsApp'a mesaj düştüğü anda sistem onu okuyup **taslak** hazırlıyor. Siz gelen kutusunu
açtığınızda taslak sizi bekliyor oluyor.

```text
Mesaj:  "Ahmet bey'in ameliyatı 28'ine kaydı,
         kliniğe 2.900 GBP ödendi"

Sistem hazırlar:
   Finans taslağı   → 2.900 GBP gider, Ada Klinik
   Randevu önerisi  → 28'ine kaydır

Siz onaylarsınız.  Onaylamadan hiçbiri kayda geçmez.
```

### Kaynak rozetleri

Taslaktaki her alanın yanında küçük bir 📎 işareti var. Tıklayın — mesajda o rakamın **hangi
cümleden** alındığı vurgulanır. "Bu 2.900 nereden çıktı" sorusunun cevabı orada.

**Nerede:**
- `Finans → AI ile İşlem` — taslakları görüp onaylayacağınız yer
- `Randevular → Öneriler` — randevu değişikliği önerileri

> **⚠ KURAL**
> **Toplu onay yoktur ve olmayacak.** Her kart tek tek onaylanır. Sistem emin değilse öneri hiç
> üretmez — boş kalması, yanlış tahmin etmesinden iyidir.

---

## 4 — Bu hastadan kazandık mı

> *"Ahmet bey'e ne kadar harcadık, ne aldık?"*

Hasta kartını açın. Finans özeti orada: **gelir, gider, net, tahsil edilen, açık bakiye.**

Hem hastanın kendi işlemleri hem o dosyaya düşen klinik/otel/uçuş giderleri birlikte hesaplanır —
yeter ki 3. adımdaki "Vaka" alanı dolu olsun.

**Kimden alacağımız var:** `Bakiyeler` — kişi ve para birimi bazında açık tutarlar, büyükten
küçüğe.

---

## 5 — Maya AI'a soru sormak

> *"Rapor açmadan hızlıca öğrenebilir miyim?"*

`Maya AI` iki tür soruya cevap verir:

| Soru | Nereden cevaplar |
|---|---|
| "Ahmet Yılmaz ne kadar borçlu?" | Canlı veriden |
| "Kimlerden alacağımız var?" | Canlı veriden |
| "Bu ay ne kadar tahsilat var?" | Canlı veriden |
| "Ahmet'in randevusu ne zaman?" | Canlı veriden |
| "Kime dönülmedi?" | Canlı veriden |
| "Saç ekimi fiyatımız ne?" | Bilgi bankasından |

### Bilmiyorsa "bilmiyorum" der

Bu bir kusur değil, **bilinçli bir karar.** Uydurulmuş bir fiyat, cevapsızlıktan çok daha
pahalıdır — müşteriye verilmiş yanlış bir taahhüt olur.

Fiyat sorularına cevap alamıyorsanız `Ayarlar → Bilgi Bankası` boştur. Doldurun, Maya oradan
cevaplasın.

**Nasıl çalışıyor:** Maya rakamı *kendisi söylemiyor.* Yalnız hangi sorgunun çalışacağını
seçiyor; rakamı veritabanı veriyor. Bu yüzden yanlış rakam üretemez.

---

## 6 — Bir şey ters gittiğinde

> *"Operasyon tutmadı / otel sorun çıkardı — nereye yazacağım?"*

Hasta kartındaki **Olaylar** bölümüne. Tek tıkla açılır; dosya, tarih ve randevu önceden dolu
gelir. Siz yalnız türü seçersiniz.

- Revizyon gerekti
- Sonuç beklentinin altında
- Komplikasyon
- Süreç gecikmesi

Bu bize mal olduysa **maliyeti de yazın** — sonra "bu hatalar bize kaça patladı" sorusu
cevaplanabilir olur. Sorun çözülünce *Çözüldü* işaretleyin.

> **⚠ NEDEN ZAHMET EDELİM?**
> Çünkü yazılmayan sorun ölçülemez. Sistem randevuyu ve parayı görüyor ama **neyin ters
> gittiğini göremiyor** — onu ancak siz yazarsanız bilir. 30 saniyelik kayıt, ay sonunda "hangi
> klinikte sorun birikiyor" cevabına dönüşür.

*Şimdilik yalnız klinik sorunları var. Otel, transfer ve satış türleri bu çalıştıktan sonra
eklenecek.*

---

## 7 — Ay sonu: neye bakmalı

> *"Bu ay ne kötüye gitti, kime öncelik vermeliyim?"*

### Müdahale Listesi

`Raporlar → Müdahale Listesi` — sistemin size *söylediği* yer. Siz sormuyorsunuz, o gösteriyor:

```text
KALİTE DÜŞÜŞÜ
  Dr. Mehmet Yılmaz — RPT oranı %8 → %19   (42 randevu)

AÇIK OLAYLAR
  Ahmet Kaya — Revizyon gerekti — 18 gündür açık

DEĞERLİ REFERANS
  Fatma Demir — 4 kişi getirdi, 38.400 GBP net
```

Her satır tıklanabilir — ilgili ekrana götürür.

**Liste boşsa iyi haberdir.** Sistem küçük dalgalanmaları bilerek raporlamaz: 4 ameliyatın 1'i
RPT ise oran %25'tir ama bu bilgi değil gürültüdür. Söylenmeye değer bir şey yoksa susar.

### Referans değeri

`Raporlar → Referanslar` — kim kaç kişi getirdi, o kişilerden ne kazanıldı. **1. adımdaki
"Referans veren" alanını doldurdukça** bu rapor değerlenir.

### AI isabet

`Raporlar → AI İsabet` — taslakların ne kadarı düzeltilmeden onaylandı, Maya neyi cevaplayamadı.
Cevaplanamayan sorular "bilgi bankasına ekle" önerisiyle listelenir.

---

## 8 — Kim ne görebilir

> *"Koordinatör finans rakamlarını görmesin istiyorum."*

`Ayarlar → Erişim` — rol bazında yetki kısıtlanabilir. Örneğin temsilci rolünden *finans okuma*
yetkisi kaldırılabilir.

> **⚠ ÜNVAN ≠ YETKİ**
> Birine "Koordinatör" **ünvanı** vermek yetkisini değiştirmez. Ünvan raporlarda kırılım
> içindir; yetki ayrı yerden yönetilir.
> Bu bilinçli: ünvanı düzelten biri yanlışlıkla finans erişimi açmasın diye.

Maya da bu kurala uyar — finans yetkisi olmayan biri Maya'ya bakiye sorarsa cevap alamaz.

---

## 9 — Dikkat edilecek beş şey

> *"Neyi yanlış yaparsam sonra pişman olurum?"*

1. **"Vaka" alanını boş bırakmayın.** Gider hangi hastaya ait yazılmazsa dosya kârı eksik
   çıkar — ve bu sessizce olur, hata vermez.
2. **"Referans veren"i doldurun.** Bugün beş saniye, altı ay sonra "en değerli müşterim kim"
   sorusunun tek cevabı.
3. **Ünvan silmeden önce uyarıyı okuyun.** Silerseniz o ünvandaki herkesin etiketi boşalır.
   Kişiler silinmez, ama atamalar gider. Yeniden adlandırmak istiyorsanız *kalem* simgesini
   kullanın.
4. **AI taslağını düzeltirseniz kaynak izi düşer.** Doğrudur: iz "AI şu cümleden aldı" demek;
   siz üstüne yazdıysanız artık o cümle kaynak değildir.
5. **Bilgi bankasına hasta bilgisi yazmayın.** Orası hizmet, fiyat ve kural için. Kişisel bilgi
   girmeyin.

---

*Bu rehber panelin bugünkü hâlini anlatır (Ağustos 2026). Yeni eklenenler için `Değişiklikler`
sayfasına bakın. Anlaşılmayan yer varsa söyleyin — rehber eksikse suç sizde değil.*
