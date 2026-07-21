CREATE TABLE "webhook_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"event_types" text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "webhook_subscriptions_tenant_created_at_idx" ON "webhook_subscriptions" USING btree ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX "webhook_subscriptions_tenant_active_idx" ON "webhook_subscriptions" USING btree ("tenant_id","active");
--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "webhook_subscriptions_tenant_isolation" ON "webhook_subscriptions"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE webhook_subscriptions TO verimaya_app;
