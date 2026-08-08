# MARKET-01 — Stratejik kararlar (cloud agent, 2026-08-08)

> Kullanıcı onayı beklenmeden **en savunulabilir varsayım** ile dolduruldu.
> 17 Ağustos review öncesi gözden geçir; gerekirse revize et.

## (a) Birincil segment: **klinik**

**Gerekçe:** PILOT-01 tek tenant Demo Klinik; ETL kaynağı OrbisMed Clinics; ürün omurgası
operasyon dosyası (DOMAIN-01). Acente komisyon/çoklu müşteri kanıtı yok.

**Sonuç:** İlk 20 görüşme **klinik** segmentine odaklanır; acente PRODUCT-01 discovery
freeze sonrası.

## (b) OrbisMed çıkar çatışması

| Alan | Karar |
| --- | --- |
| Veri | Prod tenant `Demo Klinik` ayrı `tenant_id`; RLS aktif |
| Tüzel | Verimaya ayrı marka/tüzel (referans müşteri ≠ hissedar) |
| Erişim | OrbisMed kullanıcıları yalnız kendi tenant'ında; süper-admin yok (panel) |
| Referans | Case study için yazılı onay şart; logo isimleri anonymize edilebilir |

## (c) Kapasite ve freeze

| Karar | Değer |
| --- | --- |
| Haftalık sabit | ≥2 × 4 saat panel + operasyon verisi girişi |
| Feature freeze | PILOT-02 boyunca (`docs/PILOT-02-PLAN.md`) |
| Destek | Async; P0 yanıt hedefi aynı iş günü |
