# Tracker → Verimaya Özellik Gap Analizi

Tarih: 2026-08-07

Kaynaklar:

- `docs/tracker-verimaya-sayfa-karsilastirma.md` (sayfa envanteri — başlangıç noktası)
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

1. **`DashboardPage.tsx` ölü kod DEĞİL.** `ReportsPage.tsx:33` `import { DashboardOzetContent } from './DashboardPage'` ve `ReportsPage.tsx:668` bunu Summary sekmesinde render ediyor. Rota yok ama içerik canlı. Dolayısıyla operasyon/yönetim metrikleri Tracker'da **çalışan bir özellik** — Verimaya'da karşılığı yok. Sayfa karşılaştırmasındaki "ölü kod" notu bu belgeyle düzeltilir.
2. **Verimaya'da canlı bir sözleşme kopukluğu var.** `apps/web/src/routes/settings/appointment-types/+page.svelte:37,49` `POST /v1/settings/appointment-types` ve `DELETE /v1/settings/appointment-types/:id` çağırıyor; MSW (`handlers.ts:1712,1728`) bunları karşılıyor; **gerçek NestJS controller'da yalnız `@Get('appointment-types')` var** (`settings.controller.ts:140`). MSW kapalıyken randevu tipi ekleme/silme 404 döner. Bkz. **G-30**.

---

## Özet (sayılarla)

| Kategori | Adet |
|---|---:|
| Tracker'da olup Verimaya'da **yok** (`eksik`) | 17 |
| Tracker'da derin, Verimaya'da **sade** (`sadeleşmiş`) | 10 |
| **Placeholder** (ekran var, arka uç yok) | 4 |
| **Tracker'da ölü kod** (`ölü-kod-tracker`) | 1 |
| **Bilinçli fark** (tasarım kararı — gap sayılmaz) | 9 |
| **Toplam kayıt** | 41 |

Öncelik dağılımı (bilinçli-fark hariç, 32 kalem): **P0 = 3**, **P1 = 9**, **P2 = 13**, **P3 = 5**, **skip = 2**.

`belirsiz` türünde kayıt yok — doğrulanamayan bir özellik çıkmadı. Ürün kararı gerektirenler tür olarak değil, "Açık sorular" bölümünde toplandı (10 madde).

---

## Gap tablosu (öncelikli)

Tür: `eksik` | `sadeleşmiş` | `placeholder` | `ölü-kod-tracker` | `bilinçli-fark` | `belirsiz`
Öncelik: `P0` (pilot bloğu) | `P1` (saha kullanım) | `P2` (konfor) | `P3` (ertelenebilir) | `skip`

### P0 — pilot bloğu

| ID | Modül | Özellik | Tracker kanıtı | Verimaya durumu | Tür | Öncelik | Pilot etkisi | Not |
|---|---|---|---|---|---|---|---|---|
| G-01 | Finans | İşlem listesi filtreleri (kind, category, subtitle, payment_method, status, invoice_status, q, offset, X-Total-Count) | `routers/transactions.py:176-280` — 15 query param | `list-query.ts:30-38` `transactionListQuerySchema` yalnız `patient_id, contact_id, from, to` + `.strict()` | sadeleşmiş | P0 | Saha kullanıcısı "ödenmemiş giderler" veya "şu kategori" listesini çıkaramaz; işlem arama yok | `.strict()` olduğu için ek param 400 döner — sessiz yoksayma değil, sert kırılma |
| G-02 | Ayarlar / RBAC | Üye rolü değiştirme | `routers/tenant_admin.py:64` `PATCH /members/{user_id}` | `members.controller.ts` yalnız `@Get()`; `settings/team/+page.svelte` salt-okunur rozet | eksik | P0 | Org sahibi ekip üyesinin rolünü panelden değiştiremez; DB'ye elle girmek gerekir | better-auth org API'si ile de yapılabilir; panelde yüzey yok |
| G-30 | Ayarlar | Randevu tipi ekleme / silme — web ↔ API sözleşme kopukluğu | Tracker'da tam CRUD: `tenant_appointment_settings.py:56,66,82,98` | Web POST/DELETE çağırıyor (`appointment-types/+page.svelte:37,49`), MSW karşılıyor, **gerçek API'de yalnız GET** (`settings.controller.ts:140`) | eksik | P0 | MSW kapalı ortamda randevu tipi eklenemez → 404. Pilotta ilk kurulumda çıkar | Bu bir gap değil, **canlı hata**. Doğrulama sırasında bulundu |

