-- Transactions list order is occurred_on DESC, id DESC (not created_at).
-- Composite indexes for tenant-wide and patient/contact filtered pages + cursor.

CREATE INDEX IF NOT EXISTS "transactions_tenant_occurred_on_id_idx"
	ON "transactions" ("tenant_id", "occurred_on", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_tenant_patient_occurred_on_id_idx"
	ON "transactions" ("tenant_id", "patient_id", "occurred_on", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_tenant_contact_occurred_on_id_idx"
	ON "transactions" ("tenant_id", "contact_id", "occurred_on", "id");
