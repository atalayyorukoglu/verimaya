-- AI-04: zaman kilitli operasyon alarmları (deterministik — model/LLM yok).
-- due_at = appointment.starts_at − threshold_hours. Teyit insan işidir.
CREATE TABLE "operation_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"threshold_hours" integer NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operation_alerts_kind_check" CHECK ("kind" IN ('flight', 'transfer', 'welcome', 'clinic')),
	CONSTRAINT "operation_alerts_threshold_hours_positive_chk" CHECK ("threshold_hours" > 0),
	CONSTRAINT "operation_alerts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict,
	CONSTRAINT "operation_alerts_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "operation_alerts_tenant_id_due_at_idx" ON "operation_alerts" USING btree ("tenant_id","due_at");
--> statement-breakpoint
CREATE INDEX "operation_alerts_tenant_id_appointment_id_idx" ON "operation_alerts" USING btree ("tenant_id","appointment_id");
--> statement-breakpoint
CREATE INDEX "operation_alerts_tenant_id_confirmed_at_idx" ON "operation_alerts" USING btree ("tenant_id","confirmed_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "operation_alerts_tenant_appointment_kind_uidx" ON "operation_alerts" USING btree ("tenant_id","appointment_id","kind") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "operation_alerts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "operation_alerts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "operation_alerts_tenant_isolation" ON "operation_alerts"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operation_alerts TO verimaya_app;
