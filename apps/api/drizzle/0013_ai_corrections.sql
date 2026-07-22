CREATE TABLE "ai_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"inbound_message_id" uuid,
	"original_parsed" jsonb NOT NULL,
	"corrected" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_corrections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "ai_corrections_inbound_message_id_inbound_messages_id_fk" FOREIGN KEY ("inbound_message_id") REFERENCES "inbound_messages"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX "ai_corrections_tenant_created_at_idx" ON "ai_corrections" USING btree ("tenant_id","created_at" DESC);
--> statement-breakpoint
ALTER TABLE "ai_corrections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_corrections" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ai_corrections_tenant_isolation" ON "ai_corrections"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_corrections TO verimaya_app;
