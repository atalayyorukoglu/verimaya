# Prod smoke rehberi + doküman tutarlılığı (2026-08-09)

> **Kim için:** Demo Klinik tenant’ında paneli açıp elle bakacak insan.
> **Host:** `app.verimaya.com` (veya `app.localhost:5173`). MSW kapalı olmalı — sarı “Demo verisi” şeridi **yok**.
> **Önceki checklist (A bölümü kanıtı):** `[docs/Arşiv/2026-08-08-PROD-KONTROL-LISTESI.md](./Arşiv/2026-08-08-PROD-KONTROL-LISTESI.md)`
> **Aktif iş listesi:** `[docs/2026-08-09-YAPILACAKLAR.md](./2026-08-09-YAPILACAKLAR.md)` kalem 1.

## İşaretler


| Etiket             | Anlam                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| **👤 SEN TIKLA**   | Prod’da sırayla yap; kutuyu sen işaretle.                                   |
| **ℹ️ BİLGİ**       | Kod/arşivde bitmiş veya bilinçli karar; tıklaman gerekmez (istersen smoke). |
| **⚠️ TUTARSIZLIK** | Liste / kod / HEAD kayması — bug değil; doküman hijyeni.                    |


Bir madde takılırsa **dur**, aşağıdaki Bulgular tablosuna yaz, YAPILACAKLAR’a kalem aç. Devam etme.

---



## 0. Başlamadan

- [x] Tenant: **Demo Klinik** (`afb4a68b…`). Ölçek: ~757 dosya, ~548 işlem, ~703 randevu.
- [x] Üstte sarı **“Demo verisi”** şeridi **yok**. Varsa `PUBLIC_USE_MSW` yanlış → dur.

---



## 1. 👤 SEN TIKLA — Soft-delete (eski B1–B4)

Silme butonu dialog’ların içinde (GAP-06b). Kayıt → aç → **Sil** → onay ekranı (başlık/tutar/tarih görünmeli) → onayla.

### 1.1 İşlem sil

- [ ] **Sol menü → İşlemler.** Küçük tutarlı, tanıdık bir gelir/gider seç (ileride “o tutar” diye takip edeceksin).
- [ ] Satıra tıkla → düzenleme diyaloğu → **Sil** → onayda tutar+tarih doğru mu? → onayla.
- [ ] **Not:** tutar, para birimi, tarih, kategori, bağlı kişi/hasta.



### 1.2 Aynı işlem altı yerde yok mu?

Silinen kayıt **hiçbirinde** görünmemeli / toplam ona göre düşmeli:


| #   | Nereye tıkla                                          | Ne bekliyorsun                     |
| --- | ----------------------------------------------------- | ---------------------------------- |
| a   | **İşlemler** (liste + filtreler)                      | O satır yok                        |
| b   | **Raporlar** → dönem içinde aylık gelir/gider         | Toplam, sildiğin tutar kadar düştü |
| c   | **Raporlar** → kategori kırılımı                      | O kategorinin toplamı düştü        |
| d   | Hasta bağlıysa: **Hastalar** → o dosya → finans özeti | O işlem yok                        |
| e   | **Bakiyeler**                                         | İlgili kişinin bakiyesi değişti    |
| f   | **Raporlar** / pazarlama tahsilatı (varsa)            | Tahsilat düştü (işlem tahsilattsa) |


- [ ] Altılı kontrol bitti. Biri hâlâ gösteriyorsa → `deleted_at` filtresi atlanmış; Bulgular’a yaz.



### 1.3 Kişi sil

- [ ] **Kişiler** → eski bir işlemi olan kişiyi aç → **Sil** → onayla.
- [ ] Kişi listesinde yok.
- [ ] **İşlemler**’de o eski işleme bak: satır **duruyor**, kişi adı (`contact_label`) **okunuyor**.



### 1.4 Randevu sil

- [ ] **Randevular** → bir kayıt aç → **Sil** → onayla.
- [ ] Listede yok.
- [ ] **Raporlar** → Operasyon bloğu: toplam / ilgili oranlar düştü (dönem filtresi aynı kalsın).

---



## 2. 👤 SEN TIKLA — Filtreler (eski D1–D2)

Kod tarafı hazır (`total_count`, randevu `from`/`to`); sen sayıların azaldığını görmelisin.

### 2.1 İşlem filtreleri

- [ ] **İşlemler.** Üstteki toplam/sayaç not et (ör. “548 işlem”).
- [ ] Sırayla dene: **Gelir** → sayı düştü mü, yalnız gelir mi?
- [ ] **Ödenmedi** (veya eşdeğer durum) → yine daraldı mı?
- [ ] Bir **kategori** seç → uyuyor mu?
- [ ] Arama kutusuna bilinen bir başlık parçası → sonuçlar eşleşiyor mu?
- [ ] Filtreleri temizle → sayaç eski hale yakın mı?



### 2.2 Randevu arama + durum + dönem

- [ ] **Randevular.** Bir hasta adının parçasını ara → sonuçlar o isme yakın.
- [ ] Durum: **Gelmedi** (`no_show`) → yalnız gelmeyenler.
- [ ] **Başlangıç / bitiş (from–to)** doldur → aralık dışındakiler kaybolsun; “filtreleri temizle” ikisini de sıfırlasın.

---



