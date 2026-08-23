# Maya — içgörü soruları kataloğu (AI-05 girdisi)

> **Nereden çıktı (2026-08-23, kullanıcı).** İki örnek cümle verildi:
>
> 1. *"X kişisi 4 tane referans hasta gönderdi, ilgilenen koordinatör Y. Bu hasta ile
>    ilgilenilmesi daha yüksek kazanç."*
> 2. *"Z hekimin tedavilerinde RPT oranı çok arttı, sebebini öğrenip hataları düzeltelim."*
>
> **Bu iki cümle AI-05'in eksik tanımıdır.** AI-05 ("Müdahale Listesi") 2026-08-20'den beri
> şu gerekçeyle bekliyordu: *"rapor hangi soruyu cevaplayacak, hiçbir yerde yazılı değil."*
> Bu dosya o boşluğu doldurmak için açıldı. Kalem: `docs/2026-08-11-YAPILACAKLAR.md` § AI-05.

---

## 1. Önce cins farkı — bu AI-11 değil, AI-05

Bunları karıştırmak en pahalı hata olur, çünkü ikisi farklı mekanizma:

| | **AI-11 (Maya)** | **AI-05 (Müdahale listesi)** |
|---|---|---|
| Kim başlatır | Kullanıcı sorar | Sistem söyler |
| Ne zaman | Anlık | Dönemsel / tetiklenince |
| Cevap tipi | Tek gerçek ("1.450 GBP") | Çıkarım ("bu dosyaya öncelik ver") |
| Kaç kayıt gezer | Bir kişi, bir dönem | Bütün tenant, karşılaştırmalı |
| Yanılırsa | Kullanıcı fark eder, tekrar sorar | **Kullanıcı yanlış işe koşar** |
| Durum | ✅ canlıda (5 araç) | ⏸ tanımı yeni doldu — bu dosya |

Kullanıcının verdiği iki örnek de ikinci sütun. Maya'ya "X ne kadar borçlu" diye sormak gibi
değil; sistemin **kimse sormadan** "şuna bak" demesi.

> **Sonuç:** AI-11a'nın 5 aracı bu soruları cevaplayamaz ve cevaplaması da beklenmemeli.
> Bunlar ayrı bir yüzey (Raporlar → Müdahale Listesi, bugün "Yakında" rozetli yer tutucu).

---

## 2. Katalog

Sorular altı kümede. Her satırda **veri bugün var mı** kolonu asıl bilgidir — soru güzel olsa da
veri yoksa yazılamaz.

Durum işaretleri: ✅ veri hazır · 🟡 veri kısmen var · ❌ veri yok

### A. Değer ve öncelik — "kime önce bakılmalı"

| Söylenecek cümle | Gereken veri | Durum |
|---|---|---|
| "X 4 referans hasta gönderdi, koordinatörü Y — bu dosyaya öncelik" | `contacts.referred_by_contact_id` zinciri + `assigned_user_id` | ✅ |
| "X'in getirdiği hastaların toplam cirosu 42.000 GBP" | referans zinciri + `transactions.case_contact_id` | ✅ |
| "Bu ay en çok kazandıran 5 dosya" | `case_contact_id` bazında gelir − gider | ✅ |
| "Yüksek paketli hasta hâlâ teyit edilmedi" | `appointments.status` + dosya tutarı | ✅ |
| "Bu kişi hiç referans getirmedi ama 3 kez geldi" | referans + randevu sayısı | ✅ |

> **Not:** Referans zinciri `contacts` tablosunda kendine referans veren bir FK — yani
> "X'in getirdiğinin getirdiği" de izlenebilir. Bugün **hiçbir rapor bu alanı okumuyor.**
> Veri giriliyor (kişi formunda alan var), sorgulanmıyor.

### B. Kalite ve risk — "nerede bozuluyor"

