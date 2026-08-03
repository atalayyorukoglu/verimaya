-- CONTRACT-01 (Faz 2.1): transactions.contact_id became a real list filter
-- (contacts/[id] page: GET /v1/transactions?contact_id=...). Add the missing
-- tenant-scoped composite index, matching the existing patient_id one.
CREATE INDEX "transactions_tenant_id_contact_id_created_at_idx" ON "transactions" USING btree ("tenant_id","contact_id","created_at");
