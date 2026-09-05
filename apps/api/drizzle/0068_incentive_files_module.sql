-- "Teşvik dosyaları" Finans başlığındaki sabit bağlantıdan Araçlar modülüne taşındı
-- (2026-09-05). Kayıtlı tercihi olan kullanıcılarda modül listede yer almadığı için
-- özellik hem başlıktan hem kenar çubuğundan kaybolurdu; mevcut satırlara eklenir.
--
-- Idempotent: id zaten varsa satıra dokunulmaz. RLS bypass gerekmez, DDL/DML sahibi
-- rolüyle koşar (migration runner), kiracı filtresi yok — tüm kiracılar için geçerli.
UPDATE user_ui_preferences
SET enabled_product_modules = enabled_product_modules || '["incentive-files"]'::jsonb,
    updated_at = now()
WHERE NOT (enabled_product_modules @> '["incentive-files"]'::jsonb);
