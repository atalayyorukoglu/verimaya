# LLM altyapısı — seçenekler ve uzun vadeli duruş

> **Nereden çıktı (2026-08-23).** Prod'da LLM yapılandırılmamış olduğu tespit edildi
> (`docs/2026-08-11-YAPILACAKLAR.md` § AI-10). Kullanıcı sordu: *"Alternatifler neler?
> Küçük durmayı düşünmek yerine uzun vadeli düşünmeliyiz."* — kendi sunucumuzda / Apple
> Silicon üzerinde model çalıştırma seçeneği dahil.
>
> Bu dosya karar vermiyor, **karar için gereken zemini** kuruyor.

---

## 1. Önce işin gerçek boyutu

Karar vermeden önce ne çalıştırdığımızı netleştirmek gerekiyor, çünkü "LLM lazım" cümlesi
altında çok farklı büyüklükte işler saklanabiliyor.

VeriMaya'nın dil modelinden istediği **üç iş** var ve üçü de dar:

| İş | Girdi | Çıktı |
|---|---|---|
| WhatsApp finans çıkarımı | Kısa Türkçe mesaj + kişi listesi | Yapılandırılmış taslak (tutar, tür, tarih, karşı taraf) |
| Randevu erteleme çıkarımı | Aynı mesaj + randevu listesi | Randevu id + yeni tarih |
| Maya araç seçimi | Türkçe soru | 5 araçtan biri + parametre |

**Hiçbiri sınır-seviye akıl yürütme istemiyor.** İstediği şeyler:

- **İyi Türkçe anlama** — "kliniğe", "28'ine", "kaydı" gibi çekimli biçimleri çözebilmek
- **Güvenilir JSON** üretimi
- Verilen listeden **varlık eşleme**

Bu, küçük bir modelin işi — **eğer o küçük model Türkçeyi iyi biliyorsa.** Bütün mesele burada.

> **Bağlayıcı kısıt: Türkçe.** Türkçe eklemeli bir dil ve eğitim verisinde İngilizceye göre
> az temsil ediliyor. Küçük açık modeller Türkçede İngilizcedekinden belirgin biçimde zayıf.
> Bu **varsayılacak değil, ölçülecek** bir şey — §4'e bakınız.

---

## 2. Hacim ve maliyet — sayılarla

Kabaca bir hesap, büyüklük mertebesini görmek için:

```
Bir acente günde ~200 mesaj  ·  çağrı başına ~2.000 token (bağlam dahil)
10 tenant → günde ~2.000 çağrı → ~4M token/gün
```

Projenin kendi ledger'ında varsaydığı fiyat (`estimateCostUsdMicros`, gpt-4o-mini sınıfı:
girdi 1M token başına ~$0,15 · çıktı ~$0,60):

**≈ aylık 15–20 dolar. On tenant için.**

> **Bundan çıkan tek sonuç: maliyet, kendi sunucumuzda model çalıştırmanın gerekçesi
> DEĞİL.** Bir GPU sunucusu aylık 200–400 €; Mac Studio sınıfı bir makine 2.500 €+ peşin.
> Bugünkü hacimde barındırılan API 10–20 kat ucuz.
>
> Kendi altyapında model çalıştırmanın gerekçesi **veri egemenliği**dir, para değil.
> Bu ayrım kararın tamamını belirliyor; karıştırılırsa yanlış sebeple doğru şey (ya da
> tersi) yapılır.

---

## 3. Seçenekler

### A — Barındırılan API, küresel (OpenAI vb.)

| | |
|---|---|
| Türkçe kalitesi | En iyi katman |
| Maliyet | Aylık ~$20 (10 tenant) |
| Kurulum | **3 env değişkeni** — kod yolu yazılı, testli, hata hâlinde heuristic'e düşüyor |
| Sorun | **Sağlık verisinin yurtdışına aktarımı.** KVKK aktarım dayanağı, DPA, aydınlatma metni gerekiyor. LEG-02 zaten bu yüzden açık. |

### B — Barındırılan API, AB bölgesi

| | |
|---|---|
| Türkçe kalitesi | A ile aynı katman |
| Maliyet | A'ya yakın |
| Kurulum | OpenAI-uyumlu ise yine 3 env değişkeni |
| Avantaj | Veri AB'de kalıyor — **mevcut duruşla tutarlı** (Hetzner Helsinki, R2 EU). Aktarım sorunu kaybolmuyor ama ciddi biçimde küçülüyor. |
| Sorun | Hâlâ üçüncü taraf; sözleşme ve saklama şartları okunmalı |

