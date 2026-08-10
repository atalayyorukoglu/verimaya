# DOMAIN-02 — Hastalar + Kişiler tek modülde birleşme planı (2026-08-10)

> **Durum:** §0 kararları kapandı (2026-08-10, Atalay). Faz A uygulamaya açık.
> Bu dosya `docs/2026-08-09-YAPILACAKLAR.md`'nin yerine geçmez — birleşme işi oraya
> tek kalem olarak (`DOMAIN-02`) girer, adım ayrıntısı burada durur.

---

## Neden

Bugün iki tablo var ve biri diğerine yarı bağlı: `patients.contact_id` FK'si zaten
mevcut (`0004_core_domain.sql`). Yani mimari "iki ayrı varlık" değil, "aynı varlığın
iki kaydı" — en pahalı hâli.

Somut maliyetler:

| Yer | Bugün | Birleşme sonrası |
| --- | --- | --- |
| `appointments` | 4 FK: `patient_id` + `clinic_contact_id` + `hotel_contact_id` + `transfer_contact_id` → 2 tablo | 4 FK, tek tablo |
| `transactions` | hem `patient_id` hem `contact_id`; "bağlanmamış işlemi bağla" hangi tabloya bakacağına karar veriyor | tek `contact_id` |
| Referans takibi | referans veren doktor `contacts`'ta, hasta `patients`'ta → FK kurulamıyor, serbest metin | `referred_by_contact_id` self-FK, ters sorgu ile "kim kaç hasta getirdi" |
| Panel | iki liste, iki form dialog, iki mükerrer-kayıt ekranı | tek liste + tür filtresi |

`patients.status` `0029` ile bilinçli olarak CRM hunisinden operasyon durumuna
çevrildi (`scheduled/arrived/treated/follow_up/cancelled`); satış hunisi GHL'de.
**Bu karar korunur** — birleşme onu geri getirmez.

---

## Hedef model

Tek tablo: **`contacts`** (panel adı "Kişiler"). Kişi kaydı **daima bir insandır**;
klinik/otel/acente bir *nitelik*tir, ayrı kayıt türü değil.

```
contacts
  id, tenant_id
  first_name        text NOT NULL      -- yeni (GHL + web formu ayrı gönderiyor)
  last_name         text               -- yeni, nullable
  display_name      text NOT NULL      -- türetilir: trim(first_name || ' ' || last_name)
  phone, email, notes                  -- mevcut
  contact_type_id / contact_type_name  -- mevcut (Hasta / Klinik / Otel / Transfer / Personel …)
  organization_id   uuid NULL          -- yeni: tür firma taşıyorsa hangi firma (§0-A)
  status            text NULL          -- patients.status taşınır; yalnız Hasta türünde anlamlı
  assigned_user_id  uuid NULL          -- patients'tan taşınır
  source            text NULL          -- Kaynak      (Dijital Reklam / Referans / Organik …)
  medium            text NULL          -- Alt kaynak  (Meta Ads / Google Ads / WhatsApp …)
  campaign          text NULL          -- Kampanya    (Implant_Yaz_Kampanyasi_2026)
  referred_by_contact_id uuid NULL     -- self-FK, ON DELETE SET NULL
  is_internal, usage_count, deleted_at, created_at, updated_at   -- mevcut
```

