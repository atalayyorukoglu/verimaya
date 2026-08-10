-- DOMAIN-02 Faz F: remaining patient* naming cleanup
-- 1) tenants.patients_section_label → contacts_section_label (display value unchanged)
-- 2) audit_logs CHECK: drop 'patient' (rows already remapped in 0036)
-- 3) Idempotent remap if any residual audit_logs.entity_type = 'patient'

ALTER TABLE "tenants" RENAME COLUMN "patients_section_label" TO "contacts_section_label";
--> statement-breakpoint
UPDATE "audit_logs"
SET "entity_type" = 'contact'
WHERE "entity_type" = 'patient';
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_entity_type_chk";
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_entity_type_chk" CHECK ("entity_type" IN (
	'contact', 'appointment', 'transaction', 'inbound_message', 'file', 'tenant', 'user'
));
