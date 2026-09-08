-- Verimaya tarafı. Çıktı kesim-mutabakat-eski.sql ile birebir aynı olmalı.
-- Tutarlar minor unit (integer) tutulduğu için /100, sıralama legacy id'ye göre.
-- psql "$DATABASE_URL_APP" -v t=<verimaya_tenant_uuid> -f kesim-mutabakat-yeni.sql
\pset format unaligned
\pset fieldsep '|'
\pset footer off
\pset null 'NULL'

-- RLS: verimaya_app rolü tenant değişkeni olmadan HİÇBİR satır göremez.
SET app.current_tenant_id = :'t';

SELECT
  t.currency,
  t.kind,
  count(*)                                              AS n,
  (sum(t.amount) / 100.0)::numeric(18,2)                AS tutar,
  (sum(coalesce(t.paid_amount, 0)) / 100.0)::numeric(18,2) AS odenen,
  count(*) FILTER (WHERE t.status = 'partial')          AS kismi,
  md5(string_agg(
    md5(concat_ws('|',
      t.kind, t.occurred_on, t.amount, t.currency,
      t.status, t.invoice_status, coalesce(t.category, ''))),
    ',' ORDER BY e.external_id))                        AS hash
FROM transactions t
JOIN external_ids e
  ON e.tenant_id   = t.tenant_id
 AND e.internal_id = t.id
 AND e.entity_type = 'transaction'
 AND e.source      = 'legacy_tracker'
WHERE t.tenant_id = :'t'::uuid
  AND t.deleted_at IS NULL
GROUP BY 1, 2
ORDER BY 1, 2;