Detay sayfası kartları (bugün `patients/[id]`'de olanlar aynen taşınır):
Finans özeti (bakiye · işlemlerde aç · bağlanmamış işlemleri bağla) · Randevular
(takvim · yeni randevu) · Dosyalar · Vaka notları.

**Rol/çoklu tür eklenmiyor.** Tek `contact_type_id` yeterli: "hem eski hasta hem
referans kaynağı" durumu `referred_by_contact_id` ters FK'siyle zaten çıkıyor.

---

## §0 — Kararlar (2026-08-10, Atalay · KAPANDI)

- [x] **A. Firma alt seçimi → `organizations` sözlük tablosu.**
  Yeni tablo (`id, tenant_id, name, deleted_at`, `UNIQUE(tenant_id, name)`) +
  `contacts.organization_id` FK. `contact_types` / `appointment_types` ile aynı desen
  (`0034`'teki sözlük kuralı geçerli); RLS + `tenant_id NOT NULL` zorunlu.
  Serbest metin `organization_name` reddedildi: raporda gruplama kirlenir ve sonradan
  sözlüğe geçiş ikinci bir migration ister.
  **§0-A tamamlandı (2026-08-10):** `GET/POST/PATCH/DELETE /v1/settings/organizations`
  (soft-delete `deleted_at`; 409 `duplicate_type_name`; izin = contact-types ile
  `settings:read|update`). Panel: `/settings/organizations` + ContactFormDialog canlı
  seçim + satır içi "yeni firma" (GAP-F09-16 deseni).
  **Düzeltme (2026-08-10):** Soft-delete ile `0035`'teki koşulsuz
  `UNIQUE(tenant_id, name)` çakışıyordu — silinen ad yeniden yaratılamıyordu
  (liste görünmez + 409 çıkmazı). `0037_organizations_partial_unique`: kısmi unique
  `WHERE deleted_at IS NULL`; soft-deleted satır UNIQUE'i işgal etmez, aynı ad yeni
  satır olarak açılır. Servis create/rename ön kontrolleri zaten yalnız aktif satırlara
  bakıyordu (isNull deleted_at); SQL + app birlikte doğru. contact_types hard-delete
  olduğu için bu regress organizations'a özgüydü.
  **Görüş (hotfix):** lokal + `0000→0037` prova yeşil; api check OK · test **452**
  (+1: soft-deleted name can be reused). Prod'a dokunulmadı.
- [x] **B. `/v1/patients` tek seferde kesilir — alias yok.**
  `/v1/contacts` kanonik; `/v1/patients*` doğrudan silinir. Gerekçe: repoda
  `/v1/patients` çağıran kayıtlı bir n8n akışı yok (n8n dokümanlarda yalnız yetenek
  olarak geçiyor), dış tüketici tek kullanıcı kontrolünde. Deprecated alias modülünün
  6 ay bakım yükü bu ölçekte karşılığını vermiyor.
  **Sonuç:** Faz F'deki "alias kaldırma" kalemi düşer; kesim Faz C'de tek seferde olur.
  **Ön koşul TEYİTLİ (2026-08-10, Atalay):** n8n kurulu değil, `/v1/patients` tüketicisi yok.
  Risk tablosundaki n8n satırı kapandı.
- [x] **C. Rapor `source`'a göre gruplar; `medium` ikinci seviye kırılım.**
  `PATIENT_SOURCE_PRESETS` (Meta / Google / WhatsApp / Tavsiye / Organik) geçmişi
  B2'deki eşleme ile yeni `source` sözlüğüne taşınır, böylece E2 birebir sayı
  karşılaştırması yapılabilir. Birleşik tek etiket ("Dijital Reklam · Meta Ads")
  reddedildi: kategori sayısı çoğalır, E2 doğrulaması zorlaşır.

---

## Faz A — Sözleşme (`packages/shared`)

> AGENTS.md ilke 7: şema önce burada değişir.

- [x] **A1.** `contact.ts`: `contactSchema`'ya `first_name`, `last_name`,
      `organization_id`, `status`, `assigned_user_id`, `source`, `medium`,
      `campaign`, `referred_by_contact_id` alanları. `display_name` **read-only**
      (server türetir, create/update body'sinde kabul edilmez).
- [x] **A2.** `patient.ts` → içeriği `contact.ts`'e taşınır; dosya `contactStatusSchema`
      + `CONTACT_SOURCE_PRESETS` / `CONTACT_MEDIUM_PRESETS` re-export'u olarak kalır
      (deprecated yorumuyla), sonra Faz F'de silinir.
- [x] **A3.** Kaynak sözlükleri: `CONTACT_SOURCE_PRESETS` = `['Dijital Reklam',
      'Referans', 'Organik', 'WhatsApp', 'Diğer']`; `CONTACT_MEDIUM_PRESETS` =
      `['Meta Ads', 'Google Ads', 'Instagram', 'TikTok', 'Web Formu', 'Telefon']`.
      Kampanya serbest metin (max 128).
- [x] **A4.** `api.ts`: `apiPaths`'e `contactFinanceSummary`, `contactFiles*`,
      `contactCaseNotes`, `contactAutoLinkTransactions` eklenir; `patient*` yolları
      **silinir** (§0-B). `apiContract` girdileri güncellenir.
- [x] **A5.** `appointment.ts` / `transaction.ts` / `file.ts` / `case-note.ts` /
      `duplicate.ts` / `reports.ts`: `patient_id` → `contact_id`,
      `patient_display_name` → `contact_display_name`.
- **Kabul:** `pnpm --filter @verimaya/shared test` yeşil; `pnpm --filter @verimaya/api
  openapi:generate` çalıştırıldı ve drift spec'i geçiyor.
  **Görüş (2026-08-10):** Shared A1–A5 uygulandı; `patient.ts` ince re-export.
  Transaction'ta mevcut `contact_id` korunup `patient_id` eritildi (tek FK).
  Patient duplicate şemaları/fonksiyonlar kaldırıldı (contacts kanonik).
  A5 kalıntı temizliği: `inbound-message` taslağı + `list-query` filtreleri +
  `AI_CORRECTION_COMPARE_FIELDS` → `contact_id` / `contact_display_name`
  (`transactionListQuery`'deki çift `patient_id`+`contact_id` tek `contact_id`'ye indi).
  OpenAPI regenerate: **67** ops. `patient_id`/`patient_display_name` OpenAPI'de yok;
  kalan `patient*` path/enum/kod (`/whatsapp/create-patient`, `contact.created`,
  `/reports/contact-distribution`, `income_contact_missing`, audit `entity_type`)
  + `contacts_section_label` bilinçli — Faz C/F. apps/api+web kırıları beklenen — Faz C/D.

---

## Faz B — Migration (0035 → 0037)

> Tek migration'a sıkıştırma. Üç adım ayrı dosya: **genişlet → taşı → daralt**.
> Böylece her adım tek başına geri alınabilir ve prod'da API deploy'uyla arası açılabilir.

- [x] **B1 · `0035_contacts_person_fields.sql` (genişlet, kırıcı değil)**
  `contacts`'a: `first_name`, `last_name`, `organization_id`, `status`,
  `assigned_user_id`, `source`, `medium`, `campaign`, `referred_by_contact_id`
  (hepsi NULL kabul eder). `organizations` tablosu + RLS + koşulsuz
  `UNIQUE(tenant_id, name)` (`0035`; soft-delete ile çakışmayı `0037` kısmi unique ile düzeltir).
  Mevcut satırlar için `first_name` = `display_name`'in ilk kelimesi,
  `last_name` = kalanı (tek kelimelik isimlerde `last_name` NULL).
  Index: `contacts_tenant_referred_by_idx`, `contacts_tenant_status_updated_at_idx`.
  RLS: yeni tabloya `tenant_id` + FORCE ROW LEVEL SECURITY (AGENTS ilke 1).
  **Görüş (2026-08-10):** `0035` lokal migrate temiz; organizations RLS = appointment_types
  (0028) deseni. Schema: `organizations.ts` + contacts alanları (C1 DDL kısmı).
  `organization_id` ON DELETE SET NULL. Probe: Mehmet Ali Kaya → Mehmet / Ali Kaya.
  B2/B3 yok; patients.ts duruyor.

### §0-D — Korunacak veri yok (2026-08-10, Atalay · B2/B3 sadeleşmesi)

> **Karar:** n8n kurulu değil ve **korunması gereken gerçek veri yok** — mevcut
> satırlar demo/ETL prova verisi; silinmesi kabul edilir.
>
> **Sonuç — orijinal üç adımlı "genişlet → taşı → daralt" tasarımı düşer.** O tasarımın
> tamamı (eşleme tablosu, idempotent taşıma, satır sayısı kanıtı, B3'ün ayrı deploy'a
> alınması, prod DB yedeği ön koşulu) yalnızca canlı veriyi korumak içindi. Veri
> korunmuyorsa bu maliyet karşılıksız: **B2 + B3 tek migration'a (`0036`) iner** ve
> Faz C ile aynı deploy'a girer.
>
> **Yine de yapılır:** `0035` (B1) olduğu gibi kalır — zaten uygulandı ve `organizations`
> + yeni sütunlar veriden bağımsız gerekli.
>
> **Bu karar geri alınırsa** (pilot verisi korunacaksa) orijinal B2/B3 metni
> `git log docs/2026-08-10-KISILER-BIRLESME-PLANI.md` ile geri alınabilir.

- [x] **B2+B3 · `0036_drop_patients.sql` (tek adım — taşıma yok, kesim)**
  1. `appointments`, `files`, `case_notes`: `contact_id` sütunu eklenir (FK → `contacts`),
     `patient_id` sütunu + FK'si DROP. `transactions`'ta `contact_id` **zaten var**;
     yalnız `patient_id` + `patient_display_name` DROP (`contact_display_name` mevcut).
  2. `patients` tablosu DROP CASCADE.
  3. `external_ids`: `entity_type='patient'` satırları DELETE (karşılığı olan contact yok).
  4. `ai_corrections.field`: `'patient_id'` → `'contact_id'`,
     `'patient_display_name'` → `'contact_display_name'` (C7 notu — bu satırlar
     AI öğrenme raporunu besliyor, silmek yerine yeniden adlandırılır).
  5. `audit_logs.entity_type`: `'patient'` → `'contact'` (denetim izi korunur).
  **Veri taşıma, eşleme tablosu ve satır sayısı kanıtı YOK** — §0-D.
  **Görüş:** `ai_corrections`'ta `field` sütunu yoktu → `original_parsed`/`corrected` JSON
  anahtarları rename edildi. Lokal `0000→0036` OK; `DROP patients CASCADE` NOTICE üretmedi
  (FK/sütunlar önceden düşürüldü). Diğer NOTICE'lar eski IF NOT EXISTS skip'leri
  (`demo_notes`, `files_status_chk`, `organizations_tenant_isolation`).

- [x] **B1-hotfix · `0037_organizations_partial_unique.sql`**
  Soft-delete + `0035` koşulsuz UNIQUE çıkmazını kapatır: DROP unconditional index →
  `UNIQUE (tenant_id, name) WHERE deleted_at IS NULL`. Soft-deleted ad yeniden
  yaratılabilir (yeni satır; eski soft-deleted FK geçmişi için yerinde kalır).
  Servis create/rename duplicate ön kontrolü yalnız `deleted_at IS NULL`.
  **Görüş:** Lokal migrate + `0000→0037` sıfırdan prova; isolation test
  `soft-deleted name can be reused`.

- **Kabul:** `pnpm db:migrate` sıfırdan temiz DB üzerinde `0000` → `0037` hatasız çalışır;
  her tablo için tenant izolasyon spec'i yeşil; `patients` tablosu ve `patient_id`
  sütunları veritabanında kalmamış; soft-deleted organization adı yeniden kullanılabilir.

---

## Faz C — API (`apps/api`)

- [x] **C1.** `src/db/schema/contacts.ts` yeni alanlar + `organizations.ts` + `index.ts`
      export — B1 ile birlikte yapıldı. Kalan: `patients.ts` **bu fazda silinir**
      (§0-D: `0036` aynı deploy'da tabloyu düşürüyor, bekleme yok).
- [x] **C2.** `patients.service.ts` (930 satır) → `contacts.service.ts`'e taşınır.
      Taşınacak yetenekler: finance-summary, auto-link-transactions, files
      (presign/confirm/content/download/preview + MIME kontrolü), case-notes,
      duplicate-groups + merge. `contacts.service.ts` (308 satır) mevcut yetenekleri
      (bulk-type) korunur.
  **Görüş:** auto-link `contact_id IS NULL` + `contact_label` eşleşmesi; merge tam
  reassignment (appt/files/notes/txns/referred_by). `patients/` + `schema/patients.ts` silindi.
- [x] **C3.** `contacts.controller.ts`: `patients.controller.ts`'in (509 satır) tüm
      rotaları `/v1/contacts/:id/...` altına. `/v1/patients` **kesilir**, alias yok (§0-B).
  **Görüş:** PatientsModule kaldırıldı; OpenAPI 67 op (`openapi:generate` + drift yeşil).
- [x] **C4.** `appointments.service.ts`, `transactions.service.ts`,
      `common/mappers.ts`, `storage/*`: `patientId` → `contactId` yol şeması.
      §0-D ile **geriye uyumluluk katmanı gerekmez** — korunacak dosya yok, eski key'ler
      okunabilir kalmak zorunda değil, ayrı key göçü kalemi de düştü.
  **Görüş:** storage key doğrudan `contactId`; transactions tek `contact_id` +
  `contact_display_name`.
- [x] **C5.** `reports.service.ts` + `karne`: `patients` join'leri `contacts`'a;
      `contact_type_name = 'Hasta'` filtresi eklenir (aksi hâlde tedarikçi kayıtları
      hasta sayısına girer — **en olası regresyon burası**). §0-C kırılımı uygulanır.
  **Görüş:** Hasta filtresi: `fetchPatientsForPeriod`, `sumTahsilatBySource` join,
  `patientCohortBySource`. `by_medium` shared şemada. Karne DB patient join yoktu.
- [x] **C6.** `integrations/ghl/*`: `PATIENT_ENTITY = 'patient'` → `'contact'`;
      GHL `firstName`/`lastName` artık birebir eşleşiyor (bugün `fullName`'e birleştiriliyor
      — bu düzeltme birleşmenin bedava kazancı). `ghl.reconcile.service.ts` aynı.
  **Görüş:** Hasta tipi yoksa otomatik seed; result alanı `patientId` adı Faz F'ye kaldı.
- [x] **C7.** `whatsapp/*` (`heuristic-parse.ts`, `ai-corrections.service.ts`,
      `whatsapp.service.ts`): taslak eşleme hedefi `contacts`. AGENTS ilke 6 korunur
      (AI çıkarımı onaysız yazılmaz).
      **Not:** `ai_corrections.field` geçmiş değerleri için 0036'da veri güncellemesi
      gerekli (`patient_id`/`patient_display_name` → `contact_id`/`contact_display_name`).
      Sözleşme tarafı A5 kalıntı temizliğinde yeni adlara çevrildi; satır migrasyonu burada.
  **Görüş:** create-patient → Hasta contact create; draft alanları `contact_*`.
- **Kabul:** her `/v1/contacts*` endpoint'i için negatif izolasyon testi ("Tenant A,
  Tenant B'yi göremez"); `patients.*.spec.ts` dosyaları `contacts.*.spec.ts` olarak
  taşınmış ve yeşil; OpenAPI drift yok.
  **Görüş (2026-08-10):** `pnpm --filter @verimaya/api check` temiz; test **93/93 · 446**;
  E2' `reports.hasta-filter.isolation.spec.ts` yeşil. ETL cases→Hasta contacts.

---

## Faz D — Panel (`apps/web`)

- [x] **D1.** Rota birleşmesi: `routes/patients/` → silinir; `routes/contacts/`
      kanonik. `contacts/[id]` sayfası `patients/[id]`'nin kartlarını devralır
      (Finans özeti, Randevular, Dosyalar, Vaka notları).
      `patients/duplicates` + `contacts/duplicates` → tek `contacts/duplicates`.
      `/patients` → `/contacts` **client-side redirect** (kayıtlı sekme/derin link kırılmasın).
- [x] **D2.** `navigation.ts`: iki menü kalemi (`nav.patients` + `nav.contacts`) →
      tek `nav.contacts` ("Kişiler"). Mobil menüdeki `nav.patients` de kalkar.
- [x] **D3.** `ContactFormDialog.svelte`: `PatientFormDialog.svelte` ile birleşir.
      Yeni alanlar: **Ad** / **Soyad** ayrı input, Tür, (tür firma taşıyorsa) Firma
      alt seçimi, Telefon, E-posta, Kaynak → Alt kaynak → Kampanya kademeli select,
      `source = 'Referans'` seçilince **Referans Eden** kişi arama alanı (aynı tabloda ara).
      `PatientFormDialog.svelte` silinir.
- [x] **D4.** Liste ekranı: varsayılan filtre **tür = Hasta**; üstte tür sekmeleri /
      filtre çipleri. Sütunlar: Ad Soyad · Tür · Telefon · Kaynak · Durum · Atanan.
- [x] **D5.** `ContactFilesPanel.svelte` → `ContactFilesPanel.svelte`,
      `ContactCaseNotesThread.svelte` → `ContactCaseNotesThread.svelte`;
      `AppointmentFormDialog`, `TransactionFormDialog`, `TransactionDraftCard`,
      `DuplicateScanPanel`, `CommandPalette`, `PanelHome`, `AppointmentOpsList`
      içindeki `patient*` alanları `contact*`'a.
- [x] **D6.** `query-keys.ts`, `rbac.ts`, `status-tone.ts`, `patient-source-select.ts`
      (→ `contact-source-select.ts`), `mocks/handlers.ts` + `mocks/data.ts`.
- [x] **D7.** `i18n/messages.ts`: yeni anahtarlar `tr` + `en` (AGENTS: `en` eksikse
      derleme hatası). `nav.patients` kalkar. **Dokunulan ekranların gömülü Türkçe
      metinleri de kataloğa taşınır** (AGENTS "dokunulan kod" kuralı).
- **Kabul:** `contract-parity.spec.ts` yeşil; `pnpm --filter @verimaya/web test` yeşil;
  `/patients` derin linki `/contacts`'a düşüyor.
  **Görüş (2026-08-10):** Panel D1–D7. Thin SPA redirect (`patients/*` → `contacts/*`,
  `replaceState`). Liste varsayılan Hasta + tür çipleri. Form: ad/soyad; medium yalnız
  Dijital Reklam; Referans → kişi typeahead. Organizations list API yok → Firma select
  preserve-only. check 0 · test 42 · lint temiz. E3/E4/F dokunulmadı.

---

## Faz E — Doğrulama

- ~~**E1.** Pilot tenant DB kopyası üzerinde satır sayısı karşılaştırması~~ — §0-D ile düştü
      (korunacak veri yok; taşınan satır yok, karşılaştırılacak sayı yok).
- ~~**E2.** Birleşme öncesi/sonrası rapor sayılarının birebir eşleşmesi~~ — §0-D ile düştü
      (veri sıfırlandığı için "önce" tarafı yok).
      **Ama C5'in riski kalkmadı, sadece kanıtı değişti:** `contact_type_name = 'Hasta'`
      filtresi unutulursa tedarikçi/otel/klinik kayıtları hasta sayısına girer ve bu
      **sessiz** bir hatadır. Yerine geçen kanıt → **E2'.**
- [x] **E2'.** Rapor birim testi (sayı karşılaştırması yerine kurgu veri):
      tek tenant'a bilinçli karışık kişi kümesi yazılır (ör. 3 Hasta + 2 Klinik + 1 Otel),
      rapor "hasta sayısı = 3" döndürmeli. Aynı test `source`/`medium` kırılımını da
      doğrular (§0-C). Bu test kalıcıdır — E1/E2'nin tek seferlik provasından daha iyi.
  **Görüş:** `apps/api/src/reports/reports.hasta-filter.isolation.spec.ts` — total=3,
  source/medium kırılımı; drizzle tx + SET LOCAL.
- [x] **E3.** `docs/2026-08-09-PROD-SMOKE-REHBERI.md`'ye Kişiler bölümü eklenir;
      insan tıklama turu.
  **Görüş (2026-08-10):** Prod deploy (PR #2 → `main` `cc86b2c`) sonrası canlı tur:
  menü/rota, liste, form, detay, firmalar, rapor hasta sayısı, WhatsApp AI — **OK**.
  Detay checklist: runbook § canlı kontrol + smoke rehberi § DOMAIN-02.
- [ ] **E4.** GHL çift yönlü senkron testi: GHL'de kişi güncelle → panelde ad/soyad
      ayrı geldi mi; panelde oluştur → GHL'e gitti mi.
  **Not (2026-08-10):** E3 turunda bilerek atlandı; DOMAIN-02 kapanışı için son açık madde.

---

## Faz F — Temizlik

- [x] `packages/shared/src/patient.ts` + `patient-source.test.ts` silinir
      (`contact-source.test.ts` presets testini üstlendi).
- ~~`apps/api/src/patients/` + `db/schema/patients.ts` silinir~~ — §0-D ile **Faz C'ye taşındı**
  (bekleme gerektiren tek sebep B3'ün ayrı deploy'u idi, o düştü).
- [x] **Faz A'dan ertelenen `patient*` adlandırma yüzeyleri** (alan rename'i değil, ad/enum/kod):
      - `POST /v1/whatsapp/create-patient` **silindi** — yalnız `create-contact` kaldı
        (ikisi de `contacts`'a yazıyordu; AI akışı zaten create-contact kullanıyordu;
        §0-B alias yok).
      - `GET /v1/reports/patient-distribution` → `/v1/reports/contact-distribution`
      - outbox/webhook `patient.created` → `contact.created` (§0-B gerekçesi)
      - audit `entity_type` enum'dan `patient` düştü; geçmiş satırlar 0036'da
        güncellenmişti — 0038 CHECK + idempotent UPDATE ile doğrulandı
      - hata kodu `income_patient_missing` → `income_contact_missing`
      - `tenants.patients_section_label` → `contacts_section_label` (**0038**);
        kullanıcıya görünen değer metni değişmez (tenant'ın yazdığı etiket)
      - Yan etki (isim tutarlılığı): `patientFile*`/`patientCaseNote*` → `contact*`,
        RBAC kaynağı `patient` → `contact`, GHL ownership entity `contact`
      OpenAPI `openapi:generate` + drift yeşil.
- ~~`/v1/patients` alias'ı kaldırılır~~ — §0-B ile düştü; kesim Faz C3'te tek seferde.
- [x] `AGENTS.md` "Modüller" satırı + `docs/MIMARI.md` güncellenir.
- [x] Obsidian `01-kararlar.md`'ye karar metni işlenir; `CHANGELOG.md` / `changelog.ts` 0.8.0.
  **Görüş (2026-08-10):** Faz F tamam. create-patient kesildi; 0038 rename+CHECK.
  shared 92 · api check + **449** test · web check 0 · 42 test · lint temiz; openapi 68 ops.
  Kalan `patient` eşleşmeleri: uygulanmış migration dosyaları (0000–0036) + LLM
  `patient_ref` + featureId `patients-list` + i18n `patients.*` anahtarları (ürün dili
  Hasta) + test lokal değişken/açıklama metinleri + `/patients` SPA redirect.

---

## Riskler

| Risk | Etki | Önlem |
| --- | --- | --- |
| Raporlarda tedarikçi kayıtlarının hasta sayısına karışması | Sessiz yanlış veri — **kalan en yüksek risk** | C5 + **E2'** kurgu veri birim testi (§0-D sayı karşılaştırmasını kaldırdı) |
| `display_name` ayrıştırması ("Mehmet Ali Kaya" → ad/soyad) | Orta (firma satırlarında Ad/Soyad formu saçma görünür) | B1: yalnız kişi türlerinde böl; firma türlerinde (`Klinik` / `Otel` / `Transfer`, seed: `DEFAULT_CONTACT_TYPE_NAMES`) `first_name` = tüm `display_name`, `last_name` NULL — bölme yok. Tanınmayan/özel tür adında kişi varsayılır (güvenli taraf). Panelde elle düzeltme; Kişiler listesinde "soyadı eksik" filtresi (opsiyonel) |
| ~~Dosya depolama yolunda `patientId` → eski dosyalar kaybolur~~ | **Düştü (§0-D)** | Korunacak dosya yok; C4'te yol şeması serbestçe `contactId`'ye geçer, geriye uyum katmanı gerekmez |
| ~~B3 erken çalışırsa geri dönüş yok~~ | **Düştü (§0-D)** | Veri taşıma yok; `0036` Faz C ile aynı deploy'a girer |
| ~~`/v1/patients` tüketicisi (n8n) kırılır~~ | **Düştü** | §0-B teyitli: n8n kurulu değil, tüketici yok |
| Prod migration sırası (`0033`+`0034` henüz prod'da değil) | Orta | `0035` öncesi `0034` prod'da doğrulanmış olmalı |
| `0036` DROP CASCADE'in beklenmeyen nesne düşürmesi | Orta | Migration önce lokalde sıfırdan (`0000`→`0036`) koşar; `DROP ... CASCADE` çıktısındaki NOTICE'lar okunur |

---

## Sıralama özeti

```
§0 kararlar ✅ → A (shared) ✅ → B1 ✅ → C (api) + 0036 → D (web) → E (doğrulama) → F (temizlik)
```

`B2` bilinçli olarak koddan **sonra**: yeni sütunlar (B1) hazır olduğu için API ve panel
eski/yeni ikisini de okuyabilir; veri taşıma canlıya en son ve tek seferde gider.
