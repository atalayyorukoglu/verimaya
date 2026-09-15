-- KISI-01: bağ yöntemine `context` eklendi.
--
-- Gruba atılan görsel/dosya "(boş mesaj)" olarak düşüyor; metin olmadığı için ad
-- eşleşmesi yok. Oysa aynı kişi 3 dakika önce "Dawit Abraham Alp paşa hotel" yazıp
-- ardından bilet görselini atıyor. Görsel mesajı, aynı sohbette aynı yazarın az
-- önceki metinli mesajının kişilerine bağlanır — yöntem `context`.
ALTER TABLE "inbound_message_contacts" DROP CONSTRAINT "inbound_message_contacts_method_chk";
--> statement-breakpoint
ALTER TABLE "inbound_message_contacts" ADD CONSTRAINT "inbound_message_contacts_method_chk"
	CHECK ("method" IN ('exact', 'name', 'surname', 'model', 'manual', 'context'));
