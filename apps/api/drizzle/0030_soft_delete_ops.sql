-- GAP-06: soft-delete for appointments, contacts, transactions (patient already has deleted_at)

ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "appointments_tenant_id_deleted_at_idx"
	ON "appointments" USING btree ("tenant_id", "deleted_at");

CREATE INDEX IF NOT EXISTS "contacts_tenant_id_deleted_at_idx"
	ON "contacts" USING btree ("tenant_id", "deleted_at");

CREATE INDEX IF NOT EXISTS "transactions_tenant_id_deleted_at_idx"
	ON "transactions" USING btree ("tenant_id", "deleted_at");
