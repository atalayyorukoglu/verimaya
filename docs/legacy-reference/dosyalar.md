# Legacy notlar — Case / Appointment dosyaları

> **Durum (Verimaya):** `GET/POST /v1/patients/:id/files` gerçek API (Nest + Drizzle + RLS); `files` tablosu bu dokümandaki modele uygun (`tenant_id`, `patient_id` zorunlu, `appointment_id` nullable). Web'de `PatientFilesPanel.svelte` liste + metadata yükleme yapıyor. Hâlâ eksik: gerçek object storage/imzalı URL (`storage_key='local://pending'`), silme endpoint'i, audit kaydı — bkz. "İleri (Faz 1)".

Kaynak: Fixrav Tracker (`CaseFile`, `/cases/:id/files`, `/appointments/:id/files`).

## Ne idi?

Hasta her geldiğinde randevu açılır; o güne ait belgeler (onam, pasaport, fotoğraf, fatura) **randevuya** yüklenir. Aynı kayıt gerektiğinde **case (hasta)** düzeyine de bağlanır. Tek tablo: `case_files` — nullable `case_id` + nullable `appointment_id`. Depolama: **Google Drive** (hasta adına klasör). Dosya adı: `{YYYY-MM-DD} - {kişi} - {orijinal}`.

UI: `CaseFiles` bileşeni hem hasta detayında hem randevu detayında kullanılır.

## Legacy'de korunacaklar

- Önizleme MIME allowlist (PDF/görsel inline; gerisi zorunlu indirme)
- `X-Content-Type-Options: nosniff` + CSP sandbox — XSS koruması
- 25 MB boyut sınırı, parça parça okuma
- Randevu dosyasının `case_id` ile de bağlanması (hasta dosya listesi tek sorguda)

## Legacy hataları (taşınmayacak)

1. **Drive klasörü hasta adıyla** — aynı isimli hastalar karışır; isim değişince klasör kopar. Path ID bazlı olmalı.
2. **Google Drive birincil depolama** — auth/quota düşünce özellik 503; her önizlemede backend dosyayı Drive'dan proxy'ler (cache/range yok).
3. **`drive_web_link` dışarı sızabilir** — uygulama RBAC'i baypas edilebilir.
4. **Yetim dosya** — case CASCADE ile DB gider, Drive kalır; temizlik job'u yok. Randevu silinince `SET NULL` → randevusuz kayıt.
5. **Ad çakışması yarışı** — "(2), (3)" eki eşzamanlı yüklemede güvenli değil.
6. **Audit yok** — kim yükledi/sildi izlenmiyor (sağlık verisi).
7. Tür/uzantı doğrulaması zayıf; izin kaba (`operasyon_cases`).

## Verimaya modeli

| Konu | Karar |
|------|--------|
| Tablo | `files` — `tenant_id`, `patient_id` (zorunlu), `appointment_id` (nullable) |
| Depolama | S3-uyumlu object storage (Hetzner/R2); adaptör katmanı |
| Key | `tenant_id/patient_id/{uuid}` — isim çakışması yok |
| Erişim | Kısa ömürlü imzalı URL; dış kalıcı link yok |
| Silme | Önce DB (kayıt kaynağı), storage outbox/job |
| Audit | upload + delete zorunlu |
| Önizleme | Legacy MIME allowlist + indirme zorlaması korunur |

## Faz 0a demo

- Mock hasta **Atalay Demir**: 4–5 tamamlanmış/planlı ziyaret + bağlı işlemler + randevu dosyaları
- Hasta detayı: dosya listesi (randevu rozeti), mock yükle/sil
- MSW: `GET/POST/DELETE /v1/patients/:id/files` (+ appointment eşdeğerleri)

## İleri (Faz 1)

- Gerçek storage + imzalı URL
- `CHECK (patient_id IS NOT NULL)` + appointment varsa aynı hastaya ait doğrulama
- Soft-delete / retention politikası (KVKK)
- Randevu silinince dosyalar hastada kalır (`appointment_id` null) — bilinçli tercih; Drive orphan yok
