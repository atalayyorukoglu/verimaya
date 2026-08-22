-- AI-11a: Maya soru kaydı — AI-11b'nin ("akla gelen her soru") TEK girdisi.
-- Sağlık turizmi acentesinin hazır bir soru kanonu yok; desteklenecek filtreler
-- önceden tasarlanamaz, gerçek sorulardan çıkar. Bu tablo o sayacı başlatır.
--
-- PII girmez: `question_masked` maskelenmiş metindir (isimler KISI_n, telefon/e-posta
-- [TELEFON]/[EPOSTA]). Ham soru hiçbir yerde saklanmaz.
CREATE TABLE "maya_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"question_masked" text NOT NULL,
	-- Seçilen araç; bilgi bankası yolunda ve eşleşme olmadığında NULL.
	"tool" text,
	-- Cevap üretilebildi mi (araç çalıştı ya da bilgi bankasından cevap çıktı).
	"answered" boolean NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maya_questions_source_check" CHECK ("source" IN ('knowledge', 'tool', 'unknown')),
	CONSTRAINT "maya_questions_tool_check" CHECK ("tool" IS NULL OR "tool" IN ('contactBalance', 'openBalances', 'contactAppointments', 'periodSummary', 'untouchedContacts')),
	-- Cevaplanmış araç yolunda araç adı zorunlu. Tersi serbest bırakıldı bilinçli:
	-- izin reddi yüzünden çalışmayan araç da AI-11b için değerli bir kayıt
	-- (`source='unknown'`, `tool='contactBalance'`, `answered=false`).
	CONSTRAINT "maya_questions_tool_source_check" CHECK ("source" <> 'tool' OR "tool" IS NOT NULL),
	CONSTRAINT "maya_questions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX "maya_questions_tenant_id_created_at_idx" ON "maya_questions" USING btree ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX "maya_questions_tenant_id_tool_created_at_idx" ON "maya_questions" USING btree ("tenant_id","tool","created_at");
--> statement-breakpoint
ALTER TABLE "maya_questions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "maya_questions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "maya_questions_tenant_isolation" ON "maya_questions"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE maya_questions TO verimaya_app;
--> statement-breakpoint
-- Denetim kaydı: yazılır ve okunur, güncellenmez. 0003_app_role.sql'deki
-- ALTER DEFAULT PRIVILEGES public şemasındaki her yeni tabloya UPDATE veriyor —
-- burada bilinçli olarak geri alınıyor (yalnız GRANT yazmak yetmezdi).
REVOKE UPDATE ON TABLE maya_questions FROM verimaya_app;
