# Verimaya — Yapılacaklar (2026-08-11 · pilot-öncesi kapanış → pazar kapısı)

> **Bu dosya tek kaynaktır.** Açık iş yalnız burada durur. İkinci envanter / “tüm açık
> işler” dosyası **yazılmaz** — o sapma üretir.
>
> **Re-base:** `docs/Arşiv/2026-08-09-YAPILACAKLAR.md` (kapananlar + Görüş’ler) +
> `docs/Arşiv/2026-08-10-TUM-ACIK-ISLER.md` (yönelim notu; içeriği buraya emildi).
> Daha eski: `docs/Arşiv/2026-08-03-YAPILACAKLAR.md` (Faz 0–7).
>
> **Durum anı:** branch `main`. DOMAIN-02 kapandı. Prod migrate
> `0053`'ye kadar (G-11 tenant_permission_overrides; lokal `pnpm db:migrate`).
> Panel tek **Kişiler** (soyad sırası + load-more düzeltildi).
> Pilot tenant: `Demo Klinik`. Smoke: `docs/Arşiv/2026-08-09-PROD-SMOKE-REHBERI.md`.
> Web canlı = GHCR `verimaya-web:main` (CI yeşil → imaj → Coolify); Restart eski imajı açar.

---

## Çalışma kuralları

1. **Sırayla ilerle.** Sıra numarası önceliği gösterir; `Bağımlı:` satırı kırmızı çizgidir.
2. **Adım başına tek commit.** Commit mesajı Türkçe, `feat:` / `fix:` / `ops:` / `docs:` önekiyle.
3. **Bitirince:** kutuyu işaretle, **Görüş**'ü doldur (≤ 3 satır; detay commit mesajına),
   sonra kalemi gövdeden **"Son kapananlar"** bölümüne tek satırla taşı. Gövde yalnız açık iş tutar.
4. **Soru sorma, en savunulabilir varsayımı seç**, Görüş'te yaz.
5. **Sır yazma.** Hiçbir token/parola/anahtar değeri koda, teste, commit mesajına girmez.
6. **Bir blokta birden çok numaralı kalem varsa her kalem ayrı commit ve ayrı kabul kriteridir.**
   **Sana tek bir kalem söylendiyse yalnız onu yap, diğerlerine dokunma, soru sorma.**
