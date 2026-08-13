# Tracker → Veri Maya Sayfa Karşılaştırması

Kaynaklar:
- **Tracker:** `fixrav-tracker/frontend/src/App.tsx` + `src/routes/**` (React Router)
- **Veri Maya:** `verimaya/apps/web/src/routes/**` (SvelteKit)

Tarih: 7 Ağustos 2026

---

## 1. Kimlik / Giriş

| Sayfa Adı | Tracker | Veri Maya |
|---|---|---|
| **Giriş** | `/login` (LoginPage, 137 satır) | `/login` (321 satır) |
| ↳ Özellikler | E-posta + şifre, dev ortamda `SEED_DEV_PASSWORD` ipucu | E-posta + şifre, **kayıt olma** (organizasyon adı + slug), **doğrulama kodu** akışı, org oluşturma |
| **Organizasyon Seçimi** | `/select-tenant` (73 satır) — ayrı sayfa | ✗ Ayrı sayfa yok — login akışına ve `AppShell` içindeki org menüsüne taşındı |
| ↳ Özellikler | Org listesi, "Choose organization" | Login sonrası otomatik / sidebar org değiştirici |

---

## 2. Ana Modüller

| Sayfa Adı | Tracker | Veri Maya |
|---|---|---|
| **Hastalar / Vaka Giderleri** | `/case-expenses` (PatientsPage, 753 satır) | `/patients` (172 satır) |
| ↳ Özellikler | Vaka listesi, arama, "Case name" seçimi + serbest ad girişi, notlar, satır içi düzenleme, tenant'a göre "patient/case" etiketi | Hasta listesi, "Yeni hasta" dialogu, **Durum**, **Kaynak**, Telefon, Güncelleme kolonları, "Çift kayıt tara" butonu |
| **Hasta Detay** | `/case-expenses/:patientId` (PatientDetailPage → PatientDetailContent) | `/patients/[id]` (510 satır) |
| ↳ Özellikler | Vaka bilgisi, bağlı işlemler, dosyalar (CaseFiles), vaka notu thread'i | Finans özeti (gelir/gider), Telefon/E-posta/Kaynak/Oluşturulma, Notlar, **Randevular bloğu** (+ takvim linki, yeni randevu), **İşlemler bloğu** (+ yeni işlem), dosya paneli, vaka notu thread'i, Düzenle dialogu |
| **Hasta Çift Kayıt** | ✗ Yok | `/patients/duplicates` (16 satır, `DuplicateScanPanel`) |
| ↳ Özellikler | — | Benzer hasta kayıtlarını tara ve birleştir |
| **Legacy Yönlendirme** | `/patients` → `/case-expenses`, `/patients/:id` → LegacyPatientRedirect | ✗ Gerek yok (kavram baştan `patients` olarak isimlendirildi) |

---

## 3. Kişiler

| Sayfa Adı | Tracker | Veri Maya |
|---|---|---|
| **Kişiler** | `/contacts` (ContactsPage, **1281 satır**) | `/contacts` (185 satır) |
| ↳ Özellikler | Arama, Tür filtresi, Ad/Tür/İletişim/Kullanım kolonları, **"Duplicate records" sekmesi sayfa içinde**, toplu tür atama (Bulk type), birleştirme (Target contact), ekleme/düzenleme formu (Ad, Soyad, Tür, E-posta, Telefon) | Arama, "Tüm türler" filtresi, Yeni kişi dialogu, Düzenle — **çift kayıt ayrı sayfaya taşındı** |
| **Kişi Detay** | `/contacts/:partyId` (ContactProfilePage, 673 satır) | `/contacts/[id]` (225 satır) |
| ↳ Özellikler | Tür, E-posta, Telefon, Kullanım, Vaka notu, kişiye ait randevular, kişiye ait işlemler, yetki kontrolü | Telefon, E-posta, Kullanım, Notlar, **Bağlı hasta**, **Finans özeti** (gelir/gider + Bakiyeler linki), **Randevulardaki roller** (klinik / otel / transfer), Düzenle |
| **Kişi Çift Kayıt** | Sayfa içi sekme | `/contacts/duplicates` (16 satır) — ayrı sayfa |

---

## 4. Randevular

