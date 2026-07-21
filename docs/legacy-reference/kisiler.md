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
- **Çift kayıt:** `/kisiler/cift-kayit` ve `/hastalar/cift-kayit` — e-posta / telefon (normalize) / ad grupları; birleştirmede FK taşıma (MSW)

## Gerçek implementasyon (Faz 1)

Tracker: `find_duplicate_contact_groups` + `merge_contacts` (işlem/randevu `contact_id` yeniden yazar, kaynak silinir).

Verimaya’da:

1. Aynı eşleme anahtarları (email lower, phone digits, name `tr` lower).
2. Merge tek transaction: referanslar → `keep_id`, kaynak soft-delete veya hard-delete + audit.
3. Hasta merge ayrı endpoint; Case notları / dosyalar / randevu / işlem hasta_id taşır.
4. İsteğe bağlı: oluştururken “benzer kayıt var” uyarısı (bloklamadan).

## Erteleme

P2P payer/payee rolleri, audit türe göre kurallar — sonraki faz.
