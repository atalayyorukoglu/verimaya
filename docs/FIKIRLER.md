# Fikirler

> **Bu bir yapılacaklar listesi DEĞİLDİR.** Aktif iş tek yerde: `docs/2026-08-11-YAPILACAKLAR.md`
> (AGENTS.md § Süreç, kural 9 — "İkinci bir açık-iş dosyası açma").
>
> Burası **kararı verilmemiş** fikirlerin durduğu yer. Bir fikir buradayken:
> - kimse üzerinde çalışmaz,
> - kabul kriteri yazılmaz,
> - tahmini boyut kabaca verilir, taahhüt değildir.
>
> **Mezuniyet kuralı:** bir fikri yapmaya karar verdiğinde onu YAPILACAKLAR'a kalem olarak taşı
> ve **buradan sil**. İki yerde birden durursa çift işaret sapması başlar — kural 9'un önlemeye
> çalıştığı şey tam olarak budur.
>
> **Çöpe atma kuralı:** yapılmayacağına karar verilen fikir buradan silinir ve YAPILACAKLAR'daki
> **"Bilinçli olarak yapılmayacaklar"** tablosuna gerekçesiyle yazılır. Sessizce silme —
> gerekçesiz düşen fikir altı ay sonra yeniden tartışılır.

Son güncelleme: 2026-08-23

> **Bugün eklenen not:** karşılaştırma katmanı `summary` ve `appointment-metrics` ile sınırlı
> (v1). Diğer raporlara (`balances`, `cohorts`, `marketing`, `referrals`…) genişletmek bir
> fikirdir — desen oturdu, ama her raporun kendi kenar durumu var ve hepsini birden açmak
> AI-05'i geciktirir. Talep geldikçe tek tek eklenir. **Boyut: rapor başına S.**

---

## Veri ve raporlama

### Referans zinciri (özyinelemeli)
Bugün `GET /v1/reports/referrals` yalnız **doğrudan** referansı sayıyor: "X 4 kişi getirdi."
Zincir sayılmıyor: X'in getirdiği 4 kişiden 2'si kendileri 3 kişi getirdiyse, X'in ağı aslında 7.

Sağlık turizminde ağızdan ağıza zincir gerçek bir olay; "en değerli müşteri kim" sorusunun
cevabı zincirle ciddi şekilde değişebilir.

**Neden v1'e girmedi:** özyinelemeli sorgu (`WITH RECURSIVE`) üç ek şey ister — döngü koruması
(A→B→A veri girişi hatasıyla oluşabilir), derinlik sınırı, ve ekranda "bu rakam kaçıncı seviyeye
kadar" sorusunun cevabı. Doğrudan sürüm çalışıp kullanılmadan buna girmek erken.

**Ön koşul:** doğrudan rapor birkaç hafta kullanılsın; "zinciri de görsek" talebi gerçekten
gelsin. **Boyut: M**

### Bakiye yaşlandırma (aging)
`GET /v1/reports/balances` "ne kadar açık" diyor, "**kaç gündür** açık" demiyor.
"X'in 1.450 GBP'si 41 gündür duruyor" cümlesi bugün kurulamıyor.

Veri var (`transactions.occurred_on`), hesap basit: 0–30 / 31–60 / 61–90 / 90+ kovaları.
Tahsilat takibinde en çok işe yarayan tek görünüm bu olabilir.

**Boyut: S** — muhtemelen en yüksek fayda/maliyet oranına sahip açık fikir.

### Çok ünvanlı kişi
Bugün kişi başına **tek** ünvan (`contacts.title_id`). 5-15 kişilik bir acentede insanlar birden
çok şapka takıyor — aynı kişi hem satışçı hem koordinatör olabilir.

**Neden tek ünvanla başlandı:** tekten çoka geçiş düz bir migration (FK → ara tablo). Baştan ara
tablo kurmak bugünkü işi büyütür, faydası ihtiyaç ortaya çıkana kadar sıfır.

**Ön koşul:** gerçek bir kişi kaydında "buraya iki ünvan lazım" durumu yaşansın. **Boyut: M**

### Hekim seçicisini kliniğe göre daraltma
Randevu formunda klinik seçilince hekim listesi o kliniğin hekimleriyle daraltılabilir
(`contacts.organization_id` üzerinden).

