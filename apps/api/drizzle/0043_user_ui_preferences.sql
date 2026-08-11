-- Per-user + organization UI preferences (product modules in sidebar).
-- Org isolation via RLS; user isolation via service-layer user_id filters.

CREATE TABLE "user_ui_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"enabled_product_modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_ui_preferences_user_id_user_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade,
	CONSTRAINT "user_ui_preferences_organization_id_tenants_id_fk"
		FOREIGN KEY ("organization_id") REFERENCES "tenants"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_ui_preferences_user_org_uidx"
	ON "user_ui_preferences" USING btree ("user_id", "organization_id");
--> statement-breakpoint
ALTER TABLE "user_ui_preferences" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_ui_preferences" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "user_ui_preferences_tenant_isolation" ON "user_ui_preferences"
	FOR ALL
	USING (organization_id = app.current_tenant_id())
	WITH CHECK (organization_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_ui_preferences TO verimaya_app;
