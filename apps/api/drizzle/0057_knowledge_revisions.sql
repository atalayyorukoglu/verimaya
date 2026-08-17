-- AI-06: bilgi bankası sürüm geçmişi.
-- Amaç: "AI neden 2.400 dedi?" sorusunun 3 ay sonraki cevabı. O tarihte bilgi bankasında
-- ne yazdığı görülebilsin. Yalnız ekleme yapılır; satır güncellenmez/silinmez.
CREATE TABLE "knowledge_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sections" jsonb NOT NULL,
	"changed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_revisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "knowledge_revisions_tenant_created_at_idx" ON "knowledge_revisions" USING btree ("tenant_id","created_at" DESC);
--> statement-breakpoint
ALTER TABLE "knowledge_revisions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "knowledge_revisions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "knowledge_revisions_tenant_isolation" ON "knowledge_revisions"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE knowledge_revisions TO verimaya_app;
