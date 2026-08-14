# Tracker ↔ Verimaya — 2026-08-14 kapanış / karar listesi

> **Bu dosya analiz çıktısıdır; açık iş envanteri değildir.**
> Açık iş tek kaynağı: `docs/2026-08-11-YAPILACAKLAR.md` (kural 9).
> Kaynak gap: `docs/tracker-verimaya-ozellik-gap.md` (aynı gün yeniden doğrulandı).
> Öncelik ölçütü: pilotta Gülçin / Sude günlük işini engelliyor mu — teorik tamlık değil.

Doğrulama: Verimaya `main` kodu + Tracker
`/Users/pablofixrav/Projects/fixrav-web/_projects/fixrav-tracker`.
Kanıtsız “kapandı” yok.

---

## Özet sayılar

| Kova | Adet |
|---|---:|
| KAPANDI | 27 |
| AÇIK | 7 |
| BİLİNÇLİ YAPILMAYACAK | 11 (+ BF-01…09) |
| **Pilotu engelleyen AÇIK** | **0** |

---

## Özet tablo

| Kalem | Kova | Büyüklük | Pilot engeli |
|---|---|---|---|
| G-01 İşlem listesi filtreleri (kind/status/category/q) | KAPANDI | — | H |
| G-02 Üye rolü değiştirme | KAPANDI | — | H |
| G-30 Randevu tipi POST/DELETE | KAPANDI | — | H |
| G-03 Sunucu işlem tutarlılık denetimi | KAPANDI | — | H |
| G-04 Taslak canlı audit (`audit-draft`) | AÇIK | S | H |
| G-05 Randevu filtreleri (status + q) | KAPANDI | — | H |
| G-05r `contact_involves` (artık) | AÇIK | S | H |
| G-06 Randevu silme | KAPANDI | — | H |
| G-07 İşlem silme | KAPANDI | — | H |
| G-08 Kişi silme | KAPANDI | — | H |
| G-09 Bundle import/export | AÇIK | L | H |
| G-10 Kişi import/export | AÇIK | M | H |
| G-11 Tenant izin matrisi | AÇIK | L | H |
| G-12 Operasyon dashboard metrikleri | KAPANDI | — | H |
| G-13 Denetim kaydı filtreleri | KAPANDI | — | H |
| G-14 Sunucu veri kalitesi | KAPANDI | — | H |
| G-15 AI düzeltme agregasyonu | KAPANDI | — | H |
| G-16 WhatsApp satır içi oluşturma | KAPANDI | — | H |
| G-17 Toplu kişi tür atama | KAPANDI | — | H |
| G-18 Kişi türü yeniden adlandırma | KAPANDI | — | H |
| G-19 Kişi not thread'i | KAPANDI | — | H |
| G-20 Randevu checklist | BİLİNÇLİ | L | H |
| G-21 Randevu liste istatistikleri | KAPANDI | — | H |
| G-22 Auto-link işlemler | KAPANDI | — | H |
| G-23 Dosya silme | KAPANDI | — | H |
| G-24 Satır içi önizleme | KAPANDI | — | H |
| G-25 data/delete-scope + wipe | AÇIK | M | H |
| G-26 AI prompt özelleştirme | AÇIK | S | H |
| G-27 Toplu reorder | KAPANDI | — | H |
| G-28 Dev panel gerçek arka uç | KAPANDI | — | H |
| G-29 `contact_info_incomplete` uyarısı | AÇIK | S | H |
| G-31 Toplu case / toplu auto-link | BİLİNÇLİ | — | H |
| G-32 Tags | BİLİNÇLİ | — | H |
| TX-FORM Başlık opsiyonel + türetilmiş etiket | KAPANDI | — | H |
| TX-CASE `case_contact_id` + finans özeti OR | KAPANDI | — | H |
| TX-RESP `responsible_contact_id` + Personel + rapor | KAPANDI | — | H |
| FX-AUTO ECB/Frankfurter + `fx_rates` | KAPANDI | — | H |
| CAT-UI Kategori sıralama + detay ekranı | KAPANDI | — | H |
| BAL-OPEN Bakiyeler yalnız açık + yön filtresi | KAPANDI | — | H |
| TX-UX Ödeme yöntemi sabit liste + Combobox | KAPANDI | — | H |

---

## Pilotu engelleyenler

**Yok.** P0 üçlüsü (G-01, G-02, G-30) kodda kapalı. Kalan AÇIK kalemler ya ikinci müşteri eşiği (import), ya ürün kararı, ya konfor.

---

## AÇIK kalemler (öncelik sırası)

### 1. G-09 / G-10 — Bundle + kişi içe/dışa aktarım · L+M · engel: H

- **Ne:** Excel şablon → export → dry-run → commit; kişi 26 sütun + legacy başlık.
- **Neden:** İkinci müşteri kendi Excel’ini taşıyamaz; pilot ETL ile gidiyor.
- **Nereye:** `settings/import-export/+page.svelte` (yer tutucu), yeni API modülü, `ETL-ESLEME.md` eşlemesi, formül sanitizasyonu.
- **YAPILACAKLAR:** Bekleyen · GAP-08.

