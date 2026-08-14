-- @veri-migration: transactions.case_contact_id — patient/case link independent of counterparty
ALTER TABLE "transactions" ADD COLUMN "case_contact_id" uuid;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_case_contact_id_contacts_id_fk"
	FOREIGN KEY ("case_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "transactions_tenant_id_case_contact_id_idx"
	ON "transactions" USING btree ("tenant_id", "case_contact_id");