### C — Kendi sunucumuzda (Hetzner GPU)

| | |
|---|---|
| Veri | **Hiç çıkmıyor** — en güçlü KVKK duruşu |
| Maliyet | Aylık 200–400 € sabit; 10 tenantta API'nin 10–20 katı, 500 tenantta tersine döner |
| Kurulum | Model seçimi, sunum katmanı, izleme, güncelleme — **işletme yükü bizde** |
| Türkçe kalitesi | Tamamen model seçimine bağlı; **ölçülmeden bilinemez** |

### D — Apple Silicon (Mac Studio / Mac mini) — kantan yaklaşımı

> **Referans işi netleşti (2026-08-23, video transkripti).** Kantan News **Mac Studio'da
> değil**, bir **M4 Pro Mac mini / 48 GB** üzerinde servis ediliyor. Mac Studio sonradan
> alındı ve video prodüksiyonu + aynı anda birden çok model içindir.
>
> **O 48 GB'lık Mac mini'nin yaptığı iş bizimkinden ağır:** haber görseli seçimi, telif
> kontrolü, yorum kontrolü, **üç dilde TTS** (Türkçe/İngilizce/İspanyolca, açık kaynak motor,
> 30 saniyelik örnekten klonlanmış ses) ve otomatik podcast yayını. Bir haberin üç dile
> çevrilmesi 10–15 dakika sürüyor ve bu kabul edilebilir bulunuyor.
>
> **Bizim için çıkarım:** VeriMaya'nın dil modelinden istediği iş — kısa Türkçe mesajdan beş
> alan çıkarmak ve beş araçtan birini seçmek — bu işin **yanında çok küçük.** Yani "yerel
> donanımda çalışır mı" sorusunun cevabı teknik olarak **evet**. Kısıt donanım değil,
> §1'de yazdığımız gibi modelin Türkçe başarımı.
>
> **İki farkı da not etmek gerekiyor:** Kantan tek kiracılı, toplu (batch) çalışan ve
> **hassas veri taşımayan** bir servis. 10–15 dakikalık gecikme orada sorun değil, kimse
> beklemiyor. Bizde de WhatsApp yolu kuyruklu, yani gecikme toleransı var — ama sağlık
> verisi ve çok kiracılı SaaS yükümlülüğü var.

Apple Silicon'ın **birleşik belleği** çıkarım için gerçekten güçlü: CPU ve GPU aynı bellek
havuzunu paylaştığı için, ayrık GPU'da aynı VRAM'i almak çok daha pahalıya geliyor. MLX ile
Apple donanımında llama.cpp'ye göre belirgin hız kazancı raporlanıyor.

**Ama bizim bağlamımızda:**

| | |
|---|---|
| Tek kurulum / kişisel proje / ofis kutusu | ✅ mantıklı |
| **Çok kiracılı SaaS'ın arka ucu** | ❌ mimari olarak yersiz |

Gerekçe: ofisteki bir Mac veri merkezi değil. Yedeklilik yok, tek nokta arızası var, ofis
ağına ve elektriğine bağlı, fiziksel risk taşıyor. Bugün Hetzner'de duran bir sistemi ofise
bağlamak, kazanılan tüm altyapı olgunluğunu geri veriyor.

#### Asıl mesele donanım değil, kutunun NEREDE durduğu

Yukarıdaki itiraz ("ofisteki Mac veri merkezi değil") Apple Silicon'a değil, **ofise**
yönelikti. Apple donanımı veri merkezinde de kiralanabiliyor:

| Yol | Mertebe |
|---|---|
| Mac mini kolokasyon (kendi cihazın, veri merkezinde) | ~$30–60/ay |
| Yönetilen özel Mac (MacStadium vb.) | ~$79–199/ay |
| AWS EC2 Mac (M4) | ~$500/ay |

Yani Apple Silicon ile **veri merkezi disiplinini birlikte** almak mümkün. Bu, D'yi ciddi bir
seçenek hâline getiriyor — ofis makinesi olmaktan çıkardığın anda.

> **Güvenlik notu — atlanmaması gereken.** Kantan'ın geliştiricisi süreç içinde
> **hacklendiğini** anlatıyor: içerideki tüm verilere ulaşılmış, bilgisayarın kontrolü ele
> geçirilmiş (bir arkadaşı tarafından, kontrollü biçimde). Bu bizim için teorik bir risk
> değil: VeriMaya **sağlık verisi** tutuyor. Modeli ofisteki bir makineye taşımak, saldırı
> yüzeyini ofis ağına taşımak demektir. Hetzner + Cloudflare + firewall disiplini
> (`MIMARI.md` § Güvenlik çerçevesi) bir sebeple kuruldu.
>
> Kısacası: **Apple Silicon'a itiraz yok, ofise itiraz var.**

