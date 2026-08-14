# Tracker → Verimaya Özellik Gap Analizi

Tarih: 2026-08-07 · **Yeniden doğrulama: 2026-08-14**

> **2026-08-14:** Her kalem bugünkü koda karşı yeniden doğrulandı.
> Karar listesi (KAPANDI / AÇIK / BİLİNÇLİ + pilot engeli): `docs/2026-08-14-tracker-kapanis-listesi.md`.
> Bu dosya tarihsel gap envanteridir; satırlar düzeltilir/işaretlenir, baştan yazılmaz.
> Açık iş envanteri değildir — tek kaynak `docs/2026-08-11-YAPILACAKLAR.md`.

Kaynaklar:

- `docs/Arşiv/tracker-verimaya-sayfa-karsilastirma.md` (sayfa envanteri — başlangıç noktası)
- `docs/legacy-reference/`: `README.md`, `ayarlar.md`, `raporlar.md`, `case-expenses.md`, `dosyalar.md`, `kisiler.md`, `doviz.md`, `dev-panel.md`, `ETL-ESLEME.md`
- `AGENTS.md`, `docs/2026-08-03-YAPILACAKLAR.md`
- Tracker FE: `frontend/src/App.tsx`, `routes/**` (özellikle `TransactionsPage`, `AppointmentsPage`, `ContactsPage`, `ReportsPage`, `DashboardPage`, `WhatsAppImportPage`, `settings/**`)
- Tracker BE: `backend/app/routers/**` (14 router), `services/transaction_audit.py`, `deps/rbac.py`
- Verimaya: `apps/web/src/routes/**`, `apps/web/src/lib/components/**`, `apps/api/src/**`, `packages/shared/src/api.ts`, `list-query.ts`, `transaction.ts`, `appointment.ts`, `file.ts`, `auth/permissions.ts`

---

## Yöntem

- Karşılaştırma birimi **özellik (capability)**, sayfa değil. Bir sayfanın var olması özelliğin taşındığı anlamına gelmiyor; filtre seti, iş kuralı ve endpoint yüzeyi ayrı ayrı kontrol edildi.
- **Dahil:** UI yetenekleri + API yüzeyi + sunucu tarafı iş kuralları + RBAC.
- **Hariç:** Verimaya-only yenilikler (marketing araçları, scorecard, GHL/Ads/n8n, hub, karne) — bu rapor tek yönlü.
- **Ayrı bölüm:** `docs/legacy-reference/**` içinde açıkça "taşınmayacak / yeniden tasarlandı" diye karara bağlanmış olanlar `bilinçli-fark` sayıldı, gap listesine yazılmadı.
- Her iddia dosya + satır/fonksiyon düzeyinde doğrulandı. Doğrulama sırasında **iki önemli düzeltme** çıktı, aşağıda "Doğrulama notları"nda.

### Doğrulama notları (önceki sayfa karşılaştırmasını düzelten bulgular)

1. **`DashboardPage.tsx` ölü kod DEĞİL.** `ReportsPage.tsx:33` `import { DashboardOzetContent } from './DashboardPage'` ve `ReportsPage.tsx:668` bunu Summary sekmesinde render ediyor. Rota yok ama içerik canlı. ~~Verimaya'da karşılığı yok~~ → **2026-08-14 KAPANDI (G-12):** `GET /v1/reports/appointment-metrics` + `/reports` Operasyon bloğu.
2. ~~**Verimaya'da canlı bir sözleşme kopukluğu var** (G-30: API'de yalnız GET).~~ → **2026-08-14 KAPANDI:** `settings.controller.ts` `@Post` / `@Delete` / `@Put(.../reorder)` appointment-types için mevcut.

### 2026-08-14 yeniden doğrulama özeti

| Kova | Adet | Not |
|---|---:|---|
| **KAPANDI** | 27 | G-01…03, G-05…08, G-12…19, G-21…24, G-27–28, G-30 + bugün kapanan TX/FX/CAT/BAL yüzeyleri |
| **AÇIK** | 7 | G-04, G-09, G-10, G-11, G-25, G-26, G-29 (+ G-05 artığı `contact_involves`) |
| **BİLİNÇLİ / skip** | G-20, G-31, G-32 + BF-01…09 | Checklist skip adayı; Tags/toplu-case taşınmaz |
| **Pilotu engelleyen AÇIK** | **0** | P0 üçlüsü kapalı |

Detay ve dosya:satır kanıtları → `docs/2026-08-14-tracker-kapanis-listesi.md`.

*(Aşağıdaki tarihsel tablolar 2026-08-07 envanteridir; satır sonuna **Durum** sütunu / Not güncellemesi eklendi.)*

---

## Özet (sayılarla) — 2026-08-07 tarihsel envanter

| Kategori | Adet (07 Ağu) | 14 Ağu |
|---|---:|---|
| Tracker'da olup Verimaya'da **yok** (`eksik`) | 17 | çoğu kapandı; kalan AÇIK listede |
| Tracker'da derin, Verimaya'da **sade** (`sadeleşmiş`) | 10 | pilot setleri taşındı; artıkları bilinçli dar |
| **Placeholder** | 4 | G-09/G-10 hâlâ; G-20 skip; G-28 platform’a taşındı |
| **Tracker'da ölü kod** | 1 | G-32 Tags — skip |
| **Bilinçli fark** | 9 | BF-01…09 (BF-06 notu güncellendi) |

`belirsiz` türünde kayıt yok. Ürün kararı gerektirenler "Açık sorular"da.

---

