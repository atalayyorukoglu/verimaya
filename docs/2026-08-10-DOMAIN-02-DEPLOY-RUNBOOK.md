# DOMAIN-02 prod deploy runbook (2026-08-10)

> **Bu deploy kırıcı bir şema değişikliği taşıyor.** Sıra yanlış olursa panel,
> API'de olmayan endpoint'leri çağırır ve prod kullanılamaz hale gelir.
> Değişikliğin kendisi: `docs/2026-08-10-KISILER-BIRLESME-PLANI.md`
> PR: [#2](https://github.com/atalayyorukoglu/verimaya/pull/2) — branch `feat/domain-02-kisiler-birlesme`

---

## Neden sıra kritik

`.github/workflows/deploy-web.yml` `main`'e push'ta web imajını build edip
**Coolify redeploy webhook'unu otomatik çağırıyor**. Yani PR merge edildiği anda
yeni panel canlıya çıkar.

Yeni panel `/v1/contacts/:id/finance-summary`, `/v1/settings/organizations` gibi
endpoint'leri çağırır. Eski API'de bunlar yoktur → panel açılır ama her ekran
hata verir.

**Bu yüzden PR en son merge edilir.** DB ve API önce gider.

---

## Ön koşullar

- [ ] Prod DB `0032`'de (2026-08-08 doğrulaması). `0033` + `0034` **henüz prod'da değil.**
- [ ] `docs/DEPLOY-COOLIFY.md` § Migrasyon okundu (migrate owner `DATABASE_URL` ile koşar,
      app runtime `DATABASE_URL_APP` kullanmaya devam eder).
- [ ] PR #2 CI'ı yeşil.

---

## Adım 0 — Yedek (atlanmaz)

```bash
# Prod sunucuda
pg_dump "$DATABASE_URL" -Fc -f ~/verimaya-$(date +%Y%m%d-%H%M)-domain02-oncesi.dump
ls -lh ~/verimaya-*-domain02-oncesi.dump
```

Dump'ı **sunucu dışına** da kopyala. `0036` geri alınamaz (tablo DROP eder).

---

## Adım 1 — `0033` + `0034` (birikmiş migration'lar)

Bunlar DOMAIN-02'den bağımsız, YAPILACAKLAR kalem 1'in artığı. `0035` bunların
üstüne biner, o yüzden önce gider.

```bash
pnpm --filter @verimaya/api db:migrate
```

**Kanıt sorguları:**

```sql
-- 0033: outbox DLQ
SELECT column_name FROM information_schema.columns
WHERE table_name='outbox_events' AND column_name IN ('dead_lettered_at');

-- 0034: sözlük UNIQUE index'leri + seed bayrakları
SELECT indexname FROM pg_indexes
WHERE indexname IN ('appointment_types_tenant_id_name_uidx','contact_types_tenant_id_name_uidx');
```

Migrate log'unda `0034`'ün dedupe adımına göz at (mükerrer (tenant, name) çiftlerini
önce temizleyip sonra index kuruyor).

**Durdurucu:** ikisinden biri beklendiği gibi değilse ilerleme.

---

## Adım 2 — `0035` → `0038` (DOMAIN-02 şeması)

> ⚠️ **`0036` tüm tenant'larda randevu, dosya ve vaka notlarının TAMAMINI siler.**
> Bu bilinçli bir karardır (§0-D — korunacak gerçek veri yok, 2026-08-10 onayı).
> `Demo Klinik`'teki 757 dosya · 703 randevu · 548 işlem bağlantısı gider.
> **Bu satırı okuyup onaylamadan devam etme.**

```bash
git fetch origin
git checkout feat/domain-02-kisiler-birlesme   # veya merge sonrası main
pnpm install --frozen-lockfile
pnpm --filter @verimaya/api db:migrate
```

**Kanıt sorguları:**

```sql
-- patients gitti, patient% sütunu kalmadı
SELECT count(*) AS patients_tablosu FROM information_schema.tables WHERE table_name='patients';
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema='public' AND column_name LIKE 'patient%';   -- boş dönmeli

-- contact_id dört tabloda
SELECT table_name FROM information_schema.columns
WHERE table_schema='public' AND column_name='contact_id' ORDER BY 1;
-- beklenen: appointments, case_notes, files, transactions

-- organizations kısmi unique + RLS
SELECT indexdef FROM pg_indexes WHERE indexname='organizations_tenant_id_name_uidx';
-- beklenen: ... WHERE (deleted_at IS NULL)
SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='organizations';
-- beklenen: t | t

-- 0038
SELECT count(*) FROM information_schema.columns
WHERE table_name='tenants' AND column_name='contacts_section_label';   -- 1

-- ad/soyad backfill: firma türlerinde bölünme OLMAMALI
SELECT contact_type_name, display_name, first_name, last_name
FROM contacts WHERE contact_type_name IN ('Klinik','Otel','Transfer') LIMIT 10;
-- beklenen: first_name = display_name'in tamamı, last_name NULL
```

**Geri dönüş:** Adım 0'daki dump'tan restore. `0036` sonrası kısmi geri alma yoktur.

---

## Adım 3 — API deploy

Coolify'da API uygulamasını `feat/domain-02-kisiler-birlesme` (veya merge sonrası
`main`) üzerinden redeploy et.

