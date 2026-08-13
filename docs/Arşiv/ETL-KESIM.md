# ETL kesim (cutover) kontrol listesi

Pilotrav Tracker → Verimaya pilot kesimi için operasyon listesi (Adım 30).  
Her madde: **kim** / **nasıl** / **geri alma**. Tracker dahili kullanımda kalabilir (tek yönlü zorunlu kesim değil — `docs/MIMARI.md`).

İlgili: `docs/legacy-reference/ETL-ESLEME.md`, `apps/api/scripts/etl-stub.md`,  
`pnpm --filter @verimaya/api etl` / `etl:verify`.

---

## 0. Önkoşullar (kesim gününden önce)

| # | Madde | Kim | Nasıl | Geri alma |
| --- | --- | --- | --- | --- |
| 0.1 | Prod Verimaya migrate + health | Solo / ops | Coolify’da `db:migrate`; `GET /v1/health` 200 | Servisi önceki image’a al |
| 0.2 | Pilot tenant + org + admin | Solo | better-auth org = tenant; admin davet | Tenant soft-disable / kullanıcı revoke |
| 0.3 | `DATABASE_URL_APP` RLS rolü | Ops | App secret’ta `verimaya_app`; ETL bu URL ile | Secret’ı eski değere döndür |
| 0.4 | Tracker **salt-okunur** snapshot | Solo | `pg_dump` veya replika; canlıya yazma yok | Snapshot dosyası arşivde kalır |
| 0.5 | KVKK / aydınlatma (LLM, karne) | Solo | Adım 23a/25 envanter + yayında metin | Özelliği kapat (`LLM_API_KEY` boş) |
| 0.6 | Yedek + restore provası | Ops | Adım 31; prova kaydı tarihli | Restore tekrarından dön |

---

## 1. Kesim günü — Tracker

| # | Madde | Kim | Nasıl | Geri alma |
| --- | --- | --- | --- | --- |
| 1.1 | Tracker’ı salt-okunur ilan et | Solo | Kullanıcılara “yalnız okuma / yeni kayıt yok”; isteğe bağlı DB role `SELECT` | Yazma rolünü geri ver |
| 1.2 | Son satır sayıları kaydet | Solo | Tracker’da `contacts/cases/appointments/transactions/case_files` count | Not defteri / Obsidian log |
| 1.3 | `TRACKER_DATABASE_URL` bağla | Solo | Salt-okunur connection string | URL’yi secret’tan sil |

---

## 2. ETL apply

| # | Madde | Kim | Nasıl | Geri alma |
| --- | --- | --- | --- | --- |
| 2.1 | Dry-run | Solo | `pnpm --filter @verimaya/api etl -- --tracker-tenant-id …` | Yok (yazmaz) |
| 2.2 | Apply 1. koşu | Solo | `etl -- --apply --tenant-id <pilot> --tracker-tenant-id …` (RLS) | Tenant verisini sil + `external_ids` cascade; veya DB restore |
| 2.3 | Apply 2. koşu | Solo | Aynı komut; **0 yeni insert** beklenir | — |
| 2.4 | Hata raporu | Solo | `stats.errors` (kırık FK skip) gözden geçir; kritikse düzelt + re-apply | Skip edilenler manuel tamamlanır |

---

## 3. Doğrulama

| # | Madde | Kim | Nasıl | Geri alma |
| --- | --- | --- | --- | --- |
| 3.1 | `etl:verify` | Solo | `pnpm --filter @verimaya/api etl:verify -- --tenant-id <pilot> --tracker-tenant-id …` | Exit ≠ 0 ise apply/veriyi incele; cutover’ı durdur |
| 3.2 | Para örneklem | Solo | En az 5 işlem: Tracker major ↔ Verimaya minor (`*100`); 100 → 10000 | Yanlış satırları düzelt / yeniden map |
| 3.3 | Panel özeti | Solo | Panel `/reports` veya `GET /v1/reports/summary` ≈ Tracker dönem özeti (kur farkına dikkat) | FX/`amount_base` notları |
| 3.4 | Çift kayıt taraması | Solo | Verify `duplicates.*`; UI `/contacts/duplicates`, `/patients/duplicates` | Merge veya ignore |
| 3.5 | Spot check UI | Solo | Hasta / randevu / finans / dosya meta (blob yok) | — |

---

## 4. Erişim / DNS

| # | Madde | Kim | Nasıl | Geri alma |
| --- | --- | --- | --- | --- |
| 4.1 | Panel URL paylaş | Solo | Pilot kullanıcılarına Verimaya URL | Eski Tracker bookmark’ları geçici kalır |
| 4.2 | Cloudflare / TLS | Ops | WAF açık; yalnız 80/443 | CF kuralını önceki haline al |
| 4.3 | Tracker erişimi | Solo | İç kullanım için okuma açık bırakılabilir | Yazmayı tekrar aç (bilinçli) |

---

## 5. Geri dönüş planı (zorunlu)

Kesim **geri alınabilir** kalmalı; Tracker silinmez.

1. **T+0 sorun:** Verimaya’da yazmayı durdur (feature flag / bakımd); Tracker yazmayı yeniden aç.  
2. **Veri:** Pilot tenant satırlarını silmek yerine **Postgres restore** (Adım 31 yedeği) tercih et — kısmi silme FK kırar.  
3. **ETL tekrar:** Restore sonrası boş tenant’ta apply yeniden; `external_ids` idempotent.  
4. **İletişim:** Pilot gruba “geçici olarak Tracker” mesajı; süre + sahip.

Kim: Solo karar verir; ops restore’u çalıştırır.

---

## 6. Kesim sonrası (ilk 48 saat)

| # | Madde | Kim | Nasıl |
| --- | --- | --- | --- |
| 6.1 | Hata / eksik alan listesi | Solo | Obsidian ilerleme log + GitHub issue |
| 6.2 | Blob/Drive dosyaları | Solo | Meta `local://pending`; byte taşıma ayrı karar |
| 6.3 | Yetim pending süpürme | Solo | Adım 30a önce dry-run |
| 6.4 | İkinci verify | Solo | `etl:verify` T+1 |

---

## Komut özeti

```bash
# Apply (RLS)
pnpm --filter @verimaya/api etl -- --apply --tenant-id "$TENANT" --tracker-tenant-id "$TRACKER_TENANT"

# Verify (fark varsa exit 1)
pnpm --filter @verimaya/api etl:verify -- --tenant-id "$TENANT" --tracker-tenant-id "$TRACKER_TENANT"

# Fixture ile lokal prova
pnpm --filter @verimaya/api etl -- --apply --tenant-id "$TENANT" --fixture ./fixtures/etl-sample.json
pnpm --filter @verimaya/api etl:verify -- --tenant-id "$TENANT" --fixture ./fixtures/etl-sample.json
```
