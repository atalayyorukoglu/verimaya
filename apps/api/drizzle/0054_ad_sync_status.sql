-- OPS-02 hata yüzeyleme: en son ad_metrics.sync denemesinin sonucu, sağlayıcı başına.
CREATE TABLE "ad_sync_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"last_error" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_sync_status_provider_check" CHECK ("provider" IN ('meta', 'google')),
	CONSTRAINT "ad_sync_status_status_check" CHECK ("status" IN ('success', 'error')),
	CONSTRAINT "ad_sync_status_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ad_sync_status_tenant_provider_uidx" ON "ad_sync_status" USING btree ("tenant_id","provider");
--> statement-breakpoint
ALTER TABLE "ad_sync_status" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ad_sync_status" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ad_sync_status_tenant_isolation" ON "ad_sync_status"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ad_sync_status TO verimaya_app;
