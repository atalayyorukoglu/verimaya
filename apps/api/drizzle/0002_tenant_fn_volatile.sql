-- Prepared statements (postgres.js) + STABLE GUC helpers break RLS isolation.
-- Mark tenant resolver VOLATILE so each query re-reads app.current_tenant_id.

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql
VOLATILE
AS $$
  SELECT nullif(current_setting('app.current_tenant_id', true), '')::uuid;
$$;
