-- KISI-01: WhatsApp mesajı → kişi bağı.
--
-- Kuyruk mesaj başına kart üretiyordu; kullanıcı kişiyi A'dan Z'ye izlemek istiyor
-- ("Claire bilet attı, geldi, tedavi oldu, ödedi"). İlk adım: her gelen mesajın
-- hangi kişilerden bahsettiğini işaretlemek. Bağ ad eşleşmesiyle (kisi-eslestir.ts)
-- kurulur; `method` hangi kuralın bağladığını söyler ki "neden Claire'e bağladın"
-- sorusunun cevabı olsun. Kişi silinince bağ da gider (cascade); mesaj silinince de.
CREATE TABLE "inbound_message_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"inbound_message_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"method" text NOT NULL,
	"matched_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_message_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict,
	CONSTRAINT "inbound_message_contacts_message_fk" FOREIGN KEY ("inbound_message_id") REFERENCES "inbound_messages"("id") ON DELETE cascade,
	CONSTRAINT "inbound_message_contacts_contact_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE cascade,
	CONSTRAINT "inbound_message_contacts_method_chk" CHECK ("method" IN ('exact', 'name', 'surname', 'model', 'manual'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_message_contacts_tenant_message_contact_uidx" ON "inbound_message_contacts" USING btree ("tenant_id","inbound_message_id","contact_id");
--> statement-breakpoint
CREATE INDEX "inbound_message_contacts_tenant_contact_created_idx" ON "inbound_message_contacts" USING btree ("tenant_id","contact_id","created_at");
--> statement-breakpoint
CREATE INDEX "inbound_message_contacts_tenant_message_idx" ON "inbound_message_contacts" USING btree ("tenant_id","inbound_message_id");
--> statement-breakpoint
ALTER TABLE "inbound_message_contacts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "inbound_message_contacts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "inbound_message_contacts_tenant_isolation" ON "inbound_message_contacts"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
-- 0063'ten sonra ALTER DEFAULT PRIVILEGES yeni tablolara UPDATE vermiyor — açık yaz.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE inbound_message_contacts TO verimaya_app;
