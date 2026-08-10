-- GAP-F09-23: soft-delete for contact files (hard-delete yok; blob physical sweep ayrı).

ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "files_tenant_id_deleted_at_idx"
	ON "files" USING btree ("tenant_id", "deleted_at");