7. **Sözleşme önce `packages/shared`'da** değişir (AGENTS.md ilke 7); tenant'lı her endpoint'e
   negatif izolasyon testi zorunlu; kullanıcı metni `messages.ts` anahtarıdır (tr + en).
   OpenAPI `apiContract`'tan üretilir — sözleşme değişince `pnpm --filter @verimaya/api
   openapi:generate` zorunlu. Spec'lerde tenant bağlamı yalnız drizzle transaction +
   `SET LOCAL` (`set_config(..., true)`); session-level `set_config(..., false)` YASAK.
8. **Re-base:** Dönem kapanınca veya dosya şişince yeni tarihli dosyaya taşınır; eskisi
   `docs/Arşiv/`'e gider; AGENTS.md + README.md referansları güncellenir.
9. **Panelde “eksik” görünen şey** → buraya kalem aç veya “Bilinçli olarak yapılmayacaklar”a
   yaz. İkinci bir açık-iş dosyası açma.
10. **Yerel doğrulamadan önce `pnpm --filter @verimaya/shared build`.** `openapi:generate`
    ve drift testi `@verimaya/shared`'ın **dist**'ini okur. Bayat dist ile yerelde her şey
    yeşil görünür, CI shared'ı build ettiği için kırmızıya döner — 2026-08-17'de AI-02
    böyle kırıldı. Sözleşme (`packages/shared`) değiştiyse: **build → openapi:generate →
    test**, bu sırayla.

**Durum işaretleri:** `- [ ]` yapılmadı · `- [x]` yapıldı · `- [~]` kısmi

---

## Panelde göze çarpanlar (unutulmuş değil)

> Sitede/panelde eksik gibi duran yüzeyler. Hepsi ya açık kalemde ya bilinçli ertelemede.

| Yüzey | Durum | Kalem |
|-------|--------|--------|
| `/settings/import-export` | **Canlı** — kişi + bundle (vaka/randevu/işlem) dry-run→commit | Son kapananlar · G-09/G-10 |
| Ads Meta / Google canlı veri | Kod + runbook var; hesap go-live açık | **3. OPS-02** |
| GHL → panel ad/soyad | **Canlı insan testiyle doğrulandı** — alan sahibi GHL | Son kapananlar |
| “Hastalar bölüm etiketi” ayarı | **Kaldırıldı** — `contact_types` rename ile mükerrerdi | Son kapananlar |
| Finans kategori yönetimi | **Tracker paritesi kapandı** — sıralama + ayrı detay + satır içi alt kategori | Son kapananlar |
| İşlem formunda başlık / hasta / sorumlu | **Kapandı** — başlık opsiyonel, hasta ve sorumlu ayrı alan | Son kapananlar |
| Dev panel (`/dev`) Nest `/v1/dev` | Bilinçli yok; prod gizli / platform allowlist | GAP-28 (kapandı) |
| Hub `/tr/` `/en/` SEO ağacı | Bilinçli yok (kısmi UI i18n) | Bilinçli yapılmayacaklar |
| Randevu checklist şablonları | Muhtemelen hiç yapılmayacak | GAP-F09-20 (skip adayı) |

---

## Öncelik sırası

### 0. OPS-03 — ✅ **kapandı (2026-08-23)** — AI temeli prod'a çıktı

Doğrulanan: CI yeşil · web deploy başarılı · API deploy başarılı ·
runtime log `[✓] migrations applied successfully!` · `GET /v1/reports/ai-accuracy` → 401
(endpoint canlı) · `GET /v1/health` → 200 ·
`maya_questions` yetkileri **`DELETE,INSERT,SELECT`** — `UPDATE` yok, `REVOKE` tuttu.

**İki öğrenilen (kalıcı not):**
1. **API elle deploy gerektirmiyor** — Coolify webhook her `main` push'unda kendiliğinden
   deploy ediyor ve `RUN_MIGRATIONS=true` sayesinde migration'lar deploy anında koşuyor.
   Bu turda elle tetiklenen deploy fazlalıktı. Sonraki sürümlerde yalnız `git push origin main`
   yeterli; Coolify'a girmek sadece doğrulama için.
2. **`pnpm check` lint koşturmuyor.** CI ayrıca `pnpm --filter @verimaya/web lint`
   (prettier + eslint) koşturuyor; yerelde yeşil görünüp CI'da kırmızıya dönen tek yol bu.
   Push öncesi `pnpm lint` de koşturulmalı — bu turda CI ilk denemede bu yüzden kırıldı.
   Web deploy kapısı çalıştı, kırık kod canlıya çıkmadı.

<details><summary>Eski runbook (kapanmadan önceki adımlar)</summary>


`feat/audit-04-transaction-audit-log` dalı prod'a giderken **iki migration** koşacak:

- `0061_maya_questions.sql` — Maya soru kaydı. İçinde `REVOKE UPDATE ON TABLE maya_questions
  FROM verimaya_app` satırı var; **atlanırsa** `0003_app_role.sql`'deki `ALTER DEFAULT
  PRIVILEGES` yüzünden denetim kaydı güncellenebilir kalır. Migration sonrası doğrula:
  ```sql
  select privilege_type from information_schema.role_table_grants
   where table_name='maya_questions' and grantee='verimaya_app';
  -- beklenen: SELECT, INSERT, DELETE (UPDATE YOK)
  ```
- `0062_transaction_source_evidence.sql` — `transactions`'a iki kolon + FK + index. Mevcut
  tabloya kolon; RLS/policy'ye dokunmuyor. Geri alınabilir (kolon drop).

Sıra önemli: `0061` → `0062`. İkisi de yerelde koşturuldu ve doğrulandı (2026-08-22).

</details>

---

### 1. PILOT-01 kapanış — prod smoke + artıklar

> Migration 0028–0038 prod'da. Kalan: insan gözüyle ekran kanıtı.

- [x] **Prod smoke turu** — `docs/Arşiv/2026-08-09-PROD-SMOKE-REHBERI.md` §1–§3 (2026-08-12).
  **Görüş:** kullanıcı turu yaptı, takılan madde bildirmedi. Tur sırasında bulunan panel
  kusurları ayrı kalem olarak açılıp kapandı (bkz. Son kapananlar · panel düzeltmeleri).
- [ ] Pilot boyunca **ikinci organizasyon yaratma** (demo/test org dahil) — devam eden kural.
  **2026-08-12 ihlali:** `Demo Tek Ay Klinik` açıldı; gezinme trafiği artınca auth rate-limit
  kusurunu tetikleyip prod'da oturum kesintisi çıkardı (Son kapananlar · RATE-01). Org silindi,
  kurala dönüldü. Kural pilot boyunca yürürlükte.
- [x] **Tenant adı ✅** (2026-08-13) — rename yapıldı.
  **Görüş:** silme değerlendirildi ve reddedildi — pilot verisi PILOT-01 smoke kanıtının ve
  OPS-02e ölçümünün dayanağı; ayrıca tek org olduğu için silmek panele girişi kilitlerdi.
  Rename sırasında iki tablo ayrışması ortaya çıktı ve kapatıldı (Son kapananlar · Firma adı
  senkronu).
- **PILOT-01 ✅ kapandı** (2026-08-13). Kalan tek satır aşağıdaki *devam eden kural*; iş değil.
- **Bağımlı:** yok.
- **Kabul:** PROD-SMOKE-REHBERI Sonuç "takılan yok".

---

### 2. MARKET-01 — üç stratejik karar (17 Ağustos review öncesi)

> Kod yok; karar işi. Karar metni Görüş + Obsidian `01-kararlar.md`'ye işlenir.

> **Kurumsal gerçek (2026-08-12'de netleşti):** satıcı **Albion Signature (UK)** — faturayı o
> kesiyor. **OrbisMed**, Türkiye'de bir sağlık turizmi acentesi ve **ilk müşteri**.
> ⚠️ `docs/Arşiv/2026-08-02-PROJE-DEGERLENDIRMESI.md` §7.2 OrbisMed'i "ürün sahibinin
> işletmesi" sanıyor — o premis YANLIŞ, arşiv metnine güvenme.

- [x] **(a) Birincil segment: acente.** (2026-08-12)
  **Görüş:** karar erişimle verildi — görüşmelerin çoğu acente tarafında ayarlanabiliyor ve
  ödeyen ilk müşteri (OrbisMed) acente. Ürün bugün iki segmentin kesişimi olan operasyon +
  finansta güçlü; acenteye özel eksik komisyon takibi (PRODUCT-01), kliniğe özel eksik
  e-Nabız/e-Fatura. İlk 20 görüşme yalnız acente.
- [x] **(b) Veri ayrımı + destek erişimi + sınır ötesi aktarım.** (2026-08-12)
  *(Eski başlık "OrbisMed çıkar çatışması" idi; premis yanlış olduğu için yeniden yazıldı —
  ortada çıkar çatışması yok, normal satıcı-müşteri ilişkisi var. Tüzel ayrım da zaten mevcut:
  UK firma ≠ Türkiye'deki acente.)*
  **Karar: şeffaflık modeli.** Platform yöneticisi yetkisi olduğu gibi kalır; taahhüt yazılı
  olarak "destek için erişim açabilirim, açtığım anda bu sizin kendi denetim kaydınıza düşer,
  siz görürsünüz" şeklinde verilir. Sessiz/görünmez erişim yok.
  **Teknik dayanak (kodda karşılığı var):** satır bazlı izolasyon `FORCE ROW LEVEL SECURITY`
  ile; uygulama rolü `NOBYPASSRLS`; tenant'lı her endpoint'te negatif izolasyon testi zorunlu;
  platform üye ekleme işlemi müşterinin tenant'ındaki denetim kaydına yazılıyor
  (`platform.service.ts:280`).
  **Bilinen sınır:** `PLATFORM_ADMIN_EMAILS` listesindeki e-posta `POST /v1/platform/tenants/:id/members`
  ile kendini herhangi bir tenant'a üye ekleyebilir; önceden müşteri onayı istenmiyor. Taahhüt
  bunu gizlemiyor, denetim kaydına dayanıyor.
  **Sınır ötesi aktarım → LEG-02.** UK tüzel kişilik + Türkiye'deki müşteri + sağlık verisi =
  KVKK yurtdışına aktarım maddesi. Bekleyen'deki "AB veri lokasyonu + DPA şablonları" ve
  "Veri işleme envanteri" kalemleri bu karara bağlandı; müşteri sözleşmesinde karşılığı olmalı.
- [x] **(c) Kapasite + feature freeze.** (2026-08-12)
  **Görüş:** haftalık taahhüt **7 saat**, iki sabit blok — Salı 10:00–14:00 görüşme/satış,
  Perşembe 10:00–13:00 pilot desteği + haftalık rapor. Blok dışına randevu konabilir ama
  garanti değil. Kaçan blok aynı hafta telafi; iki hafta üst üste kaçarsa pilot süresi uzar.
  **Freeze kabul edildi:** pilot boyunca yalnız hata + güvenlik + veri düzeltme migration'ı.
  Yeni ekran/alan/entegrasyon/rapor yok; "sonraki sürümde" demek de söz sayılır. İstisna
  yalnız pilotun devamını engelleyen eksik için, kararı ürün tarafı verir ve yazılı olur.
  **Not:** freeze pilot RESMEN başlayınca yürürlükte. 2026-08-12'deki panel düzeltmelerinin
  bir kısmı (org değiştirici, şifre değiştirme) yeni yüzeydi — pilot başlamadığı için ihlal
  sayılmıyor, ama aynı iş pilot içinde ihlal olur.
  **Satış ekibi çıktısı:** çerçeve sayfa olarak yayınlandı (segment + randevu blokları +
  freeze kuralı + "verilerimi görebiliyor musunuz" cevabı + hukuki taahhüt yasağı).
- **Kabul:** ✅ Üç karar da yazılı (2026-08-12). (c)'deki freeze taahhüdü kalem 5'in (PILOT-02)
  giriş şartıydı — karşılandı. Bu blok bir sonraki re-base'de "Son kapananlar"a taşınır.

---

### 3. OPS-02 — Meta + Google Ads go-live + attribution kapanışı

> Runbook: `docs/ADS-META-GOLIVE.md`, `docs/ADS-GOOGLE-GOLIVE.md`.
> OPS-02c / 02c-fx / 02d ✅ (arşivde). Guard kapanmadan Pazarlama sekmesi müşteriye gösterilmez.

- [x] **OPS-02e ✅ — `contacts.source` doluluğu.** Giriş tarafı ✅ (preset + zorunlu + "Bilinmiyor").
  Kapanış: **yeni kayıtlarda kaynak doluluğu ≥ %80** (`ATTRIBUTION_COVERAGE_THRESHOLD`).
  Haftalık ölçüm (DOMAIN-02 sonrası tablo `contacts`; soft-delete + Hasta türü):
  ```sql
  SELECT count(*) FILTER (WHERE source IS NOT NULL) AS dolu, count(*) AS toplam
  FROM contacts
  WHERE deleted_at IS NULL
    AND contact_type_name = 'Hasta'
    AND created_at > now() - interval '30 days';
  ```
  Geçmiş 757 satır kalıcı kaynaksız (legacy — karar arşivde).
  **✅ ÖLÇÜM (2026-08-13): eşik geçildi.** Ham sorgu %2.6 gösteriyordu ama yanıltıcı —
  legacy aktarımın `created_at`'i de 30 gün penceresine düşüyor. Güne göre kırılım:
  `2026-08-07` → 742 kayıt / 1 dolu (toplu legacy aktarımı, kapsam dışı) ·
  `2026-08-12` → 1/1 · `2026-08-13` → 18/18.
  Legacy hariç **19/19 = %100**. Bugünkü 18 kayıt GHL senkronundan geldi ve onlar da
  kaynakla geldi — yani yalnız form değil, senkron yolu da kaynağı dolduruyor.
  **Not:** ölçüm tekrarlanırken `created_at >= '2026-08-08'` ile legacy aktarım hariç
  tutulmalı; yoksa oran kalıcı olarak yanlış düşük görünür.
- [~] **Google go-live** — bağlandı, veri çekti (2026-08-13). Rakamlar Google Ads paneliyle
  uyuşuyor; senkron ikinci kez koşturuldu, toplam artmadı (mükerrer yazma yok). **Kalan:
  7 gün temiz senkron penceresi** — saat 2026-08-13'te başladı.
- [~] **Meta go-live** — bağlandı (2026-08-13). App oluşturuldu, Marketing API + redirect URI
  kuruldu, `META_APP_ID`/`META_APP_SECRET` prod'da. **Kalan: 7 gün temiz senkron penceresi.**
  Not: uygulama Development modunda yeterli — kendi reklam hesabının verisi için App Review
  gerekmiyor.
- [x] **`ENABLE_INTEGRATION_SCHEDULERS=true`** prod'da açıldı (2026-08-13). Bununla
  `ad_metrics.sync` + `ghl.reconcile` 6 saatte bir, `files.sweep_pending` günlük çalışıyor.
- [x] **Hata yüzeyleme ✅** (2026-08-16) — Ayarlar → Reklamlar'da sağlayıcı başına "Otomatik
  senkron: ✅ Başarılı — {tarih/saat}" / "⚠️ Başarısız — {tarih/saat}" rozeti. Yeni tablo
  `ad_sync_status` (tenant+provider başına tek satır, upsert, RLS izolasyonu); her sağlayıcı
  artık ayrı try/catch içinde — biri hata verirse diğerinin başarısı gizlenmez, ama iş yine de
  fail eder (BullMQ retry tetiklenir). Negatif izolasyon testi + iki sağlayıcının birbirini
  gizlemediğini kanıtlayan test eklendi, 628 API testi yeşil.
  **Görüş:** Seçenek A (basit rozet) — geçmiş log ekranı yok, yalnız "şu an durum ne".
  `last_sync_error` bilinçli olarak API sözleşmesine eklenmedi (sağlayıcı hata mesajı token/
  secret detayı sızdırabilir); panelde yalnız genel ✅/⚠️ + zaman gösteriliyor.
  **Artık:** drizzle-kit'in `db:generate` komutu bu turdan bağımsız, önceden var olan bir
  hatayla çöküyor (`tenants` tablosundaki `patients_section_label` kolonunun kaldırılmasıyla
  snapshot drift'e girmiş — `preparePgAlterColumns` TypeError). Migration `0054` elle yazıldı
  ve `meta/_journal.json`'a elle eklendi (0009/0053 RLS deseniyle birebir); `db:migrate` ile
  uygulanıp doğrulandı. Snapshot dosyası düzeltilmedi — bir sonraki `db:generate` çağrısı aynı
  hatayla karşılaşacak, ayrı kalem gerektirir.
- [ ] **Sync penceresi doğrulaması** — 7 gün 20 Ağustos'ta doluyor; ilk pilot raporuyla
  birlikte değerlendirilecek.
- **Bağımlı:** yok; ROAS attribution kapanmadan dışarıya gösterilmez.
- **Kabul:** İki provider 7 gün temiz sync + `attribution_missing` guard yeşil (kapsam ≥ %80).

---

### 4. DOMAIN-02 — ✅ kapandı (2026-08-13)

> Adım ayrıntısı: `docs/Arşiv/2026-08-10-KISILER-BIRLESME-PLANI.md`. Faz A–F + E3 ✅.
> Deploy: `docs/Arşiv/2026-08-10-DOMAIN-02-DEPLOY-RUNBOOK.md`.

- [x] **E4 ✅ (2026-08-13)** — bkz. Son kapananlar · DOMAIN-02 E4. Blok kapandı, PILOT-02 girişi açıldı.

> **Artık (ertelendi, acil değil):** GHL'deki bazı kişilerin ad/soyadı **küçük harf** kayıtlı.
> Senkron kusuru değil — GHL ne tutuyorsa panel onu gösteriyor, doğrusu bu (ad GHL'e ait).
> **Karar (2026-08-13): GHL'de düzeltilecek, kod dokunulmayacak.** Panelde büyütmek sahiplik
> ilkesini büker ve `de Souza` gibi isimleri bozar. Kapasiteye göre yapılır.

---

### 5. PILOT-02 — 2–4 haftalık feature-freeze dahili pilot · ⏸ **ERTELENDİ**

> **⏸ ERTELENDİ → yeni tarih 19 Eylül 2026** (2026-08-19 kararı — kullanıcı). Planlanan
> 17 Ağustos başlangıcı geçmişti; bir ay ileri alındı. Pilot 19 Eylül – 10 Ekim.
> **Sonuçları:**
> - **Feature freeze YÜRÜRLÜKTE DEĞİL.** Yeni yüzey eklemek ihlal sayılmaz. Freeze, pilot
>   resmen ilan edildiği gün başlar (MARKET-01 (c) kararının lafzı: "pilot RESMEN başlayınca").
> - **AI katmanı sırası serbest kaldı.** AI-01…AI-07 için yol haritasındaki "6 Eylül'den sonra"
>   notu bu erteleme ile düştü; AI-01/02/04/06 zaten 17 Ağustos'ta kapandı.
> - KPI ölçümü ve haftalık rapor ritmi de ertelendi (20 Ağu · 27 Ağu · 3 Eyl tarihleri geçersiz).
> - Aşağıdaki "Pilot-02 sonu kapıları" (WEBHOOK-01) hâlâ ikinci müşteri öncesi zorunlu —
>   pilota değil, ikinci müşteriye bağlı.

> **Bağımlı:** 1 (smoke temiz) + 2(c) (freeze taahhüdü) + 4 (DOMAIN-02 E4 dahil kapanmış).
> KPI: aktif kullanıcı/gün, Tracker’a dönüş, AI taslak kabul/düzeltme/red, finans mutabakat,
> randevu kaçırma, webhook/job fail, destek süresi, haftalık yedek + restore.

> **Plan: `docs/2026-08-13-PILOT-02-PLANI.md`** — tarihler, KPI ölçüm kaynakları, haftalık ritim.
> ⚠️ Plandaki tarihler bu erteleme ile geçersiz; yeni tarih verilince güncellenecek.

- [x] **Pilot planı + KPI tanımları yazıldı** (2026-08-13).
  **Görüş:** 17 Ağustos – 6 Eylül (3 hafta), OrbisMed'den 2–3 kullanıcı. Sekiz KPI'ın her
  birine ölçüm kaynağı bağlandı; beşi sistemden (audit log, ai_corrections, no_show oranı,
  hata logları), üçü elle (Tracker'a dönüş, finans mutabakat, destek süresi). Elle olanlar
  toplanmazsa o KPI boş kalır — planda açıkça yazılı.
- [ ] **Feature freeze ilan et** — **hedef 19 Eylül 2026** (2026-08-19 kararı: "bir ay
  sonrası"). İlan edildiği gün yürürlüğe girer: yalnız hata + güvenlik + veri düzeltme
  migration'ı, yeni yüzey yok. **O güne kadar freeze yok**, yani AI-03/05/07 ve CSP gibi
  yeni yüzeyler bu pencerede yapılabilir.
- [ ] 3 hafta çalıştır + her Perşembe raporla — **19 Eylül – 10 Ekim 2026**
  (raporlar: 25 Eyl · 2 Eki · 9 Eki). Eski 20 Ağu · 27 Ağu · 3 Eyl tarihleri düştü.
- **Kabul:** KPI raporu yazılı; freeze ihlali varsa listelenmiş.

#### Pilot-02 ÖNCESİ (kullanıcı kararı, 2026-08-19)

- [x] **AI-02 öneri onay kuyruğu anlaşıldı + kabul edildi** (2026-08-19).
  **Görüş:** ekran önce anlaşılmamıştı ("anlamadım"); tek somut örnekle (gelen mesaj → kart →
  onay) açıklanınca kabul edildi. Ders: bu ekran kendini anlatmıyor — pilotta aynı soru
  kullanıcılardan da gelecek, yardım metni (`helpTopic`) örnekle güçlendirilmeli.

#### Pilot-02 sonu kapıları (ikinci müşteri öncesi ZORUNLU)

- [ ] **WEBHOOK-01 shim kapatma** — **23 Ağustos'a ertelendi (2026-08-20 kararı).**
  `WEBHOOK_IDENTITY_DEFAULT_SECRET=false`; önce tüm tenant'larda `tenant_provider_identities`
  satırı. Runbook: `docs/DEPLOY-COOLIFY.md` § WEBHOOK-01.
  **Durum (2026-08-20):** aktif 2 tenant'ın (Klinik-0, Klinik-1) ikisi de kimlik satırına
  kavuştu (`webhook:identity issue` çalıştırıldı, `status` artık ikisini de ✅ gösteriyor).
  **Kalan:** WAHA'nın nerede çalıştığı repoda kayıtlı değil (yalnız içeri gelen webhook
  kodu var, dışarı giden bir bağlantı yok) — kullanıcı önce WAHA panelini bulacak, oradaki
  webhook secret'ı yeni değerlerle değiştirecek, bir mesajla doğrulayacak, sonra shim'i
  Coolify'da kapatıp API'yi redeploy edecek.

---

### 6. MARKET-02 — 30 günlük pazar kapısı

> **Bağımlı:** PILOT-02 verileri.
> Kabul: 20 görüşme, 4–5 rakip demo/fiyat, ≥3 ücretli ön-sipariş/yazılı pilot niyeti,
> fiyat kartı + iptal/taahhüt modeli.

- [ ] Görüşmeleri tamamla
- [ ] Fiyat kartını sabitle
- [ ] Kapı kararını ver

---

## Tanıtım ve benimseme (DOC-04, DOC-05, ADOPT-01)

> **Neden bu blok açıldı (2026-08-23, kullanıcı sorusu).** *"Bir sürü yeni özellik geldi;
> bunları nerede tanıtacağız, kullandıracağız, kullandıklarını takip edeceğiz?"*
> Cevap: altyapı var (`/features` dört durumlu, `/changelog` tek kaynaktan, kurallar
> `docs/CHANGELOG-KURALLARI.md`'de) **ama süreç bir aydır işlemiyor** ve benimseme takibi hiç yok.
>
> **Sıralamanın dayanağı: henüz kullanıcı yok.** Dahili pilot başlamadı (README), PILOT-02
> ertelendi, prod'da canlı veri yok. Sıfır kullanıcı için ürün içi tur / bildirim / benimseme
> paneli yapmak erken optimizasyondur — kimsenin benimsemediği şeyin benimsenmesini ölçen panel.
> Bu yüzden yalnız DOC-04 şimdi; diğerleri pilota bağlı.

- [x] **DOC-04 — changelog + `features.ts` borcu (2026-08-23). (S)**
  **Son changelog kaydı 2026-08-14 (v0.9.0)** — ilk yazımdaki "22 Temmuz" yanlıştı (dosya
  yeniden eskiye sıralı, `grep` kuyruğuna bakılmış). Boşluk bir ay değil 9 gündü; 17–23 Ağustos
  arasında eklenen dokuz şeyin hiçbiri ne changelog'da ne `features.ts`'de:
  AI-01/02/04/06 · AUDIT-04 · AI-08 (randevu ajanı akışta) · AI-11a (Maya canlı veri) ·
  AI-09 (kaynak izi) · AI-03 (isabet ölçümü) · ünvanlar (`0064`) · hekim alanı (`0065`) ·
  referans raporu · karşılaştırma katmanı · eşik tablosu · olay kaydı (`0066`).
  **Kural zaten yazılıydı** (`CHANGELOG-KURALLARI.md` madde 3: durum yükseltildiğinde aynı
  commit'te güncellenir) — uygulanmadı. Borç her gün büyüyor ve geriye dönük yazmak
  zorlaşıyor.
  **Kabul:** her kalem için `changelog.ts` kaydı + `features.ts` durumu; iddia ile durum
  tutarlı (madde 1: "eklendi + çalışır" diyorsan `yayinda`/`pilotta`) · `/changelog` ve
  `/features` sayfaları doğru gösteriyor.
  **Süreç düzeltmesi (asıl iş):** bundan sonra kullanıcıya görünen her özellik commit'i
  changelog kaydını **aynı commit'te** taşır. Borç yeniden birikirse kural değil süreç
  bozuktur — o zaman kontrol otomatikleştirilir (CI'da "yeni feature id var ama changelog
  kaydı yok" kontrolü).
  **Görüş:** `v0.10.0` (17 Ağu, AI katmanı temeli) + `v0.11.0` (23 Ağu, AI temeli ve operasyon
  derinliği) yazıldı; `features.ts`'e 11 yeni kalem eklendi. **Hepsi `kod-hazir`** —
  `CHANGELOG-KURALLARI.md` madde 1 gereği: pilot başlamadı, prod'da canlı veri yok, hiçbiri
  gerçek kullanımda doğrulanmadı. Dokuz özelliği "Yayında" yazmak changelog'u yalancı yapardı;
  madde 1 tam bunun için var. Durumlar PILOT-02 ile birlikte yükseltilecek.
  AUDIT-04 ve `0063` yetki düzeltmesi `features.ts`'e girmedi (kullanıcıya görünen özellik
  değil) — changelog'a `guvenlik` tipiyle yazıldı.

- [ ] **DOC-05 — kullanıcı için "ne yapabilirsin" rehberi. (M)** *pilot başlamadan*
  Geliştirici için `docs/YAPIM-GUNLUGU.md` var; **kullanıcı için karşılığı yok.** Pilot ekibi
  panele girdiğinde ünvanların, hekim alanının, Maya'nın canlı veriye bağlandığının veya
  taslaktaki kaynak rozetinin ne işe yaradığını nereden bilecek?
  **Kabul:** ekran ekran değil, **iş akışı akışı** anlatan bir doküman — "WhatsApp'tan mesaj
  geldi, ne oluyor", "bir hastadan kâr ettim mi nasıl bakarım", "Maya'ya ne sorabilirim".
  Panelden erişilebilir (Kaynaklar/Yardım altına link).
  **Bağımlı:** DOC-04 (rehber, changelog ile aynı gerçeği anlatmalı).
  **Görüş:**

- [ ] **ADOPT-01 — benimseme takibi. (M)** *pilot başlayınca*
  "Kim hangi özelliği kullanıyor" bugün ölçülmüyor. **Ham veri kısmen zaten var:**
  `audit_logs` (kim ne oluşturdu/güncelledi/sildi), `maya_questions` (AI-11a soru kaydı —
  hangi araç kaç kez), `jobs → llm.parse` (AI çağrı sayısı ve maliyeti), `ai_corrections`
  (AI taslağı ne sıklıkla düzeltiliyor). Eksik olan: sayfa görüntüleme ve bunları birleştiren
  tek görünüm.
  **Karar gerekiyor:** sayfa görüntüleme takibi eklenecek mi? Panelde kullanıcı izleme, KVKK
  ve güven açısından ayrı bir tartışma — mevcut yazma-eylemi verisiyle yetinmek de savunulabilir
  ve hiçbir yeni veri toplamaz.
  **Bağımlı:** gerçek kullanıcı (PILOT-02).
  **Görüş:**

> **Ürün içi "Yenilikler" yüzeyi** (panele giren kullanıcıya yeni özellikleri gösteren
> bileşen) bilinçli olarak buraya alınmadı — `docs/FIKIRLER.md`'de duruyor. İkinci müşteri
> eşiğinden önce yapılırsa sıfır kullanıcıya tanıtım yapan bir yüzey olur.

---

## Faz 9 — kalan denetim / ürün artıkları (sıra yok; kapasiteye göre)

- **LEG-02 artığı — anonimizasyon kapsamı: case note gövdeleri + dosya adları.**
  AUDIT-F09-07b `contacts` satırını maskeliyor (ad/soyad/tel/e-posta/`notes`), ama
  `case_notes.body` serbest metni ve `files` dosya adları olduğu gibi kalıyor. Sonuç:
  silme sonrası kişi kartı başlıkta "Anonymized Contact" görünürken notlar sekmesinde
  ad/telefon okunabiliyor — silme pratikte yarım.
  **Karar (2026-08-11): böyle kalsın**, kapsam LEG-02 hukukçu görüşüne bağlanır.
  **Gerekçe:** (1) sağlık kaydı saklama yükümlülüğü ile silme hakkı çatışıyor — hangisi
  öncelikli, hukuk kararı; (2) serbest metin script'le güvenli maskelenemez (notun tamamını
  silmek klinik geçmişi de götürür, isim yakalama mutlaka kaçırır).
  **Seçenekler:** (a) böyle kalsın · (b) notlar + dosyalar da silinsin · (c) dosyalar silinsin,
  notlar saklama süresince kalsın ama erişimi kısıtlansın.
  **Dosyalar:** `apps/api/src/contacts/contact-data-subject.service.ts`. **(M)**
- **GAP-F09-20** Randevu checklist şablonları — skip adayı (Tracker 0 satır). **(L)**
- **GAP-F09-24 — `openapi.yaml`'da `evidence` bloğu yanlış `required` yazıyor (AI-09 artığı,
  2026-08-22).** `zod-to-json-schema`, enum anahtarlı `z.record`'u eksiksiz nesne sanıp yedi
  alanın tamamını zorunlu gösteriyor. **Runtime doğru** — hiçbir anahtar zorunlu değil; kusur
  yalnız üretilen dokümanda. Şemayı `z.object().partial()`'a çevirmek düzeltirdi ama
  `z.record`'un gerekçesini (AI-07'de beyaz liste migration'sız büyüsün) zayıflatır.
  **Karar: şimdilik böyle kalsın**, şemanın üstünde yorum var. **Tetikleyici:** OpenAPI'den
  istemci üreten bir dış tüketici çıkarsa ya da AI-07 beyaz listeyi genişletirse yeniden
  değerlendirilir — AI-07 zaten şemaya dokunacak, doğal birleşme noktası orası. **(S)**

---

## Acente değer katmanı — sitede vaat edilen, kodda olmayan

> **Neden ayrı blok:** Tracker paritesi kapandı (2026-08-14 listesindeki 7 açık kalemin hepsi
> kapalı) — yani "eski sistemde vardı bizde yok" işi bitti. Kalan açık artık başka bir cins:
> **ana sayfanın vaat ettiği ama üründe karşılığı olmayan** yüzeyler. Zincirin sekiz halkası
> arasında Hakediş ve Teşvik var; temsilî müdahale listesinde ikisi de örnek satır olarak
> geçiyor. Bunlar kapanmadan "reklamdan tahsilata tek zincir" iddiası eksik kalır.
>
> Sıra değer çapasına göre; kod büyüklüğüne göre değil.

| # | İş | Neden bu sırada | Durum |
|---|---|---|---|
| 1 | **Teşvik dosya + süre takibi** | ✅ **2026-08-17'de kapandı** — bkz. Son kapananlar | ✅ |
| 2 | **Hakediş / komisyon takibi** (PRODUCT-01) | ✅ **2026-08-17'de kapandı** — bkz. Son kapananlar | ✅ |
| 3 | **Temassız kişiler listesi** | ✅ **2026-08-17'de kapandı** — bkz. Son kapananlar | ✅ |
| 4 | **Kohort görünümü** — reklam ayı ≠ tahsilat ayı | ✅ **2026-08-17'de kapandı** — bkz. Son kapananlar | ✅ |

---

## AI katmanı (AI-01…AI-11b) — sıra serbest (pilot ertelendi)

> Karar metni, gerekçe ve 13 firmalık rakip AI taraması: Obsidian
> `03-Areas/VeriMaya/09-ai-katmani-yol-haritasi.md` (2026-08-15) + `02-yol-haritasi.md` § Eksen 1b.
> Buraya **kalem olarak** taşındı ki tek kaynak dosya AI işini görsün; ayrıntı Obsidian'da kalır.
>
> ~~**Hiçbiri PILOT-02 içinde yapılmaz** — freeze ⛔ kapsamında, sıra 6 Eylül'den sonra.~~
> **Düştü (2026-08-18):** PILOT-02 ertelendi, freeze yürürlüğe girmedi (bkz. kalem 5).
> AI-01/02/04/06 zaten 17 Ağustos'ta kapandı. Ana sayfa "sistem okur, siz onaylarsınız"
> diyordu; AI-02 ile o cümlenin ürün karşılığı doğdu.
>
> **"Firmaya özel ajan" = bilgi tabanı + kurallar + düzeltme geçmişi.** Model eğitimi değil.

| Kod | İş | Bağımlı | Büyüklük |
|---|---|---|---|
| **AI-01** | Bilgi tabanı v1 | ✅ **2026-08-17'de kapandı** — bkz. Son kapananlar | ✅ |
| **AI-02** | Kayıt güncelleme onay kuyruğu | ✅ **2026-08-17'de kapandı** — bkz. Son kapananlar | ✅ |
| **AI-03** | İsabet ölçümü | ✅ **2026-08-22'de kapandı** — bkz. Son kapananlar | ✅ |
| **AI-04** | Zaman kilitli alarm motoru — **deterministik kod, AI değil** (uçuş T-48, transfer T-24) | ✅ **2026-08-17'de kapandı** — bkz. Son kapananlar | ✅ |
| **AI-05** | Müdahale listesi v1 — aylık rapor üstünde öneri üreticisi; ilk sürüm elle sabit format | ✅ **2026-08-23'te kapandı** — bkz. aşağıdaki not | M–L |
| **AI-06** | Bilgi tabanı versiyonlama | ✅ **2026-08-17'de kapandı** — bkz. Son kapananlar | ✅ |
| **AI-07** | Öneri beyaz listesi genişletme (telefon, randevu durumu, hasta durumu) | AI-03 ölçümü | S |
| **AUDIT-04** | `transactions` create/update denetim kaydı | ✅ **2026-08-22'de kapandı** — bkz. Son kapananlar | ✅ |
| **AI-08** | Randevu ajanını WhatsApp akışına gömme | ✅ **2026-08-22'de kapandı** — bkz. Son kapananlar | ✅ |
| **AI-09** | Kaynak izi (`evidence`) | ✅ **2026-08-22'de kapandı** — bkz. Son kapananlar | ✅ |
| **AI-10** | LLM veri politikası dokümanı — sağlayıcı, eğitim opt-out, saklama, yurtdışı aktarım | LEG-02 | S |
| ~~**AI-11a**~~ ✅ | Maya canlı veri v1 — sabit araç listesi (5 araç) + **soru kaydı** | AUDIT-04 | M |
| **AI-11b** | Maya canlı veri v2 — kısıtlı sorgu katmanı ("akla gelen her soru") | AI-11a soru kaydı | L |

**Değişmez kurallar** (bozulursa "insan onaylı" savunması çöker): toplu kabul yok, her kart tek
tek onaylanır · eşleşme belirsizse öneri **üretilmez** · para alanları, `deleted_at`, rol/izin
alanları asla kapsamda değil · kritik operasyon kalemleri (uçuş, karşılama, klinik randevusu)
AI tarafından otomatik kapatılmaz · bilgi tabanına **PII girmez**.

> **⏸ AI-05 — ayrı oturum bekliyor (2026-08-20 kararı).** "Aylık rapor üstünde öneri
> üreticisi" tanımı boş: rapor **hangi soruyu** cevaplayacak, hiçbir yerde yazılı değil.
> Kod yazmadan önce ayrı bir gün ayrılıp önce Claude ile tartışılacak, oradan ekibe
> sorulacak sorular çıkarılacak, sonra liste kodlanacak. Bu iş o oturuma kadar başlamaz.
>
> **Panelde yeri: Raporlar → Müdahale Listesi.** Bugün orada yalnız "Yakında" rozetli bir
> yer tutucu var (2026-08-20) — `untouched`/`cohorts` linklerinin yanına eklendi, gerçek
> işlev yok. Gözden kaçmasın diye görünür tutuluyor.
>
> **Tartışmayı somutlaştırmak için örnek (2026-08-20, Claude'un verdiği örnek):**
> Bu ay 40 hasta reklamdan geldi, 12'si tahsilata dönüştü. Sistem ne söylesin?
> - "Dönüşüm oranı geçen aya göre düştü" mü?
> - "Şu kanaldan gelenler daha az dönüşüyor" mü?
> - "Şu temsilcide takip gecikmesi var" mı?
>
> Üçü de farklı veri kaynağı ve farklı kod gerektiriyor — asıl karar burada.
>
> **✅ Tanım geldi (2026-08-23).** Kullanıcı iki örnek cümle verdi ve AI-05'in eksik olan
> "hangi soruyu cevaplayacak" tanımı böylece doldu:
> *"X kişisi 4 referans hasta gönderdi, koordinatörü Y — bu dosyaya öncelik"* ve
> *"Z hekimin tedavilerinde RPT oranı arttı."*
> Katalog, veri hazırlık durumu ve önerilen sıra: **`docs/2026-08-23-maya-icgoru-sorulari.md`**.
>
> Özet bulgu: altı soru kümesinin **beşi bugünkü şemayla yazılabilir** (referans zinciri,
> koordinatör, dosya bazlı kâr, randevu durumu, klinik kırılımı hepsi mevcut ve indeksli).
> Eksik olan tek tek raporlar değil, **aralarındaki karşılaştırma** ("geçen döneme göre",
> "ortalamanın üstünde") ve **eşikler** (hangi değişim söylenmeye değer).
> **İki açık ürün kararı var** (hekim ayrı varlık olacak mı · RPT iyi/kötü ayrılacak mı) —
> ikisi cevaplanmadan kodlanmaz. **İlk sevk edilebilir parça:** referans değeri raporu (M),
> yeni alan gerektirmiyor, örnek 1'i tek başına karşılıyor.
>
> **Müdahale listesi dil modeliyle üretilmeyecek:** cümleler şablon, rakamlar SQL. AI-11a
> ilkesi burada da geçerli — *model işaret eder, sistem söyler.* Yanlış bir çıkarım cümlesi
> kullanıcıyı yanlış işe koşturur ve fark edilmesi yanlış bir bakiyeden çok daha zordur.
>
> **İlerleme (2026-08-23) — önerilen sıranın 1–4. adımları bitti:** referans değeri raporu,
> ünvan sözlüğü, randevuya hekim alanı, ve `summary`/`appointment-metrics`'e `compare=previous`
> (dönem karşılaştırması, geriye dönük kırıcı değişiklik yok). Detay: `docs/2026-08-23-maya-icgoru-sorulari.md` § 7.
>
> **✅ AI-05 tamamlandı (2026-08-23) — 5., 6. ve 7. adımlar da bitti.** Eşik tablosu
> (`packages/shared/src/report-thresholds.ts`), olay kaydı v1 (`incidents`) ve müdahale
> listesi v1 (`GET /v1/reports/interventions`, Raporlar → Müdahale Listesi) canlıda.
> Zincirin son halkası: dört bulgu tipi — `quality_drop` (hekim bazında RPT/no-show/iptal
> oranı, `appointment-metrics` + eşik), `revenue_drop` (dönem geliri/neti, `summary` + eşik),
> `open_incident` (çözülmemiş olay, delta değil mevcut durum, en eskiden yeniye), `referral_value`
> (en çok kazandıran referans, delta değil ilk-N). **Liste dil modeliyle üretilmedi** — sunucu
> yapılandırılmış bulgu döner, cümleyi web `messages.ts` şablonundan kurar. Tip başına en fazla
> 5 satır, tip içi sıralama var ama tipler arası global sıralama yok (elmayla armut). Finans
> türevli bulgular (`revenue_drop`, `referral_value`) yalnız çağıranın `finance:read`'i varsa
> cevaba girer — `incidents`'teki `canReadFinance` deseni aynen kullanıldı. Testler:
> `apps/api/src/reports/reports.interventions.isolation.spec.ts` (eşik altı, iyileşme, az kayıt,
> finans gizleme, boş dönem, tenant izolasyonu).

~~**Bugünkü kod durumu:** `ai_corrections` tablosu var ama beslenmiyor; prompt kodda gömülü
(G-26 ile tenant ek notu eklendi, bilgi tabanı değil). Yani AI-01 ve AI-02 sıfırdan iş.~~
**Düzeltildi (2026-08-22):** `ai_corrections` **besleniyor** — `WhatsappService.approveDraftsWithDb`
onay anında `original_parsed` ≠ `corrected` ise satır yazıyor, web `original_parsed` gönderiyor
(`ai-transaction/+page.svelte`), `AiCorrectionsReport` endpoint'i de var. AI-03 planlanırken
"sıfırdan iş" varsayımı geçersiz; veri birikmeye başlamış durumda.

> **✅ AI-02 sözleşme kontrolü yapıldı (2026-08-17).**
> Hizmet sözleşmesi **Madde 6.2**: *"Hiçbir öneri, Müşteri'nin yetkilendirdiği bir kullanıcı
> tarafından onaylanmadan Müşteri kaydına işlenmez."* Bu cümlenin artık kodda karşılığı var
> ve `record-suggestions.isolation.spec.ts` içinde **maddeye adıyla atıf yapan testlerle**
> kanıtlanıyor: bekleyen öneri randevuyu değiştirmiyor · yalnız tek id'li `approve` uyguluyor ·
> toplu onay yolu yok · belirsiz LLM çıktısı kuyruğa satır yazmıyor · bayat öneri 409 dönüp
> randevuya dokunmuyor · reddedilen sonradan onaylanamıyor.
> **Sonraki kontrol AI-07'de:** beyaz liste genişleyince (telefon, randevu durumu, hasta
> durumu) aynı kanıt her yeni alan için tekrarlanmalı — `field` CHECK'i bugün yalnız
> `'starts_at'` kabul ediyor, kapıyı dar tutan şey o.
> Sözleşme metni ve teknik eşleştirme: Obsidian `13-hukukcu-paketi.md` §8 (Madde 6) + §9 tablosu.

---

### AI temeli — "AI sonradan eklenmedi" iddiasının kod karşılığı (AUDIT-04, AI-08…AI-11b)

> **Neden bu blok (2026-08-22, Rillet analizi).** Hedef, ana sayfada şu cümleyi **dürüstçe**
> kurabilmek: *"AI sonradan eklenmedi, yazılımın temelinde. İş akışlarına gömülü uzmanlaşmış
> ajanlar."* Cümlenin iki yarısı var ve bugünkü kod ikisini de yarım karşılıyor.
>
> **"Gömülü ajanlar" — bugün:** Finans ajanı **gerçekten gömülü** — WhatsApp webhook'u
> `inbound_message.process` job'ı yazıyor (`webhooks.controller.ts`), worker parse ediyor,
> kullanıcı gelen kutusunu açtığında taslak hazır bekliyor. Alarm motoru (AI-04) da olay
> tetikli. **Ama randevu ajanı gömülü değil:** `POST /v1/record-suggestions/parse` yalnız
> kullanıcı metni yapıştırınca çalışıyor. Aynı mesaj parayı görüyor, tarihi görmüyor. → **AI-08**
>
> **"Sonradan eklenmedi" — bugün:** `record_update_suggestions` (kaynak + güven + karar veren
> tabloda), `ai_corrections`, `jobs`→`llm.parse` ledger'ı: hepsi AI düşünülerek tasarlanmış.
> **Ama zincirin son halkası boş:** `transactions` satırı ne kaynağı, ne güveni, ne "kim yazdı"yı
> taşıyor. Elle girilen satırla AI'dan gelen satır bayt bayt aynı. İddianın en kolay çürütüldüğü
> nokta burası. → **AUDIT-04 + AI-09**
>
> **Ölçüt (tek soru):** *İşlem satırına bakıp "bunu AI mı yazdı, insan mı, nereden aldı,
> kim onayladı" diyebiliyor muyuz?* Bugün hayır. Bu dört kalem bitince evet.
>
> **Cümleye sokulmayacak:** "elle veri girişi yok" / "her şey entegrasyonlardan akar".
> Rillet'in ABD ekosistemine ait (Stripe/Plaid/açık bankacılık); burada karşılığı yok ve
> "Bilinçli olarak yapılmayacaklar"da. İlk demoda çöker.

**Sıra: ~~AUDIT-04~~ ✅ → ~~AI-08~~ ✅ → ~~AI-11a~~ ✅ → ~~AI-09~~ ✅ → ~~AI-03~~ ✅ → AI-11b (≥22 Eyl).** (AI-10 paralel, kod işi değil.)

> **AI-03 kapsam daraltması (2026-08-22 kararı).** Kalemin özgün metni *"sık red desenleri
> prompt'a girer"* diyordu. **Bu yarısı kapsam dışı bırakıldı.** Gerekçe ikisi de ürünün kendi
> disiplininden çıkıyor:
> 1. **Kendini yazan prompt, insan kapısı olmayan tek yüzey olurdu.** Her yerde kural "onaysız
>    hiçbir şey kayda geçmez" (Madde 6.2). Sistem prompt'unun red verisinden sessizce yeniden
>    yazılması bu kuralın istisnası olur — üstelik en görünmez yerde.
> 2. **Enjeksiyon yüzeyi.** Sürekli reddedilen mesaj deseni, prompt'u şekillendirmenin yolu
>    hâline gelir. Mesajları dışarıdan gelen bir sistemde kabul edilemez.
>
> **Yerine:** AI-03 ölçer ve öneriyi **kullanıcıya gösterir**; tenant isterse kendi AI notunu
> (G-26 · `settings` → AI prompt notu, max 2000 karakter) **elle** düzenler. Yüzey de insan
> kapısı da zaten var. Otomatik besleme istenirse ayrı kalem + ayrı sözleşme kontrolü.

> **AI-11a neden AI-09'dan önce (2026-08-22 kararı).** AI-11b'nin ("akla gelen her soru")
> tasarlanabilmesi için **gerçek soru listesi** gerekiyor ve o listenin bekleme süresi var —
> insanlar bir ay soru sormadan hangi filtrelerin gerektiği bilinemez. AI-11a'yı öne almak
> o sayacı erken başlatır. AUDIT-04 ve AI-08 zaten S; geciktirdiği süre birkaç gün.
>
> **Rillet farkı, atlanmasın:** Rillet'in ajan listesi (flux, accruals, reconciliation,
> revenue recognition) muhasebe literatürünün hazır, sonlu kanonu — onlar listeyi yazmadı,
> meslek yazdı. Sağlık turizmi acentesinin böyle bir kanonu **yok**. Bu yüzden Rillet'in
> yaptığı birebir kopyalanamaz: onlar hazır listeyi kodladı, biz listeyi **önce çıkaracağız**.
> AI-11a'nın soru kaydı, bizim eksik kanonumuzun yerine geçen şey. Kaynak: `info.rillet.com`
> — iç mimarilerini yayınlamıyorlar, ama yaklaşımlarını "constrained / strict set of methods /
> avoid inventing numbers" diye tanımlıyorlar; yani serbest SQL değil, kısıtlı metot listesi.

- [ ] **AI-10 — LLM veri politikası dokümanı. (S)** — kod işi değil
  Bugün hiçbir dokümanda "modeller müşteri verisiyle eğitilmiyor" taahhüdü **yok**
  (`TEHDIT-MODELI.md` / `MIMARI.md` taraması boş). Satıcı UK (LEG-02), müşteri TR sağlık
  turizmi → sağlık verisinin yurtdışına aktarımı zaten açık risk. İlk müşteri sözleşmesinde
  sorulacak.
  **Kabul:** `docs/TEHDIT-MODELI.md`'ye bölüm — sağlayıcı ve model (`LLM_MODEL` env),
  eğitim opt-out durumu (sağlayıcı sözleşmesinden **kanıtla**, iddia değil), saklama süresi,
  yurtdışı aktarım dayanağı, PII maskeleme sınırı (heuristic yol dışarı çıkmıyor — bu bir
  güvence, yazılmalı) · `MIMARI.md` § Güvenlik çerçevesi'nden link.
  **Karar notu:** **tenant başına model seçimi yapılmayacak** — `createLlmClientFromEnv` global
  env kalır. 3 LLM yolunun her birini tenant başına test etme yükü, 5-15 kişilik müşterinin
  sormadığı bir soruya ödenir. Doğru cevap sözleşmede yazmak.
  **Ajan:** kullanıcı + Claude (sağlayıcı sözleşmesi okunacak; iddia uydurulamaz).
  **Görüş:**

> **Maya bugün nerede duruyor (AI-11a/b'nin çıkış noktası).** `MayaService.ask` →
> `settings.getKnowledge()` → 5 bölüm (`services`, `payment`, `faq`, `rejection`, `notes`;
> bölüm başına 4000 karakter). **DB'ye hiç erişimi yok**; banka boşsa LLM'e çağrı bile gitmiyor.
> "Saç ekimi fiyatımız ne?" → cevaplar. "Yılmaz bey'in kalan borcu ne?" → `BILINMIYOR`.
> **Karar (2026-08-22): ikinci soru tipi kapsama alınıyor** — hedef, içerideki kayıtlarla
> ilgili soruları cevaplayan Maya. İki adımda, çünkü soru listesi henüz yok.
>
> **Değişmez desen (ikisinde de, pazarlığa kapalı):** DB satırları prompt'a **dökülmez** —
> hem `pii-mask.ts` disiplinini çiğner hem modeli rakam uydurmaya davet eder. Model yalnız
> **hangi sorgu + hangi parametre** olduğunu seçer; **rakamı Postgres verir, kod basar.**
> Model rakamı ne görür ne üretir. AI-09 ile aynı ilke: *model işaret eder, sistem doğruyu söyler.*
> **Her koşulda kapsam dışı:** serbest SQL · hasta listesi dökümü · tıbbi yorum · tahsilat taahhüdü.
>
> **Güncel (2026-08-22, AI-11a kapandı):** yukarıdaki "DB'ye hiç erişimi yok" cümlesi artık
> geçerli değil — beş sabit araçla erişimi var. "Yılmaz bey'in kalan borcu ne?" cevaplanıyor;
> izin araç başına çalışma anında kontrol ediliyor. Desen aynen uygulandı: DB satırı prompt'a
> dökülmüyor, model yalnız `{tool, params}` seçiyor.

- [ ] **AI-11b — Maya canlı veri v2: kısıtlı sorgu katmanı. (L)** — *listenin en büyük kalemi*
  Model tablo + filtre + toplama seçer; serbest SQL **değil**: izinli tablolar
  (`transactions`, `contacts`, `appointments`), izinli sütunlar, izinli toplamalar.
  Örnek — 5 araçta olmayan ama bunun cevapladığı soru: *"Geçen ay Ada Klinik'e toplam ne
  ödedik?"* → `transactions` · `contact=…, kind=expense, occurred_on ∈ [Tem]` · `sum(amount_base)`.
  **Ön koşul:** AI-11a soru kaydında ≥1 ay gerçek soru. Desteklenecek filtreler o kayıttan
  çıkar — önceden tasarlanmaz. **Sayaç 2026-08-22'de başladı** (`maya_questions`); bu iş
  en erken 2026-09-22'de açılabilir.
  **Kabul:** AI-11a'nın tüm kabul maddeleri aynen geçerli (izin, PII, `BILINMIYOR`, ledger) +
  üretilen sorgu whitelist dışına çıkamaz (negatif test: yasak tablo/sütun reddedilir) +
  sonuç satır sayısı üst sınırı.
  **Ajan:** Opus.
  **Görüş:**

---

## Bekleyen (MARKET-02 sonrası / ikinci müşteri eşiği)

- **Marka tescili:** `verimaya.com` / `.com.tr` + Türk Patent 9/35/42/44 (görünen: **"Verimaya"**,
  tek kelime — 2026-08-16 kararı, `README.md`).
- **IOS-01:** iOS donmuş; birikmiş drift — çözülürse ilk kalem.
- **Panel CSP enforcing** — Report-Only + ihlal toplama SEC-CSP ile geldi (`/dev`,
  `0060_csp_reports`). **Bu iş yarım kalır** ta ki raporlar birkaç gün toplanıp politika
  daraltılınca `-Report-Only` eki silinene kadar. Şimdi blocking yazma.
- **Veri işleme envanteri** + **AB veri lokasyonu + DPA şablonları**. **LEG-02'ye bağlı
  (2026-08-12):** satıcı Albion Signature (UK), müşteri Türkiye'de sağlık turizmi acentesi —
  yani sağlık verisinin yurtdışına aktarımı var. KVKK aktarım dayanağı + DPA + aydınlatma
  metni hukukçu görüşü gerektiriyor. Karar dayanağı: MARKET-01 (b).
- **DOC-03b/d artıkları (kullanıcı):** Obsidian `00-proje-ozeti` + `01-kararlar` marka +
  `04-ilerleme-log` — sıradaki vault oturumu.
- **İsteğe bağlı ops:** API'yi de GHCR image path'ine (path B) taşımak — web'de zaten öyle.
  (Coolify `verimaya-web-image` → `verimaya-web` isim temizliği ✅ yapıldı, 2026-08-20.)

---

## Bilinçli olarak yapılmayacaklar (MARKET-02 kapısına kadar)

| Konu | Gerekçe |
|------|---------|
| iOS App Store hazırlığı | Pazar doğrulaması yokken yatırım yok |
| Tam i18n/locale ağacı (`/tr/` `/en/`) SEO | Hub UI TR/EN bilinçli kısmi (DOC-03e) |
| TikTok / Instagram entegrasyonları | MARKET-02 öncesi yok |
| Klinik entegrasyonları (e-Nabız, e-Fatura) | Acente segmenti seçilmezse gereksiz |
| Ürün içi karnenin genişletilmesi | Pilotla gelir |
| **Etiketler (Tags) modülü** | Tracker'da doldurulmadı (`ayarlar.md`: "taşınmaz") |
| **Kişilerden toplu case / toplu auto-link** | Tracker tek seferlik; ETL aynı işi yapıyor |
| **Lead / pipeline / satış aşaması app'te** | **DOMAIN-01:** satış GHL'de; app = operasyon |
| **Randevu durumu tenant-CRUD** | Enum kilitli (`ETL-ESLEME` §2.3); talep → FK |
| **Canlı kur çevirici** | Snapshot model (FX-01) |
| **`responsible_party` alanı** | Contact modeli absorbe etti |
| **İkinci “açık işler” MD dosyası** | Tek kaynak kuralı; çift işaret sapması |

---

## Açık sorular / ürün kararı bekleyenler

> Kapalı: silme politikası (soft-delete) · patient merge · kişi notları (= DOMAIN-02 tek model).

3. **Randevu durumu enum kalacak mı?** Tenant kendi durumunu isterse enum → FK. PILOT-02.
4. **Checklist ölü özellik mi?** → GAP-F09-20 skip olabilir.
6. **AI prompt tenant'a açılmalı mı?** (GAP-26) — **evet, sınırlı:** çekirdek prompt
   sunucuda; tenant metni ek not (max 2000), reset zorunlu, şema sunucu kontrolünde.
9. ~~**İçe/dışa aktarım ikinci müşteriden önce mi?** (GAP-08)~~ → **evet, uygulandı** (G-09/G-10).
10. ~~**P2P payer/payee geri gelecek mi?**~~ → **hayır, kapandı (2026-08-20).** Kullanıcı canlı
    Tracker'da New Transaction formunu kontrol etti — Contact/Responsible dışında böyle bir
    alan çifti yok. Eski gap dokümanının "kişisel kategoride zorunlu" notu geçerli değilmiş
    ya da özellik zaten kaldırılmış. Liste kalıcı olarak düştü.

---

## Son kapananlar (bu dosya dönemi)

> 2026-08-09 dönemi kapananların tamamı: `docs/Arşiv/2026-08-09-YAPILACAKLAR.md` § Son kapananlar.
> 2026-08-03 ve öncesi: `docs/Arşiv/2026-08-03-YAPILACAKLAR.md`.

- [x] **OPS-04 — `pnpm check` artık lint de koşturuyor (2026-08-23).** Kök `package.json`:
  `turbo run check` → `turbo run check lint`. **Neden:** 22 Ağustos'ta CI tam bu yüzden
  kırıldı — yerelde `pnpm check` yeşildi, CI ayrıca `web lint` (prettier+eslint) koşturuyordu.
  Artık tek komut ikisini de kapsıyor, yerel yeşil = CI yeşil.

- [x] **OPS-05 — Yeni tablolara otomatik `UPDATE` yetkisi durduruldu (2026-08-23).**
  Migration `0063`: `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE UPDATE ON TABLES
  FROM verimaya_app`. **Neden:** `0003_app_role.sql` her yeni public tabloya `UPDATE`
  veriyordu; `maya_questions` (0061) denetim kaydı olmasına rağmen açık `REVOKE`
  yazılmasaydı sessizce güncellenebilir kalacaktı. Artık ters yönde hata veriyor:
  gerekli `UPDATE` unutulursa uygulama "permission denied" atar, testte yakalanır.
  **Sessiz açık yerine gürültülü hata.** Mevcut 30+ tablo etkilenmedi (doğrulandı:
  `transactions`/`contacts`/`appointments`/`audit_logs` hâlâ `UPDATE` taşıyor,
  `maya_questions` taşımıyor). Kural `AGENTS.md` migration bölümüne işlendi.

- [x] **AI-03 — İsabet ölçümü (2026-08-22).** 3 commit. `GET /v1/reports/ai-accuracy`
  (`finance:read`) + Raporlar altında sayfa. Üç kaynak: `ai_corrections` (hangi alan hangi
  AI-09 güven seviyesinde düzeltiliyor), `record_update_suggestions` (kabul oranı + red
  gerekçeleri), `maya_questions` (cevaplanma oranı + cevaplanamayan soru örnekleri).
  Kapsam daraltması uygulandı: otomatik prompt beslemesi YOK; cevaplanamayan sorular
  "bilgi bankana ekle / AI notunu düzenle" yönlendirmesi olarak gösteriliyor.
  **Görüş:** Sonnet yazdı. **Yan bulgu — gerçek bug düzeltildi:** `AiCorrectionsReport`
  SQL'i `patient_id`/`patient_display_name` arıyordu, oysa DOMAIN-02'de alanlar
  `contact_id`/`contact_display_name` olmuştu — o iki alanın düzeltmesi rapora **hiç
  girmiyordu**. Sessiz veri kaybıydı, AI-03 olmasa görülmezdi.
  **Not:** ajan "4 test dosyası önceden kırıktı" diye raporladı; kendi koşumda **806/806
  api + 180 shared + 86 web yeşil**. Geçici DB çakışmasıymış, kalıcı sorun yok.

- [x] **AI-09 — Kaynak izi / `evidence` (2026-08-22).** 3 commit.
  Taslak alan bazında `{quote, start, confidence}` taşıyor; onaylanan `transactions` satırı
  `source_inbound_message_id` + `source_evidence` (migration `0062`). Kart ve işlem detayında
  kaynak rozeti + mesajda vurgulama.
  **Görüş:** Opus yazdı. **Uydurulmuş atıf koruması mutasyonla doğrulandı** — doğrulama
  kapatılınca 3 test kırmızı. Atıf **maskeli metne** (modelin gördüğü) karşı doğrulanıyor;
  doğru seçim, ham metne karşı doğrulamak `[TELEFON]` içeren dürüst alıntıyı uydurma sayardı.
  Ofset ham metinde yeniden hesaplanıyor, modelin verdiği ofset asla doğrudan kullanılmıyor.
  Alanlar API'den yazılamıyor (zod `omit` + controller argümanı hiç geçmiyor + `updateWithDb`
  dokunmuyor + onayda izi payload'dan okuyor). Kullanıcı bir alanı düzeltirse o alanın izi
  düşüyor — doğru karar, iz "AI şuradan aldı" demek. 800 api / 180 shared / 86 web yeşil.
  **Açık kusur (bilinçli):** `zod-to-json-schema` enum anahtarlı `z.record`'u eksiksiz nesne
  sanıp `openapi.yaml`'da `evidence` bloğuna yanlış `required` yazıyor. Runtime doğru.
  Düzeltme `z.object().partial()`'a çevirmeyi gerektiriyor, o da AI-07 beyaz liste
  genişletmesinde migration'sız büyüme gerekçesini zayıflatıyor. Doküman tüketen istemci
  üretilecekse burası düzeltilmeli.

- [x] **AI-11a — Maya canlı veri v1 (2026-08-22).** 7 commit.
  Beş araç (`contactBalance`, `openBalances`, `contactAppointments`, `periodSummary`,
  `untouchedContacts`) mevcut servisleri yeniden kullanıyor; soru kaydı `maya_questions`
  (migration `0061`).
  **Görüş:** Opus yazdı. **İzin kapısı mutasyonla doğrulandı** — delinince 3 test kırmızı.
  İzin araç başına, çalışma anında (`MayaToolsService.isToolAllowed`); guard `settings:read`'te
  bilinçli bırakıldı, ikisi ancak birlikte doğru. Model rakam üretemiyor: sözleşmede rakam
  alanı yok, çıktıdan yalnız `{tool, params}` okunuyor, `params` `.strict()`; cümleyi web
  şablonu kuruyor. **Bulgu:** `0003_app_role.sql` her yeni public tabloya `UPDATE` veriyor —
  `GRANT SELECT, INSERT, DELETE` yetmiyor, açık `REVOKE UPDATE` gerekti. Canlı DB'de
  doğrulandı. Bundan sonraki her "yazılır, güncellenmez" tabloda aynı tuzak.
  **AI-11b ön koşulu bugün başladı:** `maya_questions` ≥1 ay soru toplayacak → en erken
  **2026-09-22**.

- [x] **AI-11a — Maya canlı veri v1: sabit araç listesi (2026-08-22).**
  Maya artık kendi kayıtlarınızı da cevaplıyor. Beş araç, beşi de mevcut servisi yeniden
  kullanıyor (yeni sorgu yazılmadı): `contactBalance` → `contacts.financeSummary()` ·
  `openBalances` → `reports.balances()` · `contactAppointments` → `appointments.list()` ·
  `periodSummary` → `reports.summary()` · `untouchedContacts` → `reports.untouchedContacts()`.
  Sözleşme `packages/shared/src/maya-tools.ts`; soru kaydı `0061_maya_questions.sql`.
  **Görüş:** Opus yazdı, doğrulamayı kendi koşturdu (774 API testi / 138 dosya, shared 180,
  web 78, `pnpm check` temiz).

  **İzin sınırı nereye kondu.** `POST /v1/maya/ask` hâlâ yalnız `settings:read` istiyor —
  guard'ı `finance:read`'e yükseltmek yanlış olurdu, o zaman bilgi bankası sorusu soran
  temsilci kapıda kalırdı. Doğru sınır **araç başına, çalışma anında**:
  `MayaToolsService.isToolAllowed` guard'la birebir aynı zinciri koşuyor
  (`resolveOrganizationRole` → `getDeniedKeys` → `hasOrgPermission`). İzin yoksa araç
  **çalıştırılmıyor**, sorgu bile atılmıyor ve cevap `BILINMIYOR` — "yetkin yok" denmiyor,
  verinin varlığı sızmıyor.
  **Not:** varsayılan matriste her rolde `finance:read` var; izinsizlik yalnız tenant deny
  override'ıyla oluşuyor (G-11). Test o gerçek yolu kullanıyor.

  **Modelin rakam üretmesini ne engelliyor.** Üç kat: (1) sözleşmede rakam alanı yok —
  model yalnız araç adı + kapalı kümeden parametre seçebiliyor, dönem ve temassızlık eşiği
  bile enum; (2) istemci model çıktısından **yalnız** `tool` + `params` okuyor, gövdeye
  eklediği cevap cümlesi hiç okunmuyor; (3) `params` `.strict()` — uydurma bir alan
  doğrulamayı düşürüyor ve çağrı deterministik yönlendiriciye devrediliyor. Gerçek tarih
  aralığını `mayaPeriodRange` kodda, tenant saat dilimine göre hesaplıyor.

  **PII.** Kişi eşlemesi sunucuda: isim maskeleniyor, modele `KISI_n` token + opak UUID
  gidiyor (`maya-contact-match.ts`), gövde `buildMaskedMayaToolPayload` kapısından geçiyor.
  Aynı isme birden çok kişi uyarsa **token üretilmiyor** — yanlış hastanın bakiyesini
  göstermektense cevapsızlık. Modelin verdiği `contact_ref` sunucunun çözdüğü listede yoksa
  araç çalışmıyor; bu, aynı tenant içinde RLS'in yakalayamadığı tek delik.

  **Beklenmeyen bulgu.** `0003_app_role.sql`'deki `ALTER DEFAULT PRIVILEGES` her yeni public
  tabloya `UPDATE` veriyor — denetim kaydı için yalnız `GRANT SELECT, INSERT, DELETE` yazmak
  yetmiyordu. 0061'e açık `REVOKE UPDATE` eklendi ve doğrulandı. Yeni "yazılır, güncellenmez"
  tabloların hepsi için geçerli bir tuzak.

  **Testlerin gerçekten koştuğu mutasyonla kanıtlandı:** izin kontrolü bilerek kapatılınca
  2 test, kişi izin listesi kapatılınca 1 test kırmızıya döndü.

  **AI-11b için hazır girdi:** `maya_questions` (maskelenmiş soru, seçilen araç, cevaplandı mı,
  kaynak). İzin reddi yüzünden çalışmayan araç da kaydediliyor — hangi rolün neye ihtiyaç
  duyduğu ancak böyle görülür. Sayaç bugün başladı.

- [x] **AI-08 — Randevu ajanı WhatsApp akışına gömüldü (2026-08-22).**
  `InboundMessageProcessor` artık aynı mesaj gövdesini `RecordSuggestionsService.parse`'a da
  yolluyor. Randevu ajanı ayrı try/catch'te; `outcome === 'skipped'` ise çalışmaz (mükerrer
  öneri koruması). Manuel `POST /v1/record-suggestions/parse` ve toplu inbox yolu değişmedi.
  **Görüş:** Sonnet yazdı. Hata izolasyonu mutasyonla doğrulandı — randevu ajanına bilerek
  `throw` koyuldu, finans taslağı ve `job.status=completed` yine yazıldı, 8 test yeşil kaldı.
  Tam takım 735 test yeşil, `pnpm check` temiz. Onay kapısına (Madde 6.2) dokunulmadı;
  değişen yalnız tetikleyici.

- [x] **AUDIT-04 — `transactions` create/update denetim kaydı (2026-08-22).**
  `createWithDb` + `updateWithDb` artık `audit_logs`'a yazıyor (`entity_label` =
  `deriveTransactionLabel`), aynı DB transaction'ında; WhatsApp onay yolu
  (`approveDraftsWithDb`) dahil. Yeni `transactions.audit.isolation.spec.ts` (4 test).
  **Görüş:** Cursor yazdı, izolasyon testlerini koşturamadı (Postgres kapalıydı) — Docker
  kaldırılıp 4 test yeşil doğrulandı. Testlerin gerçekten koştuğu, `create` yazımı bilerek
  kapatılıp 2 testin kırmızıya dönmesiyle kanıtlandı. Tam takım: 730 test / 135 dosya yeşil,
  `pnpm check` temiz. `ai_corrections.createdBy` imza değişiminde `actor.actorId`'ye
  taşınmış — bozulmamış.

- **AI-02 Ayrıştır sessiz boş dönüş geri bildirimi ✅** (2026-08-20) — `POST /v1/record-suggestions/parse`
  yanıtına `skipped_reason` (`ambiguous_contact` | `no_date` | `no_change` | null). Heuristic
  `{ drafts, skipped_reason }` döner; LLM yolu tanı üretemezse `null` (uydurma yok). Panel nötr
  bilgi kutusu gösterir; belirsizlikte öneri kuralı değişmedi.
  **Görüş:** Acentelerde çoklu aktif randevu (danışma+op+kontrol) sık; boş `items` artık "bozuk"
  sanılmıyor. Madde 6.2 tahmin yasağı aynı, yalnız neden kullanıcıya taşındı.
  **Canlı doğrulama ✅ (2026-08-20):** kullanıcı gerçek bir mesajla öneri + onay akışını
  denedi, çalıştı.

- **SEC-CSP panel Report-Only + ihlal toplama ✅** (2026-08-19) — `app.verimaya.com` nginx
  `Content-Security-Policy-Report-Only` (`connect-src 'self' https:` çünkü API
  `api.verimaya.com`); `POST /v1/csp-reports` auth'suz; liste `/dev`. Migration `0060`.
  **Görüş:** Hub enforcing CSP'ye dokunulmadı. İş yarım: raporlar birkaç gün toplanınca
  politika daraltılır ve `-Report-Only` silinir — o adım Bekleyen'de. Yerel Vite'de
  HEAD `/` başlık döndürmez; politika satırı canlı nginx'te görünür.

- **AI-04b operasyon alarmı ayarları ✅** (2026-08-18) — `tenant_settings.operation_alert_thresholds`
  artık yazılabiliyor: tür başına `{ hours, enabled }`. Eski düz sayı biçimi okunur.
  `GET/PUT /v1/settings/operation-alerts`, panel `/settings/operation-alerts`, listede silme.
  Eşik değişince teyitsiz `due_at` kayar; tür kapanınca teyitsiz soft-delete; teyitli satıra
  dokunulmaz; yeniden açınca backfill yok.
  **Görüş:** Ayar değişmeyen alarm yanlış saatte çalar — bu tur o boşluğu kapattı. Migration
  yok (anahtar zaten vardı). Varsayılana dön = PUT defaults, ayrı DELETE yok.

- **Canlı doğrulama turu ✅** (2026-08-19) — API redeploy + migration'lar prod'da; bilgi
  bankası dolduruldu ve **Maya artık gerçekten cevap veriyor**; alarm eşikleri tenant'a göre
  ayarlandı; öneri onay kuyruğu gerçek örnekle denendi ve kabul edildi.
  **Görüş:** Satışın önündeki asıl engel buydu — "sizin bilgi bankanızı okuyan yapay zeka"
  vaadi artık gösterilebilir. Bilgi bankası kalemi Bekleyen'den düştü; içerik büyüdükçe
  AI-06 sürüm geçmişi (`knowledge_revisions`) geri alma imkânı veriyor.

- **AI-02 kayıt güncelleme onay kuyruğu ✅** (2026-08-17) — `record_update_suggestions`
  (migration `0059`, RLS + FORCE RLS + policy + GRANT). Tek alan: `appointments.starts_at`.
  `POST /v1/record-suggestions/parse` metinden öneri üretir, `GET` kuyruğu listeler,
  `POST /:id/approve` **tek tek** uygular, `POST /:id/reject` sebep alır. Panel
  `/appointments/suggestions`. `LlmClient.suggestAppointmentReschedule` iki istemcide de var.
  **Görüş:** Bu, ana sayfadaki "sistem okur, siz onaylarsınız" vaadinin ilk gerçek karşılığı ve
  sözleşme Madde 6.2'nin kanıtı (yukarıdaki bloğa bakın). Kapı bilerek dar: `field` CHECK'i
  yalnız `'starts_at'`, `confidence` yalnız `high`/`medium`, toplu onay yolu **yok**.
  Onay randevuyu `AppointmentsService.updateWithDb` üzerinden değiştirdiği için AI-04
  alarmlarının `due_at`'i de kayıyor, teyitli alarm teyitli kalıyor.
  **Kusur ve ders:** Cursor `openapi:generate` çalıştırmadı, CI kırmızı döndü; yerelde
  görünmedi çünkü script `@verimaya/shared` **dist**'ini okuyor ve yerel dist bayattı
  (Çalışma kuralları · 10).

- **AI-04 zaman kilitli alarm motoru ✅** (2026-08-17) — `operation_alerts` (migration `0058`,
  RLS + FORCE RLS + policy + GRANT). Deterministik: `due_at = starts_at − threshold_hours`
  (uçuş 48, transfer 24, karşılama 12, klinik 24). CRUD `/v1/operation-alerts`, teyit
  `PATCH .../confirm`, panel `/appointments/alerts`. Randevu create/update/soft-delete
  alarmları üretir/günceller/düşürür; teyitli satır teyitli kalır.
  **Görüş:** Bu iş AI değil — ihtiyaç haritası §5.4 bekçi köpeği. Ayar ekranı bu turda yok;
  `tenant_settings.operation_alert_thresholds` anahtarı + shared varsayılan hazır. Mevcut
  randevulara backfill yok — alarm create/tarih değişince oluşur.
  **✅ Çözüldü (2026-08-18) — AI-04b.** İlk sürümde her randevu dört türü birden açıyordu ve
  eşik değiştirilemiyordu; gürültü kaçınılmazdı. Ayar ekranı geldi: kullanmadığınız tür
  kapatılır (yeni randevularda hiç oluşmaz), eşik tür başına değiştirilir. Liste varsayılanının
  "teyit bekleyen" olması gürültüyü **saklıyordu**; asıl çözüm kaynağı kesmek.

- **Hakediş / komisyon takibi (PRODUCT-01) ✅** (2026-08-17) — `commission_entries` (migration
  `0056`, RLS + FORCE RLS + policy + GRANT), CRUD `/v1/commissions`, özet
  `GET /v1/reports/commission-summary`, panel `/finance/commissions`. Satır elle girilir;
  tahakkuk (`accrued`) ile ödeme (`paid`) ayrı; özet kazanan başına hak edilen / ödenen /
  **kalan** (`open_base`), yalnız açık bakiyeler (BAL-OPEN). FX snapshot işlem desenini izler;
  `missing_fx_count` sessiz atlama yerine uyarı.
  **Görüş:** Komisyon **formül üretilmez** — klinik başına kural yazılı olmadığı için
  (ihtiyaç haritası §8.4) yüzde uydurmak mutabakatı bozar. MSW handler + demo veri bu turda
  yazıldı (teşvik turundaki "Yükleniyor…" tuzağı tekrarlanmasın diye).
  **⚠️ Denetimde yakalanan mali hata — testler yeşilken:** Özet, ödenmiş satırı `accrued_base`
  dışında tutup sonra `open_base = accrued − paid` ile bir daha düşüyordu; yani aynı ödeme iki
  kez sayılıyordu. Sonuç: klinikle mutabakatta **borç olduğundan az** görünüyordu (20.000 hak
  edilen / 5.000 ödenen bir kayıtta kalan 15.000 yerine 10.000). "Ödendi işaretle" düğmesine
  basıldığında ise kalan **eksiye** düşüyordu (−8.000). Kök sebep tek satırlık `else if`.
  Doğru model: **satır kazanılmış tutarı temsil eder; `status` yalnız ödenip ödenmediğini
  söyler** — ödenen satır da hak edilene dâhildir.
  Hata testlerden geçmişti çünkü mevcut spec yanlış modeli **beklenen davranış olarak
  kodlamıştı** (`accrued_base` 5.000 bekliyordu). Spec düzeltildi + durum geçişini kanıtlayan
  regresyon testi eklendi (`open_base` asla negatif olamaz). Aynı hata MSW mock'unda da vardı,
  o da düzeltildi. Tarayıcıda gözle bakılmasaydı bu hata pilota giderdi — PILOT-02 risk
  tablosundaki "sessiz veri hatası: finans mutabakatı tutmaz" satırının tam örneği.
- **Pazarlama ana sayfası v4 ✅** (2026-08-16) — canlı `/` (ve prerender kaynağı `/vitrin`)
  artık `HubHomeV4`: **v1 kabuğu + v4 içeriği**. Kabuk v1'den gelir (nav, logo, tema/dil
  değiştirici, `messages.ts` i18n, footer, KVKK bağlantısı); gövde teşhis-müdahale
  konumlandırmasının on bölümü — beş basamaklı merdiven (yazılım 3. basamakta durur, 4-5 biz),
  zincirin sekiz halkası, temsilî aylık müdahale listesi, dört adımlı döngü (örnek sayılarla),
  WhatsApp onay kuyruğu, ilk bulgu, veri/KVKK, kimin için, kapanış. `v1`–`v3` arşiv rotaları
  (`/hub-v1` … `/hub-v3`) duruyor; deneme yüzeyleri.
  **Görüş:** Brief'teki lead formu yerine `mailto` CTA'sı kondu — arka uç zaten yazılmayacaktı,
  çalışmayan form devre dışı butondan daha kötü sinyal. Onay kuyruğu bölümü AI-02'nin satış
  vaadi: sayfa "sistem okur, siz onaylarsınız" diyor, ürün karşılığı henüz yok (bkz. AI katmanı).
  `nginx.conf` CSP hash'i commit'te güncellendi (`03c211f`) — atlanırsa canlı hub kırılırdı.
  `03c211f` `e5e512d`
- **Teşvik dosyası + süre takibi ✅** (2026-08-17) — `incentive_files` tablosu (migration
  `0055`, RLS + FORCE RLS + policy + GRANT), `GET/POST/PATCH/DELETE /v1/incentives`, panel
  `/finance/incentives` ve ayar `/settings/incentives`. Dosyada: ödeme tarihi, son başvuru
  tarihi, kalan gün, durum, belge kontrol listesi. Liste en acil üstte; süresi yaklaşan
  uyarı, geçmiş tehlike rengiyle.
  **Görüş — mevzuat sınırı bilinçli çizildi:** Süre **koda gömülmedi**, `tenant_settings`
  ayarı (varsayılan 180 gün) ve ayar ekranında açıkça yazıyor: *"Varsayılan değer yalnızca
  başlangıçtır; mevzuat iddiası değildir."* Oran / üst limit / uygunluk hesabı **hiç
  yapılmıyor** — sözleşme Madde 3.7 (kayıt tutarız, danışmanlık vermeyiz) kodda da geçerli.
  `deadline_at` sunucuda hesaplanır; şemalar `.strict()` olduğu için istemci göndermeye
  kalksa istek reddedilir. Ayar sonradan değişse mevcut dosyaların tarihi değişmez.
  **Denetimde bulunan üç kusur:** (1) `due_within_days` testi "yakın" dosyayı bugünün
  tarihiyle açıyordu — 180 gün varsayılanla son tarih bugün+180 olduğu için filtreye
  takılmaması doğruydu; kod haklıydı, test yanlıştı, düzeltildi. (2) `runConfirmedDelete`
  çağrısı `Promise.resolve` sarmalayıcısı olmadan yapılmış, tip hatası veriyordu — mevcut
  `TransactionFormDialog` desenine hizalandı. (3) **MSW mock'u hiç yazılmamıştı**: demo
  modunda sayfa sonsuza kadar "Yükleniyor…" kalıyordu. Store alanları, demo verisi ve beş
  handler eklendi; tarayıcıda doğrulandı.
- **Temassız kişiler listesi ✅** (2026-08-17) — `GET /v1/reports/untouched-contacts`
  (`days` eşiği + `contact_type` filtresi) ve panel `/reports/untouched`. "Dokunuş" =
  randevu · işlem (`contact_id` **veya** `case_contact_id`) · vaka notu; taban kişinin
  `created_at`'i. Liste en eskisi üstte; her satırda son hareketin **kaynağı** rozetle
  yazılı ki "neden bu tarih" sorulmasın. 30/60/90 kovaları eşikten bağımsız, tam küme
  üzerinden sayılıyor — "38 temassız, 12'si 60 günü geçti" cümlesi liste kırpılsa da doğru.
  **Görüş:** İki bilinçli karar. (1) **Gelecek tarihli randevu dokunuş sayılır** ve kişiyi
  listeden düşürür — önümüzdeki hafta randevusu olan hasta ihmal edilmiş değil, aktif
  takiptedir. (2) İzin `contact:read`, `finance:read` değil: bu bir kişi listesi, finans
  raporu değil; temsilcinin görmesi gerekir, finans görmesi gerekmez.
  Testte her dokunuş kaynağı ayrı fixture ile sınandı (gelecek randevu, soft-delete
  aktivite, vaka tarafı işlem, tür filtresi, tenant izolasyonu) — 6/6 yeşil.
  **Yakalanan kusur:** panelde eşiği 60'a çekince "30 günü geçen" kutusu da düşüyordu;
  sunucu doğruydu, MSW mock'u kovaları eşikten sonra sayıyordu. Tarayıcıda gözle
  bakılmasaydı demo yanlış rakam gösterecekti.
- **AI-06 Bilgi bankası sürüm geçmişi ✅** (2026-08-17) — `knowledge_revisions` (migration
  `0057`, RLS + FORCE RLS + policy). Her kaydetmede **aynı transaction içinde** bir sürüm
  bırakılıyor; `GET /v1/settings/knowledge/revisions` son 20 sürümü en yeni önce döndürüyor,
  panelde bilgi bankası sayfasının altında tarih + değiştiren kişi listeleniyor.
  **Görüş:** Tabloya `GRANT` yalnız `SELECT, INSERT` — `UPDATE`/`DELETE` bilinçli verilmedi.
  Bu bir **kanıt kaydı**: "AI neden 2.400 dedi?" sorusunun üç ay sonraki cevabı. Değiştirilebilir
  olsaydı kanıt değeri kalmazdı. Panelde **geri yükleme yok** — yanlışlıkla eski fiyata dönmek
  pahalı olur; geçmiş okunur, uygulanmaz. Sürüm yazımı ayar yazımıyla aynı transaction'da:
  ayar değiştiyse sürümü de mutlaka vardır.
- **Maya AI gerçek oldu ✅** (2026-08-17) — Maya artık mock değil: `POST /v1/maya/ask`,
  cevap **yalnız tenant'ın bilgi bankasından** üretiliyor. Sistem prompt'u sunucuda
  (`buildMayaSystemPrompt`), bilgi bankası `frameKnowledgeContext` ile **veri olarak**
  ekleniyor. Bilgi bankası boşsa LLM'e hiç gidilmiyor — boş bağlamla model uydurmaya yatkın,
  ayrıca boşuna maliyet olur; panel "önce bilgi bankanızı doldurun" diyor.
  `LLM_API_KEY` yoksa `HeuristicLlmClient` bilgi bankasında kelime eşlemesi yapıyor;
  eşleşme yoksa yine "bilmiyorum". Panelden "Mock" rozeti ve sahte cevap üreten
  `matchReply` kaldırıldı.
  **Görüş — tek değişmez kural: Maya uydurmaz.** Model "BILINMIYOR" dediğinde cevap boş
  bırakılıyor; **cümlenin içinde** geçse bile grounded sayılmıyor (model "BILINMIYOR ama
  tahminen 3.000 EUR" derse tahmin kullanıcıya gösterilmez). Sağlık turizminde uydurulmuş
  fiyat, cevapsızlıktan pahalıdır — müşteriye yanlış taahhüt olur. LLM hatasında heuristic'e
  düşülmüyor, "bilmiyorum" deniyor: sessizce farklı bir cevap üretmek güveni bozar.
  **İzin kararı:** `settings:read`. POST olmasına rağmen salt-okunur — soru gövdede taşınıyor
  (uzun olabilir, hassas metin içerebilir; query string erişim loglarına düşer). Yazma izni
  istenseydi **temsilci rolü Maya'ya soru soramazdı**, oysa asıl kullanıcısı o.
  `INTENTIONAL_PERMISSION_LOCKS`'a gerekçesiyle eklendi; "settings write → update" kuralı da
  kilit listesine saygı duyacak şekilde düzeltildi.
  **Sonraki adım kullanıcıda:** bilgi bankası boş olduğu sürece Maya hiçbir soruyu
  cevaplayamaz (Bekleyen · bilgi bankasını doldur).
  **CI'da yakalanan kusur:** `MayaModule` yalnız `LlmModule` + `SettingsModule` alıyordu;
  controller'ın guard üçlüsü `AuthModule` + `CommonModule` sağlayıcılarına bağlı olduğu için
  Nest **başlatılırken çöküyordu**. Nest bu hatada `process.abort()` çağırdığı için vitest
  yalnız "Worker exited unexpectedly" gösteriyor, asıl sebebi yutuyor — modülü AppModule'den
  çıkarıp bisect ederek bulundu. Tek AppModule başlatan spec `queue-readiness.smoke.spec.ts`;
  yeni modül eklerken ilk oraya bakılmalı. Desen diğer modüllerle aynı hâle getirildi.
- **Teşvik belge listesi düzenlenebilir ✅** (2026-08-17) — belgeler sabit listeydi; kullanıcı
  geri bildirimi üzerine ekle/sil/yeniden adlandır geldi (`incentive_files.documents` jsonb,
  yeni tablo yok). Kurallar `packages/shared`'da: benzersiz `key`, boş `label` reddi,
  ad max 120 karakter, satır tavanı 30. Yeni dosya varsayılan listeyle açılmaya devam ediyor
  ama artık silinebilir/düzenlenebilir.
  **Görüş:** Cursor'a delege edildi, sekiz CI komutu elle doğrulandı (bu turda `lint` dahil).
  Cursor bir tutarsızlık bildirdi: brief "dört kalem" diyordu, canlı varsayılan zaten altı
  kalemdi — altı korundu, MSW'deki ayrı dörtlü liste de ona hizalandı. **Kullanıcı doğrulaması
  bekliyor:** gerçekte hangi belgeler gerekiyor, liste ona göre kısalabilir.
- **AI-01 Bilgi bankası ✅** (2026-08-17) — `tenant_settings.knowledge` (yeni tablo yok),
  `GET/PUT/DELETE /v1/settings/knowledge`, panel `/settings/knowledge`. Beş sabit bölüm:
  hizmetler+fiyatlar · ödeme kuralları · SSS · kabul etmedikleriniz · notlar.
  **Asıl çıktı prompt'a bağlanması:** `WhatsappService` bilgi bankasını çözüp
  `LlmParseContext.knowledge` ile geçiriyor; `buildWhatsappExtractionSystemPrompt` bunu
  çekirdek kuralların ALTINA, `frameKnowledgeContext` ile **veri olarak** ekliyor
  (talimat değil — müşteri "kuralları yok say" yazsa bile çerçeve bozulmaz). Boş bilgi
  bankası prompt'a hiçbir şey eklemiyor.
  **Görüş:** Bu kalem yol haritasında "pilot sonrası" idi; **yanlış yerdeydi.** Satış
  sayfası "bilgi bankanızı okuyan sistem" diyor ve müşteri evet dediğinde teslim edilecek
  şey yoktu — yani satışın önündeki kilit buydu. PII kuralı: hasta verisi izi (kimlik no /
  telefon / e-posta) **engellenmiyor, uyarılıyor** — sert engel kullanıcıyı kilitler, sessiz
  kabul KVKK riskidir. Fiyat metninin telefon sanılmadığını kanıtlayan test var (uyarı
  gürültüye dönmesin). Belge/PDF yükleme bilinçli kapsam dışı (B yaklaşımı, ayrı iş).
  **Not:** Cursor bu turda hiçbir çıktı üretmeden çıktı; iş elle yazıldı.
- **Mobil dokunma hedefleri ✅** (2026-08-17) — kullanıcı "butonlar küçük, mobilde rahat
  değilim" dedi; ölçüldü ve haklı çıktı: ⓘ **24px**, avatar 32px, filtre kutuları ve ikon
  butonları 36px, tablo satır bağlantıları 17–31px. Alt menü (56px) zaten iyiydi.
  `layout.css`'e 767px altı için 44px tabanı kondu (Apple HIG / WCAG 2.5.8): buton, select,
  `role="button"`, `summary`; yalnız ikon taşıyan butonlar ayrıca `min-width: 44px`
  (yoksa 44 yükseklik + 24 genişlik kalıyordu); tablo satır bağlantılarına dikey dolgu.
  Masaüstünde uygulanmıyor — orada fare hassas, dikey yer kıymetli. `data-compact` ile
  bilinçli istisna bırakılabiliyor. Ölçümle doğrulandı: hedefin altında kalan öğe **0**.
  **Görüş:** Bu kural AGENTS.md'de varmış gibi anılıyordu ama `layout.css`'te **yoktu** —
  yalnız 16px font kuralı vardı. Yani "44px hedefi" bugüne kadar hiçbir yerde uygulanmıyordu.
- **Ekran içi yardım (ⓘ) ✅** (2026-08-17) — `PageHeader`'a opsiyonel `helpTopic` eklendi;
  başlığın yanındaki ⓘ düğmesi `HelpSheet`'i açıyor. **Mobilde tam ekran, üstten** (telefonda
  okunacağı için kutuya sıkıştırılmadı); masaüstünde ortalanmış pencere. Escape + dış tıklama
  kapatıyor, odak tuzağı mevcut `focusTrap` action'ından geliyor.
  İçerik kaydı `lib/help-content.ts`'te (hangi ekran hangi anahtarları kullanıyor), metin
  `messages.ts`'te tr + en. Yapı üç parçalı: **ne işe yarar → tek somut örnek → (varsa) yanlış
  okuma uyarısı**. İlk dört ekran bağlandı: temassız kişiler, teşvik dosyaları, hakediş, kohort.
  **Görüş:** Amaç pilot destek yükünü düşürmek — destek süresi PILOT-02 KPI'ı ve haftalık 7
  saatlik kapasiteyi aşarsa pilot uzuyor. Her ekranda "bu ne işe yarar" sorusunun cevabı
  ekranın kendisinde durursa o soruların çoğu hiç sorulmaz. Kayıt ile metnin ayrışmasını
  (panelde boş/anahtar görünmesi) yakalayan test eklendi: her konunun her anahtarı iki dilde
  dolu olmak zorunda.
- **Kohort görünümü ✅** (2026-08-17) — `GET /v1/reports/cohorts` + panel `/reports/cohorts`.
  Kişi `created_at` ayına yazılır; tahsilat (tarih sınırı yok) o aya sayılır; harcama =
  aynı ayın `ad_metrics_daily`. Olgunlaşma `m0/m1/m2/m3+`. `note_key:
  cohort_attribution_assumption` + panel notu: kampanya atıfı değildir. Varsayılan dönem
  son 12 ay (`PeriodSelector` özel). Soft-delete / missing FX / ROAS null / tenant izolasyonu
  test edildi.
  **Görüş:** Mevcut marketing `cohortBySource` kaynak bazlıdır — bu iş tarih bazlı; karıştırma.
  Denetimde hesap doğrulandı (ROAS = tahsilat ÷ harcama, olgunlaşma yüzdeleri %100'e tamamlanıyor,
  harcama 0 iken ROAS `null` — sonsuza bölme yok); mobilde tablo kendi içinde kayıyor.
  **Yorumlama tuzağı ✅ kapatıldı (aynı gün):** Reklam verisi **olmayan** ay ile harcaması
  **sıfır olan** ay panelde aynı görünüyordu (ikisi de `₺0,00`). Ads entegrasyonu 2026-08-13'te
  bağlandığı için ondan önceki her kohort "0 harcama + dolu tahsilat" gösteriyordu; okuyan
  "o ay bedavaya hasta geldi" sanabilirdi. `spend_base` artık **nullable**: o ay hiç
  `ad_metrics_daily` satırı yoksa `null` döner ve panelde `—` gösterilir (tooltip: "harcama
  sıfır demek değil, bilinmiyor demek"). Satırı olup toplamı sıfır olan ay `0` kalır — veri
  var, harcama gerçekten sıfır. İki durumu ayıran iki ayrı test eklendi.
- **Güvenlik başlıkları canlıda denetlendi + eksikler kapandı ✅** (2026-08-17) — canlı
  `curl -I` denetimi: hub'da CSP + nosniff vardı, **HSTS hiç yoktu**; panel
  (`app.verimaya.com`) hiçbir güvenlik başlığı almıyordu. Sebep: `nginx.conf`'ta başlıklar
  yalnız `location = /hub.html` içindeydi ve **nginx'te `add_header` miras alınmaz** — kendi
  `add_header`'ı olan her location üsttekileri düşürür. Belge döndüren üç location'a
  (`/hub.html`, `= /`, `/`) `Strict-Transport-Security` (1 yıl + includeSubDomains),
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` tek tek eklendi.
  **Görüş:** Gerçek nginx container'ında build çıktısıyla doğrulandı — panel kabuğu, derin
  panel rotası ve hub için başlıklar dönüyor. Panel CSP'si bilinçli ertelendi (Bekleyen'e
  yazıldı): S3/R2 ve API host'ları ortama bağlı, körlemesine blocking politika paneli kırar.
  `X-Frame-Options` eklenmedi — hub'da CSP `frame-ancestors 'none'` zaten kapsıyor.
