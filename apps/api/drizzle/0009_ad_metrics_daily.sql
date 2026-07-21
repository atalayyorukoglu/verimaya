CREATE TABLE "ad_metrics_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"date" date NOT NULL,
	"campaign_id" text NOT NULL,
	"spend_minor" integer NOT NULL,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	CONSTRAINT "ad_metrics_daily_provider_check" CHECK ("provider" IN ('meta', 'google')),
	CONSTRAINT "ad_metrics_daily_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ad_metrics_daily_tenant_provider_date_campaign_uidx" ON "ad_metrics_daily" USING btree ("tenant_id","provider","date","campaign_id");
--> statement-breakpoint
CREATE INDEX "ad_metrics_daily_tenant_date_idx" ON "ad_metrics_daily" USING btree ("tenant_id","date" DESC);
--> statement-breakpoint
ALTER TABLE "ad_metrics_daily" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ad_metrics_daily" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ad_metrics_daily_tenant_isolation" ON "ad_metrics_daily"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ad_metrics_daily TO verimaya_app;
