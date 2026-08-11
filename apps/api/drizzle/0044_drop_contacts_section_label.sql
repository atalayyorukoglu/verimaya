-- DOMAIN-02 leftover: drop tenants.contacts_section_label.
-- Redundant with contact_types tenant CRUD rename; field was never consumed outside settings form.

ALTER TABLE "tenants" DROP COLUMN IF EXISTS "contacts_section_label";
