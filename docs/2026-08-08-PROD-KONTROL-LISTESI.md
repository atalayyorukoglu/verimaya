# Prod kontrol listesi — migration 0028–0030 sonrası

Tarih: 2026-08-08 · Tenant: Demo Klinik (kendi firmamız) · Kaynak: bu turda kapanan
5A DOMAIN-01 + 5B GAP-P0 + 6B GAP-04/05/06/07 + AUDIT-F09-19

> **Amaç:** testlerin kanıtlayamadığı şeyleri gerçek veriyle görmek.
> 757 hasta, 548 işlem, 703 randevu var — sayılar bu ölçekte anlamlı olmalı.
> Bir madde takılırsa **dur**, not al, devam etme.

---

## A. Migration (önce bu)

> **✅ A bölümü tamamlandı — 2026-08-08.** Üç migration da prod'da doğrulandı.
> Faydalı not: `psql` Postgres konteynerinde, owner rolü `verimaya` **değil**
> (Coolify kendi kullanıcısını atıyor) ve `$POSTGRES_DB` app veritabanı değil.
> Doğru komut: `psql -U "$POSTGRES_USER" -d verimaya -c "…"`.

- [x] **A1 — Yedek al.** ✅ 2026-08-08 14:51, 500 KB, Local + S3 Storage.
- [x] **A2 — Migration çalıştır.** ✅ `pnpm --filter @verimaya/api db:migrate`
      (API konteyneri, `DATABASE_URL` = owner). NOTICE'lar zararsız (schema/tablo zaten var).
- [x] **A3 — Kanıt sorgusu.** ✅ Yalnız `scheduled` döndü — 757 hastanın tamamı
      eşlendi (yeni sette olmayan her değer → `scheduled`, beklenen sonuç).
      ```sql
      SELECT DISTINCT status FROM patients;
      ```
      **Beklenen:** yalnız `scheduled` / `arrived` / `treated` / `follow_up` / `cancelled`.
      **Görürsen dur:** `lead`, `contacted`, `qualified`, `closed_won`, `closed_lost` →
      `0029` UPDATE'i çalışmamış.
- [x] **A4 — Randevu tipleri seed olmuş mu?** ✅ Konsültasyon / Tedavi / Kontrol / Transfer.
- [x] **A5 — `0030` doğrulaması.** ✅ `deleted_at` dört tabloda da var
      (`appointments`, `contacts`, `patients`, `transactions`).
- [x] **A6 — `0032_ad_metrics_fx_coherence` (OPS-02c-fx).** ✅ 2026-08-08.
      Constraint prod'da mevcut; tablo: tenant base **GBP**, 146 satır **TRY**,
      146'sı snapshot'lı, **0 eksik** → migration null'layacak tutarsız satır
      bulamadı, backfill gerekmedi. `fx_rate` kaynağı sorusu kapandı.
      *Not:* bundan sonraki her ads sync, maliyeti düzelttiği satırların
      snapshot'ını null'lar — o zaman backfill'i tekrar çalıştır (aşağıdaki
      ikinci sorgu > 0 olur).
      `spend_base` varsa `base_currency`/`fx_rate`/`fx_dated` zorunlu. Migration
      tutarsız satırları null'lar — **null'lanan satır çıkarsa backfill'i tekrar
      çalıştır**, yoksa Pazarlama'da "Kur bilgisi eksik" görünür (yanlış sayı değil).
      ```sql
      -- migration sonrası: kaynağı eksik çevrim kalmamalı → 0 dönmeli
      SELECT count(*) FROM ad_metrics_daily
      WHERE spend_base IS NOT NULL
        AND (base_currency IS NULL OR fx_rate IS NULL OR fx_dated IS NULL);

      -- backfill gerekiyor mu? (tenant base'inden farklı, snapshot'ı olmayan satırlar)
      SELECT count(*) FROM ad_metrics_daily
      WHERE currency IS NOT NULL AND currency <> 'GBP' AND spend_base IS NULL;
      ```
      İkinci sorgu > 0 ise: `node scripts/backfill-ad-spend-fx.js --tenant-id <uuid>`
      (önce dry-run), sonra `--apply`.

---

## B. Soft-delete — en kritik bölüm

12 sorguya filtre ekledik. Birini atladıysak test yakalamaz, **ekran yakalar.**

- [ ] **B1 — Bir işlem sil.** İşlemler → herhangi bir kayıt → sil.
      Not al: *tutar ve tarih ne idi?*
- [ ] **B2 — Altı yere bak, kayıt hiçbirinde olmamalı:**

      | Nereye | Ne bekliyorsun |
      | --- | --- |
      | İşlemler listesi | kayıt yok |
      | Raporlar → aylık gelir/gider | toplam sildiğin tutar kadar düştü |
      | Raporlar → kategori kırılımı | o kategorinin toplamı düştü |
      | Hasta detayı → finans özeti (bağlıysa) | kayıt yok |
      | Bakiyeler | kişinin bakiyesi değişti |
      | Raporlar → pazarlama (tahsilat) | tahsilat düştü |

      **Biri hâlâ gösteriyorsa** → o sorguda `deleted_at` filtresi atlanmış. Not al.

