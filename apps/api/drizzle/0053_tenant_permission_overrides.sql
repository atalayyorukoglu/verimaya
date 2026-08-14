-- G-11: tenant-scoped permission denials (override code defaults; restrict-only).
CREATE TABLE "tenant_permission_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" text NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"allowed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_permission_overrides_tenant_id_tenants_id_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "tenant_permission_overrides_allowed_deny_only" CHECK ("allowed" = false)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_permission_overrides_tenant_role_resource_action_uidx"
	ON "tenant_permission_overrides" USING btree ("tenant_id", "role", "resource", "action");
--> statement-breakpoint
ALTER TABLE "tenant_permission_overrides" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant_permission_overrides" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_permission_overrides_tenant_isolation" ON "tenant_permission_overrides"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tenant_permission_overrides TO verimaya_app;
