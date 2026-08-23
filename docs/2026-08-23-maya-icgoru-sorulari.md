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

#### ✅ Genişletildi: ünvan / görev kavramı (2026-08-23)

> **Kullanıcı:** *"Hekim, koordinatör, reklam uzmanı, satışçı gibi title'lar kişiler için olası
> görünüyor. Departman ve görevler gibi oldu. Ben şu an olsun diyorum ama negatif, kaldırılamaz
> zararı varsa söyle."*

**Değerlendirme: yapılabilir, kaldırılamaz bir zararı yok.** Ama üç somut risk var ve üçü de
baştan kurala bağlanırsa sorun çıkmaz.

**Mevcut model bunu zaten kaldırıyor.** `contacts` üzerinde üç eksen hâlihazırda var:

| Eksen | Alan | Ne söyler |
|---|---|---|
| Kayıt cinsi | `contact_type_id` | Hasta / Klinik / Otel / Transfer / Personel / Diğer |
| Bizim mi | `is_internal` | Kendi ekibimiz mi, dışarıdan mı |
| Hangi firma | `organization_id` | Hangi klinik/otel/acentede |

Ünvan **dördüncü ve dik bir eksen**: *bu insan ne iş yapıyor.* Örnekler mevcut modele temiz
oturuyor:

```
Hekim         → contact_type: Personel · is_internal: false · organization: "Ada Klinik" · ünvan: Hekim
Koordinatör   → contact_type: Personel · is_internal: true                              · ünvan: Koordinatör
Reklam uzmanı → contact_type: Personel · is_internal: true                              · ünvan: Reklam Uzmanı
```

Yani hekim için ayrı bir varlık icat etmeye gerek yok — **Karar 1 (b) ile ünvan aynı işi
çözüyor.** `appointments.doctor_contact_id` eklenir, o FK'nın işaret ettiği kişi ünvanı "Hekim"
olan bir `contacts` satırıdır.

##### Risk 1 — Ünvan yetkiye dönüşürse (en ciddi olan)

Sistemde **zaten** bir yetki modeli var: `user` + `member` rolü (owner/admin/agent) +
`tenant_permission_overrides`. Ünvan bunun yanına ikinci bir yetki sistemi olarak yerleşirse,
"bu kişi ne yapabilir" sorusunun iki cevabı olur ve zamanla birbirinden ayrılırlar.

> **Kural (bağlayıcı):** Ünvan **yalnız tanımlayıcı bilgidir.** Hiçbir izin kontrolünde
> okunmaz. `hasOrgPermission` çağrısında ünvan geçmez. Rapor ve filtre için vardır, kapı için
> değil.

Bu kural AGENTS.md'ye yazılırsa risk sıfırlanır. Yazılmazsa altı ay sonra biri "koordinatör
ünvanlıysa finansı görsün" diye kısa yol yazar ve yetki modeli ikiye bölünür.

##### Risk 2 — `user` ↔ `contacts` ikiliği zaten var, derinleşmesin

Bugün "kim sorumlu" sorusunun iki temsili var:

- `contacts.assigned_user_id` → **user** tablosuna FK (giriş yapan hesap)
- `transactions.responsible_contact_id` → **contacts** tablosuna FK (kişi kaydı)

Koordinatör hem giriş yapan bir kullanıcı hem de bir kişi kaydı olarak var olabilir. Ünvan
ikisinden hangisinde yaşayacak?

> **Kural:** Ünvan **yalnız `contacts`'te yaşar.** `user` tablosuna ünvan alanı eklenmez.
> Giriş yapan bir personelin ünvanı, ona bağlı kişi kaydından okunur.

İki yere de eklenirse ikisi kaçınılmaz olarak ayrışır ve "koordinatör kim" sorusunun iki farklı
cevabı olur.

##### Risk 3 — Serbest metin girilirse rapor parçalanır

`Koordinatör` / `koordinatör` / `Koordinator` / `Kordinatör` — dört ayrı değer, dört ayrı satır,
hiçbir rapor doğru çalışmaz. Bu geri alınması gerçekten zahmetli olan tek şey: 500 kayıt yanlış
yazılmış ünvanla dolduktan sonra temizlemek elle iştir.

> **Kural:** Serbest metin **yok.** `contact_types` / `organizations` / `appointment_types` ile
> aynı desen: tenant'ın yönettiği sözlük tablosu + FK.

##### Geri alınabilirlik — dürüst cevap

