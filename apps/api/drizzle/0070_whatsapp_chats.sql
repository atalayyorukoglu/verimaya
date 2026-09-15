-- WhatsApp sohbetine ad ve görev.
--
-- Gelen kutusu grubun adı yerine kimliğini (`120363143271144447@g.us`) yazıyordu:
-- WAHA'nın NOWEB motoru webhook gövdesinde sohbet adı göndermiyor. Ad burada elle
-- tutulur. İkinci işi: `purpose` ayrıştırıcıya "bu grupta ne aransın" der.
CREATE TABLE "whatsapp_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chat_id" text NOT NULL,
	"name" text NOT NULL,
	"purpose" text DEFAULT 'mixed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_chats_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict,
	CONSTRAINT "whatsapp_chats_purpose_chk" CHECK ("purpose" IN ('finance', 'operations', 'mixed', 'ignore'))
);
--> statement-breakpoint
CREATE INDEX "whatsapp_chats_tenant_id_created_at_idx" ON "whatsapp_chats" USING btree ("tenant_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_chats_tenant_id_chat_id_uidx" ON "whatsapp_chats" USING btree ("tenant_id","chat_id");
--> statement-breakpoint
ALTER TABLE "whatsapp_chats" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "whatsapp_chats" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "whatsapp_chats_tenant_isolation" ON "whatsapp_chats"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
-- 0063'ten sonra ALTER DEFAULT PRIVILEGES yeni tablolara UPDATE vermiyor — açık yaz.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE whatsapp_chats TO verimaya_app;
