# PILOT-02 — Dahili operasyon pilotu planı

> **Durum:** Plan onaylandı (cloud agent, 2026-08-08). Freeze başlangıcı: PR merge + migration
> `0029`/`0030` prod apply sonrası ilk iş günü.
> **Süre:** 2–4 hafta (minimum 14 gün veri birikimi hedefi).

## Amaç

Gerçek operasyon verisiyle (Demo Klinik / ilk tenant) paneli günlük kullanımda doğrulamak;
Tracker'a dönüş nedenlerini ve AI taslak kabul oranını ölçmek; PILOT-02 sonrası
MARKET-02 kapı kararı için kanıt üretmek.

## Kapsam dışı (feature freeze)

- Yeni modül / büyük şema değişikliği yok
- İkinci tenant / demo org oluşturulmaz (PILOT-01 kuralı)
- MARKET-02 öncesi bilinçli yapılmayacaklar tablosu geçerli (`YAPILACAKLAR.md`)

## Freeze sırasında izinli

- P0/P1 bugfix (veri kaybı, tenant izolasyonu, 500)
- Ops: yedek/restore kanıtı, migration apply
- Dokümantasyon / runbook

## KPI'lar (haftalık ölçüm)

| KPI | Kaynak | Hedef (yön) |
| --- | --- | --- |
| Aktif kullanıcı / gün | better-auth session / audit `login` | ≥1 (solo → ≥2 hafta üst üste) |
| Tracker'a dönüş | Manuel log (Obsidian) | 0 tercih; neden kodlanır |
| AI taslak kabul / düzeltme / red | `ai_corrections` + inbox | Kabul ≥%60 veya düzeltme kalıbı net |
| Finans mutabakat farkı | `reports/summary` vs Tracker export | <%2 tutar farkı (örneklem) |
| Randevu kaçırma (no_show) | `appointments` status | Ölçülür; hedef yok (baseline) |
| Webhook / job başarısızlık | `integration_events`, `jobs` | <%1 failed (7g) |
| Destek süresi | Manuel | Ortalama <4s yanıt (async) |
| Yedek + restore | Coolify + R2 runbook | Haftalık 1 restore provası |

## Haftalık ritim

1. **Pazartesi:** KPI tablosu doldur (`docs/pilot-02/` altına tarihli not — opsiyonel)
2. **Çarşamba:** Blocker triage; yalnız P0 fix
3. **Cuma:** 15 dk retro: ne işe yaradı / ne sürtündü

## Bitiş kriterleri

- [ ] Minimum 14 gün kesintisiz kullanım (veya 4 hafta üst sınır)
- [ ] KPI tablosu en az 2 satır dolu
- [ ] Bilinen P0 listesi boş
- [ ] `YAPILACAKLAR.md` PILOT-02 maddesi Görüş dolu
- [ ] MARKET-02 için 1 sayfalık özet (pilot sonuçları + segment önerisi)

## Görüş (varsayımlar)

- Segment: **klinik** (PILOT-01 tenant Demo Klinik; acente kanıtı yok)
- Kapasite: haftada ≥2 yarım gün panel kullanımı + freeze süresince yeni feature yok
- OrbisMed çıkar çatışması: prod veri tenant izolasyonu + audit; referans anlatısı ayrı tenant
