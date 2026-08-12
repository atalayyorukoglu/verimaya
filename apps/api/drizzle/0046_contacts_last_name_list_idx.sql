-- Contacts list order is last_name ASC NULLS LAST, first_name ASC NULLS LAST, id ASC
-- (phonebook). Composite index for tenant-wide pages + keyset cursor.

CREATE INDEX IF NOT EXISTS "contacts_tenant_last_name_first_name_id_idx"
	ON "contacts" ("tenant_id", "last_name", "first_name", "id");
