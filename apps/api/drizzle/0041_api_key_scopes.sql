-- AUDIT-F09-02: api_keys.scopes text[] ('read'|'write') → JSONB array of
-- `resource:action` strings. Legacy keys keep equivalent AuthOrApiKey power
-- (contact/finance/settings only — no silent expand into session-only resources).

ALTER TABLE api_keys ADD COLUMN scopes_new jsonb;
--> statement-breakpoint

UPDATE api_keys
SET scopes_new = CASE
	WHEN 'write' = ANY (scopes) THEN
		'[
			"contact:create","contact:read","contact:update","contact:delete",
			"finance:create","finance:read","finance:update","finance:delete",
			"settings:read","settings:update"
		]'::jsonb
	WHEN 'read' = ANY (scopes) THEN
		'["contact:read","finance:read","settings:read"]'::jsonb
	ELSE '[]'::jsonb
END;
--> statement-breakpoint

ALTER TABLE api_keys DROP COLUMN scopes;
--> statement-breakpoint

ALTER TABLE api_keys RENAME COLUMN scopes_new TO scopes;
--> statement-breakpoint

ALTER TABLE api_keys ALTER COLUMN scopes SET NOT NULL;
--> statement-breakpoint

ALTER TABLE api_keys
	ADD CONSTRAINT api_keys_scopes_is_array CHECK (jsonb_typeof(scopes) = 'array');
--> statement-breakpoint

DROP FUNCTION IF EXISTS app.lookup_api_key(text);
--> statement-breakpoint

CREATE FUNCTION app.lookup_api_key(p_hash text)
RETURNS TABLE(
	id uuid,
	tenant_id uuid,
	scopes jsonb,
	expires_at timestamp with time zone,
	last_used_at timestamp with time zone
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app
AS $$
	SELECT k.id, k.tenant_id, k.scopes, k.expires_at, k.last_used_at
	FROM api_keys k
	WHERE k.key_hash = p_hash
		AND k.revoked_at IS NULL
		AND (k.expires_at IS NULL OR k.expires_at > now())
	LIMIT 1;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.lookup_api_key(text) TO verimaya_app;
