-- Sadece Verimaya tarafı: ETL dışı / mükerrer kayıt avı. Hepsi 0 olmalı.
-- psql "$DATABASE_URL_APP" -v t=<verimaya_tenant_uuid> -f kesim-kacaklar.sql
\pset format unaligned
\pset fieldsep '|'
\pset footer off

SELECT 'etl_disi_islem' AS kontrol, count(*) AS adet
FROM transactions t
LEFT JOIN external_ids e
  ON e.tenant_id = t.tenant_id AND e.internal_id = t.id
 AND e.entity_type = 'transaction' AND e.source = 'legacy_tracker'
WHERE t.tenant_id = :'t'::uuid AND t.deleted_at IS NULL AND e.id IS NULL

UNION ALL
SELECT 'mukerrer_legacy_id',
       count(*) - count(DISTINCT e.external_id)
FROM external_ids e
WHERE e.tenant_id = :'t'::uuid AND e.entity_type = 'transaction' AND e.source = 'legacy_tracker'

UNION ALL
SELECT 'kur_cevrimi_eksik', count(*)
FROM transactions t
WHERE t.tenant_id = :'t'::uuid AND t.deleted_at IS NULL
  AND t.currency <> 'GBP' AND t.amount_base IS NULL

UNION ALL
SELECT 'odenen_tutardan_buyuk', count(*)
FROM transactions t
WHERE t.tenant_id = :'t'::uuid AND t.deleted_at IS NULL
  AND t.paid_amount IS NOT NULL AND t.paid_amount > t.amount;