**Neden yapılmadı:** hekimler klinik değiştirir, serbest çalışır, son anda değişir. Yanlış
daraltma "hekimimi bulamıyorum"a yol açar — bu, uzun listeden daha kötü bir sorun.

**Ön koşul:** hekim listesi gerçekten uzayıp rahatsız edici olsun. Belki hiç gerekmez.
**Boyut: S**

---

## Ürün yüzeyleri

### Olay kaydı — diğer departmanlar
`docs/2026-08-23-maya-icgoru-sorulari.md` § 5'te ayrıntılı duruyor. Fikir olarak burada anılıyor
çünkü **kapsamının nerede duracağı** karara bağlı: v1 yalnız klinik departmanı ile başlıyor.
Otel / transfer / satış / reklam departmanlarının tür listeleri, klinik döngüsünün çalıştığı
kanıtlanmadan yazılmayacak.

**Ön koşul:** klinik olay kaydı v1 canlıda kullanılsın, veri gerçekten girilsin. **Boyut: M**

### Maya'ya sesli soru
Maya bugün yazıyla soruluyor. Koordinatör araba kullanırken "Yılmaz bey ne kadar borçlu" diye
sorabilse operasyonel olarak anlamlı olurdu.

**Neden fikir seviyesinde:** tarayıcı ses tanıma Türkçede değişken kalitede; yanlış anlaşılan bir
soru yanlış araca gider. AI-11a'nın araç seçimi zaten `BILINMIYOR` diyebiliyor, yani güvenlik
tarafı hazır — sorun yalnız tanıma kalitesi. **Boyut: M**

### Panel içi bildirim
AI-04 alarmları ve AI-05 müdahale listesi bugün ancak kullanıcı o sayfaya giderse görülüyor.
"Uçuşa 48 saat kaldı, transfer atanmadı" uyarısının kullanıcıyı **bulması** gerekiyor.

**Dikkat:** bildirim yorgunluğu gerçek bir risk. Eşik tablosu (YAPILACAKLAR § AI-05, 5. adım)
yazılmadan bildirim açılırsa insanlar hepsini kapatır ve sistem bir daha güvenilmez.
**Ön koşul: eşik tablosu.** **Boyut: M**

---

## Operasyon ve altyapı

### `pnpm check` sonrası: commit öncesi kanca
`pnpm check` artık lint de koşturuyor (OPS-04). Bir sonraki adım, commit öncesi otomatik
koşturan bir git hook olabilir — CI'ya kırık kod hiç gitmez.

**Karşı argüman:** solo geliştiricide hook yavaşlatır ve `--no-verify` ile atlanır. CI zaten
tutuyor. Faydası tartışmalı. **Boyut: S**

### API'yi GHCR image yoluna taşımak
YAPILACAKLAR § Bekleyen içinde "isteğe bağlı ops" olarak zaten anılıyor. Web bu yolda (path B,
önceden derlenmiş image); API hâlâ sunucuda derleniyor. Taşınırsa deploy hızlanır ve sunucu
build yükünden kurtulur. **Boyut: M**

---

## Reddedilmiş sayılabilecekler (silinmeden önce son bakış)

Aşağıdakiler bu oturumda konuşuldu ve **yapılmamasına karar verildi**. Gerekçeleri asıl yerlerine
yazıldı; burada yalnız hatırlatma olarak duruyorlar. Bir sonraki temizlikte silinebilirler.

| Fikir | Karar ve yeri |
|---|---|
| AI'ın red desenlerinden prompt'u kendi güncellemesi | ❌ YAPILACAKLAR § AI-03 kapsam daraltması — kendini yazan prompt, insan onayı kuralının istisnası olur + enjeksiyon yüzeyi |
| Tenant başına LLM model seçimi | ❌ YAPILACAKLAR § AI-10 — 3 LLM yolunu tenant başına test etme yükü; doğru cevap sözleşmede yazmak |
| "İyi RPT / kötü RPT" ayrımı | ❌ Gereksiz — kullanıcı netleştirdi, RPT tek anlamlı ve tamamen olumsuz |
| Hekim için ayrı tablo | ❌ `contacts` + ünvan yeterli oldu (migration `0064`/`0065`) |
