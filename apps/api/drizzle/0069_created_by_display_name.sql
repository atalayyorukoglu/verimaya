-- Randevu ve işlem kayıtlarında "kim oluşturdu" bilgisi yoktu.
--
-- Kişi akışında not satırları yazanın adını gösteriyordu (`case_notes.
-- author_display_name`), randevu ve işlem satırları göstermiyordu — çünkü
-- kayıtta yoktu. Denetim kaydından türetilemiyor: `audit_logs` varlık
-- kimliği tutmuyor, yalnız etiket.
--
-- Ad kopyalanıyor (kullanıcı kimliğine bağlı değil): kullanıcı silinse de
-- "kim yaptı" cevabı kalsın. Aynı karar `case_notes` ve `audit_logs`'ta da
-- verilmişti.
--
-- Geçmiş kayıtlar boş kalır; uydurma isim yazmaktansa boş bırakmak yeğdir.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_by_display_name text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by_display_name text;
