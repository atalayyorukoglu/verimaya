-- WAHA-01: WhatsApp görsel/dosya ekleri Verimaya'ya gelsin.
--
-- WAHA medyayı kendi diskine indiriyor ve webhook'ta `media.url` veriyor; bize
-- yalnız "ek var" düşüyordu. Artık relay o dosyayı alıp imzalı olarak
-- `POST /v1/webhooks/waha/media`'ya gönderir; bayt R2/yerel depoya, satır buraya.
-- `files` tablosu kullanılmadı: orada `contact_id` zorunlu, ek gelirken kişi
-- henüz bilinmiyor. Mesaj başına en fazla bir ek (WhatsApp'ta öyle).
CREATE TABLE "inbound_message_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"inbound_message_id" uuid NOT NULL,
	"filename" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_message_media_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict,
	CONSTRAINT "inbound_message_media_message_fk" FOREIGN KEY ("inbound_message_id") REFERENCES "inbound_messages"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_message_media_tenant_message_uidx" ON "inbound_message_media" USING btree ("tenant_id","inbound_message_id");
--> statement-breakpoint
ALTER TABLE "inbound_message_media" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "inbound_message_media" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "inbound_message_media_tenant_isolation" ON "inbound_message_media"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
-- 0063'ten sonra ALTER DEFAULT PRIVILEGES yeni tablolara UPDATE vermiyor — açık yaz.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE inbound_message_media TO verimaya_app;
