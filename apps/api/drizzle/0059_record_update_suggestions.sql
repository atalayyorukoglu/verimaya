-- AI-02: kayıt güncelleme onay kuyruğu — yalnız appointments.starts_at (Madde 6.2 onay kapısı).
CREATE TABLE "record_update_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"field" text NOT NULL,
	"current_value" timestamp with time zone NOT NULL,
	"suggested_value" timestamp with time zone NOT NULL,
	"source_text" text NOT NULL,
	"confidence" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"reject_reason" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "record_update_suggestions_field_check" CHECK ("field" IN ('starts_at')),
	CONSTRAINT "record_update_suggestions_confidence_check" CHECK ("confidence" IN ('high', 'medium')),
	CONSTRAINT "record_update_suggestions_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected')),
	CONSTRAINT "record_update_suggestions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict,
	CONSTRAINT "record_update_suggestions_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "record_update_suggestions_tenant_id_status_created_at_idx" ON "record_update_suggestions" USING btree ("tenant_id","status","created_at");
--> statement-breakpoint
CREATE INDEX "record_update_suggestions_tenant_id_appointment_id_idx" ON "record_update_suggestions" USING btree ("tenant_id","appointment_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "record_update_suggestions_tenant_appointment_field_pending_uidx" ON "record_update_suggestions" USING btree ("tenant_id","appointment_id","field") WHERE "status" = 'pending' AND "deleted_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "record_update_suggestions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "record_update_suggestions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "record_update_suggestions_tenant_isolation" ON "record_update_suggestions"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE record_update_suggestions TO verimaya_app;
