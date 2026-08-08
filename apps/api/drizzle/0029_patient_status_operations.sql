-- DOMAIN-01: patient status = operasyon dosyası (CRM hunisi kaldırıldı)

UPDATE "patients"
SET "status" = 'scheduled'
WHERE "status" IN ('lead', 'contacted', 'qualified');

UPDATE "patients"
SET "status" = 'treated'
WHERE "status" = 'closed_won';

UPDATE "patients"
SET "status" = 'cancelled'
WHERE "status" = 'closed_lost';

ALTER TABLE "patients" DROP CONSTRAINT "patients_status_chk";

ALTER TABLE "patients"
	ADD CONSTRAINT "patients_status_chk" CHECK (
		"status" IN ('scheduled', 'arrived', 'treated', 'follow_up', 'cancelled')
	);

ALTER TABLE "patients" ALTER COLUMN "status" SET DEFAULT 'scheduled';