## Gap tablosu (öncelikli)

Tür: `eksik` | `sadeleşmiş` | `placeholder` | `ölü-kod-tracker` | `bilinçli-fark` | `belirsiz`
Öncelik: `P0` (pilot bloğu) | `P1` (saha kullanım) | `P2` (konfor) | `P3` (ertelenebilir) | `skip`

### P0 — pilot bloğu · **2026-08-14: üçü de KAPANDI**

| ID | Modül | Özellik | Tracker kanıtı | Verimaya durumu | Tür | Öncelik | Pilot etkisi | Not |
|---|---|---|---|---|---|---|---|---|
| G-01 | Finans | İşlem listesi filtreleri | `routers/transactions.py:176-280` | **KAPANDI** — `list-query.ts:36-48` `kind,status,category,q,case_contact_id,contact_id,from,to`; UI `finance/+page.svelte` filtre çubuğu. Artık: subtitle/payment_method/invoice_status (bilinçli dar) | sadeleşmiş→kapandı | ~~P0~~ | — | Pilot set taşındı |
| G-02 | Ayarlar / RBAC | Üye rolü değiştirme | `routers/tenant_admin.py:64` | **KAPANDI** — `members.controller.ts:28` `@Patch(':id')`; UI `settings/team/+page.svelte:69` | ~~eksik~~ | ~~P0~~ | — | |
| G-30 | Ayarlar | Randevu tipi ekleme / silme | Tracker CRUD | **KAPANDI** — `settings.controller.ts:239+` POST/DELETE + reorder | ~~eksik~~ | ~~P0~~ | — | Canlı hata kapandı |

### P1 — saha kullanımı

| ID | Modül | Özellik | Tracker kanıtı | Verimaya durumu | Tür | Öncelik | Pilot etkisi | Not |
|---|---|---|---|---|---|---|---|---|
| G-03 | Finans | Sunucu tarafı işlem denetim motoru | `services/transaction_audit.py`, `GET /transactions/audit` | **KAPANDI (yeniden tasarım)** — `GET /v1/reports/consistency` (`reports.service.ts:338+`); Tracker ilişkisel kurallar bilinçli kapsam dışı (`:341`) | sadeleşmiş→kapandı | ~~P1~~ | — | |
| G-04 | Finans | Kaydedilmemiş taslak için canlı uyarı | `POST /transactions/audit-draft` | **AÇIK** — endpoint yok | eksik | P1→P2 | Hata kayıttan sonra fark edilir | G-03 sonrası ucuz |
| G-05 | Randevular | Randevu listesi filtreleri | `appointments.py:138-205` | **KAPANDI** (status+q) — `list-query.ts:23-32`. **Artık AÇIK:** `contact_involves` | sadeleşmiş→kısmi | ~~P1~~ | — | |
| G-06 | Randevular | Randevu silme | `DELETE /appointments/{id}` | **KAPANDI** — soft-delete `appointments.controller.ts:108` | ~~eksik~~ | ~~P1~~ | — | |
| G-07 | Finans | İşlem silme | `DELETE /transactions/{id}` | **KAPANDI** — soft-delete `transactions.controller.ts:116` | ~~eksik~~ | ~~P1~~ | — | |
| G-08 | Kişiler | Kişi silme | `DELETE /contacts/{id}` | **KAPANDI** — soft-delete `contacts.controller.ts:554` | ~~eksik~~ | ~~P1~~ | — | |
| G-09 | İçe/dışa aktarım | Bundle import/export | `tenant_import_export.py` | **AÇIK** — `settings/import-export/+page.svelte` “Faz 8'de” | placeholder | P1 | İkinci müşteri eşiği | YAPILACAKLAR GAP-08 |
| G-10 | İçe/dışa aktarım | Kişi import/export | `tenant_import_export.py:1255+` | **AÇIK** — yok | placeholder | P1 | İkinci müşteri eşiği | G-09 ile |
| G-11 | Ayarlar / RBAC | Tenant izin matrisi | `GET/PATCH /permissions` | **AÇIK** — `permissions.ts` kodda sabit 8 kaynak × 6 rol | sadeleşmiş | P1 | Pilotta talep yoksa skip | Açık soru §7 |

### P2 — konfor