| Sayfa Adı | Tracker | Veri Maya |
|---|---|---|
| **Randevular** | `/appointments` (**2170 satır**) | `/appointments` (332 satır) |
| ↳ Özellikler | Arama, tarih/varış sıralaması (3 mod), durum seçimi, checklist, taraf slotları (klinik/otel/transfer), sonsuz kaydırma, satır içi düzenleme + silme, detay açılır paneli | "Yeni randevu" dialogu, **Hasta filtresi**, **Operasyon listesi** (`AppointmentOpsList`), durum rozetleri |
| **Randevu Detay** | `/appointments/:appointmentId` (249 satır) — ayrı sayfa | ✗ Ayrı sayfa yok — `AppointmentFormDialog` içinde |

---

## 5. Finans

| Sayfa Adı | Tracker | Veri Maya |
|---|---|---|
| **İşlemler** | `/transactions` (**2186 satır**) | `/finance` (304 satır) |
| ↳ Özellikler | Gelir/Gider filtresi, ödeme durumu (Paid/Partial/Unpaid/Pending), ödeme yöntemi, fatura durumu (Issued/Not issued), **kişiden kişiye ödeme (P2P)**, kategori/alt kategori, dönem filtresi, satır içi düzenleme, arama | Tarih / Başlık / Durum / Tutar kolonları, "Yeni işlem" dialogu (`TransactionFormDialog`), durum rozetleri, dönem filtresi |
| **P2P Net Bakiyeler** | `/transactions/p2p-net` (162 satır) | `/finance/balances` (92 satır) |
| ↳ Özellikler | Kişiler arası net borç/alacak tablosu, yetki kontrolü | Aynı — net bakiye listesi, "Borçlu" göstergesi |
| **AI / WhatsApp İşlem** | `/whatsapp-import` (**1635 satır**) + `/whatsapp-inbox` (246 satır) — **2 ayrı sayfa** | `/finance/ai-transaction` (437 satır) — **tek sayfa** |
| ↳ Özellikler | **Import:** mesaj yapıştır → AI ayrıştır, Tip/Tutar/Para birimi/Tarih/Ödeme yöntemi, Ham AI çıktısı, **Fark tablosu** (AI değeri vs şu an), yeni kişi/kategori/alt kategori/case oluşturma. **Inbox:** gelen mesaj kuyruğu, durumlar (Yeni/Ayrıştırıldı/Hata/Onaylandı/Yoksayıldı), işle/yoksay | Yapıştır + ayrıştır, **bekleyen kuyruk (pending inbox)** aynı sayfada, medya desteği, taslak kartları (`TransactionDraftCard`), toplu onay, işle/yoksay |

---

## 6. Raporlar & Analiz

| Sayfa Adı | Tracker | Veri Maya |
|---|---|---|
| **Raporlar** | `/reports` (1292 satır) — uygulamanın ana sayfası | `/reports` (**1186 satır**) |
| ↳ Özellikler | Özet + Kategori sekmeleri, kategori raporları, gelir/gider filtresi, sorumlu taraf kırılımı, işlem listesi, işlem düzenleme | Dönem seçici, **Aylık gelir/gider grafiği**, **Hasta durum dağılımı**, **Kaynak dağılımı**, **Tutarlılık uyarıları**, **Pazarlama raporu: Gerçek ROAS + Hasta başı maliyet**, **Kaynak kırılımı** (Kaynak/Lead/Kapalı/Tahsilat), kategori & alt kategori kırılımı |
| **Dashboard** | `DashboardPage.tsx` (807 satır) — ayrı rotası yok (`/dashboard` → `/reports`), ama **içeriği canlı**: `ReportsPage.tsx:33,668` `DashboardOzetContent`'i Summary sekmesinde render ediyor | ✗ Ayrı sayfa yok; operasyon metrikleri de taşınmadı |
| ↳ Özellikler | Operasyon (aylık randevu trendi), Yönetim (tamamlanma / no-show / iptal oranı, klinik performansı, vaka türü dağılımı), Finans (toplam gelir/gider/net kâr, top-5 gider & gelir kategorisi), P2P ödenmemiş borçlar | Raporlar sayfasında kısmen karşılanıyor — **randevu/klinik operasyon metrikleri henüz taşınmadı** |
| **Yapay Zeka Karnesi (Scorecard)** | ✗ Yok | `/scorecard` (428 satır) + `/scorecard/compare` (99 satır) |
| ↳ Özellikler | — | Ölçüm oluşturma, boyut bazlı skorlama, **otomatik doldurma**, N/A rozeti, çalışan sayısı, olgunluk bandı, geçmiş ölçümler, **dönemler arası karşılaştırma** |

---

## 7. Pazarlama Araçları (Veri Maya'ya özel)

