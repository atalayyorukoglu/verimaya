-- WEBHOOK-01 (Faz 8): inbound webhook tenant resolution.
--
-- Webhook handlers run BEFORE any session is established (the request is from an
-- external provider, not an authenticated user). They cannot use
-- app.current_tenant_id() to look up the per-tenant secret, because we don't yet know
-- which tenant the request is for. Hence SECURITY DEFINER: the function runs as the
-- migration owner (NOBYPASSRLS superuser-on-DB / the migration role in prod) and
-- selects from tenant_provider_identities WITHOUT going through RLS.
--
-- The lookup takes both the SHA-256 key hash AND a claimed tenantId. The tenantId is
-- not trusted for routing — it is included only as a defensive check to make hash
-- collisions across tenants irrelevant. The function returns the active identity row
-- regardless of which tenant the hash matches; the caller (webhook controller) treats
-- the row's tenant_id as canonical. If the caller asserts tenant A but the row lives
-- under tenant B, the caller rejects the request (cross-tenant spoof attempt).

CREATE OR REPLACE FUNCTION app.lookup_tenant_provider_identity(
	p_provider text,
	p_key_hash text
) RETURNS TABLE(id uuid, tenant_id uuid, ciphertext bytea, key_version integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app
AS $$
	SELECT i.id, i.tenant_id, i.ciphertext, i.key_version
	FROM tenant_provider_identities i
	WHERE i.provider = p_provider
		AND i.key_hash = p_key_hash
	ORDER BY i.updated_at DESC
	LIMIT 1;
$$;
--> statement-breakpoint

-- WEBHOOK-01 (Faz 8): inbound webhook signature verification needs to enumerate ALL
-- identities for (provider, claimedTenantId) so it can try each candidate's decrypted
-- secret against the supplied signature — the signature itself is the anchor (we don't
-- know which secret to look up by). SECURITY DEFINER + forced RLS on the underlying
-- table means a normal session would see zero rows without tenant context. This function
-- narrows by the claimed tenant id only — it does NOT verify the claimed id is real;
-- the caller still has to match the resolved tenant_id back to the claim, and reject
-- when they differ (which is the cross-tenant spoof check).
CREATE OR REPLACE FUNCTION app.lookup_tenant_provider_identities_for_claim(
	p_provider text,
	p_claimed_tenant uuid
) RETURNS TABLE(id uuid, tenant_id uuid, ciphertext bytea, key_version integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app
AS $$
	SELECT i.id, i.tenant_id, i.ciphertext, i.key_version
	FROM tenant_provider_identities i
	WHERE i.provider = p_provider
		AND i.tenant_id = p_claimed_tenant
	ORDER BY i.updated_at DESC;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.lookup_tenant_provider_identity(text, text) TO verimaya_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.lookup_tenant_provider_identities_for_claim(text, uuid) TO verimaya_app;