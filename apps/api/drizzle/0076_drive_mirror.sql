-- DRIVE-01: WhatsApp'tan gelen hasta belgeleri firmanın Google Drive'ına aynalanır.
--
-- Karar (kullanıcı, 2026-09-15): eski sistemdeki gibi firma kendi Google
-- Workspace'ini bağlar; sistem Drive'da kişi adıyla klasör açıp belgeleri oraya
-- kopyalar. Drive AYNADIR — ana kayıt Verimaya'nın deposudur (`inbound_message_media`
-- + FILE_STORAGE), Drive tek yönlü kopyadır. Bu iki tablo yalnız "neyi nereye
-- kopyaladık" defteridir; kaybolursa yeniden kurulabilir ama kopya mükerrerleşmesin
-- diye kalıcıdır.
--
-- `drive_mirror_folders`: kişi → Drive klasör kimliği (kişi başına bir klasör).
-- `drive_mirror_files`  : (ek, kişi) → Drive dosya kimliği. Bir mesaj iki kişiye
--                          bağlıysa aynı ek iki klasöre kopyalanır, iki satır olur.
CREATE TABLE "drive_mirror_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"folder_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drive_mirror_folders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict,
	CONSTRAINT "drive_mirror_folders_contact_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "drive_mirror_folders_tenant_contact_uidx" ON "drive_mirror_folders" USING btree ("tenant_id","contact_id");
--> statement-breakpoint
CREATE TABLE "drive_mirror_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"drive_file_id" text NOT NULL,
	"name" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drive_mirror_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict,
	CONSTRAINT "drive_mirror_files_media_fk" FOREIGN KEY ("media_id") REFERENCES "inbound_message_media"("id") ON DELETE cascade,
	CONSTRAINT "drive_mirror_files_contact_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "drive_mirror_files_tenant_media_contact_uidx" ON "drive_mirror_files" USING btree ("tenant_id","media_id","contact_id");
--> statement-breakpoint
CREATE INDEX "drive_mirror_files_tenant_contact_idx" ON "drive_mirror_files" USING btree ("tenant_id","contact_id");
--> statement-breakpoint
ALTER TABLE "drive_mirror_folders" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "drive_mirror_folders" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "drive_mirror_folders_tenant_isolation" ON "drive_mirror_folders"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "drive_mirror_files" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "drive_mirror_files" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "drive_mirror_files_tenant_isolation" ON "drive_mirror_files"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
-- 0063'ten sonra ALTER DEFAULT PRIVILEGES yeni tablolara UPDATE vermiyor — açık yaz.
-- İkisi de normal iş tablosu: klasör adı kişi adı değişince güncellenir, dosya
-- satırının `contact_id`'si kişi birleştirmede hayatta kalana taşınır.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE drive_mirror_folders TO verimaya_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE drive_mirror_files TO verimaya_app;
