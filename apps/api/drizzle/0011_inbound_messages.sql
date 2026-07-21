CREATE TABLE "inbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text DEFAULT 'waha' NOT NULL,
	"external_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_messages_tenant_provider_external_uidx" ON "inbound_messages" USING btree ("tenant_id","provider","external_id");
--> statement-breakpoint
CREATE INDEX "inbound_messages_tenant_created_at_idx" ON "inbound_messages" USING btree ("tenant_id","created_at" DESC);
--> statement-breakpoint
ALTER TABLE "inbound_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "inbound_messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "inbound_messages_tenant_isolation" ON "inbound_messages"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE inbound_messages TO verimaya_app;
