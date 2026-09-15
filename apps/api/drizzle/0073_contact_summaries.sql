-- KISI-01 adım 3: kişi özeti (model tarafından yazılan, kaynaklı, türetilmiş).
--
-- Kişinin akışı (WhatsApp + randevu + işlem + not) modele gider, cümle başına
-- kaynak referanslarıyla özet döner. Kişi başına tek satır; kaynak veri değişince
-- (`input_fingerprint`) yeniden üretilir. Elle düzenlenmez — çalışan notu ayrı tablo.
CREATE TABLE "contact_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"sentences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_fingerprint" text NOT NULL,
	"input_count" integer DEFAULT 0 NOT NULL,
	"model" text,
	"heuristic" boolean DEFAULT false NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_summaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict,
	CONSTRAINT "contact_summaries_contact_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contact_summaries_tenant_contact_uidx" ON "contact_summaries" USING btree ("tenant_id","contact_id");
--> statement-breakpoint
ALTER TABLE "contact_summaries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contact_summaries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "contact_summaries_tenant_isolation" ON "contact_summaries"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
-- 0063'ten sonra ALTER DEFAULT PRIVILEGES yeni tablolara UPDATE vermiyor — açık yaz.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE contact_summaries TO verimaya_app;
