# TestSprite — 17 frontend senaryosu (eski ad: 15; DOMAIN-02 · 2026-08-10)

> **Ne yaptık?** AI ajanı paneli insan gibi tıkladı (eski koşu: 2026-08-09).  
> **Ortam:** `vite preview` + API `:3000` + `http://app.localhost:5173`  
> **DOMAIN-02 güncellemesi (TEST-02, 2026-08-10):** senaryolar `/patients` yerine
> `/contacts` Kişiler modeline çekildi; TC016 Firmalar + TC017 dosya silme eklendi.  
> **Önceki koşu özeti:** 13 ✅ · 2 ⛔ (TC008 seed, TC014 — Sil o zaman yoktu; artık var)  
> **Teknik rapor (eski koşu):** `testsprite_tests/testsprite-mcp-test-report.md`  
> **Not:** Bu dosyalar statik güncellendi; canlı panelle yeniden koşulmadı.

Her senaryo (hub hariç) aynı girişle başlar: e-posta + şifre → (gerekirse) **Demo Klinik** seç → panel.

---

## TC001 — Giriş yap, panele gir

**Ne test eder:** Login çalışıyor mu?

**Örnek:** `demo@…` + şifre → **Giriş yap** → ana panel (dashboard) görünür.

---

## TC002 — Hasta tipi kişi oluştur

**Ne test eder:** `/contacts` üzerinde tür=Hasta kişi kaydı, varsayılan Hasta filtresi altında listeleniyor mu? Ad/Soyad ayrı; Kaynak=`Dijital Reklam` → Alt kanal (`#c-medium`).

**Örnek:** Kişiler → (filtre Hasta) → Yeni kişi → Ad/Soyad + kaynak/medium → Oluştur → detayda dört kart → ← Kişiler → listede `display_name`.

**Selector’lar (koddan):** `#c-first-name`, `#c-last-name`, `#c-type`, `#c-source`, `#c-medium`, nav `Kişiler`, aria `Tür filtresi`.

---

## TC003 — Hasta tipi kişi düzenle

**Ne test eder:** Mevcut Hasta kişi güncelleniyor mu?

**Örnek:** Oluştur → Düzenle → `#c-phone` değiştir → Kaydet → detayda yeni telefon; finans linki `/finance?contact=…`.

---

## TC004 — Randevu oluştur (+ iletişim uyarısı)

**Ne test eder:** Yeni randevu takvimde/listede görünüyor mu? GAP-29: seçilen kişide telefon/e-posta yoksa `data-testid=appt-contact-info-warning` çıkar ama kayıt engellenmez.

**Örnek:** Telefonsuz Hasta oluştur → Randevular → Yeni randevu → `#appt-contact` seç → uyarı → Oluştur → listede `display_name`.

---

## TC005 — Organizasyon seç → dashboard

**Ne test eder:** Login sonrası org kapısı (Demo Klinik) paneli açıyor mu?

**Örnek:** Giriş → “Demo Klinik” seç → dashboard açılır (yeni org oluşturulmaz).

---

## TC006 — Organizasyon ayarları

**Ne test eder:** Klinik profili kaydediliyor mu?

**Örnek:** Ayarlar → Organizasyon → `#tenant-name` / `#tenant-patients-label` (contacts section label) → Kaydet.

---

## TC007 — Klinik kişi + firma seçimi

**Ne test eder:** Klinik tipinde `#c-organization` + satır içi **+ Yeni firma** (`#c-new-org-name`) akışı.

**Örnek:** Tür filtresi **Tüm türler** → Yeni kişi → Tür=Klinik → + Yeni firma → Oluştur → kişi kaydı.

---

## TC008 — AI finans taslağını onayla

**Ne test eder:** AI’dan gelen işlem taslağı onaylanabiliyor mu?

**Örnek (hedef):** AI ile işlem → bekleyen mesaj aç → Onayla.

**Bilinen engel:** kuyruk boşken (`Bekleyen mesaj yok.`) seed/fixture gerekir — DOMAIN-02’den bağımsız.

---

## TC009 — Kişi düzenle (Referans eden dahil)

