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

> **Ama D'nin gerçek yeri var — arka uç olarak değil, ÜRÜN olarak.** Aşağıda §5.

### E — Hibrit

Rutin işleri yerel küçük model, zor olanları barındırılan model. Ya da: araç seçimi (kolay)
yerel, çıkarım (zor) barındırılan.

Teorik olarak en verimli, **pratikte iki sistemi birden işletmek** demek. Ölçüm altyapısı
oturmadan girilmemeli.

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

kantan.news'in hangi altyapıda çalıştığı **doğrulanamadı** — sitesinde ve aramada teknik
altyapı bilgisi yok. Mac Studio üzerinde çalıştığı bilgisi kullanıcıdan geldi, bağımsız
kaynakla teyit edilmedi.