| Sayfa Adı | Tracker | Veri Maya |
|---|---|---|
| **Pazarlama Hub** | ✗ Yok | `/marketing` (85 satır) — 6 araç kartı |
| **Hesap (Birim Ekonomi)** | ✗ Yok | `/marketing/calculator` (218 satır) |
| ↳ Özellikler | — | Platform ROAS, satış fiyatı, operasyon maliyeti, komisyon, platform ek ücreti, hedef net marj → **Katkı payı, Gerçek ROAS, Başabaş ROAS, İma edilen reklam maliyeti, Müşteri başı net kâr, Maks. reklam maliyeti** |
| **Simülatör** | ✗ Yok | `/marketing/simulator` (404 satır) |
| ↳ Özellikler | — | CPC, tık→lead, lead→satış, satış başı katkı, sabit maliyet → **huni sağlığı** (uçtan uca oran, lead maliyeti, zarar eşiği, uygulanabilirlik), **başabaş satış/ay, gerekli bütçe/tık**, **ölçek & darboğaz analizi** |
| **Uyumluluk** | ✗ Yok | `/marketing/compliance` (113 satır) |
| ↳ Özellikler | — | Reklam / landing metnini riskli terimlere karşı tarar, bulgu listesi, varsayılan terim sözlüğü |
| **Ölçüm Olgunluğu** | ✗ Yok | `/marketing/measurement` (244 satır) |
| ↳ Özellikler | — | Kontrol listesi, kayıtlı checklist, **0–100 toplam skor** |
| **Yayın Öncesi Kontrol** | ✗ Yok | `/marketing/pre-launch` (327 satır) |
| ↳ Özellikler | — | Uyumluluk + birim ekonomi + ölçüm eşiği tek ekranda → **"Yayına hazır" / "eksikler var"** kararı (uyarı, engel değil) |
| **Şablonlar** | ✗ Yok | `/marketing/templates` (205 satır) |
| ↳ Özellikler | — | **UTM oluşturucu** (base URL, campaign, source, medium, content, term), **bütçe dağıtımı** (Prospecting / Remarketing / Test) |

---

## 8. Ayarlar

| Sayfa Adı | Tracker | Veri Maya |
|---|---|---|
| **Ayarlar Ana** | `/settings` (SettingsHub, 173 satır) | `/settings` (186 satır) |
| ↳ Özellikler | Kart listesi, `SettingsLayout` + `SettingsBackLink` | Kart listesi (`card.title`), geri linki |
| **Kullanıcılar / Ekip** | `/settings/users` (159 satır) | `/settings/team` (100 satır) |
| ↳ Özellikler | E-posta, Görünen ad, Rol; admin-only | Üye listesi, rol, **Katılım tarihi** |
| **İzinler / Erişim** | `/settings/permissions` (254 satır) | `/settings/access` (80 satır) |
| ↳ Özellikler | Off / View / Edit / Admin seviyeleri, "Management" grubu, modül bazlı matris | İzin listesi (daha sade) |
| **Kategoriler** | `/settings/categories` (358) + `/settings/categories/:id` (421) — **2 sayfa** | `/settings/categories` (201 satır) — **tek sayfa** |
| ↳ Özellikler | Kategori listesi + ayrı detay sayfasında alt kategori yönetimi | Gelir/Gider tipi, **alt kategoriler satır içi (accordion)**, boş durum "İlk kategoriyi ekle" |
| **Randevu Ayarları** | `/settings/appointments` (641 satır) | `/settings/appointment-types` (111 satır) |
| ↳ Özellikler | Randevu tipleri, **randevu durumları**, randevu checklist şablonları — hepsi CRUD | Tipler + Checklist şablonları — **durum yönetimi henüz yok** |
| **Kişi Türleri** | `/settings/contacts` (242 satır) | `/settings/contact-types` (110 satır) |
| ↳ Özellikler | Tür CRUD, "kullanımdaki türler silinemez" | Tür listesi + CRUD |
| **Organizasyon / Sistem** | `/settings/system-settings` (SettingsPatientEntityPage, 106 satır) | `/settings/organization` (185 satır) |
| ↳ Özellikler | Temel para birimi (GBP/TRY/EUR/USD), patient/case varlık adı | **Firma adı**, varsayılan para birimi, **Tenant bilgisi** (Slug, Oluşturulma), Ekip linki |
| **Veri Kalitesi** | `/settings/data-quality` (503 satır) | `/settings/data-quality` (232 satır) |
| ↳ Özellikler | Dönem filtresi (7 gün / 30 gün / bu ay / tümü), tür & para birimi filtresi, eksik alan tablosu, tekrar tespiti | **Eksik kategori**, **Kur bilgisi eksik** (+Düzelt), **Eksik bağlantı** (+Düzelt), **Mükerrer şüphe** (aynı tutar+tarih+tür+kur), **kişi/hasta çift kayıt linkleri**, Raporlar→tutarlılık linki |
| **AI Ayarları** | `/settings/ai-settings` (216 satır) | `/settings/ai` (172 satır) |
| ↳ Özellikler | AI sağlayıcı / model ayarları | AI ayarları + **AI kullanım açıklaması (disclosure)** bloğu |
| **AI Öğrenme Raporu** | `/settings/ai-report` (231 satır) | `/settings/ai-learning` (122 satır) |
| ↳ Özellikler | Alan / AI değeri / Düzeltilen değer / Tekrar / Tarih, orijinal mesaj | Alan / Düzeltme listesi, boş durum |
| **Denetim Kaydı** | `/settings/audit-logs` + `/audit` + `/activity` — **3 giriş, aynı `AuditLogsView`** | `/settings/audit` (104 satır) — **tek sayfa** |
| ↳ Özellikler | Zaman, kullanıcı, eylem; `auth.login` dahil; admin-only | Aynı veri, tek rota |
| **İçe / Dışa Aktar** | `/settings/import-export` (846 satır) | `/settings/import-export` (29 satır) |
| ↳ Özellikler | CSV/Excel yükleme, kolon eşleme, önizleme, dışa aktarma | ⚠️ **Placeholder — "Faz 8'de"** |
| **Etiketler** | `/settings/tags` (16 satır) | ✗ Yok |
| ↳ Özellikler | ⚠️ Placeholder — "ileride eklenecek, şu an serbest metin" | — |