| ID | Modül | Özellik | Tracker kanıtı | Verimaya durumu | Tür | Öncelik | Pilot etkisi | Not |
|---|---|---|---|---|---|---|---|---|
| G-12 | Raporlar | Operasyon + yönetim dashboard metrikleri | `DashboardOzetContent` | **KAPANDI** — `GET /v1/reports/appointment-metrics`; UI `/reports` Operasyon | ~~eksik~~ | ~~P2~~ | — | |
| G-13 | Ayarlar | Denetim kaydı filtreleri | `audit_logs.py:39-62` | **KAPANDI** — `auditLogListQuerySchema` actor/action/entity/from/to/q (`audit.ts:41-49`) | sadeleşmiş→kapandı | ~~P2~~ | — | `entity_id` yok → `q` on label |
| G-14 | Ayarlar | Sunucu tarafı veri kalitesi | `GET /whatsapp/data-quality` | **KAPANDI** — data-quality sayfası `GET /v1/reports/consistency` tüketiyor | sadeleşmiş→kapandı | ~~P2~~ | — | |
| G-15 | WhatsApp AI | AI düzeltme raporu agregasyonu | `GET /whatsapp/corrections-report` | **KAPANDI** — `whatsapp.controller.ts:229`; UI ai-learning | sadeleşmiş→kapandı | ~~P2~~ | — | |
| G-16 | WhatsApp AI | Satır içi kayıt oluşturma | create-contact/case/category/subcategory | **KAPANDI** — create-contact + create-category. create-case/subcategory bilinçli yok (DOMAIN-02 + flat) | sadeleşmiş→kapandı | ~~P2~~ | — | |
| G-17 | Kişiler | Toplu kişi tür atama | `PATCH /contacts/bulk-type` | **KAPANDI** — `contacts.controller.ts:122` | ~~eksik~~ | ~~P2~~ | — | |
| G-18 | Kişiler | Kişi türü yeniden adlandırma | `PATCH /contact-types/{id}` | **KAPANDI** — `settings.controller.ts:155` | ~~eksik~~ | ~~P2~~ | — | |
| G-19 | Kişiler | Kişiye bağlı not thread'i | case-notes CRUD | **KAPANDI** — `contacts.controller.ts:138-186` | ~~eksik~~ | ~~P2~~ | — | DOMAIN-02 tek model |
| G-20 | Randevular | Checklist şablonları + ilerleme | checklist CRUD | **BİLİNÇLİ skip adayı** — şemada yok; Tracker 0 satır | placeholder | skip | — | YAPILACAKLAR GAP-F09-20 |
| G-21 | Randevular | Liste agregat istatistikleri | `AppointmentStats` | **KAPANDI** — `type_counts`/`status_counts` | ~~eksik~~ | ~~P2~~ | — | |
| G-22 | Hastalar | Case ↔ işlem otomatik bağlama | `auto-link-transactions` | **KAPANDI** — `POST /v1/contacts/:id/auto-link-transactions` | ~~eksik~~ | ~~P2~~ | — | DOMAIN-02: contact üzerinden |
| G-23 | Dosyalar | Dosya silme | DELETE files | **KAPANDI** — soft-delete contact files | ~~eksik~~ | ~~P2~~ | — | |
| G-24 | Dosyalar | Satır içi güvenli önizleme | MIME allowlist inline | **KAPANDI** — `GET .../files/:fileId/preview` | sadeleşmiş→kapandı | ~~P2~~ | — | |

### P3 — ertelenebilir

| ID | Modül | Özellik | Tracker kanıtı | Verimaya durumu | Tür | Öncelik | Pilot etkisi | Not |
|---|---|---|---|---|---|---|---|---|
| G-25 | Ayarlar | data/delete-scope + wipe | `tenant_admin.py:102,132` | **AÇIK** — yok | eksik | P3 | Test temizliği | YAPILACAKLAR GAP-25 |
| G-26 | Ayarlar | AI prompt özelleştirme | `/ai-prompt` | **AÇIK** — disclosure var, prompt yok | eksik | P3 | — | YAPILACAKLAR GAP-26 |
| G-27 | Ayarlar | Toplu reorder | 4× `PUT .../reorder` | **KAPANDI** — finance/contact/appointment types reorder | sadeleşmiş→kapandı | ~~P3~~ | — | |
| G-28 | Geliştirici | Dev panel gerçek arka uç | `dev_panel.py` | **KAPANDI** — Nest `platform.controller.ts` + `/dev` → `/v1/platform` | placeholder→kapandı | ~~P3~~ | — | MSW değil; platform allowlist |
| G-29 | Randevular | Eksik iletişim uyarısı | `contact_info_incomplete` | **AÇIK** — yok | eksik | P3 | — | |

### skip — taşınmaması önerilir

| ID | Modül | Özellik | Tracker kanıtı | Verimaya durumu | Tür | Öncelik | Not |
|---|---|---|---|---|---|---|---|
| G-31 | Hastalar | Kişilerden toplu case / toplu auto-link | `cases.py:135,183` dev-only | Yok | eksik | skip | **BİLİNÇLİ** — ETL kapsıyor |
| G-32 | Ayarlar | Etiketler (Tags) | ölü UI | Yok | ölü-kod-tracker | skip | **BİLİNÇLİ** — taşınmaz |

---

## Modül bazlı detay

### Hastalar / vakalar

**G-22 — Case ↔ işlem otomatik bağlama · KAPANDI (2026-08-14)**
Bir kişinin (eski “hasta/case”) henüz bağlanmamış işlemlerini tek çağrıda bağlar.
- Tracker: `backend/app/routers/cases.py:106` `auto_link_transactions`.
- Verimaya: `POST /v1/contacts/:id/auto-link-transactions`
  (`contacts.controller.ts:278`, `contacts.service.ts:214-245`) — soft-deleted ve zaten
  `contact_id` dolu satırlar atlanır.
- **Düzeltme (eski yanlış satır):** ~~`transactions.patient_id` var~~ — DOMAIN-02 bunu
  `contact_id`'ye eritti; hasta bağlantısı ayrıca `case_contact_id` (2026-08-14).
  P2P alanları yok (BF-05 / G-33). Auto-link `contact_id` + etiket eşlemesiyle çalışır.

**G-31 — Toplu case oluşturma / toplu auto-link**
- Tracker: `cases.py:135,183`, ikisi de `Depends(require_dev_user)` — yani tenant kullanıcısına açık değil.
- Öneri: **taşıma.** ETL boru hattı (`ETL-ESLEME.md` §3.2) aynı işi yapıyor.

### Kişiler

**G-08 / G-17 / G-18 / G-19** — **hepsi KAPANDI (2026-08-14).**
- Silme: soft-delete `contacts.controller.ts:554`.
- Bulk-type: `@Patch('bulk-type')`. Tür rename: `@Patch('contact-types/:id')`.
- Case-notes: `contacts.controller.ts:138-186` (DOMAIN-02 tek contact modeli).
- Duplicate/merge taşınmıştı (gap yoktu).

