-- @veri-migration: Personel contact type for existing tenants + transactions.responsible_contact_id
INSERT INTO "contact_types" ("id", "tenant_id", "name", "sort_order", "created_at")
SELECT gen_random_uuid(), t."id", 'Personel',
	COALESCE((SELECT MAX(ct."sort_order") FROM "contact_types" ct WHERE ct."tenant_id" = t."id"), -1) + 1,
	now()
FROM "tenants" t
WHERE NOT EXISTS (
	SELECT 1 FROM "contact_types" ct
	WHERE ct."tenant_id" = t."id" AND ct."name" = 'Personel'
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "responsible_contact_id" uuid;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_responsible_contact_id_contacts_id_fk"
	FOREIGN KEY ("responsible_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "transactions_tenant_id_responsible_contact_id_idx"
	ON "transactions" USING btree ("tenant_id", "responsible_contact_id");