| Ne | Geri alınabilir mi |
|---|---|
| Kolon/tablo düşürmek | ✅ kolay |
| Tek ünvan → çok ünvan (kişi birden çok görev yapıyorsa) | ✅ kolay — FK → ara tablo, düz migration |
| Yanlış modelle girilmiş 500 kayıt | 🟡 zahmetli ama mümkün |
| Ünvan yetki kontrolüne sızmışsa | ❌ **zor** — kod her yere dağılır |
| İnsanların güvendiği bir rapor ünvana dayanıyorsa | ❌ **zor** — model değişince rapor bozulur, güven gider |

Son iki satır Risk 1 ve Risk 3'ün sonucudur. İkisi de baştan kurala bağlanabiliyor, yani
**kaldırılamaz zarar önlenebilir.**

##### Öneri

`contact_titles` sözlük tablosu (tenant yönetir, `contact_types` deseni birebir) +
`contacts.title_id` FK. **Kişi başına tek ünvan** ile başla.

Çok ünvan (bir kişi hem satışçı hem koordinatör) muhtemelen 5-15 kişilik ekipte gerçek bir
ihtiyaç — ama tek ünvandan çoka geçiş düz bir migration. Baştan ara tablo kurmak bugünkü işi
büyütür, faydası ihtiyaç ortaya çıkana kadar sıfır.

**Boyut: S–M** (sözlük tablosu + kişi formunda alan + ayarlar ekranı; `contact_types` ekranı
kopyalanır).

**Kazanç sadece rapor değil:** hekim sorusu (Karar 1) bu tek işle çözülüyor, ve E kümesindeki
ekip soruları ("reklam uzmanının getirdiği lead kalitesi", "satışçının dönüşüm oranı") ünvan
olmadan zaten yazılamıyordu.

### Karar 2 — RPT tam olarak ne demek? ✅ **CEVAPLANDI (2026-08-23)**

> **Kullanıcı:** *"RPT; operasyon tutmadı, düzeltme gereken hasta sorunu."*

Yani RPT **tek anlamlı ve tamamen olumsuz.** "İyi RPT / kötü RPT" ayrımı diye bir şey yok —
önceki bölümde önerilen "ücretli mi diye bak, ücretsizse revizyondur" fikri gereksiz. Düştü.