### Randevular

**G-05 — filtre seti.** Tracker `routers/appointments.py:138-205`: `case_id`, `contact_id`, `contact_involves`, `date_from/to`, `status_id`, `q`, `page`, `page_size`. `q` özel: metin araması dışında `YYYY-MM-DD` veya `Gün.Ay.Yıl` yazılırsa randevu gününe de bakıyor. Verimaya `list-query.ts:21-27`: `patient_id`, `from`, `to`, cursor, limit. Öneri: **taşı** — en azından `q` + `status`.

**G-06 — silme.** Tracker `DELETE /appointments/{id}`. Verimaya'da yok. Öneri: **yeniden tasarla** (soft-delete). `dosyalar.md` zaten "randevu silinince dosyalar hastada kalır (`appointment_id` null)" kararını vermiş — silme geldiğinde bu davranış uygulanmalı.

**G-20 — checklist.** Tracker'da tam altyapı: şablon CRUD + reorder (`tenant_appointment_settings.py:185-263`), randevu başına ilerleme (`appointments.py:349` `patch_appointment_checklist_item`), `appointment_checklist_progress` + `appointment_checklist_template` tabloları. Verimaya: ekranda "Faz 1" notu, şemada iz yok (`grep checklist` → yalnız Trust Score checklist'i, ilgisiz). Öneri: **ertele** — `ayarlar.md` düşük kullanım notu var, pilot doğrulasın.

**G-21 — liste istatistikleri.** `AppointmentStats(type_counts, status_counts)` sayfalı listede dönüyor. Öneri: **taşı**, tek SQL `GROUP BY`.

**Randevu tipi/durum modeli — bkz. Bilinçli farklar.** Ancak G-30 (tip CRUD'un API'de olmaması) bilinçli fark değil, hata.

### Finans / işlemler / P2P

**G-01 — filtre seti · KAPANDI (2026-08-14, pilot set).** Tracker 16 param.
Verimaya `transactionListQuerySchema` (`list-query.ts:36-48`): `contact_id`,
`case_contact_id`, `from`, `to`, `kind`, `status`, `category`, `q` + cursor/limit.
UI: `finance/+page.svelte` filtre çubuğu. Artıklar (subtitle, payment_method,
invoice_status, involving_contact_id, X-Total-Count) bilinçli dar — talep gelirse açılır.
~~Eski yanlış: yalnız `patient_id, contact_id, from, to`~~ — `patient_id` yok (DOMAIN-02).

- Öneri (tarihsel): **taşı** — yapıldı. `responsible_party` taşınmaz (BF-04 → `responsible_contact_id`).

**G-03 / G-04 — denetim motoru.** `services/transaction_audit.py` bir kural motoru: kategori→case politikası (`_case_policy`), kişi tipi uyumu, sorumlu kişinin iç personel olması, kişi≠sorumlu (severity `error`), kişisel kategorilerde payer/payee zorunluluğu, kur karşılığı eksikliği, kısmi ödeme aralığı. İki yüzeyi var: kayıtlı işlemler (`GET /transactions/audit`) ve **kaydedilmemiş taslak** (`POST /transactions/audit-draft`) — form doldurulurken canlı uyarı.

Verimaya'da `reports/+page.svelte:355-405` içinde 6 istemci kuralı var (hasta yok, kişi etiketi yok, kategori boş, paid/unpaid tutar tutarsızlığı, FX eksik). Kesişim var ama Tracker'ın ilişkisel kuralları (kategori↔case, kişi tipi, sorumlu) yok ve taslak uyarısı hiç yok.

- Bağımlılık: kural motoru sunucuya taşınırsa `transactions` + `contacts` + kategori sözlüğü birlikte okunur; `contact_type_name` zaten denormalize.
- Öneri: G-03 **yeniden tasarla** (sunucu tarafı, sayfalama sorununu G-14 ile birlikte çöz). G-04 **ertele** — kural motoru sunucuya taşındıktan sonra ucuz eklenti.

**G-07 — işlem silme.** Öneri: **yeniden tasarla** — mali kayıtta hard-delete yerine soft-delete + audit; AUDIT-F09-06 (`tenants` soft-delete) ile aynı desen.

**P2P:** Tracker'da açık `payer_contact_id` / `payee_contact_id` çifti + doğrulama (`_validate_p2p_pair`: ikisi birlikte zorunlu, eşit olamaz). Verimaya'da bu alanlar yok; `reports/balances` net bakiyeyi `transactions.contact_id` + `kind` üzerinden türetiyor. Bu, `kisiler.md` "Erteleme: P2P payer/payee rolleri" satırıyla **bilinçli olarak ertelenmiş** — BF-05.

### WhatsApp AI içe aktarım

Verimaya bu modülü **birleştirerek iyileştirmiş**: Tracker'ın iki sayfası (`/whatsapp-import` 1635 satır + `/whatsapp-inbox` 246 satır) tek `/finance/ai-transaction` (437 satır) olmuş; kuyruk + yapıştır + taslak onayı aynı ekranda. Endpoint yüzeyi de daha zengin (`inbox/:id/parse`, `approve-drafts`, `corrections`). İki gerçek gap kaldı:

**G-16 — satır içi kayıt oluşturma.** Tracker `whatsapp_import.py:544-685` dört endpoint: `create-contact`, `create-case`, `create-category`, `create-subcategory`. UI'da taslağı onaylarken "Yeni kişi / Yeni kategori / Yeni alt kategori / Yeni case" alanları var. Verimaya'da taslak onayı yalnız mevcut kayıtlardan seçiyor. Öneri: **taşı** — günlük akışta en sık kesinti noktası.

**G-15 — düzeltme raporu agregasyonu.** `GET /whatsapp/corrections-report` alan bazlı hata sıklığı + tekrar sayısı üretiyordu; Verimaya düz liste döndürüyor. Öneri: **taşı** (tek `GROUP BY` sorgusu).

`GET /whatsapp/meta` (kategori ağacı + kişi + case tek çağrıda) Verimaya'da ayrı sorgularla karşılanıyor — gap değil.

### Raporlar / dashboard

**G-12.** Tracker Summary sekmesi (`ReportsPage.tsx:668` → `DashboardOzetContent`) üç blok gösteriyor:

- **Operasyon:** aylık randevu trendi
- **Yönetim:** tamamlanma oranı, no-show oranı, iptal oranı, klinik performansı (klinik × vaka × tamamlama), iptal & no-show trendi, vaka türü dağılımı
- **Finans:** toplam gelir/gider/net, en yüksek 5 gider ve gelir kalemi, P2P ödenmemiş borçlar

Verimaya `/reports`: aylık gelir/gider, hasta durum dağılımı, kaynak dağılımı, tutarlılık uyarıları, pazarlama (gerçek ROAS + hasta başı maliyet), kaynak kırılımı, kategori/alt kategori.

