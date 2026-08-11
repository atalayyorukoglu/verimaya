-- AUDIT-F09-07b: KVKK m.11 contact data-subject — deletion/anonymization request ledger.
-- Separate from data_deletion_requests (panel-user subject). Hard-delete yok; identifying
-- fields masked on apply; financial rows and contact_id links stay.

CREATE TABLE "contact_data_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_contact_id" uuid NOT NULL,
	"status" text NOT NULL,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_data_deletion_requests_tenant_id_tenants_id_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict,
	CONSTRAINT "contact_data_deletion_requests_subject_contact_id_contacts_id_fk"
		FOREIGN KEY ("subject_contact_id") REFERENCES "contacts"("id") ON DELETE restrict,
	CONSTRAINT "contact_data_deletion_requests_status_chk"
		CHECK ("status" IN ('received', 'applied'))
);
--> statement-breakpoint
CREATE INDEX "contact_data_deletion_requests_tenant_subject_created_idx"
	ON "contact_data_deletion_requests" USING btree ("tenant_id", "subject_contact_id", "created_at");
--> statement-breakpoint
ALTER TABLE "contact_data_deletion_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contact_data_deletion_requests" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "contact_data_deletion_requests_tenant_isolation" ON "contact_data_deletion_requests"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE contact_data_deletion_requests TO verimaya_app;
