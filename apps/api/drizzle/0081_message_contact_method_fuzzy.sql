-- KUCUK-01: bağ yöntemine `fuzzy` eklendi.
--
-- Aynı hasta gruplarda birden fazla yazımla geçiyor: "Mccubbin / Mcgubbin /
-- Mccgubbin", "Haydyn / Haydn", "Severino / Seberino", "Waldu / waldhu". Kural
-- tabanlı bağ (exact/name) bunları kaçırıyordu; ad+soyad ikisi de yakın geçtiğinde
-- (Damerau-Levenshtein ≤1, ≥8 harfte ≤2) bağ kurulur ve yöntemi `fuzzy` olur —
-- kullanıcı "bunu neden bağladın" diye sorunca cevabı rozette görsün.
ALTER TABLE "inbound_message_contacts" DROP CONSTRAINT "inbound_message_contacts_method_chk";
--> statement-breakpoint
ALTER TABLE "inbound_message_contacts" ADD CONSTRAINT "inbound_message_contacts_method_chk"
	CHECK ("method" IN ('exact', 'name', 'surname', 'model', 'manual', 'context', 'fuzzy'));
