-- Ünvan / görev sözlüğü (Hekim, Koordinatör, Reklam Uzmanı, Satış, …).
-- Desen `contact_types` (0004) ile birebir aynı. Bkz. AGENTS.md "migration kuralları":
-- ünvan yalnız tanımlayıcı veridir, hiçbir izin kontrolünde okunmaz; yalnız
-- `contacts` üzerinde yaşar (`user` tablosuna eklenmez).

CREATE TABLE "contact_titles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_titles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX "contact_titles_tenant_id_created_at_idx" ON "contact_titles" USING btree ("tenant_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "contact_titles_tenant_id_name_uidx" ON "contact_titles" USING btree ("tenant_id","name");
--> statement-breakpoint
ALTER TABLE "contact_titles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contact_titles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "contact_titles_tenant_isolation" ON "contact_titles"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
-- 0063'ten sonra ALTER DEFAULT PRIVILEGES yeni tablolara UPDATE vermiyor — açık yaz.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE contact_titles TO verimaya_app;
--> statement-breakpoint

-- contacts.title_id — nullable, kişi başına tek ünvan. Silinen ünvan kullanan
-- kişiler bozulmasın diye ON DELETE SET NULL (contact_types'ın restrict'inden
-- bilinçli fark — bkz. docs/2026-08-23-maya-icgoru-sorulari.md § Risk 3).
ALTER TABLE "contacts" ADD COLUMN "title_id" uuid;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "title_name" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_title_id_contact_titles_id_fk"
	FOREIGN KEY ("title_id") REFERENCES "contact_titles"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX "contacts_tenant_id_title_id_idx" ON "contacts" USING btree ("tenant_id","title_id");