### P1 — saha kullanımı

| ID | Modül | Özellik | Tracker kanıtı | Verimaya durumu | Tür | Öncelik | Pilot etkisi | Not |
|---|---|---|---|---|---|---|---|---|
| G-03 | Finans | Sunucu tarafı işlem denetim motoru (8 kural) | `services/transaction_audit.py` (310 satır), `GET /transactions/audit` | Yok. `reports/+page.svelte:355-405` istemcide 6 basit kural | sadeleşmiş | P1 | Kategori↔case, kişi tipi, sorumlu kişi tutarsızlıkları yakalanmaz | Tracker kuralları: `case_required`, `case_forbidden`, `contact_type_mismatch`, `responsible_not_internal`, `contact_equals_responsible`, `personal_payer_payee_required`, `currency_equivalent_missing`, `partial_amount_out_of_range` |
| G-04 | Finans | Kaydedilmemiş taslak için canlı uyarı | `POST /transactions/audit-draft` (`transactions.py:383`) | Yok | eksik | P1 | Hata kayıttan sonra fark edilir, form doldururken değil | G-03 ile aynı motor; ayrı endpoint |
| G-05 | Randevular | Randevu listesi filtreleri: `status_id`, `q` (not/kişi adı/tarih), `contact_involves` | `routers/appointments.py:138-205` | `appointmentListQuerySchema` yalnız `patient_id, from, to` | sadeleşmiş | P1 | Randevu arama yok; "bu klinikteki randevular" sorgulanamaz | `contact_involves` ana/klinik/otel/transfer rollerinin hepsinde arıyor |
| G-06 | Randevular | Randevu silme | `DELETE /appointments/{id}` (`appointments.py:376`) | Controller'da `@Delete` yok | eksik | P1 | Yanlış açılan randevu kapatılamaz (yalnız `cancelled` durumu) | Soft-delete tercihi olabilir — bkz. Açık sorular |
| G-07 | Finans | İşlem silme | `DELETE /transactions/{id}` (`transactions.py:588`) | Controller'da `@Delete` yok | eksik | P1 | Hatalı işlem kaydı düzeltilemez, yalnız üzerine yazılır | Mali kayıt için soft-delete + audit doğru tasarım olabilir |
| G-08 | Kişiler | Kişi silme | `DELETE /contacts/{id}` (`tenant_contacts.py:443`) | Yok | eksik | P1 | Yanlış kişi kaydı kalıcı | Merge var, delete yok |
| G-09 | İçe/dışa aktarım | Bundle içe/dışa aktarım (cases / appointments / transactions) — şablon, export, dry-run önizleme, commit | `routers/tenant_import_export.py` (1482 satır); `GET bundle/template.xlsx`, `bundle/export.xlsx`, `POST bundle/import/dry-run`, `bundle/import/commit` | `settings/import-export/+page.svelte` (29 satır) — "Faz 8'de" | placeholder | P1 | Pilot müşteri mevcut Excel'ini taşıyamaz; veri girişi elle | YAPILACAKLAR'da Faz 8 olarak **zaten planlı** |
| G-10 | İçe/dışa aktarım | Kişi içe/dışa aktarım (26 sütunluk şablon + legacy başlık eşleme) | `tenant_import_export.py:1255-1420`, `CONTACT_HEADERS` | Yok | placeholder | P1 | GHL/Excel'den kişi dizini taşınamaz | Legacy başlıkları da tanıyan eşleyici var (`CONTACT_LEGACY_HEADERS`) |
| G-11 | Ayarlar / RBAC | Tenant düzeyinde düzenlenebilir izin matrisi (9 özellik × 5 rol) | `GET/PATCH /permissions` (`tenant_admin.py:203,214`); `SettingsPermissionsPage.tsx:12-32`; `deps/rbac.py` view/edit ayrımı | `auth/permissions.ts` — kodda sabit 3 kaynak (`patient`, `finance`, `settings`) × 6 rol; tenant değiştiremez | sadeleşmiş | P1 | "Bu personel tutarları görmesin" gibi tenant-özel talep karşılanamaz | `transaction_amounts`, `case_finance_detail`, `panel_finance_kpis` gibi ince ayarlar yok. **YAPILACAKLAR AUDIT-F09-02 ile kısmen örtüşür** |

