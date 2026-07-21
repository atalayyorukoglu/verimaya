-- Idempotency keys + patient soft delete (0005 — after 0004_core_domain, before 0006_queue_platform)

ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "patients_tenant_id_deleted_at_idx"
	ON "patients" USING btree ("tenant_id", "deleted_at");

CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status_code" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);

CREATE UNIQUE INDEX "idempotency_keys_tenant_key_uidx" ON "idempotency_keys" USING btree ("tenant_id", "key");
CREATE INDEX "idempotency_keys_tenant_id_idx" ON "idempotency_keys" USING btree ("tenant_id");

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY idempotency_keys_tenant_isolation ON idempotency_keys
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE idempotency_keys TO verimaya_app;
