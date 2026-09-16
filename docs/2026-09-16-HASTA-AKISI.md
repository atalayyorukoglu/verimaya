# OrbisMed hasta akışı — WhatsApp gruplarından çıkarılan gerçek akış (2026-09-16)

Kaynak: `docs/whatsapp-01` — 8 grup, 42 bin satır, Haziran 2023 → 15 Eylül 2026.
Amaç: kişi türü **Hasta** olan kayıtlarda sistemin (ve Kişi Akışı'ndaki AI özetin) neyi
kontrol edeceğini, eksikte neyi soracağını belirlemek. Bu belge AI'ya verilecek "hasta
akışı" şablonunun ilk taslağıdır; 6. bölümdeki öneriler ürün kararı bekler.

## 1. Gruplar ne taşıyor

| Grup | Dönem | İçerik | Akıştaki yeri |
|---|---|---|---|
| Rezervasyon | 2022→ | Satışçı bilet + hasta bilgisi + tedavi planı + otel/transfer kapsamı atar; koordinatör "işlemlerini yapıyorum / konfirme maili atıldı" der | Aşama 1–3 |
| TNC-ORBISMED REZERVASYON | 2025-02→ | TNC kliniğinden randevu istenir ("Geliş … Dönüş … randevusunun oluşturulmasını rica ederim"); klinik ertesi günün listesini akşam 17:00 civarı atar; hekimle plan tartışması | Aşama 2, 5 |
| Dentgroup Randevu | 2026-08→ | Aynısı, Dentgroup kliniği için; ilaç/alerji ve implant markası burada yazılıyor | Aşama 2, 5 |
| AYD 🚐 | 2026-08→ | Havalimanı karşılama/uğurlama: bilet görseli + isim + pax + otel; AYD panosu; vcf ile hasta numarası | Aşama 4 |
| Ramazan Abi Transfer | 2026-08→ | Günlük otel↔klinik transferleri: "X 11:45'te Y otelden alınıp TNC'ye götürülecek" ve "alınıp bırakıldı" teyidi | Aşama 4 |
| Evrak Grubu | 2024-09→ | Her belgeye başlık: `Ad Soyad + belge türü + visit N/rpt` (pasaport, stamp, consent, before/after x-ray, invoice, satisfaction, certificate, guidelines, Hekim Onay pdf); graft/membran notu; diş rengi | Aşama 5, 7 |
| Operasyon | 2022→ | Tedavi planı + toplam bedel + bu vizit alınan + kalan; plan değişiklikleri; kliniğe borç | Aşama 6 |
| Muhasebe | 2023→ | Aynı tahsilat satırı + otel faturaları, klinik/hekim ödemeleri, transfer hakedişi, prim, kur bozdurma | Aşama 6, 9, 10 |

Aynı olay iki-üç gruba birden yazılıyor (tahsilat: Operasyon + Muhasebe; RPT: Rezervasyon + TNC).
Sistem kişi bazında birleştirince tekrarları tek olaya indirmeli.

## 2. Roller

- **Satış** (Berkay, Anil, dış satışçılar "Ian'lar"): teklif/invoice pdf, fiyat, depozito, bilet, hasta iletişim bilgisi.
- **Koordinasyon** (Gülçin = "OrbisMed Clinics", Sude, Bahar): otel, klinik randevusu, transfer, hasta ile yazışma, evrak, tahsilat kaydı, prim.
- **Klinik ortakları**: OGN, TNC, Dentgroup, DDS, Vega (RPT'de kimin karşıladığı önemli); hekimler (Selin, Eren, Seher, Muharrem, Bora, Emre).
- **Oteller**: Grand Park Lara, Dumos, Cedrus, Leaf River Suites, Laren, Tema 242, Elegance East, Alp Paşa, Tuvana, City Live.
- **Transfer**: AYD (havalimanı, 2026-08'den), Ramazan Abi / İbrahim Abi (şehir içi), Anlık Transfer / Vip Antalya (2024–25, 10 günlük hakediş tablosu).
- **Muhasebe** (Özlem, Anil, Semih, Atalay): ödemeler, faturalar, hakediş, prim.

## 3. Akış — aşama aşama

Her aşamada: **tetikleyici → kim/hangi grup → sistemde tutulacak veri → eksikse uyarı**.

### 0. Satış / teklif
- Tetikleyici: hastaya invoice pdf gönderilir (`Ad Soyad Invoice.pdf`, bazen 3 seçenekli: All on 4 / All on 6 / Zygomatic).
- Veri: tedavi planı, toplam bedel (GBP), depozito (var/yok, tutar), fiyat listesi dönemi ("1 Mayıs öncesi hastası"), referans veren kişi ("Sharon Foxworthy referansı"), refakatçi/eş (ayrı hasta mı, hediye temizlik mi).
- Uyarı: bilet geldi ama plan/bedel yok · depozito yazılmamış · referans veren kişi sistemde yok.

### 1. Rezervasyon talebi (bilet geldi)
- Tetikleyici: satışçı Rezervasyon grubuna bilet görseli + "Name / Email / Phone" + otel + pax + kapsam atar.
- Veri: geliş/dönüş tarih-saat, uçuş kodu, otel (kim karşılıyor: firma / hasta kendi oteli / "sadece transfer bizde"), gece sayısı, **extra hotel cost** (7 geceden fazlası ücretli — sabitlenmiş kural), pax ve isimleri, özel istek (hekimle görüntülü görüşme, sedasyon).
- Uyarı: bilet var, geliş/dönüş saati yok · otel belirsiz · pax ismi eksik · 7+ gece ama extra cost yazılmamış · hasta konfirme maili beklediğini yazmış (Francis Deary örneği).

### 2. Klinik randevusu
- Tetikleyici: koordinatör TNC/Dentgroup grubuna "Ad Soyad, tedavi, Geliş … Dönüş …, randevusunun oluşturulmasını rica ederim".
- Veri: klinik, hekim, ilk randevu tarih-saat (klinik onayı), implant markası (Neodent/Straumann/Medentika/Megagen), sedasyon/genel anestezi (hastane: Faruk Seriz, Rich Hospital), **kullanılan ilaçlar ve alerjiler** (Haydn Wright örneği), eski hasta notu ("vida gevşemiş").
- Uyarı: talep atıldı, klinik onay saati gelmedi (Gülçin'in 3 Eylül'de 3 kez sorması) · geliş 24 saat içinde ama randevu yok · GA planlı ama kan tahlili/hastane notu yok.

### 3. Otel + konfirme
- Veri: otel rezervasyon maili atıldı mı, hastaya konfirme maili atıldı mı, oda tipi, otel değişikliği (Zaid: Tema 242 → Laren → Alp Paşa), otel stop-sale/şikayet notu (Jura, Tourist).
- Uyarı: konfirme maili yok · otel değişti ama transfer firmasına güncellenmedi.

### 4. Transfer
- Havalimanı: AYD grubuna bilet + isim + pax + otel + hasta numarası (vcf); AYD panoya girer; dönüş bileti değişirse yeniden yazılır.
- Şehir içi: her akşam ertesi günün "otel → klinik" saatleri; gün içinde "alındı/bırakıldı" teyidi; iptal.
- Veri: her transfer bacağı (tarih, saat, nereden, nereye, pax, firma, durum), transfer firması hakedişi (10 günlük tablo), hastadan alınan taksi/transfer ücreti (25 GBP) veya hastaya ödenen (20 GBP taksi).
- Uyarı: geliş var, havalimanı transferi yazılmamış · randevu var, sabah transferi yok · dönüş bileti değişti, transfer güncellenmedi · hasta "sürücü yoktu" şikayeti (Richard Blair, Paul Jones).

### 5. Klinik günleri ve evraklar
- Tetikliyici: hasta kliniğe girdi; koordinatör Evrak grubuna aynı başlık kalıbıyla belgeleri atar.
- **Vizit başı evrak seti** (Evrak grubundaki 5.000+ ekten çıkan standart):
  - Gelişte: pasaport + giriş damgası (stamp), registration form, consent form (visit N), TNC form / clinic policy consent, media release, GA/lokal anestezi/çekim/implant cerrahi consent (varsa), before x-ray, tıbbi lab tetkik (GA ise).
  - Ameliyat günü: ameliyat sonrası x-ray, graft/membran kullanım notu ("1 cc graft kullanıldı", "graft kullanılmadı"), diş rengi + design (1M1, OM2, natural).
  - Bitimde: after/bitim x-ray, invoice (visit N, 1–2 sayfa), satisfaction form (2 sayfa), after care guidelines, temporary crown care guidelines (geçici varsa), post-operative instructions (implant / all-on-X temporary veya final), implant passport + crown certificate (final vizitte), insurance/garanti belgesi.
  - Sonradan: **Hekim Onay pdf** (visit N) — klinikle hakediş için, bazen 3 ay gecikmeli toplu geliyor.
- Uyarı: consent yok ama ameliyat sonrası x-ray var · bitim x-ray var ama invoice/satisfaction yok · final vizit ama sertifika yok · Hekim Onay pdf 30 günden fazla gecikti.

### 6. Ödeme (hasta tarafı)
- Tek satır kalıbı: "Ad Soyad · plan · Toplam X GBP · bu vizit Y GBP (nakit/kart, hangi POS) · ikinci vizit Z GBP".
- Veri: toplam, depozito, 1. vizit alınan, 2. vizit alınan, extra hotel cost, ek işlemler (botoks 230–250, plak 100, titanyum bar 350, GA 360), düşümler ("ikinci vizit ödemesinden 200 düşülecek", "yapılmayan 2 kanal 240 düşülecek"), kur çevrimi (420 EUR = 360 GBP), UK'de ödenecek kısım ("Ian'lara 670"), hastadan alınan zarar bedeli (yutulan implant anahtarı 2.850 TL).
- Uyarı: toplam − alınanlar ≠ yazılan kalan · 2. vizit geldi, kalan tahsil edilmedi · kart çekimi "hesaba geçen miktara bakılacak" açık kaldı · aynı tahsilat iki grupta farklı tutar.

### 7. Hasta gideri (hasta başı maliyet)
- Kliniğe ödenen ("OGN'ye borç 830", "Dentgroup'a 1.200 + 100 EUR membran"), hekim payı ("Bora hocaya 1.890", "sedasyon hekimi 4.000 TL"), hastane (Faruk Seriz GA 27.750 TL), otel faturası (Laren 10.075 TL, Cedrus 21.526 TL, Leaf River 26.815 TL), transfer hakedişi, hastaya iade/ödenen taksi, sarf (graft/membran stok notu).
- Uyarı: otel faturası var ama hastaya bağlanmamış · klinik borcu yazıldı, ödendi notu yok · RPT hastasına otel/transfer gideri çıktı (kural: RPT'de verilmez) ama istisna notu yok.

### 8. Bitiş ve teslim
- Veri: satisfaction imzası, sertifikalar, after fotoğrafları, **yorum** (Google) istendi mi / yapıldı mı (yorum primi 30 GBP), hasta memnuniyet notu (otel şikayeti, "hasta pozitif"), 2. vizit planı (kaç kron/ne yapılacak, ne zaman, kalan ödeme), 2. vizitte otel/transfer kimde.
- Uyarı: bitim x-ray var, 2. vizit planı yazılmamış · yorum istenmemiş · 2. vizit için "otel kendi karşılar" notu yok.

### 9. Vizitler arası ve RPT
- 2. vizit tipik 3–7 ay sonra; 3. vizit/konsültasyon ayrı olabilir (Zaid: konsültasyon → 1 → 2).
- **RPT** = garanti/revizyon ziyareti (vida çıktı, implant fail, kron kırıldı, plak). Kural: RPT'de transfer/otel/bilet verilmez; verilirse indirim/istisna yazılır; klinikten alınan hakedişten RPT otel+transfer maliyetinin %50'si düşülür. Kim karşılıyor (OGN/Vega/DDS) yazılır. Yönetim RPT sayısını ve sebebini takip etmek istiyor ("bu ay 8 rpt, sebebini not alalım").
- Uyarı: RPT açıldı, sebep yok · RPT'de otel/transfer gideri var, istisna notu yok · aynı hasta 2+ RPT · 2. vizit tarihi 9 aydır yok.

### 10. Prim / hakediş
- Satış primi kişi listesiyle ödeniyor ("Karen O'Donnell satış + plak, Claire McLeod satış + plak … Gülçin'e 650 GBP + 430 EUR"); yorum primi; Hekim Onay pdf → klinik hakedişi.
- Uyarı: hasta bitti, prim listesine girmedi · Hekim Onay yok ama hakediş ödendi.

## 4. Kontrol listesi — Hasta türü için sistemin izleyeceği alanlar

| # | Alan | Kaynak grup | Ne zaman zorunlu | Eksikse özetteki uyarı |
|---|---|---|---|---|
| 1 | Tedavi planı + toplam bedel | Rezervasyon / Operasyon | Bilet geldiğinde | "Tedavi bedeli yazılmamış" |
| 2 | Depozito | Rezervasyon / Muhasebe | Bilet geldiğinde | "Depozito bilgisi yok" |
| 3 | Geliş/dönüş tarih-saat, uçuş | Rezervasyon / AYD | Bilet geldiğinde | "Uçuş saati yok" |
| 4 | Otel + kim karşılıyor + gece | Rezervasyon | Bilet geldiğinde | "Otel belirsiz / extra hotel cost?" |
| 5 | Pax ve refakatçi isimleri | Rezervasyon / AYD | Bilet geldiğinde | "Refakatçi ismi yok" |
| 6 | Klinik + hekim + ilk randevu | TNC / Dentgroup | Gelişten 1 gün önce | "Klinik randevu onayı gelmedi" |
| 7 | İlaç / alerji / GA | Dentgroup / TNC | Randevu talebinde | "Anamnez yok" |
| 8 | Konfirme maili | Rezervasyon | Otel ayarlanınca | "Hastaya konfirme gitmedi" |
| 9 | Havalimanı transferi (geliş+dönüş) | AYD | Gelişten 1 gün önce | "Karşılama yazılmamış" |
| 10 | Günlük klinik transferleri | Ramazan Abi | Her klinik günü | "Yarınki transfer yok" |
| 11 | Pasaport + stamp | Evrak | İlk klinik günü | "Pasaport yüklenmedi" |
| 12 | Consent (vizit) + before x-ray | Evrak | İlk klinik günü | "Onam formu yok" |
| 13 | Ameliyat sonrası x-ray + graft notu | Evrak | Cerrahi günü | "Cerrahi kaydı yok" |
| 14 | Bu vizit tahsilatı (tutar, yöntem) | Operasyon / Muhasebe | Cerrahi günü | "Tahsilat kaydı yok" |
| 15 | Invoice + satisfaction + guidelines | Evrak | Bitim günü | "Bitim evrakı eksik" |
| 16 | Sertifika / implant passport | Evrak | Final vizit | "Sertifika verilmedi" |
| 17 | Hekim Onay pdf | Evrak | Bitimden ≤30 gün | "Hekim onayı bekleniyor" |
| 18 | Kalan ödeme + 2. vizit planı | Operasyon | Bitim günü | "2. vizit planı/kalan yok" |
| 19 | Yorum istendi | Evrak / Operasyon | Bitim günü | "Yorum istenmedi" |
| 20 | Hasta giderleri (otel, klinik, hekim, hastane, transfer) | Muhasebe | Vizit kapanışı | "Otel faturası bağlanmadı" |
| 21 | RPT sebebi + karşılayan | Rezervasyon / Operasyon | RPT açılınca | "RPT sebebi yok" |
| 22 | Prim listesi | Muhasebe | Ay sonu | "Prim listesine girmedi" |

## 5. Gerçek hastalardan örnek akış özetleri (AI özetinin hedef biçimi)

Biçim: vizit başına kısa paragraf + para durumu + **Eksik/uyarı** listesi. Tarihler mesajlardan.

### 5.1 Tek vizit tamamlandı, ikinci vizit bekliyor — Claire McLeod (Dentgroup, 2026)
- **Satış (6–7 Ağu 2026):** Stephen McLeod'un (eski hasta, 2025) eşi. 3 seçenekli invoice gönderildi (All on 4 / All on 6 / Zygomatic). Stephen için ayrıca plastik cerrahi planlandı (Dr. Bora, GA).
- **Rezervasyon/transfer (25 Ağu–3 Eyl):** 2 pax, Leaf River Suites; AYD karşılama; dönüş bileti 3 Eyl'de değişti, AYD 7 Eyl 18:25 LS110 güncelledi.
- **Klinik (2–5 Eyl):** Dentgroup, Selin/Eren hoca; randevu saati 1 gün önce zor alındı. Plan: üst 2 zigoma + 2 implant, alt All on 4, çift çene plak + titanyum bar. GA Faruk Seriz'de (kan tahlili). Evrak: pasaport, first x-ray, ameliyat sonrası x-ray, after care, post-op (temporary + implant), satisfaction, invoice p1–2.
- **Para:** Toplam 10.500 GBP. 2 Eyl 4.000 nakit; 4 Eyl 2.000 kart (Stephen ile ortak satır). Kalan ≈ 4.500 GBP (2. vizit). Stephen: 2.400 nakit plastik cerrahi + 100 GBP detertraj alınacak.
- **Gider:** Dentgroup 1.200 GBP + 100 EUR membran; Faruk Seriz 27.750 TL; Bora hoca 1.890 GBP (Stephen); Leaf River 26.815 TL (ikisi); prim 9 Eyl ödendi (Claire satış + plak).
- **Eksik/uyarı:** ⚠ visit 1 consent form ve registration form Evrak'ta yok (yalnız pasaport ve x-ray var) · ⚠ 2. vizit tarihi/planı yazılmamış · ⚠ Stephen'ın 100 GBP detertraj tahsilatı görünmüyor · ⚠ Hekim Onay pdf yok (normal, 30 gün dolmadı) · ℹ Dentgroup'a "şimdilik 1.200" — kalan klinik borcu belirsiz.

### 5.2 Konsültasyon + 1. vizit + 2. vizit (3 geliş) — Zaid Waldu (TNC, 2025–26)
- **Konsültasyon (2–5 May 2025):** Eşi Dawit Abraham ile geldi; Dawit check-up 920 + otel/transfer 400 = 1.320 GBP kart. Zaid'e All on 6 + çift çene plak 7.300 GBP teklif. Evrak: pasaport, before x-ray.
- **1. vizit (19–24 Eki 2025):** Otel 3 kez değişti (Tema 242 → Laren Seaside → hasta kendi tuttu). TNC: 20 Eki All on 6 (11:30→13:00 revize), 22 Eki tarama, 23 reçine, 24 bitim. GA hastane 360 GBP. Evrak tam set: consent v1, before x-ray, ameliyat sonrası x-ray, GA/lokal/çekim/implant consent, lab tetkik, satisfaction, invoice, after care, temp crown guidelines.
- **Para:** Toplam 8.260 GBP (All on 6 + plak + titanyum bar + GA). 4 gece kendi oteli için 280 GBP düşüldü; 2.520 nakit + 1.510 kart = 4.030 GBP alındı.
- **2. vizit (13–19 Eyl 2026, sürüyor):** Cedrus → Alp Paşa; AYD karşılama; Ramazan Abi 14–16 Eyl transferleri; TNC 14 Eyl 10:30, 15 Eyl 12:00, 16 Eyl 14:00. Evrak: pasaport, stamp, before x-ray v2, registration, clinic policy, media release, final prosthesis consent.
- **Eksik/uyarı:** ⚠ 2. vizit ödemesi henüz yok ve beklenen tutar hiçbir yerde net yazılmamış (8.260 − 4.030 − 280 = 3.950 mi, 4.230 mi?) · ⚠ 1. vizitten sonra "ikinci vizit ödemesi X" satırı eksik · ℹ Dawit'in 2026'daki rolü (refakatçi mi, kontrol mü) yazılmamış.

### 5.3 1. vizit + RPT + 2. vizit + 2 RPT — Thomas Daniel McLaughlin (TNC/OGN, 2024–25)
- **1. vizit (26–29 Kas 2024):** All on 6 çift çene + plak + 150 sedasyon. Toplam 8.550 GBP; 4.350 alındı (2.000 nakit + 2.350 kart, "hesaba geçen miktara bakılacak"); 2. vizit 4.200. Gider: OGN 830 GBP, sedasyon hekimi 4.000 TL, Laren 10.075 TL. Evrak: pasaport, ameliyat sonrası x-ray, invoice, temp guideline. Not: 1 haftadan fazla buz kullanmış (iyileşme yavaş).
- **RPT (26 Mar 2025):** implant fail → üst çeneye titanyum bar kararı; eşi Claire Smith ile geldi, Grand Park Lara. Evrak: rpt after x-ray, satisfaction, temp crown guidelines. 2. vizit ödemesinden 1.960 nakit alındı, 2.240 kaldı.
- **2. vizit (21–25 Nis 2025):** TNC 22 reçine, 23–24 zirkon prova. 2.240 nakit alındı → tamamlandı. Evrak: consent v2 (+TNC), before/after x-ray, satisfaction, invoice, implant+crown certificate. Hekim Onay v2 pdf 15 Eyl'de (5 ay sonra) geldi.
- **RPT 2 (23 Haz 2025):** vida çıktı; consent, before/after x-ray, satisfaction, insurance. Otel kendine ait.
- **RPT 3 (6–11 Eki 2025):** check-up + eşi Claire Smith tedaviye başladı (22 kron + 4 dolgu + plak, 3.600 nakit). 420 EUR extra hotel = 360 GBP alındı. Evrak tam.
- **Eksik/uyarı:** ⚠ 1. vizit consent formu Evrak'ta yok · ⚠ 2.350 GBP kart "hesaba geçen miktar" teyidi hiç kapanmadı · ⚠ 3 RPT'nin sebepleri yalnız 2'sinde yazılı (fail, vida); Mart RPT'sinde otel firma tarafından verildi, istisna notu yok · ℹ eşi Claire Smith ayrı hasta olarak açılmalı, referans: Thomas.

### 5.4 2. vizit + RPT + referans zinciri — Sharon Foxworthy (OGN → DDS, 2024–26)
- **2. vizit (11–16 Kas 2024):** consent, x-ray, after x-ray, guarantees. 3.907 GBP nakit. OGN borç listesinde 970 GBP.
- **Referans (Mar 2025):** Dawn Evans'ı getirdi (çift çene All on 4 → sonra All on 6 + 2 zigoma, 12.200 GBP).
- **RPT (22–26 Eyl 2025):** uçuşu kaçırdı, aynı gün yeni bilet. Tek çene yenilendi; "OGN ve Vega RPT'si fakat DDS'e verildi". Plak + titanyum bar 350 GBP kart. Evrak: rpt consent, TNC form, after x-ray, satisfaction, Hekim Onay RPT pdf (26 Eyl, 3 gün içinde ✓), before x-ray 10 Eki (geç).
- **2026 (Şub):** Dawn Evans'ın 2. vizitine eşlik ediyor, Dumos.
- **Eksik/uyarı:** ⚠ RPT sebebi yazılmamış · ⚠ RPT'de hangi kliniğin garantisi olduğu çelişkili (OGN/Vega/DDS) · ℹ 2026 gelişinde hasta mı refakatçi mi belirsiz.

### 5.5 1. vizit + 2. vizit + RPT — Claire Mccubbin (TNC, 2025–26)
- **1. vizit (11–16 Tem 2025):** All on 4 + sedasyon, eşi David ile Elegance. Toplam 6.400 GBP; 3.100 kart; 2. vizit 3.300. Evrak tam (consent, TNC form, before/ameliyat sonrası x-ray, invoice pdf, guidelines, satisfaction). Hekim Onay v1 pdf 15 Eyl'de geldi.
- **2. vizit (19–26 Nis 2026):** Dumos; TNC 20–25 Nis (lab parçası yüzünden 21 Nis saat kaydı). 3.300 kart ✓ + masseter botoks 230 kart. David detertraj. Dumos faturası 20.261 TL. Prim listesine girdi (26 Nis); yorum primi Sude'ye 30 GBP (16 Haz).
- **RPT (31 Ağu–4 Eyl 2026):** Ramazan Abi transferleri; evrak: pasaport, stamp, before x-ray, registration, clinic policy, media release, final prosthesis consent. 14 Eyl: hakedişten RPT otel+transfer %50 düşüldü.
- **Eksik/uyarı:** ⚠ RPT sebebi yok · ⚠ RPT'de after x-ray / satisfaction yok (tamamlanmadı mı?) · ⚠ isim 4 farklı yazımla geçiyor (Mccubbin / Mcgubbin / Mccgubbin / McLeod ile karışma) — kişi bağlama bunu tolere etmeli.

## 6. Öneriler

### 6.1 "Hasta akışı" alanı — ne olmalı
Tek bir serbest metin kutusu yetmez; özetin **kontrol edebilmesi** için iki parça öneriyorum:
1. **Anlatı (serbest metin, Ayarlar › AI › Hasta akışı):** Bölüm 3'ün sadeleştirilmiş hali. Özet üretirken sistem istemine eklenir. Firma kendi cümleleriyle düzenler.
2. **Kontrol listesi (yapılandırılmış, Bölüm 4):** aşama · alan · hangi kanıt sayılır (belge türü / mesaj kalıbı) · ne zaman zorunlu · uyarı metni. Sistem her hasta için işaretler; özet sonuna "Eksik" bloğu koyar; kuyrukta rozet olur.

Şablon başlangıçta OrbisMed'e göre dolu gelir; başka firma kendine göre değiştirir.

### 6.2 Vizit kavramı
Bugün her şey kişiye düz bağlı. Akış vizit başına ilerliyor (konsültasyon / 1 / 2 / 3 / RPT). Kişi kartında **vizit** kaydı (tür, geliş-dönüş, otel, klinik, hekim, transfer firması, durum) olursa evrak seti, tahsilat ve giderler vizite bağlanır; "2. vizit ödemesi alınmadı" gibi uyarılar ancak böyle çıkar. Vizit, Rezervasyon/TNC mesajlarındaki "Geliş … Dönüş …" kalıbından otomatik açılabilir, kullanıcı onaylar.

### 6.3 Evrak sınıflandırma
Evrak grubundaki başlıklar zaten standart (`Ad + tür + visit N`). Ek geldiğinde tür + vizit otomatik çıkarılır, kişi Dosyalar sekmesine ve Drive klasörüne türüyle düşer; kontrol listesi kendini işaretler. 20 tür yeter: pasaport, stamp, registration, consent (alt türleri), before/after/ameliyat sonrası x-ray, invoice, satisfaction, certificate/passport, guidelines, post-op, insurance, hekim onay, lab tetkik, diş rengi notu.

### 6.4 Hasta başı para mutabakatı
Kişi › Finans Özet'te vizit bazlı: toplam bedel · depozito · alınan (vizit/yöntem) · düşümler · kalan; karşısında giderler (klinik, hekim, hastane, otel, transfer, sarf) → hasta başı kâr. Operasyon ve Muhasebe'deki çift kayıt tek işleme indirgenir (aynı tutar + aynı gün + aynı kişi).

### 6.5 Ekibe önerilecek üç küçük alışkanlık
Bunlar AI'nın isabetini en çok artıracak şeyler:
- RPT açarken **sebep** ve **kim karşılıyor** her zaman yazılsın.
- Bitim günü tek satır: "2. vizit: ne yapılacak · tahmini ay · kalan X GBP · otel/transfer kimde".
- Evrak başlığında vizit her zaman yazılsın ("rpt" veya "visit 2"); isim yazımı tek olsun.

### 6.6 Sıra önerim
1. Hasta akışı anlatı alanı + özet istemine ekleme + özet sonunda "Eksik" bloğu (küçük, hemen).
2. Vizit kaydı + Rezervasyon/TNC kalıbından otomatik vizit önerisi.
3. Evrak sınıflandırma + kontrol listesi otomatik işaretleme.
4. Vizit bazlı para mutabakatı ve hasta başı kâr.