### P2 — konfor

| ID | Modül | Özellik | Tracker kanıtı | Verimaya durumu | Tür | Öncelik | Pilot etkisi | Not |
|---|---|---|---|---|---|---|---|---|
| G-12 | Raporlar | Operasyon + yönetim dashboard metrikleri | `DashboardPage.tsx:352` `DashboardOzetContent`, `ReportsPage.tsx:668` Summary sekmesi | Yok — `/reports` finans + hasta dağılımı + kaynak kırılımı | eksik | P2 | Klinik performansı, no-show/iptal oranı, aylık randevu trendi, vaka türü dağılımı görülemez | **Canlı özellik** (ölü kod değil) — bkz. Doğrulama notu 1 |
| G-13 | Ayarlar | Denetim kaydı filtreleri (`actor_user_id`, `action`, `entity_type`, `entity_id`, `created_from/to`) | `routers/audit_logs.py:39-62` | `audit-logs.controller.ts` yalnız `cursor` + `limit` | sadeleşmiş | P2 | "Bu kaydı kim değiştirdi" sorusu elle taranarak cevaplanır | KVKK/denetim talebinde iş yükü |
| G-14 | Ayarlar | Sunucu tarafı veri kalitesi raporu | `GET /whatsapp/data-quality` (`whatsapp_import.py:769`) — SQL agregasyon, günlük özet + eksik alan | `settings/data-quality/+page.svelte` — sayfalı `transactions` listesi üzerinden istemcide | sadeleşmiş | P2 | Büyük tenant'ta yalnız ilk sayfa denetlenir → yanlış "temiz" sonucu | `raporlar.md` "istemci aggregate" hatasını zaten taşınmayacak diye işaretlemiş; ama sunucu karşılığı da yazılmamış |
| G-15 | WhatsApp AI | AI düzeltme raporu agregasyonu (alan bazlı hata sıklığı + tekrar sayısı) | `GET /whatsapp/corrections-report` (`whatsapp_import.py:686`); `SettingsAiReportPage.tsx` Alan/AI değeri/Düzeltilen/**Tekrar**/Tarih | `GET /v1/whatsapp/corrections` düz liste; `settings/ai-learning/+page.svelte` yalnız Alan/Düzeltme | sadeleşmiş | P2 | "AI en çok hangi alanda yanılıyor" ölçülemez → prompt iyileştirme körlemesine | Ham veri var, agregasyon yok |
| G-16 | WhatsApp AI | İçe aktarım ekranından satır içi kayıt oluşturma (kişi / case / kategori / alt kategori) | `POST /whatsapp/create-contact`, `create-case`, `create-category`, `create-subcategory` (`whatsapp_import.py:544-685`) | Taslak onayında satır içi oluşturma yok | sadeleşmiş | P2 | Yeni kişi/kategori için ayrı sayfaya gidip geri dönmek gerekir — akış kopar | Günlük WhatsApp aktarımında sık karşılaşılan durum |
| G-17 | Kişiler | Toplu kişi tür atama | `PATCH /contacts/bulk-type` (`tenant_contacts.py:212`); `ContactsPage.tsx` "Bulk type" | Yok | eksik | P2 | İçe aktarma sonrası 200 kişinin türü tek tek düzeltilir | G-10 ile birlikte anlamlı |
| G-18 | Kişiler | Kişi türü yeniden adlandırma | `PATCH /contact-types/{id}` (`tenant_contacts.py:104`) | `settings.controller.ts` yalnız `@Get`, `@Post`, `@Delete('contact-types/:id')` | eksik | P2 | Tür adı düzeltmek için sil + yeniden oluştur → bağlı kişiler etkilenir | Küçük ama tuzaklı |
| G-19 | Kişiler | Kişiye bağlı not thread'i | `GET/POST/DELETE /contacts/{id}/case-notes` (`tenant_contacts.py:281-386`) | Yalnız hasta not thread'i (`patients` `case-notes`); kişide tek `notes` alanı | eksik | P2 | Klinik/otel ile yazışma geçmişi tutulamaz | `ContactCaseNotesThread.tsx` Tracker'da mevcut |
| G-20 | Randevular | Randevu checklist şablonları + randevu başına ilerleme | `tenant_appointment_settings.py:185-263` CRUD + reorder; `PATCH /appointments/{id}/checklist/{item}` (`appointments.py:349`) | `settings/appointment-types/+page.svelte:60,105` "Checklist şablonları Faz 1" | placeholder | P2 | Operasyon adımları takip edilemez | `ayarlar.md`: "checklist çoğu tenant'ta kullanılmıyor" → düşük değer notu var |
| G-21 | Randevular | Randevu listesi agregat istatistikleri (`type_counts`, `status_counts`) | `appointments.py:198-205` `AppointmentStats` | Yok | eksik | P2 | Liste başında "kaç planlı / kaç tamamlandı" özeti yok | Ucuz kazanç |
| G-22 | Hastalar | Case ↔ işlem otomatik bağlama | `POST /cases/{id}/auto-link-transactions` (`cases.py:106`) | Yok | eksik | P2 | Kişi üzerinden girilmiş işlemler hastaya elle bağlanır | ETL sonrası tek seferlik değeri yüksek |
| G-23 | Dosyalar | Dosya silme | `DELETE /cases/{id}/files/{id}`, `/appointments/{id}/files/{id}` (`case_files.py:251,396`) | Yok — `dosyalar.md` "silme endpoint'i" eksik listesinde | eksik | P2 | Yanlış yüklenen belge kaldırılamaz (KVKK açısından önemli) | `dosyalar.md`'de zaten "İleri (Faz 1)" olarak yazılı |
| G-24 | Dosyalar | Satır içi güvenli önizleme (MIME allowlist) | `case_files.py:44` `_inline_safe_mime`, `_safe_preview_response` — PDF/görsel inline, gerisi zorunlu indirme | Yalnız `attachment` indirme (`patients.controller.ts:180-183`); `nosniff` var, inline yok | sadeleşmiş | P2 | Pasaport/onam görüntülemek için her belge indirilir | `dosyalar.md` "önizleme MIME allowlist korunur" diyor — karar var, uygulama yok |

