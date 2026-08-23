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

### Spec'lerde session-level `set_config` temizliği
16 test dosyası tenant bağlamını `set_config('app.current_tenant_id', ..., false)` ile kuruyor —
session düzeyi. `AGENTS.md` kural 7 bunu **yasaklıyor** ve gerekçesi ciddi: session ayarı testler
arasında sızar, bir testin bıraktığı tenant sonraki testte geçerli kalabilir. Bu, **izolasyon
testini yalancı yeşile çevirebilir** — yani tam da güvendiğimiz testleri.

Bugüne kadar bir soruna yol açtığına dair kanıt yok (test dosyaları ayrı süreçlerde koşuyor
olabilir), o yüzden acil değil. Ama "tenant izolasyonu kanıtlanmıştır" cümlesinin dayanağı bu
testler; dayanağın kendisi kuralı çiğniyorsa er geç bakılmalı.

**Ön koşul:** yok, kapasiteye bağlı. Yeni yazılan spec'ler zaten doğru desende (drizzle
transaction + `SET LOCAL`). **Boyut: M** (16 dosya, mekanik ama dikkat ister).

### Heuristic'te yazıyla para birimi ve gelir ipuçları
`llm:compare` aracı ilk koşuşta somut bir boşluk gösterdi: para birimi regex'i yalnız
`TRY|GBP|EUR|USD|₺|£|€|$` tanıyor. Türkçe WhatsApp'ta **çok yaygın olan** yazılı biçimler
tanınmıyor:

```
"1500 euro kapora aldık"  → 1.500 TRY GİDER   ✗   (olması gereken: 1500 EUR GELİR)
"12.400 TL havale yaptım" → 12.400 TRY gider  ~   (doğru ama tesadüfen — TL eşleşmedi,
                                                   yedek yola düştü, havale de kaçtı)
```

İki eksik: (1) `euro|avro|dolar|sterlin|TL|lira` gibi yazılı biçimler, (2) `aldık|tahsil
ettik|geldi` gibi gelir ipuçları (`INCOME_HINTS` bugün dar).

**Neden hemen yapılmadı:** LLM açılırsa bu boşluk zaten kapanır ve heuristic yalnız yedek
yol olarak kalır. LLM açılmazsa **mutlaka** yapılmalı — S, birkaç regex satırı.
Karar AB API denemesinden sonra. **Boyut: S**

### Yerinde kurulum (on-prem) — egemenlik bir SKU olarak
Sağlık verisiyle çalışan bir klinik "verim hiçbir yere gitmesin" diyebilir. Bugün böyle bir
müşteriye satılacak bir şey yok.

Tek kutu, müşterinin kendi mekânında, model ve veritabanı içeride, internete çıkışsız. Apple
Silicon donanımı bunun **tam olarak doğru** donanımı olur: sessiz, düşük güç, veri merkezi
gerektirmeyen, birleşik bellekle büyük model taşıyabilen.

**Ön koşullar (ikisi de bugün yok):** tek-kiracılı kurulum yolu (her şey çok kiracılı
varsayımıyla yazılı — RLS, `tenant_id`) ve yerinde güncelleme/destek modeli.

**Yatırım şartı:** gerçek bir müşteri "verim çıkmasın" demeden başlanmaz. Ayrıntılı analiz:
`docs/2026-08-23-llm-altyapi-secenekleri.md` § 5. **Boyut: L**

### Ürün içi "Yenilikler" yüzeyi
Panele giren kullanıcıya son eklenen özellikleri gösteren küçük bir bileşen (changelog'un
ürün içi yüzü). `changelog.ts` tek kaynak zaten var, veri hazır.

**Neden şimdi değil:** dahili pilot başlamadı, prod'da kullanıcı yok. Sıfır kullanıcıya
tanıtım yapan bir yüzey olur. Ayrıca DOC-04 borcu kapanmadan gösterilecek doğru içerik yok.

**Ön koşul:** DOC-04 + gerçek kullanıcı. **Boyut: M**

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
