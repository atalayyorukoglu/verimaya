-- AI-09: onaylanmış işlem satırı kaynağını ve kaynak izini taşır.
--
-- Bugüne kadar elle girilen satırla WhatsApp'tan gelen satır bayt bayt aynıydı;
-- "bunu AI mı yazdı, nereden aldı" sorusunun kodda karşılığı yoktu. Bu iki kolon
-- o karşılığı kuruyor. Onay kapısına dokunmuyor — taslak hâlâ insan onaylı.
--
-- İkisi de YALNIZ sunucu tarafından doldurulur: `TransactionCreate` zod şeması
-- bu alanları içermez, istek gövdesindeki değer zod tarafından düşürülür.
-- `source_evidence` onay anında `inbound_messages.payload.parsed_records`'tan
-- okunur (istekten değil).
--
-- Mevcut tabloya kolon ekleniyor: RLS/policy/GRANT zaten `transactions` üzerinde
-- tanımlı ve kolon bazlı değil — bilinçli olarak dokunulmuyor.
ALTER TABLE "transactions"
	ADD COLUMN "source_inbound_message_id" uuid,
	ADD COLUMN "source_evidence" jsonb;
--> statement-breakpoint
-- ON DELETE SET NULL: gelen kutusu satırı silinse de işlem kaydı ve tutarı kalır;
-- yalnız izi kopar. Finans satırı hiçbir koşulda gelen mesaja bağlı silinmez.
ALTER TABLE "transactions"
	ADD CONSTRAINT "transactions_source_inbound_message_id_inbound_messages_id_fk"
	FOREIGN KEY ("source_inbound_message_id") REFERENCES "inbound_messages"("id") ON DELETE SET NULL;
--> statement-breakpoint
-- Tenant önde: RLS zaten tenant'a kilitli, "şu mesajdan hangi işlemler çıktı"
-- sorgusu bu sırayla index'i kullanır.
CREATE INDEX "transactions_tenant_source_msg_idx"
	ON "transactions" USING btree ("tenant_id","source_inbound_message_id");
