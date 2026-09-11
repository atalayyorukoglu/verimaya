-- Randevularda boş kalmış klinik/otel adlarını kimliklerinden doldurur.
--
-- GÖRÜNTÜLEME İÇİN ARTIK GEREKMİYOR (2026-09-11): API adı okuma anında kişiden
-- join'le türetiyor, kolon boş olsa da kart doğru görünüyor. Bu script yalnız
-- ARAMA için gerekli: randevu araması `clinic_name`/`hotel_name` kolonlarına
-- bakıyor, kolon boşsa klinik adıyla arama o randevuyu bulamıyor.
--
-- Panel, adı yalnız ilk 500 kişilik listede arıyordu; seçili klinik/otel o sayfada
-- olmayınca ad bulunamayıp null gönderiliyor ve kayıtlı ad siliniyordu. Kimlik
-- yerinde kaldığı için veri kaybı yok, ad geri türetilebiliyor.
--
-- Çalıştırma:
--   set -a && . scripts/ops/.env.kesim && set +a
--   psql "$DATABASE_URL_APP" -v ON_ERROR_STOP=1 -f scripts/ops/onarim-randevu-adlari.sql
BEGIN;
SET LOCAL app.current_tenant_id = '4204bb9b-0c66-48b1-ba97-fa959acab043';

\echo '-- onarım öncesi: kimliği olup adı boş olanlar --'
SELECT
  count(*) FILTER (WHERE clinic_contact_id IS NOT NULL AND coalesce(clinic_name, '') = '') AS klinik,
  count(*) FILTER (WHERE hotel_contact_id  IS NOT NULL AND coalesce(hotel_name, '')  = '') AS otel
FROM appointments WHERE deleted_at IS NULL;

UPDATE appointments a
SET clinic_name = c.display_name, updated_at = now()
FROM contacts c
WHERE c.id = a.clinic_contact_id AND c.deleted_at IS NULL
  AND a.deleted_at IS NULL AND coalesce(a.clinic_name, '') = '';

UPDATE appointments a
SET hotel_name = c.display_name, updated_at = now()
FROM contacts c
WHERE c.id = a.hotel_contact_id AND c.deleted_at IS NULL
  AND a.deleted_at IS NULL AND coalesce(a.hotel_name, '') = '';

\echo '-- onarım sonrası (ikisi de 0 olmalı) --'
SELECT
  count(*) FILTER (WHERE clinic_contact_id IS NOT NULL AND coalesce(clinic_name, '') = '') AS klinik,
  count(*) FILTER (WHERE hotel_contact_id  IS NOT NULL AND coalesce(hotel_name, '')  = '') AS otel
FROM appointments WHERE deleted_at IS NULL;

COMMIT;
