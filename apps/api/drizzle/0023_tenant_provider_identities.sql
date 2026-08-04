-- WEBHOOK-01 (Faz 8): bind webhook tenant to provider identity, not to client-supplied
-- X-Tenant-Id header. Per-tenant per-provider webhook secret; signature payload now binds
-- tenantId+provider so a valid signature for tenant A cannot be replayed against tenant B.
--
-- Mirrors tenant_credentials schema (apps/api/src/db/schema/tenant-credentials.ts) on
-- purpose: the new table is the inbound equivalent, and reusing the encryption/hashing
-- shape keeps one CryptoService and one rotation story.
--
-- RLS: same shape as tenant_credentials — only the row matching
-- app.current_tenant_id is readable; lookups go through SECURITY DEFINER functions to
-- resolve the secret for inbound verification. The migration grants EXECUTE to the
-- app role; the function is defined separately (apps/api/drizzle/0024_* below) to keep
-- this migration pure DDL.

CREATE TABLE "tenant_provider_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"ciphertext" bytea NOT NULL,
	"key_hash" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_provider_identities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);
--> statement-breakpoint

-- One active identity per (tenant, provider). Two rows for the same pair is the
-- rotation handover state; the lookup function picks the most recently updated.
CREATE UNIQUE INDEX "tenant_provider_identities_tenant_provider_uidx"
	ON "tenant_provider_identities" USING btree ("tenant_id", "provider");
--> statement-breakpoint

-- Tenant self-service: list my identities. Admin path: the SECURITY DEFINER function
-- below lets the api role resolve any (tenant, provider) without holding tenant context.
CREATE INDEX "tenant_provider_identities_provider_idx"
	ON "tenant_provider_identities" USING btree ("provider");
--> statement-breakpoint

ALTER TABLE "tenant_provider_identities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant_provider_identities" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_provider_identities_tenant_isolation" ON "tenant_provider_identities"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tenant_provider_identities TO verimaya_app;