## 3. 👤 SEN TIKLA — Sayılar mantıklı mı? (eski E1–E2)

Burada “çalışıyor mu” değil, **“inanılır mı”**.

### 3.1 Operasyon metrikleri

- [ ] **Raporlar** → sayfanın üstünde **Operasyon** bloğu.
- [ ] No-show oranı: **%0 ise şüphelen** (703 randevuda hiç gelmeyen zor).
- [ ] Tamamlanma %100 ise de şüphelen.
- [ ] Klinik kırılımı: adlar tanıdık mı?
- [ ] Dönem filtresini değiştir → toplam randevu değişiyor mu?



### 3.2 Tutarlılık / veri kalitesi

- [ ] **Raporlar → Tutarlılık** ve/veya **Ayarlar → Veri kalitesi**.
- [ ] Yaklaşık yorum: **0 uyarı** → muhtemel bozuk; **500+** → kural fazla hassas; **~10–100** → sağlıklı.
- [ ] 100’ü aşarsa “İlk 100 gösteriliyor, toplam N” benzeri kesme notu görünmeli.
- [ ] Birkaç uyarıyı aç: gerçekten sorunlu mu?

---



## 4. ℹ️ BİLGİ — Kod/arşivde kapalı (tıklaman şart değil)

Detay kanıt: arşivdeki eski checklist + `2026-08-09-YAPILACAKLAR` **Son kapananlar**.


| Kod     | Ne                             | Durum                                           |
| ------- | ------------------------------ | ----------------------------------------------- |
| A1–A6   | Migration 0028–0032 prod       | ✅ 2026-08-08                                    |
| C1      | Randevu tipi API               | ✅ kod                                           |
| C2      | Kendi rolünü değiştirme engeli | ✅ kod + test                                    |
| F1–F5   | Dil / MSW / GHL / kaynak kartı | ✅ kod                                           |
| F6      | ROAS attribution + FX guard    | ✅ kod; kaynak boşken “Attribution verisi yok”   |
| G1–G2   | Çift kayıt tarama kuralları    | ✅ kod                                           |
| GAP-06b | Silme UI üç diyalog            | ✅ kod (`5581392`) — yukarıdaki §1 bunu kullanır |


İsteğe bağlı hızlı smoke: Ayarlar → Randevu tipleri ekle/yenile/sil; Ayarlar → Ekip → başkasının rolü / kendi rolün engeli.

---



## 5. ⚠️ TUTARSIZLIK — doküman / kod kayması (bug listesi değil)

Bunları “düzeltilecek ürün bug’ı” sanma. Rehber + liste senkronu için not.

1. **Eski chat’teki “76 kalan” listesi bayat.** Çoğu 2026-08-09’da kapandı. Gerçek açık iş: `2026-08-09-YAPILACAKLAR.md`.
2. **GAP-06b kodda var; smoke §1 hâlâ açık.** “UI yazıldı” ≠ “prod’da silip baktım.”
3. **Migration** `0033` **+** `0034` **repoda var; prod deploy / migrate ayrı iş** (YAPILACAKLAR kalem 1). Repoda olması canlıda uygulanmış demek değil.
4. **AUDIT-F09-13 (CORS webhook header)** — bilinçli no-op (“gerekmiyor”); `main.ts`’te webhook header yok → unutulmuş değil.
5. **YAPILACAKLAR “Durum anı HEAD”** bazen son docs commit’inin gerisinde kalır → tarihçe drift, işlevsel sorun değil.
6. **Eski PROD checklist başlığı** “0028–0030” iken içeride A6=0032 vardı → bu yüzden arşive alındı; bu rehber onun yerini tutuyor.

---



## 6. Sonuç (👤 SEN TIKLA bitince)

- [ ] Takılan madde **yok** → YAPILACAKLAR kalem 1’de smoke’u kapat; PILOT-02 öncesi bir kapı daha temiz.
- [ ] Takılan madde **var** → Bulgular’a yaz + YAPILACAKLAR’a kalem aç.

**Bulgular**


| Madde (§) | Ne oldu | Not |
| --------- | ------- | --- |
|           |         |     |


---



## 4. DOMAIN-02 — Kişiler birleşmesi (2026-08-10)

> Detaylı checklist: `docs/2026-08-10-DOMAIN-02-DEPLOY-RUNBOOK.md` § canlı kontrol.
> Prod deploy sonrası tıklama (E3).

- [x] Menüde tek **Kişiler**; `/patients` → `/contacts` redirect
- [x] Liste varsayılan tür=Hasta; form ad/soyad; detay kartları; `/settings/organizations`
- [x] Rapor hasta sayısı ↔ liste tür=Hasta uyumu; WhatsApp AI kişi seçimi
- [ ] **E4 GHL** (ayrı): GHL↔panel ad/soyad çift yön — henüz yapılmadı

---



## Kaynaklar

- Arşiv checklist (A kanıtı + eski C/F/G kod denetimi): `docs/Arşiv/2026-08-08-PROD-KONTROL-LISTESI.md`
- Önceki yapılacaklar: `docs/Arşiv/2026-08-03-YAPILACAKLAR.md`
- Aktif sıra: `docs/2026-08-09-YAPILACAKLAR.md`
- DOMAIN-02 deploy: `docs/2026-08-10-DOMAIN-02-DEPLOY-RUNBOOK.md`