- **`db:generate` engellendi + migration kuralı yazıldı ✅** (2026-08-17) — komut çöküyordu;
  kök sebep `drizzle/meta/` içinde 55 migration'a karşılık **tek snapshot** (`0000`) olması.
  Snapshot'ı canlı şemadan üretip denedim: araç, RLS'i modellemediği için **32 izolasyon
  politikasını DROP, 32 tabloda RLS'i DISABLE, 30 check kısıtını DROP** eden bir migration
  üretti. Yani "düzeltilmiş" hâli çok kiracılı izolasyonu sessizce silecekti.
  **Görüş:** Doğru çözüm aracı çalıştırmak değil, **kullanılamaz hâle getirmek**. `db:generate`
  artık açıklayıcı bir hata verip çıkıyor (`scripts/db-generate-guard.js`); elle migration
  yazma adımları hem orada hem `AGENTS.md` kod konvansiyonlarında yazılı. Üretilen taslak
  migration ve sahte snapshot geri alındı, çalışma ağacı temiz.
- **WEBHOOK-01 sağlama scripti ✅** (2026-08-17) — shim kapatmanın önündeki engel, her
  tenant'a elle SQL ile kimlik yazmaktı (secret üret → sha256 → AES-GCM şifrele → insert).
  `pnpm --filter @verimaya/api webhook:identity status|issue` ile iki komuta indi.
  `status` hangi tenant'ta kimlik eksik olduğunu listeler ve eksik varsa **çıkış kodu 2**
  döner — shim kapatılmadan önceki kapı kontrolü budur.
  **Görüş:** Yazılan şifreli değerin gerçekten çözülüp secret'a döndüğü ve `key_hash`'in
  eşleştiği yerel round-trip testiyle doğrulandı; bozuk ciphertext webhook'ları sessizce
  401'e düşürürdü. Secret yalnız bir kez ekrana basılır, DB'de düz metin tutulmaz.
  Mevcut kimlik varken `--rotate` olmadan yazmayı reddediyor. Env'i `false` yapmak hâlâ
  kullanıcı işi (prod erişimi yok).