Finans tarafı taşınmış (ve sunucu agregasyonuna çevrilerek iyileştirilmiş — `reports.service.ts`, `raporlar.md`'deki `limit: 50000` hatası düzeltilmiş). **Operasyon + klinik performansı metrikleri hiç yok.**

- Bağımlılık: `appointments.status` enum'u zaten `no_show` / `cancelled` / `completed` içeriyor (`appointment.ts:4-11`) — veri var, agregasyon yok. `clinic_contact_id` de var.
- Öneri: **taşı** — `GET /v1/reports/appointment-metrics` benzeri tek endpoint. Sağlık turizmi operasyonunda no-show oranı birincil KPI.

### Ayarlar

**G-11 — izin matrisi.** En derin mimari fark.

| | Tracker | Verimaya |
|---|---|---|
| Kaynak | `tenants.permissions` JSON — **tenant başına düzenlenebilir** | `auth/permissions.ts` — kodda sabit |
| Granülerlik | 9 özellik anahtarı × 5 rol, view/edit ayrı (`deps/rbac.py:99-118`) | 3 kaynak (`patient`, `finance`, `settings`) × 6 rol × CRUD |
| UI | `SettingsPermissionsPage.tsx` — Off/View/Edit/Admin matrisi | `settings/access` (80 satır) — salt okunur liste |
| İnce ayarlar | `transaction_amounts` (kartlarda tutar gizle), `case_finance_detail`, `panel_finance_kpis`, `medya_kutuphane` | yok |

Verimaya'nın rol modeli daha temiz (better-auth AC) ama **tenant'a özel kısıtlama yeteneği kayıp**. YAPILACAKLAR **AUDIT-F09-02** kaynak listesini genişletmeyi planlıyor — ama tenant-düzeyinde düzenlenebilirlik ayrı bir karar.
- Öneri: **yeniden tasarla.** Rol modelini kodda tut, üzerine tenant başına "kısıtlama katmanı" (yalnız daraltan) ekle. Pilotta gerçekten istenip istenmediğini ölç — bkz. Açık sorular.

**G-02 — üye rol değiştirme (P0).** `members.controller.ts` yalnız `@Get()`. `settings/team/+page.svelte` rolü rozet olarak gösteriyor, değiştirme yok. better-auth organization eklentisinde API mevcut ama panelde yüzey yok. Öneri: **taşı** — pilot öncesi zorunlu.

**G-13 / G-14 / G-25 / G-26 / G-27** — yukarıdaki tabloda; hepsi P2–P3.

### İçe-dışa aktarım

Tracker'ın en büyük tek dosyası (`tenant_import_export.py`, 1482 satır). Yetenekler:
- Üç kapsam (`cases`, `appointments`, `transactions`) için ayrı **şablon indir → export → dry-run önizleme → commit** akışı
- Kişiler için ayrı akış: 26 sütunluk şablon (`CONTACT_HEADERS`), legacy başlık eşleme (`CONTACT_LEGACY_HEADERS`), e-posta/telefon/dış-id ile eşleştirme, kategori sözlüğü senkronu (`_sync_finance_categories_from_import`)
- Hücre sanitizasyonu (formül enjeksiyonu — `_sanitize_cell`)
- Kapsam bazlı silme + org adı yazarak onay

Verimaya: `settings/import-export/+page.svelte` 29 satır, "Faz 8'de".
- Bağımlılık: `packages/shared` şemaları + ETL boru hattı (`ETL-ESLEME.md` aynı alan eşlemesini zaten çözmüş — yeniden keşfetmeye gerek yok).
- Öneri: **taşı, ama Faz 8'de kalsın.** Pilot tek tenant (kendi firmamız) ve ETL ile taşınıyor; ikinci müşteriden önce zorunlu. Formül enjeksiyonu sanitizasyonu taşınırken korunmalı.

### Dosyalar / ekler

Verimaya modeli `dosyalar.md`'ye göre daha sağlam: tek `files` tablosu, `patient_id` zorunlu + `appointment_id` nullable (`file.ts:15-17`), object storage + presign akışı, `nosniff`. Randevu dosyası desteği **var** (şemada `appointment_id`, `appointment_label`). Kalan iki gap:
- **G-23 silme** — `dosyalar.md`'de zaten "İleri (Faz 1)" listesinde. Öneri: **taşı** (soft-delete + audit; KVKK).
- **G-24 satır içi önizleme** — `dosyalar.md` "Legacy MIME allowlist + indirme zorlaması korunur" diyor, ama controller her dosyayı `attachment` olarak gönderiyor. Öneri: **taşı** — kararı zaten verilmiş, uygulama eksik.

25 MB sınırı korunmuş (`main.ts` multipart `fileSize`), Drive bağımlılığı bilinçli olarak atılmış (BF-08).

### RBAC / roller

Tracker: 5 kanonik rol + 12 takma ad (`deps/rbac.py:14-33`), 9 özellik anahtarı, view/edit ayrımı, ops rolü için "aksi belirtilmedikçe açık" varsayılanı.
Verimaya: 6 rol (`owner, admin, manager, agent, finance, readonly`), 3 kaynak, better-auth AC, `@RequireOrgPermission` dekoratörü + guard.

Verimaya modeli daha standart ve test edilebilir (izolasyon spec'leri var). Kayıp: G-02 (rol değiştirme yüzeyi) + G-11 (tenant düzeyinde ayar). Ayrıca YAPILACAKLAR **AUDIT-02** API-key RBAC bypass'ını zaten açık bulgu olarak taşıyor — bu rapor kapsamı dışı ama aynı alan.

### Entegrasyonlar (Tracker tarafında olanlar)

Tracker'ın tek gerçek entegrasyonu WhatsApp (WAHA webhook — `routers/whatsapp_webhook.py`, medya indirme + saklama) ve Google Drive (dosya depolama).
- **WhatsApp webhook:** Verimaya'da `apps/api/src/webhooks/` + queue-first mimari ile **daha iyi** karşılanmış (AGENTS.md ilke 2). Gap yok.
- **Google Drive:** bilinçli olarak atıldı (BF-08).
- **Frankfurter / ECB kur:** raporlarda canlı çeviri yok (BF-06). **2026-08-14:** form/API
  yazma anında `GET /v1/fx/rate` + `fx_rates` ile snapshot dolduruluyor.

Verimaya'nın GHL / Meta / Google Ads / n8n entegrasyonları Tracker'da yok — kapsam dışı.

### Diğer

- **Mobil menü sayfası** (`/menu`) → AppShell + CommandPalette (BF-02).
- **`SelectTenantPage`** → AppShell org menüsü (BF-01).
- **G-28 dev panel** — **KAPANDI:** Nest `platform` + `/dev` (allowlist); MSW değil.
- **2026-08-14 Tracker paritesi (G-* değildi, gap dokümanında yanlış/eksik duruyordu):**
  başlık opsiyonel + `deriveTransactionLabel`; `case_contact_id` + finans özeti OR;
  `responsible_contact_id` + Personel; otomatik FX; kategori UI sıralama/detay;
  bakiyeler yalnız açık + yön; ödeme yöntemi sabit liste + Combobox.

---

## Bilinçli farklar (eksik sayma)

| ID | Konu | Karar kaynağı |
|---|---|---|
| BF-01 | `/select-tenant` ayrı sayfası → `AppShell` org menüsü + login akışı | Sayfa karşılaştırması; mimari sadeleştirme |
| BF-02 | `/menu` mobil menü sayfası → responsive sidebar + `CommandPalette` | aynı |
| BF-03 | `/whatsapp-import` + `/whatsapp-inbox` → tek `/finance/ai-transaction` | Sayfa karşılaştırması; akış iyileştirmesi |
| BF-04 | `responsible_party` (serbest metin) kaldırıldı → **2026-08-14:** `responsible_contact_id` + Personel tipi + `GET /v1/reports/by-responsible` | `raporlar.md` / `ayarlar.md`; Contact modeli absorbe etti |
| BF-05 | P2P `payer/payee` çifti → `contact_id` + `kind` üzerinden net bakiye | `kisiler.md`: "Erteleme: P2P payer/payee rolleri… sonraki faz" — **ertelendi, iptal değil** |
| BF-06 | Canlı kur çevirici (WhatsApp `GET /whatsapp/convert-rate`) yok; raporlar snapshot `amount_base` ile toplanır | `doviz.md`. **2026-08-14 güncelleme:** yazma anında ECB/Frankfurter + `fx_rates` önbelleği snapshot doldurur (`GET /v1/fx/rate`) — bu rapor canlı çevirisi değil, bilinçli karar bozulmaz |
| BF-07 | Randevu **durumları** tenant-CRUD → sabit enum (6 değer) | `ETL-ESLEME.md` §2.3 — 5 Tracker durumu enum'a eşlenmiş, `in_progress` eklenmiş |
| BF-08 | Google Drive depolama → S3-uyumlu object storage + presign | `dosyalar.md` "Legacy hataları" 1–5 + "Verimaya modeli" tablosu |
| BF-09 | `case-expenses` / `patients` legacy ikiliği → tek `patients`; Tags modülü | `case-expenses.md` madde 6; `ayarlar.md` madde 2 |

**Not — BF-05 ve BF-07 kalıcı karar değil:** ikisi de "ertelendi" olarak yazılmış. P2P açık payer/payee'ye dönülürse `transactions` şeması değişir; randevu durumu tenant-CRUD'a dönerse enum → FK migrasyonu gerekir. Bugün gap sayılmıyor ama **geri dönülemez karar değil** — pilot verisi izlensin.

---

## API yüzey gap'i (kısa) · 2026-08-14 durumu

Tracker FastAPI endpoint'lerinden `packages/shared/src/api.ts` `apiPaths` içinde karşılığı **olmayanlar / kısmi**:

| Tracker endpoint | Domain | Verimaya karşılığı | Gap ID | 14 Ağu |
|---|---|---|---|---|
| `PATCH /members/{user_id}` | Üyeler | `PATCH /v1/members/:id` | G-02 | KAPANDI |
| `GET/PATCH /permissions` | RBAC | yok (kodda sabit) | G-11 | AÇIK |
| `POST /data/delete-scope`, `POST /data/wipe` | Tenant verisi | yok | G-25 | AÇIK |
| `DELETE /transactions/{id}` | Finans | soft-delete var | G-07 | KAPANDI |
| `GET /transactions/audit` | Finans | `GET /v1/reports/consistency` | G-03 | KAPANDI |
| `POST /transactions/audit-draft` | Finans | yok | G-04 | AÇIK |
| `DELETE /appointments/{id}` | Randevu | soft-delete var | G-06 | KAPANDI |
| `PATCH /appointments/{id}/checklist/{item}` | Randevu | yok | G-20 | BİLİNÇLİ |
| `GET/POST/PATCH/DELETE /appointment-statuses` | Ayarlar | enum | BF-07 | BİLİNÇLİ |
| `POST/PATCH/DELETE /appointment-types` | Ayarlar | POST/DELETE/reorder var | G-30 | KAPANDI |
| `…/appointment-checklist` | Ayarlar | yok | G-20 | BİLİNÇLİ |
| `DELETE /contacts/{id}` | Kişiler | soft-delete var | G-08 | KAPANDI |
| `PATCH /contacts/bulk-type` | Kişiler | var | G-17 | KAPANDI |
| `PATCH /contact-types/{id}` | Ayarlar | var | G-18 | KAPANDI |
| `…/contacts/{id}/case-notes` | Kişiler | var | G-19 | KAPANDI |
| `POST /cases/{id}/auto-link-transactions` | Hastalar | `POST /contacts/:id/auto-link-transactions` | G-22 | KAPANDI |
| `POST /cases/bulk-…` | Hastalar | yok (dev-only) | G-31 | BİLİNÇLİ |
| `DELETE …/files/{id}` | Dosyalar | soft-delete var | G-23 | KAPANDI |
| `GET …/files/{id}/preview` | Dosyalar | preview var | G-24 | KAPANDI |
| `GET/POST/DELETE /ai-prompt` | Ayarlar | yok | G-26 | AÇIK |
| `GET /whatsapp/corrections-report` | AI | var | G-15 | KAPANDI |
| `GET /whatsapp/data-quality` | Veri kalitesi | consistency ile karşılandı | G-14 | KAPANDI |
| `POST /whatsapp/create-contact\|category` | AI | var | G-16 | KAPANDI |
| `POST /whatsapp/create-case\|subcategory` | AI | yok | G-16 | BİLİNÇLİ |
| `GET /whatsapp/convert-rate` | Kur | yok; snapshot + `/v1/fx/rate` | BF-06 | BİLİNÇLİ |
| Dev tenants/users | Dev panel | `/v1/platform/...` | G-28 | KAPANDI |
| import/export ailesi | ETL | yok — Faz 8 | G-09, G-10 | AÇIK |
| `PUT .../reorder` | Ayarlar | var | G-27 | KAPANDI |

**Query parametresi (14 Ağu):**

| Endpoint | Tracker | Verimaya | Durum |
|---|---|---|---|
| `GET /transactions` | 16 param | kind/status/category/q + tarihler/contact | G-01 KAPANDI (artıklar bilinçli) |
| `GET /appointments` | 8 param | status/q + tarihler/contact | G-05 KAPANDI; `contact_involves` AÇIK |
| `GET /audit-logs` | 7 param | actor/action/entity/from/to/q | G-13 KAPANDI |

---

## YAPILACAKLAR'a önerilen kalemler

Mevcut `docs/2026-08-03-YAPILACAKLAR.md` ile karşılaştırıldı. **Listenin kilitli öncelik sırası bozulmamalı** — bunlar sıraya sokulmak üzere öneridir, doğrudan eklenmemelidir (AGENTS.md: "Listenin dışına çıkan işe başlama").

| # | Başlık | Kabul kriteri | Öncelik | YAPILACAKLAR durumu |
|---|---|---|---|---|
| 1 | **GAP-01 — Randevu tipi CRUD sözleşme kopukluğunu kapat** | MSW kapalıyken `/settings/appointment-types` üzerinden tip eklenip silinebiliyor; `settings.controller.ts`'te POST/DELETE var; tenant izolasyon testi geçiyor | P0 | **Yeni iş** — hiçbir kalemde yok. Canlı hata |
| 2 | **GAP-02 — Üye rolü değiştirme yüzeyi** | Org sahibi `/settings/team` üzerinden bir üyenin rolünü değiştirebiliyor; kendi rolünü düşüremiyor; audit kaydı düşüyor | P0 | **Yeni iş** |
| 3 | **GAP-03 — İşlem listesi filtre seti** | `transactionListQuerySchema` `kind`, `status`, `category`, `q` kabul ediyor; API + MSW + web üçü aynı sözleşmeyi kullanıyor; `/finance` sayfasında filtre çubuğu var | P0 | **Yeni iş**. `AUDIT-F09-02` ile ilgisiz |
| 4 | **GAP-04 — Randevu arama + durum filtresi** | `GET /v1/appointments` `q` ve `status` kabul ediyor; `/appointments` sayfasında arama kutusu çalışıyor | P1 | **Yeni iş** |
| 5 | **GAP-05 — Sunucu tarafı işlem denetim motoru** | `GET /v1/reports/consistency` tüm dönem üzerinden (sayfa sınırı olmadan) kural ihlallerini döndürüyor; `/reports` ve `/settings/data-quality` bunu tüketiyor | P1 | **Kısmen var** — `AUDIT-F09-17` benzer bir "istemci tarafı O(N)" sorununu contacts için kaydetmiş; bu onun finans karşılığı |
| 6 | **GAP-06 — Silme yüzeyleri (işlem / randevu / kişi), soft-delete + audit** | Üç kaynak için `DELETE` var, soft-delete uygulanıyor, audit kaydı düşüyor, listelerden çıkıyor | P1 | **Kısmen var** — `AUDIT-F09-06` (`tenants` soft-delete + retention) aynı deseni kuruyor; birlikte gitmeli |
| 7 | **GAP-07 — Randevu operasyon metrikleri raporu** | `GET /v1/reports/appointment-metrics` tamamlanma / no-show / iptal oranı + klinik kırılımı döndürüyor; `/reports` sayfasında gösteriliyor; tenant-timezone doğru | P2 | **Yeni iş**. `AUDIT-01`'deki `tenantDayRange` altyapısını kullanmalı |
| 8 | **GAP-08 — İçe/dışa aktarım (Faz 8) kapsamını ETL eşlemesine bağla** | Faz 8 planı `ETL-ESLEME.md` §3 alan eşlemesini yeniden kullanıyor; kişi şablonu + formül enjeksiyonu sanitizasyonu kapsamda | P1 | **Zaten var** — `ayarlar.md` "Faz 8 ETL"; bu yalnız kapsam netleştirmesi |

Ayrıca **G-09/G-10 (import/export)** ve **G-20 (checklist)** için yeni kalem önerilmiyor: ikisi de mevcut faz planında (`ayarlar.md` faz eşlemesi) kayıtlı.

---

## Açık sorular

1. **Silme politikası:** işlem / randevu / kişi için hard-delete mi soft-delete mi? Mali kayıtta Türk mevzuatı 10 yıl saklama (`AUDIT-F09-06`) ile KVKK silme hakkı (`AUDIT-F09-07`) çatışıyor. Karar verilmeden G-06/G-07/G-08 yazılamaz.
2. **Tenant düzeyinde izin matrisi gerçekten isteniyor mu?** Tracker'da vardı ama kaç tenant kullandı bilinmiyor (yerel DB'de 2 tenant, 1 kullanıcı — `ETL-ESLEME.md` §1). Pilotta ölçülmeli; yoksa G-11 `skip` olur.
3. **P2P payer/payee geri gelecek mi?** `kisiler.md` "sonraki faz" diyor. Gelecekse `transactions` şeması değişir — ETL cutover'dan **önce** karar verilmesi ucuz, sonra pahalı.
4. **Randevu durumu enum mu kalacak?** `ETL-ESLEME.md` §2.3 enum'a kilitlemiş. Bir tenant kendi durumunu isterse enum → FK migrasyonu gerekir. Pilot bu soruyu cevaplayacak mı?
5. **`transaction_amounts` benzeri alan-düzeyi gizleme** (tutarları belirli rollerden saklama) sağlık turizmi acentesinde gerçek bir talep mi? `raporlar.md` "İleri (Faz 7)" listesine yazmış ama uygulanmamış.
6. **İçe/dışa aktarım ikinci müşteriden önce mi gerekli?** Pilot tek tenant + ETL ile taşınıyor. MARKET-02 kapısı geçilmeden yatırım yapılmalı mı?
7. **Checklist ölü özellik mi?** `ayarlar.md` "çoğu tenant'ta kullanılmıyor" diyor; Tracker canlı DB'de checklist tabloları **0 satır** (`ETL-ESLEME.md` §1). Tamamen `skip` yapılabilir mi?
8. **Dev panel gerçek arka uç ne zaman?** `/dev` sayfası MSW'siz çalışmıyor. Pilotta gerekmeyecekse ekran gizlenmeli — yanlış izlenim veriyor.
9. **AI prompt tenant başına özelleştirilebilir mi olmalı?** Verimaya `ai-disclosure`'ı taşımış, prompt'u taşımamış. Prompt tenant'a açılırsa çıkarım kalitesi tenant'a göre değişir — destek yükü.
10. **Kişi not thread'i (G-19) hasta not thread'inden ayrı mı kalmalı,** yoksa tek "notlar" modeli mi? Tracker ikisini ayrı tutmuş; Verimaya yalnız hasta tarafını taşımış.

---

## Ek: Verimaya'nın Tracker'a göre **iyileştirdiği** noktalar (bağlam için, gap değil)

Bu rapor tek yönlü olduğu için listelenmiyor ama gap'leri değerlendirirken akılda tutulmalı: sunucu tarafı rapor agregasyonu (`raporlar.md`'deki `limit: 50000` hatası düzeltildi), minor-unit integer para + FX snapshot, RLS + tenant izolasyon testleri, queue-first webhook, cursor sayfalama, `packages/shared` tek sözleşme kaynağı, hasta/kişi çift kayıt tarama, idempotency, object storage + presign.
