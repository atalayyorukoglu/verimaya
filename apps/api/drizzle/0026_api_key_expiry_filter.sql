-- AUDIT-03 (Faz 8): tighten app.lookup_api_key to filter by expires_at.
-- The migration is intentionally small and idempotent: REPLACE the function
-- with the same shape plus the new filter. Existing callers don't change.

CREATE OR REPLACE FUNCTION app.lookup_api_key(p_hash text)
RETURNS TABLE(id uuid, tenant_id uuid, scopes text[], expires_at timestamp with time zone, last_used_at timestamp with time zone)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app
AS $$
	SELECT k.id, k.tenant_id, k.scopes, k.expires_at, k.last_used_at
	FROM api_keys k
	WHERE k.key_hash = p_hash
		AND k.revoked_at IS NULL
		-- AUDIT-03: NULL expires_at = never expires (legacy). Anything else is
		-- strictly future-dated. Past expires_at rejects as if revoked.
		AND (k.expires_at IS NULL OR k.expires_at > now())
	LIMIT 1;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.lookup_api_key(text) TO verimaya_app;