- **Marka yazımı "Verimaya" + destek e-postası ✅** (2026-08-16) — karar netleşti: **"Verimaya"**
  tek kelime (2026-08-07'deki "Veri Maya" iki kelimelik yazımını günceller). Tüm canlı yüzeyler
  taransın: `HubHomeV1-V4.svelte` (JSON-LD, OG meta, footer telifi), `features.ts` (GHL özellik
  açıklaması), `auth.ts` (şifre sıfırlama e-postası konusu), `karne-summary.email.ts` +
  `resend.client.ts` (karne özet e-postası konu/gövde/gönderen adı) + ilgili test, `README.md`,
  `DEPLOY-COOLIFY.md` örnek env değeri. `HubHomeV1-V4.svelte`'teki `info@verimaya.com` yer
  tutucusu `AppShell.svelte`'teki gerçek adrese hizalandı: **`destek@verimaya.com`**.
  **Görüş:** `docs/Arşiv/` altındaki geçmiş kayıtlar ve `CHANGELOG.md`/`changelog.ts`'deki 0.7.0
  sürüm notu **bilinçli dokunulmadı** — o tarihte gerçekten "Veri Maya" duyurulmuştu, tarihi
  kaydı değiştirmek yanıltıcı olur. **Kalan (kod dışı, kullanıcı yürütür):** prod Coolify'daki
  `KARNE_SUMMARY_FROM` env değeri elle "Veri Maya <karne@verimaya.com>" olarak ayarlanmışsa
  kodun fallback'i güncellendi ama prod env'i override ediyor — orayı da güncellemek gerekir.
- **Ekip: üye ekleme/silme/şifre belirleme ✅** (2026-08-16) — Ayarlar → Ekip'teki "Üye davet et"
  butonu bilerek devre dışıydı (`inviteDisabled`). PILOT-02 başlamadan Gülçin ve Sude'ye hesap
  açmak gerektiği için tenant owner/admin artık panelden gerçek üye ekleyip (`POST /v1/members`
  — e-posta + isim + rol + şifre, hemen giriş yapılabilir, davet e-postası yok), üye silip
  (`DELETE /v1/members/:id`, kendini/son owner'ı silemez) ve mevcut üyeye doğrudan şifre
  belirleyebiliyor (`PATCH /v1/members/:id` genişletildi, kendi şifresini bu yoldan değiştiremez).
  Var olan "Şifre sıfırla" (e-posta linki) dokunulmadı, ikisi birlikte duruyor.
  **Görüş:** İş Cursor'a delege edildi, commit'i okuyup testleri bağımsız tekrar çalıştırarak
  denetlendi (640 API + 72 web testi yeşil, svelte-check 0 hata). Platform-admin uçlarına
  (`apps/platform/*`) bilinçli dokunulmadı — ayrı, tenant-scoped yeni uç yazıldı. Permission
  matrix'te `members` kaynağına `create`/`delete` eklendi, yalnız owner/admin; `OWNER_LOCKED_PERMISSIONS`
  genişletildi ki tenant kendini üye yönetiminden kilitleyemesin. Kullanılmayan eski
  `memberRoleUpdateSchema` denetim sırasında temizlendi. `f2196da` `ea96faa`
- **G-25 / GAP-25 kapsamlı veri silme ✅** (2026-08-14) — `POST /v1/settings/data-delete/preview|execute`;
  kapsam seçimi (transactions/appointments/contacts/files, varsayılan hiçbiri); önizleme
  `plan_token` (CryptoService, 10 dk TTL, jti tek kullanımlık); org adı birebir onay; yalnız
  `owner` (G-11 override ile genişlemez); audit_logs silinmez ve wipe kaydı yazılır; tek
  transaction. Panel: `/settings/data-delete` (Tehlikeli bölge).
  **Görüş:** Tracker wipe audit’i de siliyordu — Verimaya bilerek iz bırakır. Kişiler seçince
  randevu/dosya/case_notes önizlemede cascade olarak görünür. Kırmızı: owner/ad/token/audit/
  rollback kapanınca spec düştü; yeşil restore 8/8.
- **G-11 tenant izin matrisi ✅** (2026-08-14) — `tenant_permission_overrides` (RLS) +
  `GET/PATCH /v1/settings/permissions`; etkin izin = kod varsayılanı ∩ deny override
  (`hasOrgPermission` + `OrgPermissionGuard`); owner members/settings kilitli; genişletme yok.
  Panel: `/settings/access` (görüntüle/düzenle, sapma vurgusu, varsayılana dön).
  **Görüş:** Override yalnız kısıtlar — genişletme ayrı ürün kararı (pilot talebi yokken
  self-lock/escalation yüzeyini büyütmemek). Kırmızı: deny set yok sayılınca finance:read
  403 spec’i düştü; guard yolu panel gizlemesinden bağımsız.
- **G-09 / G-10 + GAP-08 içe/dışa aktarım ✅** (2026-08-14) — `/settings/import-export`:
  kişi + bundle (Cases/Appointments/Transactions) şablon→export→dry-run→commit;
  `plan_token` (CryptoService) dry-run çıktısını bağlar; silme yok.
  **Görüş:** Sütunlar bugünkü şema (minor unit tutar, case/responsible contact, FX snapshot).
  Limit 5 MB / 2000 satır/sayfa; idempotency `external_ids.source=xlsx_import`. Kırmızı-yeşil:
  formül sanitizasyonu kapatılınca export spec düştü; `12.50` tutar reddedildi.
- **G-26 AI prompt özelleştirme ✅** (2026-08-14) — `GET/PUT/DELETE /v1/settings/ai-prompt`;
  tenant notu çekirdek prompt’a eklenir (yerine geçmez), max 2000, reset her zaman mümkün;
  LLM invalid JSON → heuristic fallback.
  **Görüş:** Tracker tam prompt replace idi; Verimaya bilinçli “ek not + çerçeve” — destek
  yükünü ve şema kaçışını sınırlar. Isolation + DELETE reset kırmızı-yeşil: reset sonrası
  `is_default` false bırakılınca spec düştü.
- **G-05r `contact_involves` ✅** (2026-08-14) — randevu listesi `contact_involves` ile
  `contact_id` / `clinic_contact_id` / `hotel_contact_id` / `transfer_contact_id` OR;
  panel Combobox + kişi profilinden derin link.
  **Görüş:** `contact_id` hasta-only kaldı; klinik/otel/transfer araması için ayrı param.
  Isolation’da dört rol + tenant B sızıntısı yok. Kırmızı: yalnız hasta FK bırakınca klinik
  eşleşmesi `[]` döndü.
- **ETL işlem eşlemesi şema güncellemesi ✅** (2026-08-14) — `case_id`→`case_contact_id`,
  `responsible_contact_id` taşınıyor, boş/`İşlem` başlık → null, `--fx-backfill` (varsayılan)
  eksik `amount_base` için ECB/`fx_rates`; verify tip sayımları + fixture dry-run.
  **Görüş:** Eski ETL `case` ile `contact_id`'yi birleştiriyordu — hasta maliyeti yanlış kişiye
  yazılırdı. Tracker `counterparty_*` ECB'yi ezer; kur yoksa null + “kur bulunamadı”, uydurma yok.
- **Bakiyeler İşlemler’e gömüldü ✅** (2026-08-14) — ortak `BalancesPanel`; İşlemler’de açılır
  bölüm (mobil kapalı / masaüstü açık, localStorage); `/finance/balances` derin link canlı;
  kapalıyken lazy query, açılınca `qs.keys.reports.balances()` cache paylaşımı.
  **Görüş:** Bakiye `GET /v1/reports/balances` filtre almaz — tüm işlemler aggregate’i.
  İşlem filtrelerinin yanına koyunca “bu aralığın bakiyesi” sanılır; blokta bağımsız not zorunlu.
  İleride bakiyeyi `from`/`to`/türe bağlamak ayrı ürün kararı + API sözleşmesi ister.
- **G-04 Taslak canlı audit ✅** (2026-08-14) — `evaluateTransactionConsistency` shared saf
  motor; `GET /v1/reports/consistency` + `POST /v1/transactions/audit-draft` aynı kurallar;
  form debounce ile uyarı gösterir, kaydı engellemez.
  **Görüş:** SQL FILTER yerine satır+join + ortak fonksiyon — iki kural seti riski kalktı.
  Yeni: `contact_equals_responsible` / `responsible_not_internal`; kategori→hasta zorunluluğu
  bilinçli yok. Kırmızı: `income_contact_missing` kuralı silinince unit + GAP-05 isolation kırıldı.
- **G-29 Eksik iletişim uyarısı ✅** (2026-08-14) — randevu list/detay `contact_info_incomplete`
  (telefon ve e-posta ikisi de boş); sunucu join ile türetir; rozet engelleyici değil.
  **Görüş:** Tracker “biri boşsa” idi; Verimaya kararı her iki alan boş. Isolation’da
  complete / incomplete / phone-only + tenant B sızıntısı yok. Kırmızı: helper ters çevrilince
  G-29 spec düştü.
- **Bakiye açık tutar filtresi ✅** (2026-08-14) — bakiye listesi yalnız `open ≠ 0`
  kişileri gösteriyor; alacak/borç yön filtresi ve yöne özel boş durumları eklendi.
  **Görüş:** `collected ≠ 0` koşulu, tamamen kapanmış bakiyeyi yeniden listeye sokuyordu;
  tahsilat geçmişi ile bugün açık olan tutar aynı kavram değil. Gerçek DB testi bunu koruyor.
- **İşlem formu Tracker paritesi A/B/C ✅** (2026-08-14) — başlık opsiyonel + türetilmiş
  liste etiketi; karşı taraftan bağımsız `case_contact_id` (hasta); Personel tipi,
  `responsible_contact_id` ve sorumlu bazlı gider raporu eklendi.
  **Görüş:** hasta maliyeti `financeSummary` içinde `amount_base` boş satırları
  `if (base == null) continue` ile sessizce atıyordu; elle kur yüzünden çoğu satır eksikti.
  Bu nedenle otomatik kur, `case_contact_id` ile doğru hasta maliyetinin ön koşuluydu.
- **Otomatik işlem kuru + FX önbelleği ✅** (2026-08-14) — form ECB/Frankfurter kurunu
  çekip snapshot alanlarını dolduruyor; sağlayıcı hatası kaydı engellemiyor. Tatil anahtarı
  istenen güne bağlandı, gerçek kur günü ayrıca korunuyor.
  **Görüş:** ilk cache testi DB’yi mock’layıp servisin `where` koşulunu yok saydığı için hata
  geri konduğunda bile yeşildi. Sorgu davranışı gerçek Postgres `*.isolation.spec.ts` ile
  sınanmalı; `requested_date` cache anahtarı, `rate_date` gerçek ECB günüdür.
- **Web cache politikası ✅** (2026-08-14) — SPA/hub kabukları ile service worker her
  kullanımda doğrulanıyor; içerik hash’li SvelteKit asset’leri bir yıl immutable.
  **Görüş:** `nginx.conf` SPA kabuğuna hiç `Cache-Control` vermiyordu; tarayıcı heuristic
  cache ile deploy’u günlerce sakladı. Cloudflare Browser Cache TTL 4 saatlik taban gibi
  davranıyor (`hub-interact.js`: origin 60 sn, canlı 14400); `/sw.js` 4 saat, HTML CF’de cache’siz.
- **Finans kategori yönetimi Tracker paritesi ✅** (2026-08-14) — gelir/gider listelerine
  yukarı/aşağı sıralama, ayrı kategori detay rotası ve satır bazlı alt kategori düzenleme
  geldi; virgülle ayrılan textarea kaldırıldı.
  **Görüş:** API’de CRUD ve `sort_order` bulunması panel paritesi demek değildi; kullanıcı
  alt kategorileri tek metin alanında düzenliyordu. Tracker’ın satır modeli hatayı yerelleştiriyor.
- **Mobil finans UX ✅** (2026-08-14) — işlem formu yatay taşma, iOS zoom, tarih sığdırma,
  kişi combobox, ödeme yöntemi select, liste 44px arama + `from`/`to` filtresi.
  **Görüş:** kategori CRUD vardı ama yönetim paritesi yoktu (ayrı kalem olarak kapandı);
  kur o gün hâlâ elleydi, aynı gün otomatiğe çevrildi. Tarih alanını sığdırmak için
  eklenen `-webkit-appearance:none` tarih değerinin dikey ortalamasını da düşürmüştü —
  shadow part'lara `height:100%` + flex ile kutu yüksekliğinden bağımsız düzeltildi. Rapor:
  `docs/2026-08-14-mobil-ux-duzeltmeleri.md`.
- **Migration 0048–0052 prod ✅** (2026-08-14) — FX oranları/istenen tarih,
  opsiyonel işlem başlığı, hasta bağlantısı ve sorumlu/Personel değişiklikleri uygulandı.
  **Görüş:** Coolify’da `RUN_MIGRATIONS=true`; entrypoint `set -e` ile önce migrate ediyor,
  hata olursa API başlamıyor. Prod sürümü artık `0052`, ayrı elle migrate adımı yok.
- **DOMAIN-02 E4 ✅** (2026-08-13) — GHL ↔ panel ad/soyad doğrulaması. **DOMAIN-02 kapandı.**
  **Görüş:** kalemin "çift yönlü" ifadesi yanlıştı — `ghl.field-ownership.ts` (mimari ilke 5)
  adın sahibini **GHL** olarak tanımlıyor, panel geri yazmaz. Doğrulama tek yönlü yapıldı:
  GHL'de değiştir → panelde ad/soyad ayrı ayrı doğru geliyor (canlı, kullanıcı). Ters yön
  koddan garanti: GHL istemcisinde yazma metodu yok (`getContact`/`listContacts` sadece) +
  geri yazmadığını iddia eden test.
  **Yol boyunca çıkan üç kusur kapatıldı:** (1) `GHL_CLIENT_ID` prod'da boştu → panel
  `client_id=` ile bozuk yetkilendirme linki üretiyordu; env dokümana eklendi. (2) GHL
  Marketplace redirect URI'de kendi markasını reddediyor (`ghl` kelimesi) → callback
  `/v1/integrations/crm/callback`'e taşındı. (3) GHL'in ayrı `firstName`/`lastName` alanları
  yerine birleşik alan okunuyor ve ilk boşluktan yeniden bölünüyordu → `Ancuta Monica` /
  `Naste-0` yanlış bölünüp yazımı bozuluyordu; artık ayrı alanlar olduğu gibi alınıyor.
  Ayrıca elle senkron tetikleyici eklendi (6 saatlik zamanlayıcıyı beklemeden test için).
  `aba9e33` `654bbab` `dec663c` `7026e45`
- **Firma adı senkronu ✅** (2026-08-12) — ad değiştirildi ama panelde eski ad görünmeye devam etti.
  **Görüş:** silinen-organizasyon hatasının aynı kök sebebi — ad iki tabloda. Rename yalnız
  `tenants.name`'i yazıyordu, `/v1/me/organizations` ise better-auth `organization.name`'den
  okuyordu. Artık rename her iki tabloyu aynı transaction'da güncelliyor ve liste domain
  tablosundan okuyor; regresyon testi iki tablonun ayrışmadığını iddia ediyor. `AppShell`'deki
  hardcoded `'Demo Klinik'` yedeği de kaldırıldı (yükleme iskeleti). Slug bilinçli sabit,
  dokunulmadı. `fe34c2e` `b4ce21e`
  **⚠️ Ajan denetimi:** aynı turda Cursor istenmediği hâlde destek metnini değiştirip
  `destek@verimaya.app` diye **var olmayan bir adres uydurdu** ve panele tıklanabilir `mailto:`
  koydu. Denetimde yakalanıp geri alındı; sonra gerçek adres (`destek@verimaya.com`) tek
  sabitten okunacak şekilde eklendi. Ajan çıktısındaki kullanıcıya görünen sabit değerler
  (adres, telefon, URL) doğrulanmadan kabul edilmemeli. `271ff52` `a2fb39e`
- **Migration 0046/0047 prod ✅** (2026-08-12) — soyad index + bölünmemiş isimlerin onarımı.
  **Görüş:** `RUN_MIGRATIONS=true` olduğu için deploy anında kendiliğinden uygulandı (ayrı
  migrate adımı yok — veri değiştiren migration'larda deploy öncesi yedek şart). Doğrulama:
  index var, bölünmemiş kalan 34 satırın tamamı `Otel`/`Transfer`/`Klinik` — yani 0047'nin
  bilinçli hariç tuttuğu kurum tipleri; kişi kaydı kalmadı.
  **Bilinen sınır:** heuristik ilk boşluktan bölüyor, çift isimler (`Ayşe Nur Yılmaz` →
  `Ayşe` / `Nur Yılmaz`) yanlış ayrışıyor. `display_name` dokunulmadığı için tam isim
  kaybolmuyor; düzeltme elle. 0035 ile aynı heuristik.
- **Keyset sayfalama testi ✅** (2026-08-12) — load-more hatasının sınıfı kalıcı kapatıldı.
  **Görüş:** mevcut `contact-list-cursor.spec.ts` yalnız cursor kodlamasını test ediyordu;
  sayfa 2'nin sayfa 1'in devamı olduğunu kanıtlayan test yoktu. 15 kişilik fixture (aynı
  soyad, aynı ad+soyad, NULL soyad, TR harfler, `|` içeren isim), limit=2 ve 5 ile tam
  gezinti; tekrar/atlama yok, son sayfada cursor yok. `aeb3083`
- **Kişiler load-more + soyad sırası ✅** (2026-08-12) — telefon defteri sırası (`last_name`
  ASC) geldi; “Daha fazla yükle” ikinci sayfada 1 kişi görüp duruyordu.
  **Görüş:** sıra değişmişti, sayfa imleci hâlâ `created_at` kullanıyordu — keyset uyumsuz.
  `list()` soyad cursor'ına bağlandı; MSW aynı sözleşmeye çekildi. `fbc8d74` `8c02d3b`
- **CI/deploy kapısı (2. tur) ✅** (2026-08-12) — Coolify restart/redeploy panelde değişiklik
  göstermiyordu.
  **Görüş:** web VPS'te build edilmez; GHCR `:main` yalnız CI yeşil olunca push edilir.
  Prettier → `$effect` içinde `periodKey;` (eslint) → API test (yanlış cursor) → svelte-check
  (`Diğer` preset'ten düşmüş) sırayla kırmızı kaldı; her kırmızı Deploy web'i skip etti.
  Format/`void`/Kaynak select düzeltildi, zincir döndü. Restart ≠ yeni imaj.
  `34626f3` `a0c9964` `cdf7350`
- **Sorumlu alanı 500 ✅** (2026-08-12) — kişi kaydında Sorumlu seçince 500.
  **Görüş:** form `member.id` gönderiyordu, kolon `user.id` bekliyordu. Panel `user_id`
  yolluyor; API her iki id'yi de çözüyor. `7bdced2` `f9b748e` `6313897`
- **Kişiler seçim modu ✅** (2026-08-12) — toplu tür atama checkbox'ları varsayılan gizli.
  **Görüş:** “Toplu işlem” ile açılıyor; kalıcı sütun ara sıra kullanılan işi sürekli
  gürültü yapıyordu. `a70d41b` `3e58344`
- **Sidebar footer telif + Albion ✅** (2026-08-12) — sürüm satırının altına yıl + marka.
  **Görüş:** TickPort footer; metin `messages.ts`. `a680935` `6ab9da6`
- **RATE-01 artığı (CF IP) ✅** (2026-08-12) — `TRUST_PROXY=1` Cloudflare arkasında edge IP'de
  kalıyordu (kota yine paylaşılıyordu).
  **Görüş:** hop artırmak XFF sahteciliğine açık. `TRUST_CF_CONNECTING_IP=true` iken anahtar
  `CF-Connecting-IP`. Prod'da açıldı (2026-08-12) — `TRUST_PROXY=1` de duruyor, `req.ip`/log
  onu kullanmaya devam ediyor. `d14215a`
- **PILOT-01 prod deploy ✅** (2026-08-12) — migration `0044` + `0045` prod'da uygulandı.
  **Görüş:** Coolify API Terminal → `db:migrate`; `0044` kolon düşürdü, `0045` tablo açtı,
  ikisi de psql ile doğrulandı. Not: prod Postgres rolü `postgres`/`verimaya` —
  `DEPLOY-COOLIFY.md`'deki `verimaya` owner rolü kurulumda yok.
- **RATE-01 ✅** (2026-08-12) — prod oturum kesintisi: panelde gezerken atılma + tekrar giriş yapamama.
  **Görüş:** sıkı 10/dk auth limiti `get-session`'ı da sayıyordu; SPA her rota değişiminde onu
  çağırdığı için ~10 gezinme kotayı doldurup 429 → boş oturum → `/login` üretiyordu. Ayrıca
  `trustProxy` yoktu, kota tüm kullanıcılar için tek kovaydı. Limit yalnız kimlik uçlarına
  daraltıldı + `TRUST_PROXY` env'i eklendi. Kusur Faz 8'den beri koddaydı, deploy'dan gelmedi. `34ef59a`
- **Panel düzeltmeleri ✅** (2026-08-12) — smoke turunda bulunan 6 kusur, altı ayrı commit.
  **Görüş:** silinen org listede/login'de görünüyordu (kök sebep: silme `tenants.deleted_at`
  yazıyor, liste better-auth `organization` tablosundan geliyordu) · profil rozeti hardcoded
  `demo@verimaya.app` gösteriyordu · ekip listesinde ad/e-posta boştu · şifre değiştirme yüzeyi
  yoktu. Org değiştirici eklendi (logout ile geçiş yerine). `da3f5ee` `bd74eec` `6cd8526`
  `52234f8` `95cbfe2` `1ebf560`
- **CI/deploy zinciri ✅** (2026-08-12) — web image build'i atlanıyordu.
  **Görüş:** Prettier formatı CI `Lint and format (web)` adımını kırıyordu; `deploy-web.yml`
  gate'i red CI'da build'i atladığı için panelde hiçbir değişiklik görünmüyordu. Format
  düzeltildi, zincir baştan sona döndü. `ca2c65c`
- **SEC-03 artığı ✅** (2026-08-11) — `@fastify/static` GHSA-83w8-p2f5-377r kapandı.
  **Görüş:** override yerine upstream bump yetti (Nest platform-fastify 11.1.29 +
  bull-board 8.6.0 static ^10 istiyor); `fastify` 5.11'e hizalandı. `pnpm audit
  --audit-level high` temiz. `998e163`
- **DOMAIN-02 artığı ✅** (2026-08-11) — "Hastalar bölüm etiketi" ayarı tamamen kaldırıldı.
  **Görüş:** alan mükerrerdi — `contact_types` tenant-CRUD zaten rename sağlıyor — ve
  ayarlar formu dışında hiçbir yerde tüketilmiyordu. Sözleşme + API + UI + OpenAPI temiz,
  kolon migration `0044` ile düştü. `c38e79e`
- **AUDIT-F09-07b ✅** (2026-08-11) — contact KVKK m.11 API yüzeyi.
  **Görüş:** `GET/POST /v1/contacts/:id/data-export|data-deletion-request`, yetki
  `contact:delete` (tam PII dump sıradan `read` değil), ledger tablosu migration `0045`
  (RLS + negatif izolasyon spec'i). Anonimizasyon ad/soyad/tel/e-posta/`notes` maskeler;
  mali kayıt + `contact_id` korunur, hard-delete yok. Panel UI ve hukuk metni bilinçli
  kapsam dışı → kalan kapsam Faz 9 "LEG-02 artığı". `7838e4b`, `f73a905`

---

## Kaynaklar (liste değil — bakılacak yer)

| Soru | Dosya |
|------|--------|
| Önceki dönem kapananları | `docs/Arşiv/2026-08-09-YAPILACAKLAR.md`, `docs/Arşiv/2026-08-03-YAPILACAKLAR.md` |
| Kişiler birleşmesi adımları | `docs/Arşiv/2026-08-10-KISILER-BIRLESME-PLANI.md` |
| DOMAIN-02 deploy | `docs/Arşiv/2026-08-10-DOMAIN-02-DEPLOY-RUNBOOK.md` |
| Prod tıklama | `docs/Arşiv/2026-08-09-PROD-SMOKE-REHBERI.md` |
| Migration A kanıtı | `docs/Arşiv/2026-08-08-PROD-KONTROL-LISTESI.md` |
| Tracker gap | `docs/tracker-verimaya-ozellik-gap.md` |
| Denetim | `AUDIT-REPORT.md` |
| Ads go-live | `docs/ADS-META-GOLIVE.md`, `docs/ADS-GOOGLE-GOLIVE.md` |
| Deploy | `docs/DEPLOY-COOLIFY.md` |
| Mimari / tasarım | `docs/MIMARI.md`, `docs/TASARIM.md`, `AGENTS.md` |
| Eski sistem | `docs/legacy-reference/` |
| Obsidian | `SecondBrain-Remote/03-Areas/VeriMaya/` |