- [ ] **B3 — Bir kişi sil**, sonra o kişiye bağlı eski bir işleme bak.
      **Beklenen:** işlem duruyor, kişi adı hâlâ okunuyor (denormalize `contact_label`),
      ama kişi listesinde kişi yok.
- [ ] **B4 — Bir randevu sil**, randevu listesinde ve operasyon metriklerinde düştüğünü gör.

---

## C. Daha önce kırık olan yerler

- [ ] **C1 — Randevu tipi ekle/sil.** Ayarlar → Randevu ayarları → yeni tip ekle →
      sayfayı yenile → **hâlâ duruyor mu?** Sonra sil.
      *(Eskiden 404 veriyordu — MSW'de vardı, API'de yoktu.)*
- [ ] **C2 — Üye rolü değiştir.** Ayarlar → Ekip → bir üyenin rolünü değiştir.
      Sonra **kendi rolünü** değiştirmeyi dene → engellenmeli.
      *(Eskiden panelden hiç değiştirilemiyordu.)*

---

## D. Yeni filtreler — gerçek veriyle

- [ ] **D1 — İşlem filtreleri.** İşlemler → sırayla dene: Gelir / Ödenmedi / bir kategori /
      arama kutusuna bir başlık parçası.
      **Beklenen:** her filtrede sayı azalıyor, sonuçlar filtreye uyuyor.
- [ ] **D2 — Randevu arama.** Randevular → bir hasta adının parçasını yaz.
      Sonra durum filtresinden "Gelmedi" seç.

---

## E. Yeni sayılar — inandırıcı mı?

Burada "çalışıyor mu" değil, **"sayı mantıklı mı"** soruyorsun.

- [ ] **E1 — Operasyon metrikleri** (Raporlar → Operasyon bloğu, dönemin en üstünde).
      - No-show oranı: **%0 ise şüphelen** — 703 randevuda hiç gelmeyen olmaması zor.
      - Tamamlanma oranı: %100 ise de şüphelen.
      - Klinik kırılımı: klinik adları tanıdık mı?
      - Toplam randevu, dönem filtresiyle değişiyor mu?
- [ ] **E2 — Tutarlılık uyarıları** (Raporlar → Tutarlılık + Ayarlar → Veri kalitesi).
      548 işlemle ilk kez karşılaşıyor.
      - **Sıfır uyarı** → muhtemelen çalışmıyor, ETL verisi bu kadar temiz olmaz.
      - **500+ uyarı** → kural fazla hassas, hangi `code` baskın bak.
      - **10–100 arası** → sağlıklı. Birkaçını açıp gerçekten sorunlu mu kontrol et.
      - 100'ü aşarsa "İlk 100 gösteriliyor, toplam N" satırı görünmeli.

---

## F. Dil ve görünüm (DOMAIN-01)

- [ ] **F1 — Hastalar sayfası.** "Yeni dosya aç" yazıyor mu? Boş durumda "Henüz dosya yok"?
      Hiçbir yerde "lead" / satış hunisi dili kalmamalı.
- [ ] **F2 — Hasta durumu seçenekleri:** sadece beş operasyon değeri görünmeli.
- [ ] **F3 — Demo şeridi YOK.** Prod'da MSW kapalı → sarı "Demo verisi" şeridi
      görünmemeli. Görünüyorsa `PUBLIC_USE_MSW` yanlış.
- [ ] **F4 — GHL ayarları:** "Alan sahipliği" başlığında "(planlanan)" yazmamalı.
- [ ] **F5 — Raporlarda tek kaynak kartı.** "Kaynak dağılımı" gitmiş olmalı,
      pazarlamadaki "Kaynak kırılımı" kalmalı. Kolon başlıkları:
      Kaynak / Dosya / Tedavi edilen / Tahsilat *(eski "Lead" ve "Kapalı" olmamalı)*.
- [x] **F6 — Pazarlama ROAS guard (OPS-02d, 2026-08-08).** ✅ Kod: `attribution_missing`
      + efektif pencere (ad_metrics MIN/MAX) + `spend_fx_missing`. Prod Demo Klinik'te
      tüm `patients.source` boş → ROAS kartı **"Attribution verisi yok"** göstermeli
      (yanlış 19× yok). Kapatmak için OPS-02e (`patients.source` doldurma) gerekir;
      attribution kapanana kadar ROAS müşteri önünde gösterilmemeli.

---

## G. Mükerrer (yeni kural)

- [ ] **G1 — Hastalar → Çift kayıt tara.** Randevusu veya işlemi olan hastalar
      listede **görünmemeli**.
- [ ] **G2 — Kişiler → Çift kayıt tara.** Burası eski davranışta, "birleştir" demeli.

---

## Sonuç

- [ ] Takılan madde yok → prod migration tamam, PILOT-02'ye hazır.
- [ ] Takılan madde var → aşağıya yaz, YAPILACAKLAR'a kalem aç.

**Bulgular:**

| Madde | Ne oldu | Not |
| --- | --- | --- |
|  |  |  |