### P3 — ertelenebilir

| ID | Modül | Özellik | Tracker kanıtı | Verimaya durumu | Tür | Öncelik | Pilot etkisi | Not |
|---|---|---|---|---|---|---|---|---|
| G-25 | Ayarlar | Kapsamlı veri silme (`data/delete-scope`) + operasyonel wipe (`data/wipe`), org adı yazarak onay | `tenant_admin.py:102,132` | Yok | eksik | P3 | Test verisi temizliği elle SQL | `ayarlar.md`: "Import/export Ayarlar içinde karmaşık ve **tehlikeli** (toplu silme)" → dikkatli taşınmalı |
| G-26 | Ayarlar | AI prompt özelleştirme (`GET/POST/DELETE /ai-prompt`) | `routers/ai_settings.py:38,53,72` | Yok (`ai-disclosure` var, prompt yok) | eksik | P3 | Tenant AI çıkarım promptunu ayarlayamaz | `ayarlar.md` Faz 3 diyor; disclosure taşınmış, prompt taşınmamış |
| G-27 | Ayarlar | Kategori / randevu tipi / durum / checklist sıralama (`PUT .../reorder`) | 4 ayrı reorder endpoint | `sort_order` alanı şemada var, `PATCH` ile tek tek yazılabilir; toplu reorder yok | sadeleşmiş | P3 | Sürükle-bırak sıralama yok | Kısmen karşılanıyor |
| G-28 | Geliştirici | Dev panel gerçek arka uç | `routers/dev_panel.py` (262 satır) — org CRUD + kullanıcı ekle/çıkar, e-posta allowlist | `/dev` sayfası `/v1/dev/tenants` çağırıyor; **yalnız MSW'de** (`handlers.ts:1804+`), NestJS'te modül yok | placeholder | P3 | MSW kapalıyken `/dev` boş | `dev-panel.md`: "Gerçek erişim: Faz 0b süper-admin" — henüz yok |
| G-29 | Randevular | Eksik iletişim bilgisi uyarısı (`contact_info_incomplete` → "Check the details!") | `appointments.py:82` | Yok | eksik | P3 | Randevu öncesi eksik telefon/e-posta fark edilmez | Küçük UX kazancı |

### skip — taşınmaması önerilir

