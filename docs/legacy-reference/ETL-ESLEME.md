# ETL eşleme — Fixrav Tracker → Verimaya

Kaynak: yerel salt-okunur Tracker Postgres (`127.0.0.1:5432/tracker`, 2026-07-30).
Şema dump: [`schema.sql`](./schema.sql). Dry-run fixture: `apps/api/fixtures/etl-sample.json`.
İş planı: `apps/api/scripts/etl-stub.md` Faz 1–2.

> **Kimlik notu:** Canlı Tracker PK’ları **UUID**. Dry-run fixture tarihsel olarak `integer` id kullanır;
> apply aşamasında (Adım 27+) `external_id = legacy UUID string`, `source = legacy_tracker`.

---

## 1. Keşif — satır sayıları (yerel snapshot)

| Tablo (Tracker) | n_live_tup (2026-07-30) | Not |
| --- | ---: | --- |
| `tenants` | 2 | Hedef: tek Verimaya tenant (kendi firmamız) |
| `users` / `memberships` | 1 / 2 | ETL dışı (better-auth yeniden kurulur) |
| `contact_types` | 0 | Seed kodu var; canlı satır yok |
| `contacts` | 0 | |
| `cases` | 0 | → `patients` |
| `appointment_types` / `appointment_statuses` | 0 / 0 | Defaults kodda |
| `appointments` | 0 | |
| `finance_categories` / `finance_subcategories` | 11 / 52 | **Canlı seed dolu** |
| `transactions` | 0 | |
| `case_files` | 0 | → `files` (meta) |
| `inbound_messages` | 4 | Cutover dışı (`etl-stub` erteleme) |
| `whatsapp_corrections` | 0 | Cutover dışı |
| `audit_logs` | 6 | Cutover dışı |
| checklist tabloları | 0 | Cutover dışı |

Prod cutover öncesi bu sayılar **prod kopyası** üzerinde yeniden alınır; bugünkü yerel DB domain verisi boş — eşleme şema + seed + fixture üzerinden doğrulanır.

---

## 2. Sözlük — sabit listeler

### 2.1 Contact türleri

| Tracker (`DEFAULT_CONTACT_TYPE_NAMES`) | Verimaya (`DEFAULT_CONTACT_TYPE_NAMES`) | Karar |
| --- | --- | --- |
| Otel | Otel | birebir (isim) |
| Transfer | Transfer | birebir |
| Klinik | Klinik | birebir |
| Hasta | Hasta | birebir |
| Diğer | Diğer | birebir |

Sıra farklı; ETL isim eşlemesi yapar (`lower(trim(name))`). Bilinmeyen tür → **Diğer** + audit notu.

### 2.2 Randevu türleri

| Tracker default | Verimaya default | Karar (Adım 26) |
| --- | --- | --- |
| Yeni Hasta | Konsültasyon | **Korunur:** `appointment_type = "Yeni Hasta"` (serbest metin; FK yok) |
| Devam Hastası | Kontrol | **Korunur:** `"Devam Hastası"` |
| RPT | Tedavi | **Korunur:** `"RPT"` |
| _(yok)_ | Transfer | Verimaya-only; ETL üretmez |

Apply: Tracker adını çevirme. Pilot tenant settings listesine Tracker tiplerini **ek seed** olarak yaz (Verimaya `DEFAULT_*` ile birleşik). UI varsayılanları ayrı kalır.

### 2.3 Randevu durumları

| Tracker (`DEFAULT_APPOINTMENT_STATUSES`) | Verimaya enum | Karar |
| --- | --- | --- |
| Randevu Ayarlanıyor | `scheduled` | eşle |
| Planlandı | `confirmed` | eşle |
| Tamamlandı | `completed` | eşle |
| İptal | `cancelled` | eşle |
| Gelmedi | `no_show` | eşle |
| _(yok)_ | `in_progress` | Verimaya-only; ETL üretmez |

Bilinmeyen durum → `scheduled` + `notes`/`payload` uyarısı.

### 2.4 Finans kategorileri

Tracker canlı seed (11 üst + 52 alt) Verimaya `DEFAULT_FINANCE_CATEGORY_SEEDS` ile **örtüşmüyor**.

**Karar (Adım 26): yaklaşım A** — Pilot tenant’a Tracker `finance_categories` + `finance_subcategories` taşınır; işlemlerdeki `category` / `subtitle` string’leri olduğu gibi kalır. Verimaya DEFAULT seed’i bu tenant’ta üzerine yazılmaz (tarihsel sözlük öncelikli).