> **Ve D'nin bir yeri daha var — arka uç olarak değil, ÜRÜN olarak.** Aşağıda §5.

### E — Hibrit

Rutin işleri yerel küçük model, zor olanları barındırılan model. Ya da: araç seçimi (kolay)
yerel, çıkarım (zor) barındırılan.

Teorik olarak en verimli, **pratikte iki sistemi birden işletmek** demek. Ölçüm altyapısı
oturmadan girilmemeli.

---

## 3b. İlk gerçek ölçüm (2026-08-23, Mistral small)

Gerçek muhasebe WhatsApp grubu (4.695 mesaj, 1.224'ü para içeriyor) üzerinden rastgele
örneklem. **İkisinin de çalıştığı 10 vaka** — kalanlar sağlayıcı hız sınırına (HTTP 429)
takıldı, bu yüzden örneklem küçük ve sonuç yön gösterir, kesin değildir.

| | REGEX | LLM |
|---|---|---|
| Taslak üretti | 10/10 | 10/10 |
| **Para birimi doğru** | 6/10 | **9/10** |
| Karşı taraf buldu | 2/10 | **4/10** |

Somut örnekler:

```
"Dg ye olan 1617 euro borcumuzu mylab bize fatura etti"
  REGEX  gider · 1.617 TRY · —          ✗ para birimi
  LLM    gider · 1.617 EUR · mylab      ✓

"Kart ile 50 pound alındı."
  REGEX  gelir · 50 TRY · —             ✗
  LLM    gelir · 50 GBP · —             ✓

"Yani bugun ANKA LAB ICIN TNC YE toplamda 1.390 EURO odenmis oldu."
  REGEX  gider · 1.390 TRY · —          ✗
  LLM    gider · 1.390 EUR · TNC        ✓

Çok satırlı tedavi dökümü (karmaşık)
  REGEX  gider · 7.900 GBP · —          ✓ tutar
  LLM    gelir · 3.950 TRY · —          ✗ LLM burada yanıldı
```

### Ücretli katman sonrası tam ölçüm (40 gerçek mesaj)

Hız sınırı kalkınca örneklem tamamlandı. **Üretimle aynı ayarlar** (kişi listesi 100 ile
sınırlı, aynı maskeleme):

| | REGEX | LLM |
|---|---|---|
| Taslak üretti | **40/40** | 31/40 |
| Para birimi doğru | 25/40 (%63) | **31/40 (%78)** |
| **Karşı taraf buldu** | 3/40 (%8) | **25/40 (%63)** |

**Karşı taraf 8% → 63%.** Bu, `ai_corrections`'ta en çok düzeltilen alan; en büyük kazanç orada.

**Ama LLM 9 mesajda hiç taslak üretmiyor** — regex her zaman üretiyor. Yedek yol bu yüzden
değerli: `openai_compatible_fallback` yolu boş LLM çıktısında regex'e düşüyor ve kullanıcı
yine bir taslak görüyor.

### Ölçüm harness'i iki kez yanılttı — not düşülmeli

1. **Sentetik isim listesi mesajı bozdu.** İsimleri büyük harfli kelime çiftlerinden
   çıkarmıştım; `"Ödeme Alındı"` da listeye girmiş, `"Jack Hogsden 3530 gbp nakit ödeme
   alındı"` → `"[HASTA] 3530 gbp nakit [HASTA]"` olmuş. Model haklı olarak susmuş.
   İlk okuma "LLM %58 başarısız" idi — **yanlıştı.**
2. **Kişi listesi boyutu sonucu değiştirdi.** 771 kişi → %43 üretim; 100 kişi (üretim sınırı)
   → %78. Yani liste büyüdükçe model kötüleşiyor.

> **2. maddeden çıkan gerçek ürün bulgusu:** modele giden kişi listesi **opak UUID**'lerden
> ibaret (`patient_ref`), mesajdaki isimler ise `[HASTA]` ile maskeli. **Model ikisini
> eşleştiremez** — hangi UUID'nin hangi `[HASTA]` olduğunu bilmesinin yolu yok. Yani bugünkü
> hâliyle liste yalnız gürültü ve kaliteyi düşürüyor.
>
> **Doğrusu zaten projede var:** AI-11a'nın Maya araç seçiminde `KISI_n` token'ı ile UUID
> **eşleştirilmiş** olarak gönderiliyor. WhatsApp çıkarım yolu bu desene geçirilmeli — o
> zaman `contact_id` de doğru dolabilir. **Boyut: S–M.**

### KISI_n eşleştirmesi + model boyutu — kontrollü ölçüm

`contact_id` doldurulabilsin diye maskeleme `KISI_n` token eşleşmesine çevrildi
(AI-11a deseni). **Ama önce kötüleştirdi** — aynı liste ve aynı 40 mesajla A/B:

| Maskeleme | `mistral-small` | `mistral-medium` |
|---|---|---|
| `[HASTA]` (eski) | 36/40 | 39/40 |
| `KISI_n` (yeni) | **30/40** | **39/40** |

**Okunuş:** token eşleştirmesi küçük modele ek bilişsel yük bindiriyor ve model taslak
üretmeyi bırakıyor. Büyük modelde bu yük **tamamen kayboluyor.** Yani tasarım doğru,
kısıt modelin boyutuydu — ölçmeden karar verilseydi doğru tasarım yanlış sebeple geri
alınacaktı.

### Nihai ölçüm — `mistral-medium-latest`, 40 gerçek mesaj

| | REGEX | LLM |
|---|---|---|
| Taslak üretti | 40/40 | 38/40 (%95) |
| Para birimi doğru | 25/40 (%63) | **38/40 (%95)** |
| Karşı taraf buldu | 3/40 (%8) | **24/40 (%60)** |

40 mesaj **0,0124 USD**. Mesaj başına ~0,0003 USD — günde 200 mesajlık bir acente için
**aylık ~2 USD**.

> **Model seçimi kararı:** `mistral-small` yetmiyor (para birimi %55–78 arası savruluyor,
> token eşleştirmesini kaldıramıyor). `mistral-medium` %95'e çıkıyor ve maliyet yine
> önemsiz. Küçük modelle "idare etmek" burada yanlış ekonomi — kazanılan kuruş, düzeltme
> emeğiyle geri ödeniyor.

**Okunuş:** LLM yazılı para birimini ("euro", "pound") ve yönü ("alındı"/"ödendi") belirgin
biçimde daha iyi çözüyor. Ama **her vakada üstün değil** — çok satırlı, birden çok tutar
içeren dökümlerde yanılabiliyor. Yani LLM regex'i "bitirmiyor"; yedek yol değerini koruyor.

### Ölçüm sırasında bulunan iki kusur

1. **`[HASTA]` yer tutucusu çıktıya sızıyordu.** Modele maskelenmiş metin gidiyor
   ("Dexy Murphy" → `[HASTA]`), model de karşı taraf adı olarak yer tutucuyu geri veriyordu.
   Temizlenmeseydi kayda `contact_label: "[HASTA]"` yazılacaktı. `stripPlaceholders` eklendi,
   testli, mutasyonla doğrulandı.
2. **Sağlayıcı hız sınırı gerçek bir kısıt.** 40 mesajlık bir denemede çağrıların çoğu 429
   döndü. Üretimde kuyruk çağrıları doğal olarak seyreltiyor ama **toplu gelen kutusu
   işleme** (`processInbox`) patlama yaratabilir. Ücretli katman ve/veya çağrı seyreltme
   gerekecek — açmadan önce bakılmalı.

---

## 4. Uzun vadeli doğru hamle: önce ölçü aleti

Bu sorunun cazip ama yanlış cevabı, bugün nihai altyapıyı seçmek. Doğru cevap şu:

> **Motoru seçmeden önce ölçü aletini kur.**

Çünkü "hangi model Türkçede yeterli" sorusunun cevabı hissiyatla verilemez — ve verilirse
altı ay sonra geri dönmek pahalıya patlar.

**İyi haber: ölçü aleti zaten kendiliğinden birikiyor.**

| Kaynak | Ne söylüyor |
|---|---|
| `ai_corrections` | AI taslağının **hangi alanı** ne sıklıkla düzeltiliyor |
| `maya_questions` | Maya hangi soruyu cevaplayamadı |
| `jobs → llm.parse` | Hangi yol (heuristic / LLM / fallback), ne kadar token, ne maliyet |
| AI-03 raporu | Yukarıdakileri okunabilir hâle getiriyor |

Bunlar birikince elimizde **gerçek mesajlardan çıkmış bir Türkçe değerlendirme kümesi**
olur. O kümeyle A, B, C, D birbirine karşı **ölçülerek** kıyaslanabilir — tahminle değil.

### Önerilen sıra

1. **B'yi aç** (AB bölgesi barındırılan API). Kalite tavanını gör, ölçümü başlat.
   Kurulum 3 env değişkeni; kod hazır.
   *Neden önce barındırılan:* yerel modelin Türkçesini ölçmek için önce bir **tavan**
   gerekiyor. "Yeterli mi" sorusu ancak "neye göre" cevabıyla anlamlı.
2. **Değerlendirme kümesini biriktir** — 4–6 hafta gerçek kullanım. AI-03 raporu zaten
   sayıyor.
3. **O kümeyle yerel modelleri test et.** Türkçe başarımı yeterliyse C ekonomik ve
   egemenlik açısından kazanır; değilse B'de kalınır.
4. Karar ne olursa olsun **`LlmClient` arayüzü sayesinde tek sınıflık iş.**

> **Mimarinin ödülü burada görünüyor.** `LlmClient` üç metotlu bir arayüz ve seçim
> `createLlmClientFromEnv`'de. Sağlayıcı değiştirmek yeni bir sınıf yazmak demek — domain
> kodu hiç bilmiyor. Bu, "sonra karar veririz" demeyi **ucuz** kılan şey. Adaptör katmanı
> (AGENTS ilke 5) tam bu gün için vardı.

---

## 5. Asıl uzun vadeli fikir: egemenlik bir ürün olabilir

Kullanıcının işaret ettiği yönde, arka uç seçiminden daha değerli bir şey var.

Sağlık verisiyle çalışan bir klinik ya da hastane, **verisinin hiçbir yere gitmemesini**
şart koşabilir. Bugün böyle bir müşteriye satılacak bir şey yok.

**"Yerinde kurulum" (on-prem) bir SKU olabilir:** tek kutu, müşterinin kendi mekânında,
model ve veritabanı içeride, internete çıkışsız. Apple Silicon donanımı — kullanıcının
işaret ettiği yaklaşım — böyle bir kutunun **tam olarak doğru** donanımı olur: sessiz, düşük
güç tüketimli, veri merkezi gerektirmeyen, birleşik bellekle büyük model taşıyabilen.

Yani D seçeneği yanlış değil; **yanlış yere konulduğunda** yanlış. SaaS'ın arka ucu olarak
zayıf, egemenlik isteyen müşteriye satılan ürün olarak güçlü.

**Ön koşullar (ikisi de bugün yok):**
- Tek-kiracılı kurulum yolu (bugün her şey çok kiracılı varsayımıyla yazılı — RLS, tenant_id)
- Yerinde güncelleme ve destek modeli

**Bu bir fikirdir, kalem değil.** Gerçek bir müşteri "verim çıkmasın" demeden yatırım
yapılmaz. `docs/FIKIRLER.md`'ye taşınır.

---

## 6. Bu dosyanın söylemediği şey

Hangi sağlayıcının seçileceğini ve LLM'in açılıp açılmayacağını **söylemiyor.** İkisi de
ürün kararı ve ikisi de ölçüm gerektiriyor.

Söylediği tek şey: **bugün karar vermek zorunda değiliz ve vermemeliyiz** — çünkü karar
ucuz kalacak şekilde inşa edilmiş, ve doğru kararı verecek veri birkaç hafta içinde
kendiliğinden gelecek.

**Ama bugün yapılabilecek iki şey var:**
- **AI-10a** — "canlı sistemde dış LLM kullanılmıyor" gerçeğini yaz. Bugün doğru ve
  KVKK açısından anlatılabilecek en güçlü cümle.
- **B'yi açmaya karar verilirse** — 3 env değişkeni + veri politikası (AI-10b).

---

## Kaynaklar

Apple Silicon / MLX çıkarım başarımı ve birleşik bellek avantajı için:
- <https://spicyneuron.substack.com/p/a-mac-studio-for-local-ai-6-months>
- <https://dev.to/bspann/running-llms-locally-on-macos-the-complete-2026-comparison-48fc>
- <https://news.ycombinator.com/item?id=46907001>

Apple donanımı veri merkezi/kolokasyon fiyat mertebeleri:
- <https://macstadium.com/bare-metal-mac>
- <https://www.macminivault.com/mac-mini-colocation/>
- <https://macly.io/alternatives/aws-ec2-mac>

kantan.news altyapısı: geliştiricinin kendi video transkriptinden (2026-08-23, kullanıcı
paylaştı). Servis **M4 Pro Mac mini 48 GB** üzerinde; Mac Studio (512 GB'a kadar birleşik
bellek) video prodüksiyonu ve çoklu model çalıştırma için sonradan alınmış.