### 2. G-04 — Kaydedilmemiş taslak canlı uyarı · S · engel: H

- **Ne:** Tracker `POST /transactions/audit-draft`; form doldurulurken kural ihlali.
- **Neden:** Hata kayıttan sonra fark edilir. G-03 sunucu motoru var; taslak yüzeyi yok (`rg audit-draft` → yalnız eski doküman).
- **Nereye:** `reports.service.ts` consistency kurallarını taslak gövdesine uygula; `TransactionFormDialog.svelte`.

### 3. G-11 — Tenant düzeyinde izin matrisi · L · engel: H

- **Ne:** Tracker `GET/PATCH /permissions` (9×5 view/edit). Verimaya `permissions.ts` kodda sabit (8 kaynak × 6 rol).
- **Neden:** “Bu personel tutarları görmesin” tenant-özel talep karşılanamaz.
- **Nereye:** `auth/permissions.ts`, better-auth AC, `settings/access`.
- **Not:** Açık soru §7 — pilotta talep yoksa skip. Bugün engel değil.

### 4. G-05r — `contact_involves` · S · engel: H

- **Ne:** G-05’in pilot seti (`status`+`q`) kapandı; Tracker’daki klinik/otel/transfer rolünde arama taşınmadı.
- **Neden:** “Bu klinikteki randevular” tek parametreyle sorulamaz (`q` kısmen karşılar).
- **Nereye:** `list-query.ts` `appointmentListQuerySchema`, `appointments.service.ts`, panel filtre.

### 5. G-25 — data/delete-scope + wipe · M · engel: H

- **Ne:** Kapsamlı silme + org adı onayı.
- **Neden:** Test verisi temizliği. Tehlikeli; ikinci müşteri / MARKET-02 sonrası.
- **YAPILACAKLAR:** Bekleyen · GAP-25.

### 6. G-26 — AI prompt özelleştirme · S · engel: H

- **Ne:** Tracker `GET/POST/DELETE /ai-prompt`. Disclosure var, prompt yok.
- **Neden:** Tenant prompt açılırsa destek yükü. Açık soru §6.
- **YAPILACAKLAR:** Bekleyen · GAP-26.

### 7. G-29 — Eksik iletişim bilgisi uyarısı · S · engel: H

- **Ne:** Tracker `contact_info_incomplete` → “Check the details!”.
- **Neden:** Randevu öncesi telefon/e-posta eksikliği. `rg contact_info_incomplete` → yok.
- **Nereye:** `appointments.service.ts` + liste/detay UI.

---

## KAPANDI — kanıt özeti

| ID | Kanıt (dosya:satır) |
|---|---|
| G-01 | `packages/shared/src/list-query.ts:36-48`; UI `finance/+page.svelte:50-69,304-352` |
| G-02 | `members.controller.ts:28-44`; UI `settings/team/+page.svelte:69-74,156-168` |
| G-30 | `settings.controller.ts:239-273` (+ isolation `appointment-types.isolation.spec.ts`) |
| G-03 | `reports.service.ts:338-362`; `GET` `reports.controller.ts:111-119`; UI reports + data-quality |
| G-05 | `list-query.ts:23-32`; `appointments.service.ts:39-40` |
| G-06 | `appointments.controller.ts:108-125` soft-delete |
| G-07 | `transactions.controller.ts:116-133` soft-delete |
| G-08 | `contacts.controller.ts:554-571` soft-delete |
| G-12 | `reports.controller.ts:100` `appointment-metrics`; UI `reports/+page.svelte:579-648` |
| G-13 | `packages/shared/src/audit.ts:41-49`; `audit-logs.service.ts:26-31` |
| G-14 | `settings/data-quality/+page.svelte:38-40` → `GET /v1/reports/consistency` |
| G-15 | `whatsapp.controller.ts:229-234`; UI `settings/ai-learning/+page.svelte:13-15` |
| G-16 | `whatsapp.controller.ts:153-205`; UI `finance/ai-transaction/+page.svelte:247-271,493-494` (`create-case`/`create-subcategory` bilinçli yok — DOMAIN-02 + flat kategori) |
| G-17 | `contacts.controller.ts:122` `@Patch('bulk-type')` |
| G-18 | `settings.controller.ts:155-166` |
| G-19 | `contacts.controller.ts:138-186` case-notes CRUD |
| G-21 | `appointments.service.ts:57-93` `type_counts`/`status_counts`; UI `appointments/+page.svelte:170` |
| G-22 | `contacts.controller.ts:278-284`; `contacts.service.ts:214-245` |
| G-23 | `contacts.controller.ts:372+` file soft-delete; `contact-files-soft-delete.isolation.spec.ts` |
| G-24 | `contacts.controller.ts:218-240` preview; `contacts.service.ts:637-652` |
| G-27 | `settings.controller.ts` finance/contact/appointment `PUT .../reorder` |
| G-28 | `platform.controller.ts:27+` gerçek Nest; UI `dev/+page.svelte` → `/v1/platform/...` |
| TX-FORM | `transaction.ts:59-60,106-124` `deriveTransactionLabel`; form `title: null` (`TransactionFormDialog.svelte:320`) |
| TX-CASE | şema `transactions.ts:30` `case_contact_id`; özet OR `contacts.service.ts:172-174` |
| TX-RESP | `0052_...personel.sql`; `responsible_contact_id`; `reports.controller.ts:55` `by-responsible` |
| FX-AUTO | `fx.controller.ts` + `fx.service.ts`; şema `fx-rates.ts:14-15`; form `TransactionFormDialog.svelte:156` |
| CAT-UI | `settings/categories/+page.svelte` reorder; `[id]/+page.svelte` alt kategori |
| BAL-OPEN | `reports.service.ts:595` `open_amount !== 0`; UI yön filtresi `finance/balances/+page.svelte:55-78` |
| TX-UX | `TRANSACTION_PAYMENT_METHODS` `transaction.ts:23-30`; `Combobox` formda |

