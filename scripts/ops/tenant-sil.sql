-- Test tenantlarını kalıcı siler. GERİ DÖNÜŞÜ YOKTUR — önce yedek al.
--
-- Kalanlar:  orbismed-clinics (4204bb9b…), demo-hesap-01 (bbf043a8…)
-- Silinenler: demo-klinik, demo-tek-ay-klinik, klinik-1, orbismed, orbismed-01
--
-- `tenants`e bağlı 39 kısıt ON DELETE restrict; doğrudan silinemez, çocuklar
-- önce gider. Sıra `apps/api/src/test/purge-tenant-fixtures.ts` ile aynı,
-- üstüne orada eksik olan `record_update_suggestions` eklendi.
--
-- Çalıştırma:
--   set -a && . scripts/ops/.env.kesim && set +a
--   psql "$DATABASE_URL_APP" -v ON_ERROR_STOP=1 -f scripts/ops/tenant-sil.sql
BEGIN;

CREATE TEMP TABLE silinecek(id uuid) ON COMMIT DROP;
INSERT INTO silinecek VALUES
  ('afb4a68b-4dba-426a-8c3f-0b0f3d99bb7b'),  -- demo-klinik
  ('e67821fb-8e1a-55ca-a3bb-26df89e3fb01'),  -- demo-tek-ay-klinik
  ('b8658a28-13ed-4439-b2e6-a08f9482177a'),  -- klinik-1
  ('0e73943b-90e2-4163-a390-2497a0f10ee7'),  -- orbismed
  ('a0244aac-de21-466b-a157-94fd76f9b421');  -- orbismed-01

-- Emniyet: korunacaklar listeye sızmışsa işlemi düşür.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM silinecek
    WHERE id IN ('4204bb9b-0c66-48b1-ba97-fa959acab043',
                 'bbf043a8-68fd-40e2-b4de-14d176bd406c')
  ) THEN
    RAISE EXCEPTION 'DUR: korunacak tenant silme listesinde';
  END IF;
END $$;

\echo '-- silinecek tenantlar --'
SELECT t.slug, t.name FROM tenants t JOIN silinecek s ON s.id = t.id ORDER BY t.slug;

DO $$
DECLARE tid uuid;
BEGIN
  FOR tid IN SELECT id FROM silinecek LOOP
    PERFORM set_config('app.current_tenant_id', tid::text, true);

    DELETE FROM scorecard_answers            WHERE tenant_id = tid;
    DELETE FROM scorecard_assessments        WHERE tenant_id = tid;
    DELETE FROM scorecard_profiles           WHERE tenant_id = tid;
    DELETE FROM record_update_suggestions    WHERE tenant_id = tid;
    DELETE FROM files                        WHERE tenant_id = tid;
    DELETE FROM case_notes                   WHERE tenant_id = tid;
    DELETE FROM incidents                    WHERE tenant_id = tid;
    DELETE FROM incident_types               WHERE tenant_id = tid;
    DELETE FROM operation_alerts             WHERE tenant_id = tid;
    DELETE FROM appointments                 WHERE tenant_id = tid;
    DELETE FROM incentive_files              WHERE tenant_id = tid;
    DELETE FROM commission_entries           WHERE tenant_id = tid;
    DELETE FROM transactions                 WHERE tenant_id = tid;
    DELETE FROM contact_data_deletion_requests WHERE tenant_id = tid;
    DELETE FROM contacts                     WHERE tenant_id = tid;
    DELETE FROM contact_types                WHERE tenant_id = tid;
    DELETE FROM contact_titles               WHERE tenant_id = tid;
    DELETE FROM appointment_types            WHERE tenant_id = tid;
    DELETE FROM finance_categories           WHERE tenant_id = tid;
    DELETE FROM organizations                WHERE tenant_id = tid;
    DELETE FROM audit_logs                   WHERE tenant_id = tid;
    DELETE FROM api_keys                     WHERE tenant_id = tid;
    DELETE FROM ai_corrections               WHERE tenant_id = tid;
    DELETE FROM inbound_messages             WHERE tenant_id = tid;
    DELETE FROM integration_events           WHERE tenant_id = tid;
    DELETE FROM outbox_events                WHERE tenant_id = tid;
    DELETE FROM jobs                         WHERE tenant_id = tid;
    DELETE FROM idempotency_keys             WHERE tenant_id = tid;
    DELETE FROM webhook_subscriptions        WHERE tenant_id = tid;
    DELETE FROM ad_metrics_daily             WHERE tenant_id = tid;
    DELETE FROM tenant_credentials           WHERE tenant_id = tid;
    DELETE FROM tenant_provider_identities   WHERE tenant_id = tid;
    DELETE FROM tenant_settings              WHERE tenant_id = tid;
    DELETE FROM external_ids                 WHERE tenant_id = tid;
    DELETE FROM data_deletion_requests       WHERE tenant_id = tid;
    DELETE FROM demo_notes                   WHERE tenant_id = tid;
    DELETE FROM user_ui_preferences          WHERE organization_id = tid;
    DELETE FROM tenant_permission_overrides  WHERE tenant_id = tid;
    DELETE FROM maya_questions               WHERE tenant_id = tid;
  END LOOP;
END $$;

DELETE FROM tenants WHERE id IN (SELECT id FROM silinecek);

\echo '-- kalan tenantlar (2 satır olmalı) --'
SELECT slug, name FROM tenants ORDER BY slug;

COMMIT;