**Kanıt (sunucudan veya lokalden):**

```bash
# Yeni yüzey ayakta
curl -s -o /dev/null -w '%{http_code}\n' https://api.verimaya.com/v1/contacts   # 401 bekleniyor (auth yok)
# Eski yüzey gitti
curl -s -o /dev/null -w '%{http_code}\n' https://api.verimaya.com/v1/patients   # 404 bekleniyor
```

`/v1/patients` hâlâ 401/200 dönüyorsa eski imaj çalışıyordur — deploy tutmamıştır.

---

## Adım 4 — Web deploy (PR merge)

PR #2 merge edilir. `deploy-web.yml` imajı build edip Coolify webhook'unu çağırır.

Coolify'da deploy'un bittiğini gör, sonra panele gir.

---

## Canlıda gözle kontrol edilecekler

Adım 4 bittikten sonra `app.verimaya.com`'da:

### 1. Menü ve rota
- [ ] Sol menüde **tek "Kişiler"** kalemi var; "Hastalar" yok (mobil menüde de).
- [ ] Tarayıcıya elle `app.verimaya.com/patients` yaz → **`/contacts`'a düşüyor**.
- [ ] Eski bir `/patients/<uuid>` derin linkin varsa: `/contacts/<uuid>`'e düşer ama
      kayıt bulunamaz (§0-D ile eski hasta id'leri gitti) — bu beklenen.

### 2. Kişiler listesi
- [ ] Liste **varsayılan olarak tür = Hasta** ile açılıyor.
- [ ] Tür filtresini "Tümü" yapınca klinik/otel/transfer kayıtları da geliyor.
- [ ] Sütunlar: Ad Soyad · Tür · Telefon · Kaynak · Durum · Atanan.
- [ ] **Firma kayıtlarının adı bölünmemiş:** "Grand Blue Hotel" tek parça görünüyor,
      "Grand" / "Blue Hotel" diye ayrılmamış.

### 3. Kişi formu
- [ ] **Ad** ve **Soyad** ayrı iki alan.
- [ ] Kaynak seçince **Alt kaynak** açılıyor (yalnız "Dijital Reklam" seçilince),
      sonra **Kampanya** serbest metin.
- [ ] Kaynak = **Referans** seçince "Referans Eden" kişi arama alanı çıkıyor,
      yazınca kişi öneriyor.
- [ ] Tür = Klinik/Otel/Transfer seçince **Firma** seçimi çıkıyor ve
      **"+ Yeni firma"** ile oradan firma oluşturulabiliyor.

### 4. Kişi detay sayfası
Eski hasta detayındaki dört kart taşındı mı:
- [ ] Finans özeti (bakiye görünüyor, "bağlanmamış işlemleri bağla" çalışıyor)
- [ ] Randevular
- [ ] Dosyalar (yükleme + önizleme)
- [ ] Vaka notları

### 5. Firma yönetimi
- [ ] `/settings/organizations` ekranı açılıyor; firma ekle / adını değiştir / sil çalışıyor.
- [ ] **Sil sonrası aynı adla yeniden oluşturma çalışıyor** (`0037` bunun için).

### 6. Raporlar — en kritik kontrol
- [ ] Raporlar → hasta sayısı, **Kişiler listesindeki tür = Hasta sayısıyla aynı**.
      Farklıysa tedarikçi kayıtları hasta sayısına karışıyor demektir — bu sessiz
      bir veri hatası, hemen bildir.
- [ ] Kaynak kırılımı görünüyor; alt kaynak (medium) ikinci seviye olarak var.

### 7. GHL çift yönlü senkron (Faz E4)
- [ ] GHL'de bir kişinin adını/soyadını güncelle → panelde **ad ve soyad ayrı ayrı**
      doğru geldi mi. (Birleşmeden önce GHL `firstName`/`lastName` gönderiyordu,
      biz tek `fullName`'e birleştiriyorduk. Bu düzeltme birleşmenin bedava kazancı.)
- [ ] Panelde kişi oluştur → GHL'e gitti mi.

### 8. WhatsApp AI taslak akışı
- [ ] `/finance/ai-transaction`'da taslakta kişi seçimi çalışıyor.
- [ ] "Yeni kişi" satır içi formu çalışıyor ve **tür seçilebiliyor**
      (eskiden "yeni hasta" türü zorla Hasta yapıyordu).

---

## Bir şey ters giderse

| Belirti | Muhtemel sebep | Yapılacak |
|---|---|---|
| Panel açılıyor, her ekran hata | Web, API'den önce deploy edilmiş | API'yi deploy et (Adım 3) |
| `/v1/contacts` 404 | API eski imajda | Coolify'da API redeploy, imaj etiketini doğrula |
| "column does not exist" | Migration koşmamış | Adım 2'yi koş, kanıt sorgularını çalıştır |
| Rapordaki hasta sayısı listeden fazla | `contact_type_name='Hasta'` filtresi bir sorguda eksik | Bildir — kod düzeltmesi gerekir, veri sorunu değil |
| Firma silip aynı adla ekleyemiyorum | `0037` koşmamış | `0037`'yi doğrula |
