-- Soft-delete + UNIQUE: unconditional (tenant_id, name) left soft-deleted names
-- unusable (create → 409 duplicate_type_name while the row is invisible in lists).
-- Partial unique indexes only active rows; soft-deleted names may be reused as new rows.
DROP INDEX IF EXISTS "organizations_tenant_id_name_uidx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_tenant_id_name_uidx"
	ON "organizations" USING btree ("tenant_id", "name")
	WHERE "deleted_at" IS NULL;
