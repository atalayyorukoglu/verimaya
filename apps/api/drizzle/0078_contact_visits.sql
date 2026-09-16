-- VIZIT-01: hasta vizitleri + WhatsApp'tan çıkarılan vizit önerileri.
--
-- Karar (docs/2026-09-16-HASTA-AKISI.md § 6.2): bugüne kadar her şey kişiye düz
-- bağlıydı; oysa akış vizit başına ilerliyor (konsültasyon / 1 / 2 / 3 / RPT).
-- Evrak seti, tahsilat ve gider vizite bağlanmadan "2. vizit ödemesi alınmadı"
-- gibi uyarılar çıkmıyor. `contact_visits` o çapanın kendisidir.
--
-- `contact_visit_suggestions` neden ayrı tablo: `record_update_suggestions`
-- `appointment_id NOT NULL` + tek alan/tek değer çifti üzerine kurulu (bir
-- randevunun tarihi ya da oteli). Vizit önerisi bir KİŞİYE ait ve tek seferde
-- sekiz alan taşıyor; oraya sığdırmak appointment_id'yi nullable yapmayı, kısmi
-- tekillik kısıtını bozmayı ve onay yolunu dallandırmayı gerektirirdi.
--
-- `arrival_time_known` / `departure_time_known`: mesajda yalnız gün yazıyor
-- olabiliyor ("26 nisan gelis 2 mayis donus"). Bayrak olmasa gece yarısı uçuş
-- saati gibi görünürdü.
CREATE TABLE "contact_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"visit_type" text NOT NULL,
	"sequence" integer,
	"arrival_at" timestamp with time zone,
	"arrival_time_known" boolean DEFAULT true NOT NULL,
	"departure_at" timestamp with time zone,
	"departure_time_known" boolean DEFAULT true NOT NULL,
	"arrival_flight" text,
	"departure_flight" text,
	"hotel" text,
	"hotel_covered_by" text DEFAULT 'unknown' NOT NULL,
	"transfer_provider" text,
	"clinic" text,
	"doctor" text,
	"treatment_plan" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"notes" text,
	"source_inbound_message_id" uuid,
	"created_by" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_visits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict,
	CONSTRAINT "contact_visits_contact_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE cascade,
	CONSTRAINT "contact_visits_source_message_fk" FOREIGN KEY ("source_inbound_message_id") REFERENCES "inbound_messages"("id") ON DELETE set null,
	CONSTRAINT "contact_visits_visit_type_check" CHECK ("visit_type" IN ('consultation','visit_1','visit_2','visit_3','rpt','other')),
	CONSTRAINT "contact_visits_status_check" CHECK ("status" IN ('planned','in_progress','completed','cancelled')),
	CONSTRAINT "contact_visits_hotel_covered_by_check" CHECK ("hotel_covered_by" IN ('company','patient','unknown'))
);
--> statement-breakpoint
CREATE INDEX "contact_visits_tenant_contact_arrival_idx" ON "contact_visits" USING btree ("tenant_id","contact_id","arrival_at");
--> statement-breakpoint
CREATE INDEX "contact_visits_tenant_status_arrival_idx" ON "contact_visits" USING btree ("tenant_id","status","arrival_at");
--> statement-breakpoint
CREATE TABLE "contact_visit_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"inbound_message_id" uuid,
	"draft" jsonb NOT NULL,
	"source_text" text NOT NULL,
	"confidence" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_visit_id" uuid,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"reject_reason" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_visit_suggestions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict,
	CONSTRAINT "contact_visit_suggestions_contact_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE cascade,
	CONSTRAINT "contact_visit_suggestions_message_fk" FOREIGN KEY ("inbound_message_id") REFERENCES "inbound_messages"("id") ON DELETE set null,
	CONSTRAINT "contact_visit_suggestions_visit_fk" FOREIGN KEY ("created_visit_id") REFERENCES "contact_visits"("id") ON DELETE set null,
	CONSTRAINT "contact_visit_suggestions_status_check" CHECK ("status" IN ('pending','approved','rejected')),
	CONSTRAINT "contact_visit_suggestions_confidence_check" CHECK ("confidence" IN ('high','medium'))
);
--> statement-breakpoint
CREATE INDEX "contact_visit_suggestions_tenant_status_created_idx" ON "contact_visit_suggestions" USING btree ("tenant_id","status","created_at");
--> statement-breakpoint
-- Aynı mesaj + aynı kişi için tek öneri: kuyruk işlemcisi mesajı yeniden işlerse
-- mükerrer kart doğmasın. Reddedilmiş öneri de kapsamda — "hayır" denen şey
-- tekrar sorulmaz.
CREATE UNIQUE INDEX "contact_visit_suggestions_tenant_message_contact_uidx" ON "contact_visit_suggestions" USING btree ("tenant_id","inbound_message_id","contact_id") WHERE "deleted_at" is null and "inbound_message_id" is not null;
--> statement-breakpoint
ALTER TABLE "contact_visits" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contact_visits" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "contact_visits_tenant_isolation" ON "contact_visits"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "contact_visit_suggestions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contact_visit_suggestions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "contact_visit_suggestions_tenant_isolation" ON "contact_visit_suggestions"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
-- 0063'ten sonra ALTER DEFAULT PRIVILEGES yeni tablolara UPDATE vermiyor — açık yaz.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE contact_visits TO verimaya_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE contact_visit_suggestions TO verimaya_app;