| Söylenecek cümle | Gereken veri | Durum |
|---|---|---|
| "Z **kliniğinde** RPT oranı arttı" | `appointments.appointment_type = 'RPT'` + `clinic_contact_id` | ✅ |
| "Z **hekiminde** RPT oranı arttı" | hekim alanı | ❌ **yok** |
| "Şu klinikte no-show oranı yükseldi" | `appointments.status = 'no_show'` + klinik | ✅ |
| "Şu klinikte iptal oranı ortalamanın 2 katı" | `status = 'cancelled'` + klinik | ✅ |
| "Şu kaynaktan gelenler daha çok iptal ediyor" | `contacts.source` + randevu durumu | ✅ |
| "Şu paket tipinde şikâyet arttı" | şikâyet/komplikasyon kaydı | ❌ **yok** |

> `GET /v1/reports/appointment-metrics` bugün tamamlanma / no-show / iptal oranını **klinik
> kırılımıyla** zaten döndürüyor. Yani B kümesinin çoğu için altyapı hazır; eksik olan
> "geçen döneme göre arttı mı" karşılaştırması ve cümleye çevirme.

### C. Operasyon — "zamanında yapılmayan"

| Söylenecek cümle | Gereken veri | Durum |
|---|---|---|
| "Uçuşa 48 saat kaldı, transfer atanmadı" | AI-04 alarm motoru | ✅ **zaten var** |
| "Randevusu geçti ama işlem kaydı yok" | `appointments` + `transactions` | ✅ |
| "Bu dosyada gider var, gelir yok" | `case_contact_id` bazlı gelir/gider | ✅ |
| "14 gündür hiç temas edilmemiş 6 kişi var" | `untouched-contacts` raporu | ✅ **zaten var** |

### D. Tahsilat

| Söylenecek cümle | Gereken veri | Durum |
|---|---|---|
| "X'in açık bakiyesi 41 gündür duruyor" | `reports.balances` + yaşlandırma | 🟡 yaşlandırma yok |
| "Şu koordinatörün dosyalarında tahsilat gecikiyor" | `responsible_contact_id` + açık bakiye | ✅ |
| "Bu ay tahsilat geçen aya göre %30 düştü" | dönem karşılaştırması | ✅ |

> Yaşlandırma (aging) eksik: bakiye raporu "ne kadar açık" diyor, "kaç gündür açık" demiyor.
> `transactions.occurred_on` var, hesaplanabilir — küçük iş.

### E. Ekip

| Söylenecek cümle | Gereken veri | Durum |
|---|---|---|
| "Koordinatör Y'nin dönüşüm oranı düştü" | `assigned_user_id` + dosya sonucu | ✅ |
| "Y'nin dosyalarında ortalama kapanma süresi uzadı" | atama + ilk/son işlem tarihi | ✅ |
| "Y'de takip gecikmesi var" | temassızlık + atama | ✅ |

> **Uyarı:** Bu küme insan performansı ölçüyor. Yanlış hesaplanmış bir "Y kötü çalışıyor"
> cümlesi, yanlış bir tahsilat rakamından daha çok zarar verir. Bu kümeyi en son yaz ve
> **karşılaştırmayı mutlaka aynı koşullar arasında yap** (aynı paket tipi, aynı kaynak) —
> yoksa zor dosyalara bakan koordinatör sistematik olarak kötü görünür.

### F. Pazarlama

| Söylenecek cümle | Gereken veri | Durum |
|---|---|---|
| "Şu kampanyadan gelenler daha az dönüşüyor" | `contacts.campaign` + tahsilat | ✅ |
| "Reklam ayı ≠ tahsilat ayı" | kohort raporu | ✅ **zaten var** |
| "Şu kanalın gerçek ROAS'ı platformun söylediğinin yarısı" | `ad_metrics_daily` + tahsilat | ✅ **zaten var** |

---

## 3. Veri envanteri — özet

