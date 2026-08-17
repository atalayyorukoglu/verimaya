-- Teşvik dosyası (incentive_files): kayıt + süre hatırlatma.
-- Süre gün sayısı tenant_settings.incentive_deadline_days; oran/limit/uygunluk YOK.
CREATE TABLE "incentive_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"contact_display_name" text NOT NULL,
	"transaction_id" uuid,
	"payment_date" date NOT NULL,
	"deadline_at" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"submitted_at" date,
	"note" text,
	"documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incentive_files_status_check" CHECK ("status" IN ('open', 'submitted', 'approved', 'rejected', 'expired')),
	CONSTRAINT "incentive_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict,
	CONSTRAINT "incentive_files_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE cascade,
	CONSTRAINT "incentive_files_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX "incentive_files_tenant_id_deadline_at_idx" ON "incentive_files" USING btree ("tenant_id","deadline_at");
--> statement-breakpoint
CREATE INDEX "incentive_files_tenant_id_deleted_at_idx" ON "incentive_files" USING btree ("tenant_id","deleted_at");
--> statement-breakpoint
CREATE INDEX "incentive_files_tenant_id_status_idx" ON "incentive_files" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX "incentive_files_tenant_id_contact_id_idx" ON "incentive_files" USING btree ("tenant_id","contact_id");
--> statement-breakpoint
ALTER TABLE "incentive_files" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "incentive_files" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "incentive_files_tenant_isolation" ON "incentive_files"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE incentive_files TO verimaya_app;
