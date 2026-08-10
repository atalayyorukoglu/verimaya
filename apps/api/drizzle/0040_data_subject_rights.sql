-- AUDIT-F09-07: KVKK m.11 data-subject — retention horizon + deletion-request ledger.
-- Hard-delete yok (Açık sorular §1); identifying fields anonymized on apply.

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "data_retention_until" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE "data_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_deletion_requests_tenant_id_tenants_id_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "data_deletion_requests_subject_user_id_user_id_fk"
		FOREIGN KEY ("subject_user_id") REFERENCES "user"("id") ON DELETE restrict,
	CONSTRAINT "data_deletion_requests_status_chk"
		CHECK ("status" IN ('received', 'applied'))
);
--> statement-breakpoint
CREATE INDEX "data_deletion_requests_tenant_subject_created_idx"
	ON "data_deletion_requests" USING btree ("tenant_id", "subject_user_id", "created_at");
--> statement-breakpoint
ALTER TABLE "data_deletion_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "data_deletion_requests" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "data_deletion_requests_tenant_isolation" ON "data_deletion_requests"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE data_deletion_requests TO verimaya_app;