---

## 9. Entegrasyonlar (Veri Maya'ya özel)

| Sayfa Adı | Tracker | Veri Maya |
|---|---|---|
| **n8n / API** | ✗ Yok | `/settings/connections/api` (422 satır) |
| ↳ Özellikler | — | **API anahtarları** (oluştur, scope, kopyala, iptal), **giden webhook abonelikleri** (hedef URL, paylaşılan secret, olay türleri, `X-Verimaya-Signature` imzası) |
| **Reklam Hesapları** | ✗ Yok | `/settings/connections/ads` (278 satır) |
| ↳ Özellikler | — | Reklam platformu bağlantısı, dev modu bloğu (`IntegrationCard`) |
| **GoHighLevel (GHL)** | ✗ Yok | `/settings/connections/ghl` (131 satır) |
| ↳ Özellikler | — | GHL bağlantısı, **sahiplik (ownership)** bloğu, dev modu |

---

## 10. Sistem / Yardımcı Sayfalar

| Sayfa Adı | Tracker | Veri Maya |
|---|---|---|
| **Geliştirici Paneli** | `/dev-users` (469 satır) | `/dev` (345 satır) |
| ↳ Özellikler | Organizasyon listesi, kullanıcı ekle/güncelle, org üyeleri, rol atama | Aynı: Organizasyonlar, kullanıcı ekle/güncelle, org üyeleri |
| **Mobil Menü** | `/menu` (MobileMenuPage, 235 satır) — ayrı rota | ✗ Ayrı sayfa yok — `AppShell` içinde responsive sidebar |
| ↳ Özellikler | WhatsApp Aktar, Onay Kuyruğu, Denetim, Activity, Settings, Dev Users kısayolları | Sidebar + `CommandPalette` (⌘K) |
| **Özellikler Listesi** | ✗ Yok | `/features` (91 satır) |
| ↳ Özellikler | — | Modül bazlı yetenek listesi, durum filtresi (**Kod hazır / Pilotta / Yayında / Harici onay bekliyor**), kaynak: `packages/shared/src/features.ts` |
| **Yenilikler (Changelog)** | ✗ Yok | `/changelog` (88 satır) |
| ↳ Özellikler | — | Sürüm notları listesi |
| **404 / Yönlendirme** | `CatchAllRedirect` (10 satır) | SvelteKit varsayılan `+error` |

---

## 11. Halka Açık Pazarlama Sitesi (Veri Maya'ya özel — `(public)` grubu)

Tracker'da halka açık hiçbir sayfa **yok**. Veri Maya'da tam bir pazarlama sitesi var:

