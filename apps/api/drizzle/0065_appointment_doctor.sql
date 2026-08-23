-- Hekim alanı — "Z hekiminde RPT oranı arttı" cümlesini kurabilmek için.
-- Karar (b), bkz. docs/2026-08-23-maya-icgoru-sorulari.md § Karar 1: hekim ayrı bir
-- varlık değil, `contacts` içinde ünvanı "Hekim" olan bir kişi; randevuya FK ile bağlanır.
-- Desen `clinic_contact_id` / `hotel_contact_id` / `transfer_contact_id` ile birebir aynı.
--
-- Mevcut tabloya kolon ekleniyor: RLS/policy zaten `appointments` üzerinde tanımlı,
-- kolon bazlı değil — dokunulmuyor. 0063'ten sonra ALTER DEFAULT PRIVILEGES yeni
-- TABLOLARA UPDATE vermiyor; bu yeni tablo değil, GRANT'a dokunmaya gerek yok.
ALTER TABLE "appointments" ADD COLUMN "doctor_contact_id" uuid;
--> statement-breakpoint
-- ON DELETE SET NULL: hekim kişisi silinse (GDPR hard-delete) de randevu kaydı kalır,
-- yalnız hekim bağı kopar. clinic/hotel/transfer ile aynı gerekçe.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_contact_id_contacts_id_fk"
	FOREIGN KEY ("doctor_contact_id") REFERENCES "contacts"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "appointments_tenant_id_doctor_contact_id_idx" ON "appointments" USING btree ("tenant_id","doctor_contact_id");
