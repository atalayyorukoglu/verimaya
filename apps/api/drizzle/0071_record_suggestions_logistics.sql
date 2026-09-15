-- Onay kuyruğu artık randevunun lojistiğini de taşıyor: klinik, otel, transfer.
--
-- NEDEN: WhatsApp'tan en sık gelen güncelleme "hastanın oteli değişti" biçiminde
-- ("Dawit Abraham Alp paşa hotel") ve bunun gideceği hiçbir yer yoktu — kuyruk
-- yalnız `appointments.starts_at` erteleme öneriyordu, geri kalanı finans
-- ekranında ilgisiz bir kart olarak duruyordu.
--
-- Tarih ve metin AYRI sütun çiftinde: tarihi metne çevirip tek sütunda tutmak
-- "aynı an, farklı yazım"ı çakışma sandırır.
ALTER TABLE record_update_suggestions ALTER COLUMN current_value DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE record_update_suggestions ALTER COLUMN suggested_value DROP NOT NULL;
--> statement-breakpoint
-- `current_text` null olabilir: otel çoğu zaman hiç girilmemiş oluyor.
ALTER TABLE record_update_suggestions ADD COLUMN IF NOT EXISTS current_text text;
--> statement-breakpoint
ALTER TABLE record_update_suggestions ADD COLUMN IF NOT EXISTS suggested_text text;
--> statement-breakpoint
-- Önerilen otel/klinik kayıtlı bir kişiye denk geldiyse bağı da yazılır. Kişi
-- silinirse öneri kalsın, bağ düşsün: ad zaten metin olarak duruyor.
ALTER TABLE record_update_suggestions
	ADD COLUMN IF NOT EXISTS suggested_contact_id uuid
	REFERENCES contacts(id) ON DELETE SET NULL;
--> statement-breakpoint
-- 0059'daki kısıt `field`i yalnız 'starts_at' ile sınırlıyordu; yerine dört
-- değerli olanı konuyor.
ALTER TABLE record_update_suggestions DROP CONSTRAINT IF EXISTS record_update_suggestions_field_check;
--> statement-breakpoint
ALTER TABLE record_update_suggestions
	ADD CONSTRAINT record_update_suggestions_field_check
	CHECK (field IN ('starts_at', 'clinic', 'hotel', 'transfer'));
--> statement-breakpoint
ALTER TABLE record_update_suggestions
	ADD CONSTRAINT record_update_suggestions_value_shape_chk
	CHECK (
		(field = 'starts_at' AND current_value IS NOT NULL AND suggested_value IS NOT NULL)
		OR (field <> 'starts_at' AND suggested_text IS NOT NULL)
	);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "record_update_suggestions_suggested_contact_id_idx"
	ON "record_update_suggestions" USING btree ("suggested_contact_id");