| ID | Modül | Özellik | Tracker kanıtı | Verimaya durumu | Tür | Öncelik | Not |
|---|---|---|---|---|---|---|---|
| G-31 | Hastalar | Kişilerden toplu case oluşturma / toplu auto-link | `cases.py:135,183` — `require_dev_user` ile korunuyor | Yok | eksik | skip | Tracker'da bile **dev-only tek seferlik migrasyon aracı**; ETL bunu zaten kapsıyor |
| G-32 | Ayarlar | Etiketler (Tags) | `SettingsTagsPage.tsx` (16 satır) — "will be added later" | Yok | ölü-kod-tracker | skip | `ayarlar.md`: "Tags hiç doldurulmadı → taşınmaz" — karar zaten verilmiş |

---

## Modül bazlı detay

### Hastalar / vakalar

**G-22 — Case ↔ işlem otomatik bağlama**
Bir hastanın bağlı olduğu kişi (`contact_id`) üzerinden girilmiş, henüz hastaya bağlanmamış işlemleri tek çağrıda hastaya bağlar.
- Tracker: `backend/app/routers/cases.py:106` `auto_link_transactions` — `contact_id`, `payer_contact_id`, `payee_contact_id` üçünden biri eşleşen ve `case_id IS NULL` olan işlemleri toplu `UPDATE` eder, `{"updated": n}` döner.
- Verimaya: karşılığı yok. İşlem hastaya yalnız oluşturma/düzenleme anında bağlanıyor.
- Bağımlılık: `transactions.patient_id` (var), P2P alanları (yok — G-33'e bakınız; `contact_id` tek başına yeterli).
- Öneri: **taşı** (basitleştirilmiş: yalnız `contact_id` eşleşmesi). ETL sonrası değeri yüksek, tek endpoint.

**G-31 — Toplu case oluşturma / toplu auto-link**
- Tracker: `cases.py:135,183`, ikisi de `Depends(require_dev_user)` — yani tenant kullanıcısına açık değil.
- Öneri: **taşıma.** ETL boru hattı (`ETL-ESLEME.md` §3.2) aynı işi yapıyor.

### Kişiler

**G-08 / G-17 / G-18 / G-19** — sırasıyla kişi silme, toplu tür atama, tür yeniden adlandırma, kişi not thread'i.
- Tracker: `routers/tenant_contacts.py` — `:443` delete, `:212` bulk-type, `:104` type patch, `:281-386` case-notes CRUD.
- Verimaya: `contacts.controller.ts` `@Get, @Get('duplicate-groups'), @Post('merge'), @Get(':id'), @Post(), @Patch(':id')` — delete yok. `settings.controller.ts` contact-types'ta patch yok. `apps/api/src/contacts/` altında case-note yok.
- Bağımlılık: G-19 için `contact_note_messages` benzeri tablo + shared şema (`case-note.ts` hasta için var, kişiye genelleştirilebilir).
- Öneri: G-08 **yeniden tasarla** (soft-delete + audit, hard-delete değil — `dosyalar.md`'deki yetim kayıt dersine uygun). G-17, G-18 **taşı** (ucuz). G-19 **ertele** — pilot geri bildirimi beklensin.

**Duplicate / merge:** Tracker `find_duplicate_contact_groups` + `merge_contacts` → Verimaya'da `duplicate-groups` + `merge` olarak **taşınmış ve genişletilmiş** (hasta tarafı da eklenmiş). Gap yok. Not: YAPILACAKLAR **AUDIT-F09-17** bu özelliğin O(N) bellek sorununu zaten kaydetmiş.

### Randevular

**G-05 — filtre seti.** Tracker `routers/appointments.py:138-205`: `case_id`, `contact_id`, `contact_involves`, `date_from/to`, `status_id`, `q`, `page`, `page_size`. `q` özel: metin araması dışında `YYYY-MM-DD` veya `Gün.Ay.Yıl` yazılırsa randevu gününe de bakıyor. Verimaya `list-query.ts:21-27`: `patient_id`, `from`, `to`, cursor, limit. Öneri: **taşı** — en azından `q` + `status`.

**G-06 — silme.** Tracker `DELETE /appointments/{id}`. Verimaya'da yok. Öneri: **yeniden tasarla** (soft-delete). `dosyalar.md` zaten "randevu silinince dosyalar hastada kalır (`appointment_id` null)" kararını vermiş — silme geldiğinde bu davranış uygulanmalı.

**G-20 — checklist.** Tracker'da tam altyapı: şablon CRUD + reorder (`tenant_appointment_settings.py:185-263`), randevu başına ilerleme (`appointments.py:349` `patch_appointment_checklist_item`), `appointment_checklist_progress` + `appointment_checklist_template` tabloları. Verimaya: ekranda "Faz 1" notu, şemada iz yok (`grep checklist` → yalnız Trust Score checklist'i, ilgisiz). Öneri: **ertele** — `ayarlar.md` düşük kullanım notu var, pilot doğrulasın.

**G-21 — liste istatistikleri.** `AppointmentStats(type_counts, status_counts)` sayfalı listede dönüyor. Öneri: **taşı**, tek SQL `GROUP BY`.

**Randevu tipi/durum modeli — bkz. Bilinçli farklar.** Ancak G-30 (tip CRUD'un API'de olmaması) bilinçli fark değil, hata.

### Finans / işlemler / P2P

**G-01 — filtre seti (P0).** En büyük tek gap. Tracker `routers/transactions.py:176-280` şu parametreleri alıyor:

`from`, `to`, `kind`, `category`, `subtitle`, `payment_method`, `status`, `case_id`, `contact_id`, `involving_contact_id`, `responsible_party`, `q`, `invoice_status`, `limit`, `offset`, `with_total` (→ `X-Total-Count` header).

Verimaya `transactionListQuerySchema` (`list-query.ts:30-38`) yalnız 4 filtre + cursor/limit, üstelik `.strict()` — tanımsız parametre 400 döner. UI tarafında da `finance/+page.svelte` içinde filtre kontrolü yok (yalnız URL'den gelen `?hasta=`).

- Bağımlılık: `packages/shared/src/list-query.ts` (sözleşme önce burada değişir — AGENTS.md ilke 7), sonra `transactions.controller.ts` + `transactions.service.ts` + MSW handler + web UI.
- Öneri: **taşı.** Minimum pilot seti: `kind`, `status`, `category`, `q`. `responsible_party` taşınmaz (bkz. bilinçli fark BF-04).

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
- **Frankfurter canlı kur:** bilinçli olarak atıldı (BF-06).

Verimaya'nın GHL / Meta / Google Ads / n8n entegrasyonları Tracker'da yok — kapsam dışı.

### Diğer

- **Mobil menü sayfası** (`/menu`, `MobileMenuPage.tsx` 235 satır) → Verimaya `AppShell` + `CommandPalette` ile karşılanıyor. Gap yok (BF-02).
- **`SelectTenantPage`** → `AppShell` org menüsü (BF-01).
- **G-28 dev panel** — ekran var, gerçek API yok (yalnız MSW).

---

## Bilinçli farklar (eksik sayma)

| ID | Konu | Karar kaynağı |
|---|---|---|
| BF-01 | `/select-tenant` ayrı sayfası → `AppShell` org menüsü + login akışı | Sayfa karşılaştırması; mimari sadeleştirme |
| BF-02 | `/menu` mobil menü sayfası → responsive sidebar + `CommandPalette` | aynı |
| BF-03 | `/whatsapp-import` + `/whatsapp-inbox` → tek `/finance/ai-transaction` | Sayfa karşılaştırması; akış iyileştirmesi |
| BF-04 | `responsible_party` (serbest metin + preset karışımı) kaldırıldı | `raporlar.md`: "`responsible_party` serbest metin + sabit preset karışımı — Contact modeliyle örtüşüyor"; `ayarlar.md` madde 5 |
| BF-05 | P2P `payer/payee` çifti → `contact_id` + `kind` üzerinden net bakiye | `kisiler.md`: "Erteleme: P2P payer/payee rolleri… sonraki faz" — **ertelendi, iptal değil** |
| BF-06 | Canlı kur çevirici (Frankfurter, `GET /whatsapp/convert-rate`) kaldırıldı; snapshot `amount_base` | `doviz.md`: "Raporlar snapshot ile bazda toplanır; **canlı kur yok**"; "Tracker hataları: GBP hardcode" |
| BF-07 | Randevu **durumları** tenant-CRUD → sabit enum (6 değer) | `ETL-ESLEME.md` §2.3 — 5 Tracker durumu enum'a eşlenmiş, `in_progress` eklenmiş |
| BF-08 | Google Drive depolama → S3-uyumlu object storage + presign | `dosyalar.md` "Legacy hataları" 1–5 + "Verimaya modeli" tablosu |
| BF-09 | `case-expenses` / `patients` legacy ikiliği → tek `patients`; Tags modülü | `case-expenses.md` madde 6; `ayarlar.md` madde 2 |

**Not — BF-05 ve BF-07 kalıcı karar değil:** ikisi de "ertelendi" olarak yazılmış. P2P açık payer/payee'ye dönülürse `transactions` şeması değişir; randevu durumu tenant-CRUD'a dönerse enum → FK migrasyonu gerekir. Bugün gap sayılmıyor ama **geri dönülemez karar değil** — pilot verisi izlensin.

---

## API yüzey gap'i (kısa)

Tracker FastAPI endpoint'lerinden `packages/shared/src/api.ts` `apiPaths` içinde karşılığı **olmayanlar**:

| Tracker endpoint | Domain | Verimaya karşılığı | Gap ID |
|---|---|---|---|
| `PATCH /members/{user_id}` | Üyeler | yok (`GET /v1/members` var) | G-02 |
| `GET/PATCH /permissions` | RBAC | yok | G-11 |
| `POST /data/delete-scope`, `POST /data/wipe` | Tenant verisi | yok | G-25 |
| `DELETE /transactions/{id}` | Finans | yok | G-07 |
| `GET /transactions/audit`, `POST /transactions/audit-draft` | Finans | yok | G-03, G-04 |
| `DELETE /appointments/{id}` | Randevu | yok | G-06 |
| `PATCH /appointments/{id}/checklist/{item}` | Randevu | yok | G-20 |
| `GET/POST/PATCH/DELETE /appointment-statuses` (+ reorder) | Ayarlar | yok — enum | BF-07 |
| `POST/PATCH/DELETE /appointment-types` (+ reorder) | Ayarlar | **web çağırıyor, API'de yalnız GET** | G-30 |
| `GET/POST/PATCH/DELETE /appointment-checklist` (+ reorder) | Ayarlar | yok | G-20 |
| `DELETE /contacts/{id}` | Kişiler | yok | G-08 |
| `PATCH /contacts/bulk-type` | Kişiler | yok | G-17 |
| `PATCH /contact-types/{id}` | Ayarlar | yok (POST + DELETE var) | G-18 |
| `GET/POST/DELETE /contacts/{id}/case-notes` | Kişiler | yalnız hasta tarafı | G-19 |
| `POST /cases/{id}/auto-link-transactions` | Hastalar | yok | G-22 |
| `POST /cases/bulk-create-from-contacts`, `bulk-auto-link-transactions` | Hastalar | yok (dev-only) | G-31 (skip) |
| `DELETE /cases/{id}/files/{id}`, `/appointments/{id}/files/{id}` | Dosyalar | yok | G-23 |
| `GET .../files/{id}/preview` | Dosyalar | yalnız `download` (attachment) | G-24 |
| `GET/POST/DELETE /ai-prompt` | Ayarlar | yok (`ai-disclosure` var) | G-26 |
| `GET /whatsapp/corrections-report` | AI | düz liste var, agregasyon yok | G-15 |
| `GET /whatsapp/data-quality` | Veri kalitesi | yok — istemci tarafı | G-14 |
| `POST /whatsapp/create-contact|case|category|subcategory` | AI | yok | G-16 |
| `GET /whatsapp/convert-rate` | Kur | yok | BF-06 (bilinçli) |
| `GET/POST/PATCH/DELETE /tenants`, `/tenant-users` (dev) | Dev panel | yalnız MSW | G-28 |
| `GET /transactions/p2p-net-summary` | Finans | `GET /v1/reports/balances` — **karşılanıyor** | — |
| import/export ailesi (8 endpoint) | ETL | yok — Faz 8 | G-09, G-10 |
| `PUT .../reorder` (4 adet) | Ayarlar | `sort_order` PATCH ile kısmen | G-27 |

**Query parametresi gap'i** (endpoint var, yüzey dar):

| Endpoint | Tracker parametreleri | Verimaya | Gap |
|---|---|---|---|
| `GET /transactions` | 16 param | 6 (`.strict()`) | G-01 |
| `GET /appointments` | 8 param | 5 | G-05 |
| `GET /audit-logs` | 7 param | 2 | G-13 |

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