**Sonuç sadeleşti:** `appointment_type = 'RPT'` sayısı doğrudan bir **kalite göstergesi**.
Arttıysa kötü haber; başka koşula bakmaya gerek yok. Örnek 2 bu haliyle bugün hesaplanabilir
(klinik kırılımıyla; hekim kırılımı Karar 1'e bağlı).

**Ama bu bir sonraki soruyu açtı** — aşağıdaki 5. bölüm.

---

## 5. Genel sorun: sistem "ne oldu"yu biliyor, "ne ters gitti"yi bilmiyor

> **Kullanıcı (2026-08-23):** *"Buna benzer ileride diğer departmanların sorunları da olabilir,
> bu konuyu da tartışalım."*

Bu, bu dosyadaki en önemli tespit. RPT'ye bakınca görünüyor: RPT bir **randevu tipi** olarak
tutuluyor, çünkü kliniğin sorunu tesadüfen yeni bir randevu doğuruyor. Diğer departmanların
sorunları böyle bir iz bırakmıyor:

| Departman | Tipik sorun | Bugün sistemde izi | 
|---|---|---|
| Klinik | Operasyon tutmadı → revizyon | ✅ `appointment_type = 'RPT'` (tesadüfen) |
| Otel | Oda uygun değil, konaklama şikâyeti | ❌ hiç yok |
| Transfer | Karşılamaya gelmedi, geç kaldı | ❌ hiç yok |
| Satış | Yanlış fiyat verildi, hasta kaçtı | ❌ hiç yok |
| Reklam | Kalitesiz lead, yanlış hedefleme | ❌ hiç yok |
| Koordinasyon | Takip edilmedi, hasta kayboldu | 🟡 dolaylı (temassızlık raporu) |

**Sonuç:** bugünkü sistem *olan*ı ölçüyor — randevu, tahsilat, harcama. *Ters giden*i ölçmüyor.
Oysa kullanıcının verdiği AI-05 örneklerinin ikisi de ters giden şeyler hakkında.

### Öneri: tek genel kavram — olay kaydı

Her departman için ayrı alan/bayrak açmak yerine **tek bir "olay" (incident) kaydı**:

```
olay_kaydi
  dosya          → contacts (hangi hasta dosyası)
  alan           → klinik | otel | transfer | satış | reklam | koordinasyon
  tür            → tenant sözlüğü ("Revizyon gerekti", "Karşılamaya gelinmedi"…)
  sorumlu taraf  → contacts (hangi klinik / hangi personel)
  maliyet        → kuruş, opsiyonel (bu hata bize ne kadara mal oldu)
  durum          → açık | çözüldü
  açıklama       → serbest metin
```

**Neden tek tablo:** altı departman için altı ayrı alan açarsan altı ayrı migration, altı ayrı
ekran ve **ortak rapor yok** olur. Tek tabloda "bu ay hangi alanda kaç sorun, kime kaça mal
oldu" tek sorguyla çıkar. AI-05'in beslendiği asıl kaynak da bu olur.

### RPT bununla ne olacak — değişmiyor

**RPT randevusu olduğu gibi kalır.** Karıştırmamak gerek:

- **RPT randevusu = olgu.** Gerçekten yapılan bir randevu. Takvimde yeri var, maliyeti var.
- **Olay kaydı = yorum.** "Bu revizyon, ilk operasyon tutmadığı için oldu" değerlendirmesi.

İkisi ayrı kalmalı, opsiyonel olarak birbirine bağlanmalı. RPT'yi olay kaydına *çevirmek*
geçmiş veriyi bozar ve randevu takvimini eksiltir.

### Bu tip sistemlerin klasik ölüm sebebi

Olay kaydı sistemlerinin çoğu **veri girilmediği için** ölür. Kimse ekstra iş yapmak istemez,
özellikle "hata kaydı" gibi kendini suçlar gibi hissettiren bir iş.

Üç şart, üçü de zorunlu:

1. **Tek tıkla girilsin.** Sorunun fark edildiği yerden — hasta dosyasından — girilmeli. Ayrı
   menüye gidip form doldurmak gerekiyorsa girilmez.
2. **Bağlam önceden dolsun.** Dosya, klinik, tarih zaten biliniyor; kullanıcı sadece türü ve
   varsa maliyeti seçsin.
3. **Karşılığı görünsün.** Girilen kayıt bir rapora dönüşmeli ve o rapor kullanılmalı. Kimsenin
   bakmadığı bir kayda kimse veri girmez.

**Ve tek departmanla başla.** Altı departmanın tür listesini ilk günde yazma — klinik/RPT ile
başla, döngünün çalıştığını gör (girildi mi, rapora düştü mü, karar değiştirdi mi), sonra
genişlet. Çalışmayan bir döngüyü altı kat büyütmek altı kat çöp üretir.

**Boyut: M** (tek tablo + dosya içi giriş + tek rapor, tek departman kapsamında).

---

## 6. Sistem hazır mı — dürüst cevap

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

## 7. Önerilen sıra

| Adım | İş | Boyut | Durum |
|---|---|---|---|
| 1 | **Referans değeri raporu** — "X kaç hasta getirdi, toplam ne kazandırdı, koordinatörü kim". Örnek 1'in tam karşılığı, yeni alan gerektirmiyor | **M** | hazır |
| 2 | **Ünvan sözlüğü** — `contact_titles` + `contacts.title_id`. Hekim sorusunu da çözer | **S–M** | ✅ karar verildi |
| 3 | **Randevuya hekim alanı** — `appointments.doctor_contact_id` (2'ye bağlı) | **M** | ✅ karar verildi |
| 4 | **Karşılaştırma katmanı** — her metrik için "önceki dönem" ve "tenant ortalaması" | **M** | AI-05'in çekirdeği |
| 5 | **Eşik tablosu** — hangi değişim söylenmeye değer, minimum kayıt sayısı | **S** | 4'e bağlı |
| 6 | **Olay kaydı v1** — tek tablo, yalnız klinik departmanı ile başla | **M** | 5. bölüm |
| 7 | **Müdahale listesi v1** — şablon cümleler, önem sırasına dizili | **M** | 4+5+6 üstüne |

**1. adım tek başına sevk edilebilir** ve kullanıcının verdiği ilk örneği bugün karşılar. 4–7
olmadan da işe yarar. Oradan başlamak, AI-05'in tamamını beklemekten iyi.

**2 ve 3 birlikte gider** — ünvan olmadan hekim alanı anlamsız, hekim olmadan ünvanın en net
kullanım yeri eksik.

> **Bağlayıcı iki kural (ünvan kararının şartı, AGENTS.md'ye işlenecek):**
> 1. Ünvan hiçbir izin kontrolünde okunmaz — yetki modeli `user` + `member` rolüdür, tektir.
> 2. Ünvan yalnız `contacts`'te yaşar; `user` tablosuna ünvan alanı eklenmez.

---

## 8. Bu dosyanın statüsü

Bu bir **karar girdisi**, yapılacaklar listesi değil. Tek kaynak kuralı gereği açık iş
`docs/2026-08-11-YAPILACAKLAR.md` § AI-05 kaleminde kalır; burası o kalemin arkasındaki
düşünme kaydıdır.

Kararlar verilince AI-05 kalemi bu dosyaya atıf yapacak şekilde güncellenir ve kodlanabilir
hâle gelir.
