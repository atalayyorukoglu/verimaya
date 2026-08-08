# Kişiler (Contacts) — legacy referans

Tracker: `/contacts` — hasta listesi değil, **cari / dizin**.

## Ayrım

| Entity | Anlam |
|--------|--------|
| **Contact (Kişi)** | Otel, klinik, transfer, hasta, iç personel, diğer |
| **Patient (Hasta / Case)** | Operasyon iş kaydı; opsiyonel `contact_id` (tip Hasta) |

## Verimaya demo

- `/kisiler` liste + profil
- `/ayarlar/contact-turleri` → API’li türler
- İşlem: `contact_id` + denormalize `contact_label`
- Randevu: `clinic_contact_id` / `hotel_contact_id` / `transfer_contact_id`
- Tip “Hasta” ile kişi oluşturunca otomatik Patient açılır
- **Çift kayıt (kişiler):** `/contacts/duplicates` — e-posta / telefon / ad; birleştirmede FK taşıma (işlem/randevu → keep)
- **Çift kayıt (hastalar / dosyalar):** yalnız **boş kapak** (randevu 0, işlem 0). Eksik alanlar hedefe doldurulur, fazla dosya silinir. Randevusu veya işlemi olan dosya grupta görünmez; merge → 409 `patient_has_records`. Farklı `contact_id` → grupta birlikte yok; merge → 409 `patient_contact_mismatch`. FK taşıma yok.

## Gerçek implementasyon (Faz 1)

Tracker: `find_duplicate_contact_groups` + `merge_contacts` (işlem/randevu `contact_id` yeniden yazar, kaynak silinir).

Verimaya’da:

1. Aynı eşleme anahtarları (email lower, phone digits, name `tr` lower).
2. Kişi merge tek transaction: referanslar → `keep_id`, kaynak soft-delete veya hard-delete + audit.
3. Hasta merge ayrı endpoint; **yalnız boş dosyalar**: telefon / e-posta / kaynak / notlar / `contact_id` (hedefte boşsa) doldurulur, kaynak soft-delete. Randevu/işlem/case note/file **taşınmaz**.
4. İsteğe bağlı: oluştururken “benzer kayıt var” uyarısı (bloklamadan).

## Erteleme

P2P payer/payee rolleri, audit türe göre kurallar — sonraki faz.