| Alan | Nerede | Durum |
|---|---|---|
| Referans zinciri | `contacts.referred_by_contact_id` (+ index) | ✅ şema, sözleşme, kişi formu — **rapor okumuyor** |
| Koordinatör (kişiye atanan) | `contacts.assigned_user_id` | ✅ |
| Sorumlu (işleme atanan) | `transactions.responsible_contact_id` | ✅ |
| Dosya bazlı gelir/gider | `transactions.case_contact_id` + `financeSummary` | ✅ |
| Randevu tipi (RPT dahil) | `appointments.appointment_type` | ✅ |
| Randevu durumu | `completed` / `cancelled` / `no_show` / `scheduled` | ✅ |
| Klinik / otel / transfer | `appointments.clinic_contact_id` vb. | ✅ |
| Kaynak / kanal / kampanya | `contacts.source` / `medium` / `campaign` | ✅ |
| **Hekim** | — | ❌ **hiç yok** |
| **Komplikasyon / şikâyet** | — | ❌ **hiç yok** |
| **Bakiye yaşlandırma** | hesaplanabilir, hesaplanmıyor | 🟡 |

**Sürpriz iyi haber:** kullanıcının verdiği 1. örnek (referans + koordinatör + kazanç) **bugünkü
veriyle tamamen yazılabilir.** Hiçbir yeni alan gerekmiyor.

**Sürpriz kötü haber:** 2. örnek (hekim) **yazılamaz.** Hekim diye bir kavram sistemde yok.

---

## 4. İki açık ürün kararı

Bunlar kod kararı değil, kullanıcının vermesi gereken kararlar. AI-05 kodlanmadan önce cevaplanmalı.

### Karar 1 — Hekim ayrı bir varlık olacak mı?

Bugün en ince kırılım **klinik**. "Z hekimi" demek için üç seçenek var:

| Seçenek | Ne demek | Maliyet |
|---|---|---|
| **(a) Klinikle yetin** | "Z kliniğinde RPT arttı" denir, hekim denmez | **S** — bugün mümkün |
| **(b) Randevuya hekim alanı** | `appointments.doctor_contact_id` — hekim de bir "kişi" (DOMAIN-02 modeline uyar) | **M** — migration + form + rapor |
| **(c) Hekim ayrı tablo** | Ayrı varlık, uzmanlık, çalıştığı klinikler | **L** — DOMAIN-02'nin "kişi daima insandır" ilkesiyle çelişmez ama fazla |

**Öneri: (b).** Hekim zaten bir insan; `contacts` içinde "Hekim" tipiyle durabilir, randevuya FK
ile bağlanır. Klinik/otel/transfer için bu desen zaten var (`clinic_contact_id`) — aynısı.
Yeni model icat etmeye gerek yok.

**Ama önce sor:** acente hangi hekimin ameliyat ettiğini gerçekten **biliyor ve kaydediyor mu?**
Klinik atıyorsa ve hekim son anda değişiyorsa, alan boş kalır ve rapor yanıltıcı olur.
Doldurulmayan alan, olmayan alandan kötüdür.

### Karar 2 — RPT tam olarak ne demek?

Bugün `RPT` bir **randevu tipi** değeri (`Yeni Hasta` / `Devam Hastası` / `RPT`). Legacy
eşlemesinde de aynen korunmuş.

Sorun: RPT iki farklı şeyi birden gösteriyor olabilir —

- **İyi RPT:** hasta memnun, ikinci seans için geldi → ciro artışı
- **Kötü RPT:** ilk operasyon tutmadı, düzeltme → maliyet ve itibar kaybı

Rapor "RPT oranı arttı" derse ve bunların çoğu iyi RPT'yse, sistem **iyi haberi kötü haber
gibi sunmuş olur.** Kullanıcı bir kere yanlış alarma koşarsa listeye bir daha güvenmez.

**Karar gereken:** ikisi ayrılacak mı?
- **(a)** Ayrılmaz — "RPT oranı" ham sayı olarak verilir, yorumu insana bırakılır
- **(b)** Randevu tipine dördüncü değer eklenir (`RPT-Revizyon`), enum genişletilir
- **(c)** Randevuya "ücretli mi" işareti konur — ücretsiz RPT genelde revizyondur

