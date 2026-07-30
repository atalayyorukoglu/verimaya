CREATE TABLE "external_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source" text NOT NULL,
	"entity_type" text NOT NULL,
	"external_id" text NOT NULL,
	"internal_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_ids_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "external_ids_tenant_source_entity_external_uidx" ON "external_ids" USING btree ("tenant_id","source","entity_type","external_id");
--> statement-breakpoint
CREATE INDEX "external_ids_tenant_entity_internal_idx" ON "external_ids" USING btree ("tenant_id","entity_type","internal_id");
--> statement-breakpoint
ALTER TABLE "external_ids" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "external_ids" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "external_ids_tenant_isolation" ON "external_ids"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE external_ids TO verimaya_app;
