-- Matthew Baker birleştirmesinde kopan bağları onarır.
-- Birleştirme kodu transactions.case_contact_id'yi devretmiyordu; 6 işlem
-- silinmiş işaretli kişiyi göstermeye devam etti ve arayüzde kayboldu.
-- Hiçbir veri kalıcı silinmedi.
--
-- Çalıştırma:
--   set -a && . scripts/ops/.env.kesim && set +a
--   psql "$DATABASE_URL_APP" -v ON_ERROR_STOP=1 -f scripts/ops/onarim-birlestirme.sql
BEGIN;
SET LOCAL app.current_tenant_id = '4204bb9b-0c66-48b1-ba97-fa959acab043';

\echo '-- onarım öncesi kopuk satırlar --'
SELECT count(*) AS kopuk FROM transactions
WHERE case_contact_id = '71399db8-0496-4276-a92c-526e95e39eeb' AND deleted_at IS NULL;

UPDATE transactions
SET case_contact_id = '39e6a852-6aea-4494-9afb-f5f38a54df16', updated_at = now()
WHERE case_contact_id = '71399db8-0496-4276-a92c-526e95e39eeb' AND deleted_at IS NULL;

UPDATE transactions
SET responsible_contact_id = '39e6a852-6aea-4494-9afb-f5f38a54df16', updated_at = now()
WHERE responsible_contact_id = '71399db8-0496-4276-a92c-526e95e39eeb' AND deleted_at IS NULL;

\echo '-- onarım sonrası: kopuk 0, Matthew Baker işlemleri --'
SELECT count(*) AS kopuk FROM transactions
WHERE case_contact_id = '71399db8-0496-4276-a92c-526e95e39eeb' AND deleted_at IS NULL;

SELECT occurred_on, kind, amount / 100.0 AS tutar, currency, left(title, 45) AS baslik
FROM transactions
WHERE case_contact_id = '39e6a852-6aea-4494-9afb-f5f38a54df16' AND deleted_at IS NULL
ORDER BY occurred_on;

COMMIT;
