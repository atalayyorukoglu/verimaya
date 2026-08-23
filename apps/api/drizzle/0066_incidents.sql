-- Olay kaydı v1 — yalnız klinik departmanı. docs/2026-08-23-maya-icgoru-sorulari.md § 5.
--
-- İki tablo:
--   incident_types — tenant sözlüğü, `contact_titles` (0064) ile birebir aynı desen +
--                    `area` kolonu. Kullanımdaki tür silinemez (RESTRICT) — `contact_titles`'ın
--                    aksine: tür olayın ne olduğunu tanımlıyor, boşalırsa kayıt anlamsızlaşır.
--   incidents      — "ne ters gitti" kaydı. `contact_id` NOT NULL + CASCADE (olay dosyaya ait,
--                    bağımsız anlamı yok). `appointment_id` nullable + SET NULL (RPT randevusu
--                    *olgu*, olay kaydı *yorum* — biri diğerini otomatik oluşturmaz/silmez).
--
-- `area` altı değeri birden kabul eder (clinic/hotel/transfer/sales/marketing/coordination) —
-- departman genişlemesi veri değişikliği olsun, şema değişikliği olmasın diye. v1'de yalnız
-- `clinic` seed edilir ve UI yalnız klinik gösterir (docs/FIKIRLER.md § Olay kaydı — diğer
-- departmanlar).

CREATE TABLE "incident_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"area" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict,
	CONSTRAINT "incident_types_area_chk" CHECK ("area" IN ('clinic', 'hotel', 'transfer', 'sales', 'marketing', 'coordination'))
);
--> statement-breakpoint
CREATE INDEX "incident_types_tenant_id_created_at_idx" ON "incident_types" USING btree ("tenant_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "incident_types_tenant_id_area_name_uidx" ON "incident_types" USING btree ("tenant_id","area","name");
--> statement-breakpoint
ALTER TABLE "incident_types" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "incident_types" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "incident_types_tenant_isolation" ON "incident_types"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
-- 0063'ten sonra ALTER DEFAULT PRIVILEGES yeni tablolara UPDATE vermiyor — açık yaz.
-- Normal iş tablosu: tür yeniden adlandırılabilir (UPDATE), soft-delete yok (DELETE
-- yalnız kullanılmıyorsa serviste engellenir, RESTRICT FK son savunma hattı).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE incident_types TO verimaya_app;
--> statement-breakpoint

CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"incident_type_id" uuid NOT NULL,
	"area" text NOT NULL,
	"appointment_id" uuid,
	"responsible_contact_id" uuid,
	"cost_amount" integer,
	"cost_currency" text,
	"status" text DEFAULT 'open' NOT NULL,
	"description" text,
	"occurred_on" date NOT NULL,
	"resolved_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict,
	CONSTRAINT "incidents_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE cascade,
	CONSTRAINT "incidents_incident_type_id_incident_types_id_fk" FOREIGN KEY ("incident_type_id") REFERENCES "incident_types"("id") ON DELETE restrict,
	CONSTRAINT "incidents_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE set null,
	CONSTRAINT "incidents_responsible_contact_id_contacts_id_fk" FOREIGN KEY ("responsible_contact_id") REFERENCES "contacts"("id") ON DELETE set null,
	CONSTRAINT "incidents_area_chk" CHECK ("area" IN ('clinic', 'hotel', 'transfer', 'sales', 'marketing', 'coordination')),
	CONSTRAINT "incidents_status_chk" CHECK ("status" IN ('open', 'resolved')),
	-- cost_amount / cost_currency: ikisi birlikte dolu ya da birlikte boş (transactions
	-- para deseniyle tutarlı — para tutarı olmadan para birimi ya da tersi anlamsız).
	CONSTRAINT "incidents_cost_pair_chk" CHECK (("cost_amount" IS NULL) = ("cost_currency" IS NULL))
);
--> statement-breakpoint
CREATE INDEX "incidents_tenant_id_contact_id_idx" ON "incidents" USING btree ("tenant_id","contact_id");
--> statement-breakpoint
CREATE INDEX "incidents_tenant_id_area_occurred_on_idx" ON "incidents" USING btree ("tenant_id","area","occurred_on");
--> statement-breakpoint
CREATE INDEX "incidents_tenant_id_status_idx" ON "incidents" USING btree ("tenant_id","status");
--> statement-breakpoint
ALTER TABLE "incidents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "incidents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "incidents_tenant_isolation" ON "incidents"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
-- 0063'ten sonra ALTER DEFAULT PRIVILEGES yeni tablolara UPDATE vermiyor — açık yaz.
-- Normal iş tablosu: olay çözülünce güncelleniyor (status/resolved_at).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE incidents TO verimaya_app;
