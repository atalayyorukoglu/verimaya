# TestSprite — 15 frontend senaryosu (2026-08-09)

> **Ne yaptık?** AI ajanı paneli insan gibi tıkladı.  
> **Ortam:** `vite preview` + API `:3000` + `http://app.localhost:5173`  
> **Sonuç:** 13 ✅ · 2 ⛔ (TC008, TC014)  
> **Teknik rapor:** `testsprite_tests/testsprite-mcp-test-report.md`

Her senaryo aynı girişle başlar: e-posta + şifre → (gerekirse) **Demo Klinik** seç → panel.

---

## TC001 — Giriş yap, panele gir ✅

**Ne test eder:** Login çalışıyor mu?

**Örnek:** `demo@…` + şifre → **Giriş yap** → ana panel (dashboard) görünür.

---

## TC002 — Hasta oluştur ✅

**Ne test eder:** Yeni hasta kaydı listeye düşüyor mu?

**Örnek:** Hastalar → Yeni → “Ayşe Yılmaz” kaydet → listede “Ayşe Yılmaz” var.

---

## TC003 — Hasta düzenle ✅

**Ne test eder:** Mevcut hasta güncelleniyor mu?

**Örnek:** Hastayı aç → Düzenle → telefonu değiştir → Kaydet → detayda yeni telefon görünür.

---

## TC004 — Randevu oluştur ✅

**Ne test eder:** Yeni randevu takvimde/listede görünüyor mu?

**Örnek:** Randevular → Yeni → hasta + tarih/saat → Kaydet → listede o randevu var.

---

## TC005 — Organizasyon seç → dashboard ✅

**Ne test eder:** Login sonrası org kapısı (Demo Klinik) paneli açıyor mu?

**Örnek:** Giriş → “Demo Klinik” seç → dashboard açılır (yeni org oluşturulmaz).

---

## TC006 — Organizasyon ayarları ✅

**Ne test eder:** Klinik profili kaydediliyor mu?

**Örnek:** Ayarlar → org adı/profil alanı değiştir → Kaydet → değer kalır.

---

## TC007 — Kişi oluştur ✅

**Ne test eder:** Yeni kişi (contact) listede görünüyor mu?

**Örnek:** Kişiler → Yeni kişi → “Test Contact” → Oluştur → listede satır var.

---

## TC008 — AI finans taslağını onayla ⛔

**Ne test eder:** AI’dan gelen işlem taslağı onaylanabiliyor mu?

**Örnek (hedef):** AI ile işlem → bekleyen mesaj aç → Onayla.

**Neden durdu:** Kuyruk boştu (`Bekleyen mesaj yok.`) — seed/fixture yok.

---

## TC009 — Kişi düzenle ✅

**Ne test eder:** Kişi bilgisi güncelleniyor mu?

**Örnek:** Bir kişiyi aç → e-posta değiştir → Kaydet → detayda yeni e-posta görünür.

---

## TC010 — Takım rolü değiştir ✅

**Ne test eder:** Üye rolü güncellenebiliyor mu?

**Örnek:** Ayarlar → ekip → bir üyenin rolünü değiştir → yeni rol kayıtlı.

---

## TC011 — Hub’dan login’e git ✅

**Ne test eder:** Pazarlama hub’ından app login’e ulaşılıyor mu?

**Örnek:** `localhost:5173` (hub) → App / Giriş CTA → `app.localhost:5173/login`.

---

## TC012 — Randevu güncelle ✅

**Ne test eder:** Var olan randevu düzenlenebiliyor mu?

**Örnek:** Bir randevuyu aç → saati değiştir → Kaydet → listede yeni saat görünür.

---

## TC013 — API anahtarı oluştur / iptal ✅

**Ne test eder:** API key üretip sonra revoke edilebiliyor mu?

**Örnek:** Ayarlar → API key oluştur → listede görünür → iptal/revoke → artık geçerli değil.

---

## TC014 — Hasta soft-delete ⛔

**Ne test eder:** Hasta listeden soft-delete ile kalkıyor mu?

**Örnek (hedef):** Hasta → Düzenle → Sil → onay → listede yok.

**Neden durdu:** Hasta düzenleme dialog’unda **Sil yok** (sadece İptal / Kaydet). Prod smoke da hasta sil değil; işlem/kişi/randevu siler. Test planı UI’dan önde.

---

## TC015 — Kişi tiplerini yönet ✅

**Ne test eder:** Contact type (kişi tipi) ayarları yönetilebiliyor mu?

**Örnek:** Ayarlar → kişi tipleri → ekle/düzenle → listede tip görünür.

---

## Kısa özet tablo

| ID | Ne | Sonuç |
| --- | --- | --- |
| TC001 | Login → panel | ✅ |
| TC002 | Hasta oluştur | ✅ |
| TC003 | Hasta düzenle | ✅ |
| TC004 | Randevu oluştur | ✅ |
| TC005 | Org seç → dashboard | ✅ |
| TC006 | Org ayarları | ✅ |
| TC007 | Kişi oluştur | ✅ |
| TC008 | AI taslak onay | ⛔ kuyruk boş |
| TC009 | Kişi düzenle | ✅ |
| TC010 | Takım rolü | ✅ |
| TC011 | Hub → login | ✅ |
| TC012 | Randevu güncelle | ✅ |
| TC013 | API key | ✅ |
| TC014 | Hasta sil | ⛔ UI yok |
| TC015 | Kişi tipleri | ✅ |

## Çalıştırma notu (kısa)

1. API + `vite preview --host --port 5173`  
2. Config’te e-posta/şifre + `http://app.localhost:5173`  
3. Senaryoları **tek tek** koş (paralel login flake; `vite dev` çöker)
