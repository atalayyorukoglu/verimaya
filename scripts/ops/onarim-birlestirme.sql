-- Birleştirmede kopan bağları onarır (genel).
--
-- Silinmiş (soft-delete) bir kişiyi gösteren işlem alanlarını, aynı isimdeki
-- hayatta kalan kişiye geri bağlar. Yalnızca o isimde TEK aktif kişi varsa
-- dokunur; belirsiz durumda satırı atlar ve sonda listeler.
--
-- Çalıştırma:
--   set -a && . scripts/ops/.env.kesim && set +a
--   psql "$DATABASE_URL_APP" -v ON_ERROR_STOP=1 -f scripts/ops/onarim-birlestirme.sql
BEGIN;
SET LOCAL app.current_tenant_id = '4204bb9b-0c66-48b1-ba97-fa959acab043';

CREATE TEMP TABLE hedef ON COMMIT DROP AS
SELECT s.id AS silinen_id, (array_agg(a.id))[1] AS aktif_id, s.display_name
FROM contacts s
JOIN contacts a ON a.display_name = s.display_name AND a.deleted_at IS NULL
WHERE s.deleted_at IS NOT NULL
GROUP BY s.id, s.display_name
HAVING count(a.id) = 1;

\echo '-- onarım öncesi kopuk satırlar --'
SELECT 'case_contact_id' AS alan, count(*) AS n
FROM transactions t JOIN hedef h ON h.silinen_id = t.case_contact_id
WHERE t.deleted_at IS NULL
UNION ALL
SELECT 'responsible_contact_id', count(*)
FROM transactions t JOIN hedef h ON h.silinen_id = t.responsible_contact_id
WHERE t.deleted_at IS NULL;

UPDATE transactions t
SET case_contact_id = h.aktif_id, updated_at = now()
FROM hedef h
WHERE t.case_contact_id = h.silinen_id AND t.deleted_at IS NULL;

UPDATE transactions t
SET responsible_contact_id = h.aktif_id, updated_at = now()
FROM hedef h
WHERE t.responsible_contact_id = h.silinen_id AND t.deleted_at IS NULL;

\echo '-- onarım sonrası: kalan kopuk (0 olmalı; >0 ise isim belirsiz, elle bak) --'
SELECT c.display_name, count(*) AS kopuk
FROM transactions t
JOIN contacts c ON c.id IN (t.case_contact_id, t.responsible_contact_id)
WHERE t.deleted_at IS NULL AND c.deleted_at IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC;

COMMIT;