**Öneri: (c).** Enum genişletmek geçmiş veriyi bozar ve kullanıcıdan yeni disiplin ister.
Oysa "bu RPT için para alındı mı" sorusunun cevabı **zaten `transactions`'da var** — dosyaya
bağlı gelir kaydı varsa ücretli, yoksa revizyon şüphesi. Yeni alan gerekmez, mevcut veriden
türetilir.

---

## 5. Sistem hazır mı — dürüst cevap

**Veri katmanı: büyük ölçüde hazır.** Altı kümenin beşi bugünkü şemayla yazılabilir. Referans
zinciri, koordinatör ataması, dosya bazlı kâr, randevu durumu, klinik kırılımı, kaynak/kampanya
— hepsi var ve indeksli.

**Rapor katmanı: yarı hazır.** `appointment-metrics`, `balances`, `cohorts`,
`untouched-contacts`, `marketing` zaten var. Eksik olan tek tek raporlar değil, **aralarındaki
karşılaştırma** — "geçen döneme göre", "ortalamaya göre", "diğer kliniklere göre".

**Maya (AI-11): hazır değil ve olması da gerekmiyor.** 5 aracın hiçbiri bu soruları kapsamıyor.
Kapsaması da yanlış olur — Maya *sorulana* cevap veren yüzey. Bu sorular *söylenen* şeyler.

**Eksik olan iki şey:**

1. **Karşılaştırma motoru.** Bugün her rapor tek bir dönemi anlatıyor. "Arttı", "düştü",
   "ortalamanın üstünde" demek için iki dönemi yan yana koyan bir katman gerekiyor. AI-05'in
   asıl işi bu — dil modeli değil, SQL.
2. **Eşik ve önem sırası.** "RPT oranı %12'den %14'e çıktı" bir şey ifade etmez. Hangi değişim
   söylemeye değer? Kaç kayıt altında istatistik anlamsız? Bu eşikler yazılmadan liste ya
   gürültü üretir ya sessiz kalır.

> **En kritik tasarım kararı:** Müdahale listesi **dil modeliyle üretilmemeli.** Cümleler
> şablon, rakamlar SQL. AI-11a'da kurulan ilke burada da geçerli: *model işaret eder, sistem
> söyler.* Bir çıkarım cümlesi yanlış rakamla çıkarsa kullanıcı yanlış işe koşar — ve o hatayı
> fark etmesi, yanlış bir bakiye rakamını fark etmesinden çok daha zordur.

---

## 6. Önerilen sıra

| Adım | İş | Boyut |
|---|---|---|
| 1 | **Karar 1 ve Karar 2 cevaplanır** (hekim, RPT) | — kullanıcı |
| 2 | **Referans değeri raporu** — "X kaç hasta getirdi, toplam ne kazandırdı". Örnek 1'in tam karşılığı, yeni alan gerektirmiyor, tek başına değerli | **M** |
| 3 | **Karşılaştırma katmanı** — her metrik için "önceki dönem" ve "tenant ortalaması" | **M** |
| 4 | **Eşik tablosu** — hangi değişim söylenmeye değer, minimum kayıt sayısı | **S** |
| 5 | **Müdahale listesi v1** — yukarıdakilerin üstüne şablon cümleler, önem sırasına dizili | **M** |
| 6 | Hekim alanı (Karar 1 (b) seçilirse) | **M** |

**2. adım tek başına sevk edilebilir** ve kullanıcının verdiği ilk örneği bugün karşılar. 3–5
olmadan da işe yarar. Oradan başlamak, AI-05'in tamamını beklemekten iyi.

---

## 7. Bu dosyanın statüsü

Bu bir **karar girdisi**, yapılacaklar listesi değil. Tek kaynak kuralı gereği açık iş
`docs/2026-08-11-YAPILACAKLAR.md` § AI-05 kaleminde kalır; burası o kalemin arkasındaki
düşünme kaydıdır.

Kararlar verilince AI-05 kalemi bu dosyaya atıf yapacak şekilde güncellenir ve kodlanabilir
hâle gelir.
