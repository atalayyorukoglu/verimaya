-- DOMAIN-01 Adım 2+3: patient status = operations file (CRM funnel removed).
-- Remap any non-operational value to scheduled, then tighten CHECK + DEFAULT.
-- Must ship with patientStatusSchema narrowing — cannot land as a separate commit.

UPDATE "patients"
SET "status" = 'scheduled'
WHERE "status" NOT IN ('scheduled', 'arrived', 'treated', 'follow_up', 'cancelled');
--> statement-breakpoint
ALTER TABLE "patients" ALTER COLUMN "status" SET DEFAULT 'scheduled';
--> statement-breakpoint
ALTER TABLE "patients" DROP CONSTRAINT "patients_status_chk";
--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_status_chk" CHECK ("status" IN (
	'scheduled', 'arrived', 'treated', 'follow_up', 'cancelled'
));