**G-03 notu:** Tracker’ın ilişkisel kuralları (`case_required`, `responsible_not_internal`, P2P…) bilinçli kapsam dışı — `reports.service.ts:341`. Yeniden tasarlanmış sunucu motoru kabul edildi (GAP-05).

---

## Tracker’da olup gap’te ayrı satır olmayan yüzeyler

Tarama: Tracker `backend/app/routers/*` + `models/*` + `frontend/src/App.tsx`.

| Tracker yüzeyi | Durum |
|---|---|
| `case_files` | G-23/G-24 + BF-08 — tek `files` + contact/appointment |
| `contact_note_message` | G-19 — kapandı |
| `appointment_checklist_*` | G-20 — bilinçli skip adayı |
| `audit_log` | G-13 — kapandı |
| `whatsapp_correction` | G-15 — kapandı |
| `tenant_import_export` | G-09/G-10 — açık |
| `transaction_audit` (+ `/audit` sayfası) | G-03/G-04 — motor kapandı, taslak açık; UI `/reports` + data-quality |
| `finance_subcategories` ayrı tablo | Flat `subcategories[]` — bilinçli model farkı (gap ID yok) |
| `appointment_statuses` tenant CRUD | BF-07 |
| `cases` ayrı entity | BF-09 / DOMAIN-02 |
| `inbound_messages` | Verimaya WhatsApp inbox — gap değil (iyileştirme) |
| `is_internal` contact | Verimaya’da var (`contacts` şema) — gap değildi |

Yeni gizli gap çıkmadı; yukarıdakiler mevcut G-*/BF-* altında.

---

## Bunlar bilinçli yapılmayacak

| Kalem | Gerekçe (hâlâ geçerli mi?) |
|---|---|
| G-20 Checklist | Tracker canlıda 0 satır; YAPILACAKLAR skip adayı. **Geçerli.** |
| G-31 Toplu case / auto-link | Tracker dev-only; ETL aynı iş. **Geçerli.** |
| G-32 Tags | Tracker ölü; `ayarlar.md` taşınmaz. **Geçerli.** |
| BF-01 select-tenant sayfası | AppShell org menüsü. **Geçerli.** |
| BF-02 /menu mobil | Responsive sidebar + CommandPalette. **Geçerli.** |
| BF-03 WA import+inbox birleşimi | Tek `/finance/ai-transaction`. **Geçerli.** |
| BF-04 `responsible_party` serbest metin | Contact FK (`responsible_contact_id`) ile karşılandı — serbest metin dönülmez. **Geçerli (güçlendi).** |
| BF-05 P2P payer/payee | `contact_id`+`kind` net bakiye; ertelendi. **Geçerli (açık soru §8).** |
| BF-06 “Canlı kur çevirici yok” | Raporlar hâlâ snapshot. **Güncellendi:** yazma anında ECB/Frankfurter + `fx_rates` snapshot doldurur (`GET /v1/fx/rate`). WhatsApp `convert-rate` canlı çevirici hâlâ yok — bu bilinçli. |
| BF-07 Randevu durumu enum | ETL kilitli. **Geçerli.** |
| BF-08 Google Drive | Object storage. **Geçerli.** |
| BF-09 cases/patients ikiliği + Tags | DOMAIN-02 tek contact modeli. **Geçerli.** |
| G-16 create-case / create-subcategory | DOMAIN-02 + flat kategori. **Geçerli.** |
| G-01 artıkları (subtitle, payment_method, invoice_status, X-Total-Count) | Pilot set bilinçli dar; cursor sayfalama. **Geçerli (talep gelirse AÇIK’a alınır).** |

---

## Gap dokümanına yapılan düzeltmeler (aynı commit)

- Yanlış `transactions.patient_id (var)` / DOMAIN-02 notu düzeltildi.
- G-30 “canlı hata” iddiası kapatıldı.
- Kapanan G-* satırları işaretlendi; özet sayılar güncellendi.
- BF-06 Frankfurter/snapshot notu güncellendi.