### 2.5 Hasta status / işlem status

| Alan | Tracker | Verimaya | Karar |
| --- | --- | --- | --- |
| `patients.status` | `cases` tablosunda yok (`extra` JSON opsiyonel) | enum `scheduled`…`cancelled`, default `scheduled` | `extra.status` bilinen operasyon değeriyse map; değilse **`scheduled`**. CRM hunisi (`lead`/`contacted`/…) GHL’de kalır — ETL’de semantik sadakat aranmaz (pilot tek kullanımlık). |
| `transactions.kind` | `income` \| `expense` | aynı | birebir |
| `transactions.status` | `paid` \| `partial` \| `unpaid` | aynı | birebir |
| `invoice_status` | `none` \| `issued` \| `not_issued` | aynı | birebir; boş → `none` |

---

## 3. Alan eşleme tabloları

Dönüşüm kısaltmaları: `*100` = major→minor; `UTC` = timestamptz olduğu gibi; `trim` = boş string → null.

### 3.1 `contacts` → `contacts`

| Tracker | Verimaya | Dönüşüm | Boş / çakışma |
| --- | --- | --- | --- |
| `id` | `id` (yeni UUID) + `external_ids` | yeni UUID; map `legacy_tracker`/`contact` | — |
| `tenant_id` | `tenant_id` | hedef tenant sabiti | zorunlu |
| `contact_type_id` → name | `contact_type_id` + `contact_type_name` | isim sözlüğü §2.1 | bilinmeyen → Diğer |
| `first_name` + `last_name` | `display_name` | `trim(first + ' ' + last)` | ikisi de boş → `"Adsız"` |
| `phone` | `phone` | trim | null OK |
| `email` | `email` | lower/trim; geçersiz → null + not | — |
| `notes` | `notes` | — | null OK |
| `is_internal` | `is_internal` | bool | default false |
| `extra` | _(yok)_ | JSON string olarak `notes` sonuna eklenmez (KVKK); at | — |
| — | `usage_count` | **0** | — |
| `created_at` / `updated_at` | aynı | UTC | yoksa now() |

### 3.2 `cases` → `patients`

| Tracker | Verimaya | Dönüşüm | Boş / çakışma |
| --- | --- | --- | --- |
| `id` | yeni UUID + external map | `entity_type=patient` | — |
| `full_name` | `full_name` | trim | boş → skip satır + rapor |
| `phone` | `phone` | trim | null OK |
| `contact_id` | `contact_id` | contact map | yoksa null |
| `notes` | `notes` | — | null OK |
| `extra.email` / contact.email | `email` | önce extra, sonra bağlı contact | geçersiz → null |
| `extra.status` | `status` | bilinen operasyon enum; değilse `scheduled` | default **`scheduled`** |
| `extra.source` | `source` | trim max 128 | null OK |
| — | `assigned_user_id` | **null** (üyeler taşınmaz) | — |
| — | `deleted_at` | **null** | — |
| `created_at` | `created_at` / `updated_at` | UTC; updated=created | — |

### 3.3 `appointments` → `appointments`

| Tracker | Verimaya | Dönüşüm | Boş / çakışma |
| --- | --- | --- | --- |
| `id` | yeni UUID + map | — | — |
| `case_id` | `patient_id` **NOT NULL** | patient map | `case_id` yoksa `contact_id` → `cases.contact_id` (ilk eşleşme); ikisi de yoksa **skip** (rapor) |
| `contact_id` | (yalnız ara çözüm) | yukarıdaki fallback | Tracker pilotunda çoğu randevuda `case_id` boş, `contact_id` dolu |
| case.full_name | `patient_display_name` | denormalize | zorunlu |
| type.name | `appointment_type` | §2.2 | null OK |
| status.name | `status` | §2.3 | default `scheduled` |
| — | `title` | type.name veya `"Randevu"` | — |
| `starts_at` | `starts_at` | UTC **NOT NULL** | yoksa skip |
| `ends_at` | `ends_at` | UTC | null OK |
| clinic/hotel contact → name | `clinic_name` / `hotel_name` | display_name | null OK |
| `clinic_contact_id` vb. | aynı UUID map | contact map | null OK |
| `transfer_note` + clinic/hotel_note | `transfer_note` / `notes` | notları birleştir | — |
| `notes` | `notes` | — | — |

### 3.4 `transactions` → `transactions`

