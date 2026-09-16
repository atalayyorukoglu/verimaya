-- KISI-02: hasta akışı şablonundaki eksik maddeler özetin yanında durur.
--
-- Kişi türü Hasta olan kayıtlarda model, tenant'ın kontrol listesinde karşılığını
-- bulamadığı maddeleri bildirir; satır burada saklanır ki kart her açılışta yeniden
-- LLM çağırmasın. Hasta olmayan kişide hep boş dizi kalır.
--
-- Şablonun kendisi yeni tablo değil: `tenant_settings.patient_flow` (jsonb) altında,
-- diğer tenant ayarlarıyla aynı RLS/GRANT rejimi altında durur.
ALTER TABLE "contact_summaries" ADD COLUMN "missing" jsonb DEFAULT '[]'::jsonb NOT NULL;
