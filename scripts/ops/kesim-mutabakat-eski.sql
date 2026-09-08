-- Eski Tracker tarafı. Çıktı kesim-mutabakat-yeni.sql ile birebir aynı olmalı.
-- psql "$TRACKER_DATABASE_URL" -v t=<tracker_tenant_uuid> -f kesim-mutabakat-eski.sql
\pset format unaligned
\pset fieldsep '|'
\pset footer off
\pset null 'NULL'

SELECT
  currency,
  kind,
  count(*)                                        AS n,
  sum(amount)::numeric(18,2)                      AS tutar,
  sum(coalesce(paid_amount, 0))::numeric(18,2)    AS odenen,
  count(*) FILTER (WHERE status = 'partial')      AS kismi,
  md5(string_agg(
    md5(concat_ws('|',
      kind, occurred_on, round(amount * 100), currency,
      status, invoice_status, coalesce(category, ''))),
    ',' ORDER BY id::text))                        AS hash
FROM public.transactions
WHERE tenant_id = :'t'::uuid
GROUP BY 1, 2
ORDER BY 1, 2;
