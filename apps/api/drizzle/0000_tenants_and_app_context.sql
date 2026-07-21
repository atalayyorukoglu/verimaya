CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql
VOLATILE
AS $$
  SELECT nullif(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"base_currency" text DEFAULT 'TRY' NOT NULL,
	"patients_section_label" text DEFAULT 'Hastalar' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "tenants_slug_uidx" ON "tenants" USING btree ("slug");
