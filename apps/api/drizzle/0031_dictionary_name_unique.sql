-- GAP-F09-25: prevent duplicate dictionary names per tenant (case-insensitive).

CREATE UNIQUE INDEX IF NOT EXISTS "appointment_types_tenant_id_name_lower_unique"
  ON "appointment_types" ("tenant_id", lower("name"));

CREATE UNIQUE INDEX IF NOT EXISTS "contact_types_tenant_id_name_lower_unique"
  ON "contact_types" ("tenant_id", lower("name"));