**Ne test eder:** `#c-first-name` / `#c-last-name` / e-posta güncellemesi; Kaynak=Referans → `#c-referred-by-search`.

**Örnek:** Kişiyi aç → Düzenle → alanları değiştir → Referans seç → referans eden ara/seç → Kaydet.

---

## TC010 — Takım rolü değiştir

**Ne test eder:** Üye rolü güncellenebiliyor mu?

**Örnek:** Ayarlar → ekip → bir üyenin rolünü değiştir → yeni rol kayıtlı.

---

## TC011 — Hub’dan login’e git

**Ne test eder:** Pazarlama hub’ından app login’e ulaşılıyor mu?

**Örnek:** `localhost:5173` (hub) → App / Giriş CTA → `app.localhost:5173/login`.

---

## TC012 — Randevu güncelle

**Ne test eder:** Var olan randevu düzenlenebiliyor mu? (`#appt-notes`, kişi `contact_display_name`)

**Örnek:** Bir randevuyu aç → notu değiştir → Kaydet → yeniden açınca not görünür.

---

## TC013 — API anahtarı oluştur / iptal

**Ne test eder:** API key üretip sonra revoke edilebiliyor mu?

**Örnek:** Ayarlar → API key oluştur → listede görünür → iptal/revoke → artık geçerli değil.

---

## TC014 — Kişi soft-delete

**Ne test eder:** `ContactFormDialog` içinde **Sil** → **Silmeyi onayla** listeden düşürüyor mu? (eski hasta dialog’unda Sil yoktu)

**Örnek:** Kişi oluştur → Düzenle → Sil → Silmeyi onayla → `/contacts` listesinde yok.

---

## TC015 — Kişi türlerini yönet

**Ne test eder:** Contact type (kişi tipi) ayarları yönetilebiliyor mu?

**Örnek:** Ayarlar → kişi türleri → ekle/düzenle → listede tip görünür.

---

## TC016 — Firmalar (`/settings/organizations`) *(yeni)*

**Ne test eder:** Firmalar sözlüğü ekleme.

**Örnek:** Ayarlar → Firmalar → placeholder `Yeni firma` → Ekle → listede ad.

---

## TC017 — Kişi dosyası sil *(yeni · GAP-F09-23)*

**Ne test eder:** Detay **Dosyalar** panelinde yükle → `aria-label=Dosyayı sil` → confirm → boş durum.

**Örnek:** Kişi detayı → PNG yükle → Dosyayı sil → “Henüz dosya yok”.

---

## Kısa özet tablo

| ID | Ne | DOMAIN-02 notu |
| --- | --- | --- |
| TC001 | Login → panel | Değişmedi |
| TC002 | Hasta tipi kişi oluştur | `/patients` → `/contacts`; ad/soyad; kaynak→medium |
| TC003 | Hasta tipi kişi düzenle | `#c-phone`; `?contact=` |
| TC004 | Randevu + iletişim uyarısı | `#appt-contact`; `appt-contact-info-warning` |
| TC005 | Org seç → dashboard | Değişmedi |
| TC006 | Org ayarları | `#tenant-patients-label` = contacts section label |
| TC007 | Klinik + firma | `#c-organization` / `#c-new-org-name` |
| TC008 | AI taslak onay | Seed gerekir (eski engel) |
| TC009 | Kişi düzenle + Referans | `#c-referred-by-search` |
| TC010 | Takım rolü | Değişmedi |
| TC011 | Hub → login | Değişmedi |
| TC012 | Randevu güncelle | `contact_display_name` |
| TC013 | API key | Değişmedi |
| TC014 | Kişi soft-delete | Sil artık var |
| TC015 | Kişi türleri | Değişmedi |
| TC016 | Firmalar ayarı | Yeni |
| TC017 | Dosya sil | Yeni |

## Çalıştırma notu (kısa)

1. API + `vite preview --host --port 5173`  
2. Config’te e-posta/şifre + `http://app.localhost:5173`  
3. Senaryoları **tek tek** koş (paralel login flake; `vite dev` çöker)  
4. `testsprite_tests/tmp/` gitignore — dokunma
