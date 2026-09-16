-- PARA-01: para satırı ↔ vizit bağı + vizitin teklif toplamı.
--
-- Karar (docs/2026-09-16-HASTA-AKISI.md § 6.4): Finans Özet bugüne kadar kişinin
-- tüm para satırlarını tek torbada topluyordu; oysa akış vizit başına ilerliyor
-- ("1. vizitte 4.030 alındı, 2. vizitte kalan 3.950"). Hasta başı kâr ve "2. vizit
-- ödemesi alınmadı" uyarısı ancak tutar vizite bağlıysa çıkar.
--
-- `contact_visit_id` NULLABLE ve ON DELETE SET NULL — 0079'daki
-- `inbound_message_media.contact_visit_id` ile aynı gerekçe: işlem kesin kayıttır,
-- vizit sonradan düzeltilebilen bir çerçevedir. Vizit silinince tutar kaybolmaz,
-- "Vizit belirsiz" grubuna düşer.
ALTER TABLE "transactions" ADD COLUMN "contact_visit_id" uuid;
--> statement-breakpoint
ALTER TABLE "transactions"
	ADD CONSTRAINT "transactions_contact_visit_fk"
	FOREIGN KEY ("contact_visit_id") REFERENCES "contact_visits"("id") ON DELETE set null;
--> statement-breakpoint
-- Vizit mutabakatı sorgusu: "bu vizite bağlı para satırları".
CREATE INDEX "transactions_tenant_visit_idx"
	ON "transactions" USING btree ("tenant_id","contact_visit_id");
--> statement-breakpoint
-- Tedavinin **teklif** toplamı. `treatment_plan` metnin kendisi; bu iki sütun o
-- metindeki sayının makinece okunabilir hâli ("All on 6 + plak, Toplam 8.260 GBP").
-- "Kalan = teklif − tahsilat" satırının tek dayanağı budur; boşsa kalan hesaplanmaz.
--
-- Neden `bigint`: para minor units tutuluyor ve teklifler GBP değil TL de olabiliyor
-- (27.750 TL hastane faturası gibi satırların yanında 10 milyonluk TL teklifleri
-- `integer` sınırına yaklaşır). `transactions.amount` integer kaldı — oradaki
-- değişiklik ayrı bir iş; yeni sütunda baştan geniş tip seçmek bedavaya geliyor.
ALTER TABLE "contact_visits" ADD COLUMN "quoted_total_minor" bigint;
--> statement-breakpoint
ALTER TABLE "contact_visits" ADD COLUMN "quoted_currency" text;
--> statement-breakpoint
-- Tutar varsa para birimi zorunlu: para birimi olmayan bir "8260" hiçbir şey demek
-- değildir ve kalan hesabını sessizce yanlış yapardı.
ALTER TABLE "contact_visits"
	ADD CONSTRAINT "contact_visits_quoted_currency_check"
	CHECK ("quoted_total_minor" is null or "quoted_currency" is not null);
