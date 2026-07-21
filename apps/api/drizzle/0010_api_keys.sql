CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "api_keys_tenant_created_at_idx" ON "api_keys" USING btree ("tenant_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");
--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "api_keys_tenant_isolation" ON "api_keys"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE api_keys TO verimaya_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.lookup_api_key(p_hash text)
RETURNS TABLE(id uuid, tenant_id uuid, scopes text[])
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app
AS $$
	SELECT k.id, k.tenant_id, k.scopes
	FROM api_keys k
	WHERE k.key_hash = p_hash
		AND k.revoked_at IS NULL
	LIMIT 1;
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.lookup_api_key(text) TO verimaya_app;
