-- DOMAIN-02 §0-D: cut patients — no data migration (demo/ETL only).
-- Same deploy as Faz C API. Idempotent where practical.
-- Order: clear dependents → rewrite FK columns → DROP patients CASCADE → cleanup.

-- ---------------------------------------------------------------------------
-- §0-D: discard dependent demo rows so NOT NULL contact_id can be added
-- ---------------------------------------------------------------------------
DELETE FROM "files";
--> statement-breakpoint
DELETE FROM "case_notes";
--> statement-breakpoint
DELETE FROM "appointments";
--> statement-breakpoint
UPDATE "transactions" SET "patient_id" = NULL, "patient_display_name" = NULL
	WHERE "patient_id" IS NOT NULL OR "patient_display_name" IS NOT NULL;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- appointments: patient_* → contact_*
-- ---------------------------------------------------------------------------
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_patient_id_patients_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "appointments_tenant_id_patient_id_created_at_idx";
--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "patient_id";
--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "patient_display_name";
--> statement-breakpoint
-- Empty table: ADD NOT NULL without default is allowed.
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "contact_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "contact_display_name" text NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "appointments"
		ADD CONSTRAINT "appointments_contact_id_contacts_id_fk"
		FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE cascade;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_tenant_id_contact_id_created_at_idx"
	ON "appointments" USING btree ("tenant_id", "contact_id", "created_at" DESC);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- files: patient_id → contact_id
-- ---------------------------------------------------------------------------
ALTER TABLE "files" DROP CONSTRAINT IF EXISTS "files_patient_id_patients_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "files_tenant_id_patient_id_created_at_idx";
--> statement-breakpoint
ALTER TABLE "files" DROP COLUMN IF EXISTS "patient_id";
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "contact_id" uuid NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "files"
		ADD CONSTRAINT "files_contact_id_contacts_id_fk"
		FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE cascade;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "files_tenant_id_contact_id_created_at_idx"
	ON "files" USING btree ("tenant_id", "contact_id", "created_at" DESC);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- case_notes: patient_id → contact_id
-- ---------------------------------------------------------------------------
ALTER TABLE "case_notes" DROP CONSTRAINT IF EXISTS "case_notes_patient_id_patients_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "case_notes_tenant_id_patient_id_created_at_idx";
--> statement-breakpoint
ALTER TABLE "case_notes" DROP COLUMN IF EXISTS "patient_id";
--> statement-breakpoint
ALTER TABLE "case_notes" ADD COLUMN IF NOT EXISTS "contact_id" uuid NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "case_notes"
		ADD CONSTRAINT "case_notes_contact_id_contacts_id_fk"
		FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE cascade;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_notes_tenant_id_contact_id_created_at_idx"
	ON "case_notes" USING btree ("tenant_id", "contact_id", "created_at" DESC);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- transactions: drop patient_*; rename/add contact_display_name
-- ---------------------------------------------------------------------------
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_patient_id_patients_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "transactions_tenant_id_patient_id_created_at_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "transactions_tenant_patient_occurred_on_id_idx";
--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "patient_id";
--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'transactions'
			AND column_name = 'patient_display_name'
	) AND NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'transactions'
			AND column_name = 'contact_display_name'
	) THEN
		ALTER TABLE "transactions" RENAME COLUMN "patient_display_name" TO "contact_display_name";
	ELSE
		ALTER TABLE "transactions" DROP COLUMN IF EXISTS "patient_display_name";
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = 'transactions'
				AND column_name = 'contact_display_name'
		) THEN
			ALTER TABLE "transactions" ADD COLUMN "contact_display_name" text;
		END IF;
	END IF;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- DROP patients (CASCADE drops leftover FKs/policies/indexes on that table)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "patients" CASCADE;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Cleanup: external_ids / ai_corrections / audit_logs
-- ---------------------------------------------------------------------------
DELETE FROM "external_ids" WHERE "entity_type" = 'patient';
--> statement-breakpoint
-- ai_corrections stores whole draft JSON (no per-field column). Rename draft keys
-- so the learning report (AI_CORRECTION_COMPARE_FIELDS) still finds diffs.
UPDATE "ai_corrections"
SET
	"original_parsed" = replace(
		replace("original_parsed"::text, '"patient_id"', '"contact_id"'),
		'"patient_display_name"',
		'"contact_display_name"'
	)::jsonb,
	"corrected" = replace(
		replace("corrected"::text, '"patient_id"', '"contact_id"'),
		'"patient_display_name"',
		'"contact_display_name"'
	)::jsonb
WHERE
	"original_parsed"::text LIKE '%patient_%'
	OR "corrected"::text LIKE '%patient_%';
--> statement-breakpoint
UPDATE "audit_logs"
SET "entity_type" = 'contact'
WHERE "entity_type" = 'patient';