| Tracker | Verimaya | Dönüşüm | Boş / çakışma |
| --- | --- | --- | --- |
| `amount` (numeric major) | `amount` (int minor) | `round(amount * 100)` | zorunlu |
| `paid_amount` | `paid_amount` | `*100`; null → null | partial kuralları API’de |
| `counterparty_amount` + `equivalent_currency` | `amount_base` / `base_currency` / `fx_rate` / `fx_dated` | `equivalent_currency === tenants.base_currency` ve tutar doluysa: `amount_base=round(cp*100)`, `base_currency=tenant base`, `fx_rate=cp/amount`, `fx_dated=occurred_on`. Native `currency===base` satırlarda dört alan **null** (resolver `amount` kullanır). Eşleşme yoksa null — **canlı kur yok** | mevcut satırlar için `scripts/backfill-fx.js` |
| `currency` | `currency` | upper; destek dışı → **TRY** + not | default TRY |
| `case_id` | `patient_id` + display | map | null OK |
| `contact_id` | `contact_id` | map | null OK |
| `contact_label` | `contact_label` | — | — |
| `category` / `subtitle` | `category` / `subtitle` | olduğu gibi (§2.4) | — |
| `kind` / `status` / `invoice_status` / `occurred_on` / `title` | aynı | §2.5; tarih date | title boş → `"İşlem"` |
| `payment_method` / `description` | aynı | — | — |
| `payer_*` / `payee_*` / `responsible_*` / `service_tag` | _(yok veya ertele)_ | **cutover 1 dışı** (kisiler.md P2P) | — |

### 3.5 `case_files` → `files`

| Tracker | Verimaya | Dönüşüm | Boş / çakışma |
| --- | --- | --- | --- |
| `case_id` | `patient_id` **NOT NULL** | map | null → randevu `appointment_id` üzerinden çözülen patient; yoksa **skip** |
| `appointment_id` | `appointment_id` | map | null OK |
| `filename` | `filename` | — | zorunlu |
| `mime_type` | `mime_type` | boş → `application/octet-stream` | — |
| — | `size_bytes` | **0** (bilinmiyor) | meta-only |
| — | `storage_key` | `local://pending` | blob/Drive taşınmaz |
| — | `status` | `pending` | — |
| `drive_web_link` / `drive_file_id` | notes yok | apply raporuna yaz; DB’ye PII link koyma | — |
| `uploaded_at` | `created_at` | UTC | — |

---

## 4. Verimaya zorunlu alanlar — kaynak / varsayılan özeti

| Tablo.kolon | Kaynak veya varsayılan |
| --- | --- |
| `contacts.tenant_id` | hedef tenant |
| `contacts.contact_type_id` / `contact_type_name` | tür sözlüğü |
| `contacts.display_name` | first+last / `"Adsız"` |
| `contacts.is_internal` | Tracker / false |
| `contacts.usage_count` | 0 |
| `patients.tenant_id` | hedef tenant |
| `patients.full_name` | cases.full_name (boşsa skip) |
| `patients.status` | extra / **`scheduled`** |
| `appointments.tenant_id` | hedef tenant |
| `appointments.patient_id` | case map (yoksa skip) |
| `appointments.patient_display_name` | case.full_name |
| `appointments.status` | status map / **`scheduled`** |
| `appointments.starts_at` | Tracker (yoksa skip) |
| `transactions.tenant_id` | hedef tenant |
| `transactions.kind` / `title` / `occurred_on` / `status` / `amount` / `currency` / `invoice_status` | Tracker + dönüşümler |
| `files.tenant_id` / `patient_id` / `filename` / `mime_type` / `size_bytes` / `status` / `storage_key` | §3.5 |

---

## 5. Cutover dışı (etl-stub erteleme)

`users`, `memberships`, `audit_logs`, `inbound_messages`, `whatsapp_corrections`, checklist progress/templates, Drive blob, `contact_note_messages`.

---

## 6. Adım 26 karar özeti

1. **Randevu türü:** Tracker adı serbest metin korunur; pilot settings’e ek seed.
2. **Finans kategorisi:** Yaklaşım **A** (Tracker sözlüğü taşınır).
3. Yerel DB domain satırı 0 — prod snapshot alınmadan apply yok; keşif tekrarı prod kopyasında.

Eşleşmeyen enum kalmadı (türler/durumlar/kategoriler yukarıda kilitlendi). Sonraki: Adım 27 `external_ids`.
