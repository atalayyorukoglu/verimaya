-- EVRAK-01: WhatsApp ekinin belge türü + hangi vizite ait olduğu.
--
-- Karar (docs/2026-09-16-HASTA-AKISI.md § 6.3): Evrak grubundaki başlıklar zaten
-- standart (`Ad Soyad + belge türü + visit N/rpt`). Tür sözlükten çıkarılıyor
-- (apps/api/src/whatsapp/evrak-sinifla.ts, saf fonksiyon — LLM yok), kontrol
-- listesi de bu sütuna bakarak kendini işaretliyor.
--
-- Neden CHECK kısıtı yok: tür sözlüğü ürün kararıyla büyüyor (0078'deki
-- visit_type'ın aksine, orada altı değer kapalı bir kümedir). Yeni tür eklemek
-- migration gerektirmesin; doğrulama şemada (packages/shared/src/media-doc.ts)
-- ve uçta yapılıyor. Tanınmayan değer zaten yazılmıyor.
--
-- `contact_visit_id` NULLABLE ve ON DELETE SET NULL: ek kesin kayıttır, vizit
-- ise sonradan düzeltilebilir bir çerçevedir. Vizit silinince ek kaybolmaz,
-- "Vizit belirsiz" grubuna düşer.
ALTER TABLE "inbound_message_media" ADD COLUMN "doc_type" text;
--> statement-breakpoint
ALTER TABLE "inbound_message_media" ADD COLUMN "doc_subtype" text;
--> statement-breakpoint
ALTER TABLE "inbound_message_media" ADD COLUMN "visit_hint" text;
--> statement-breakpoint
ALTER TABLE "inbound_message_media" ADD COLUMN "contact_visit_id" uuid;
--> statement-breakpoint
ALTER TABLE "inbound_message_media"
	ADD CONSTRAINT "inbound_message_media_visit_fk"
	FOREIGN KEY ("contact_visit_id") REFERENCES "contact_visits"("id") ON DELETE set null;
--> statement-breakpoint
-- Kontrol listesi sorgusu: "bu vizitte bu türden ek var mı".
CREATE INDEX "inbound_message_media_tenant_visit_type_idx"
	ON "inbound_message_media" USING btree ("tenant_id","contact_visit_id","doc_type");
--> statement-breakpoint
-- Dosyalar sekmesi ve kontrol listesi kişi üzerinden gelir; tür filtresi burada.
CREATE INDEX "inbound_message_media_tenant_doc_type_idx"
	ON "inbound_message_media" USING btree ("tenant_id","doc_type");
