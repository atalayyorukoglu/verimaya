-- DOMAIN-02 B1: expand contacts with person/CRM fields + organizations dictionary.
-- Additive only — no data drop, no patients merge (that's B2/B3).
-- Idempotent: safe to re-run (IF NOT EXISTS / duplicate_object guards).

-- ---------------------------------------------------------------------------
-- organizations (tenant dictionary; §0-A)
-- RLS pattern mirrors appointment_types (0028): ENABLE + FORCE +
-- FOR ALL USING/WITH CHECK (tenant_id = app.current_tenant_id()) + GRANT app role.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_tenant_id_tenants_id_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_tenant_id_name_uidx"
	ON "organizations" USING btree ("tenant_id", "name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_tenant_id_created_at_idx"
	ON "organizations" USING btree ("tenant_id", "created_at" DESC);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "organizations_tenant_isolation" ON "organizations";
--> statement-breakpoint
CREATE POLICY "organizations_tenant_isolation" ON "organizations"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE organizations TO verimaya_app;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- contacts: new nullable person / CRM columns
-- ---------------------------------------------------------------------------
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "first_name" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "last_name" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "status" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "assigned_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "source" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "medium" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "campaign" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "referred_by_contact_id" uuid;
--> statement-breakpoint

-- FKs (idempotent via duplicate_object)
DO $$ BEGIN
	ALTER TABLE "contacts"
		ADD CONSTRAINT "contacts_organization_id_organizations_id_fk"
		FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE set null;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "contacts"
		ADD CONSTRAINT "contacts_assigned_user_id_user_id_fk"
		FOREIGN KEY ("assigned_user_id") REFERENCES "user"("id") ON DELETE set null;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "contacts"
		ADD CONSTRAINT "contacts_referred_by_contact_id_contacts_id_fk"
		FOREIGN KEY ("referred_by_contact_id") REFERENCES "contacts"("id") ON DELETE set null;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Backfill first_name / last_name from display_name (only where first_name still NULL).
-- display_name unchanged in all branches.
--
-- Heuristic (contact_type_name is a free-text tenant dictionary):
--   Firm / institutional defaults from packages/shared DEFAULT_CONTACT_TYPE_NAMES:
--     'Klinik', 'Otel', 'Transfer'
--     → first_name = entire display_name, last_name = NULL
--       (splitting "Grand Blue Hotel" into ad/soyad is meaningless in the UI).
--   Everything else (seed person types 'Hasta', 'Diğer', plus custom names like
--     'Çalışan', or any unrecognized tenant-specific label):
--     → split like a person name — safe default because most CRM rows are people.
--       "Mehmet Ali Kaya" → first_name='Mehmet', last_name='Ali Kaya'
--       Single-word names → last_name NULL.
-- ---------------------------------------------------------------------------
UPDATE "contacts"
SET
	first_name = CASE
		WHEN contact_type_name IN ('Klinik', 'Otel', 'Transfer') THEN btrim(display_name)
		ELSE split_part(btrim(display_name), ' ', 1)
	END,
	last_name = CASE
		WHEN contact_type_name IN ('Klinik', 'Otel', 'Transfer') THEN NULL
		ELSE NULLIF(
			btrim(substr(btrim(display_name), char_length(split_part(btrim(display_name), ' ', 1)) + 1)),
			''
		)
	END
WHERE first_name IS NULL
	AND display_name IS NOT NULL
	AND btrim(display_name) <> '';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "contacts_tenant_referred_by_idx"
	ON "contacts" USING btree ("tenant_id", "referred_by_contact_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_tenant_status_updated_at_idx"
	ON "contacts" USING btree ("tenant_id", "status", "updated_at" DESC);