| Sayfa Adı | Tracker | Veri Maya |
|---|---|---|
| **Ana Sayfa** | ✗ | `/` → `HubHome` / `PanelHome` (13 satır router) |
| **Uygulama (Ürün Sayfası)** | ✗ | `/app` (48 satır) |
| ↳ Özellikler | — | 14 özellik kartı: hastalar, çift kayıt, kişiler, randevular, defter, WhatsApp import, fatura AI, bakiyeler, raporlar, gerçek ROAS, denetim, karne, n8n, multi-tenant |
| **CRM (Ürün Sayfası)** | ✗ | `/crm` (40 satır) |
| ↳ Özellikler | — | 7 özellik: lead capture, pipeline, otomasyon, çok kanallı, satış raporları, app senkron, reklam |
| **Vitrin** | ✗ | `/vitrin` (12 satır) |
| **Kaynaklar** | ✗ | `/resources` (39 satır) |
| **Araçlar Hub** | ✗ | `/tools` (53 satır) |
| ↳ Alt sayfalar | — | `/tools/calculator`, `/simulator`, `/compliance`, `/measurement`, `/pre-launch`, `/templates` (her biri ~24 satır — panel içindeki `/marketing/*` araçlarının halka açık vitrini) |
| **Yapay Zeka Karnesi (Lead Magnet)** | ✗ | `/yapay-zeka-karnesi` (275 satır) |
| ↳ Özellikler | — | "Ücretsiz · 5 dakika" testi, `KarneEmailCapture` + `KarneResult` — e-posta karşılığı sonuç |
| **KVKK Aydınlatma** | ✗ | `/kvkk-aydinlatma` (87 satır) |
| ↳ Özellikler | — | 5 bölüm: veri sorumlusu, işlenen veriler, amaç ve hukuki sebep, saklama ve aktarım, haklarınız |

---

## Özet

**Sayfa sayısı:** Tracker ~42 rota (React Router) → Veri Maya **58 sayfa** (`+page.svelte`)

**Veri Maya'da yeni (Tracker'da yok):**
- Halka açık pazarlama sitesi — 15 sayfa (`(public)` grubu, KVKK, lead magnet karnesi)
- Pazarlama araçları — 7 sayfa (hesap, simülatör, uyumluluk, ölçüm, yayın öncesi, şablonlar)
- Yapay Zeka Karnesi (scorecard) — 2 sayfa
- Entegrasyonlar — 3 sayfa (n8n/API, reklam, GHL)
- Özellikler + Changelog — 2 sayfa
- Hasta/Kişi çift kayıt tarama — 2 ayrı sayfa
- i18n (TR/EN) altyapısı tüm panelde

**Tracker'da olup Veri Maya'da eksik / sadeleşmiş:**

| Konu | Durum |
|---|---|
| `/settings/import-export` | ⚠️ Placeholder — "Faz 8'de". Tracker'da 846 satırlık tam işlevsel sayfa var |
| Randevu **durum** yönetimi | Tracker `/settings/appointments` içinde var, Veri Maya'da tip + checklist var, durum yok |
| Dashboard operasyon metrikleri | Tracker'da **canlı** (Raporlar → Summary sekmesi) — no-show/iptal oranı, klinik performansı, vaka türü dağılımı Veri Maya raporlarında yok. Detay: `tracker-verimaya-ozellik-gap.md` G-12 |
| İşlemler filtre derinliği | Tracker `/transactions` 2186 satır (ödeme durumu, yöntem, fatura durumu, P2P). Veri Maya `/finance` 304 satır — filtre seti daha dar |
| Randevu listesi derinliği | Tracker 2170 satır (3 sıralama modu, sonsuz kaydırma, satır içi düzenleme). Veri Maya 332 satır |
| Kişi toplu işlemler | Tracker'da toplu tür atama + birleştirme var; Veri Maya'da çift kayıt paneli var, toplu tür atama yok |
| Randevu detay sayfası | Tracker'da ayrı rota, Veri Maya'da dialog |
| Etiketler | İki tarafta da yok (Tracker'daki zaten placeholder'dı) |

**Mimari değişiklikler:**
- `/audit` + `/activity` + `/settings/audit-logs` (3 rota, aynı view) → tek `/settings/audit`
- `/whatsapp-import` + `/whatsapp-inbox` → tek `/finance/ai-transaction`
- `/settings/categories` + `/settings/categories/:id` → tek sayfa, satır içi alt kategori
- `/select-tenant` ve `/menu` ayrı rotalardan `AppShell`'e taşındı
- `case-expenses` / `patients` legacy ikiliği → tek `patients` kavramı
- Kişi çift kayıt: sayfa içi sekmeden ayrı rotaya
