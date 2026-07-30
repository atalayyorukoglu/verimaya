# Fixrav Tracker → Verimaya ETL (Faz 8)

Kaynak: `~/Projects/fixrav-web/_projects/fixrav-tracker` (PostgreSQL). Hedef: Verimaya multi-tenant Postgres; ilk tenant = kendi firmamız.
Eşleme: `docs/legacy-reference/ETL-ESLEME.md`. Script: `apps/api/scripts/etl.js`.

## Önkoşullar

- Tracker DB salt-okunur snapshot **veya** anonim fixture (`fixtures/etl-sample.json`)
- Verimaya migrasyonları + boş tenant + org
- Apply yazmaları: `DATABASE_URL_APP` (RLS; bypass yok) + `SET LOCAL app.current_tenant_id`

## Fazlar

1. **Keşif** — `schema.sql` + satır sayıları (`ETL-ESLEME.md`) ✅
2. **Sözlük** — contact_types, finance_categories, appointment_types → apply ✅ (Adım 28)
3. **Kişiler & hastalar** — contacts + patients + `external_ids` ✅ (Adım 28)
4. **İlişkili veri** — randevu, işlem, dosya meta, case notları (Adım 29)
5. **Doğrulama** — satır sayısı, checksum, rapor (Adım 30)
6. **Kesim** — idempotent cutover

## CLI

```bash
# Dry-run (varsayılan) — fixture map + özet
pnpm --filter @verimaya/api etl
pnpm --filter @verimaya/api etl -- --fixture ./fixtures/etl-sample.json

# Apply katman 1 (sözlük + contacts + patients)
pnpm --filter @verimaya/api etl -- --apply --tenant-id <verimaya-tenant-uuid> \
  --fixture ./fixtures/etl-sample.json

# Canlı Tracker (salt okunur) → aynı apply
TRACKER_DATABASE_URL=postgresql://… \
  pnpm --filter @verimaya/api etl -- --apply --tenant-id <uuid> --tracker-tenant-id <tracker-tenant-uuid>
```

`etl:dry-run` hâlâ alias (`node scripts/etl.js`).

### Apply davranışı (Adım 28)

| Kaynak | Hedef | Idempotency |
|--------|--------|-------------|
| contact_types / fixture list | `contact_types` | isim varsa skip |
| finance_categories | `finance_categories` | `ON CONFLICT (tenant, kind, name)` |
| appointment_types | `tenant_settings` key `etl.appointment_types` | key varsa skip |
| contacts | `contacts` + `external_ids` | `external_ids` lookup |
| cases | `patients` + `external_ids` | `external_ids` lookup |

Batch: 1000 ( `--batch-size`). İkinci koşu contacts/patients **0 insert**.

## Erteleme

Audit, WhatsApp ham mesajları, üyeler, Drive blob — ilk cutover dışı. Randevu/işlem/dosya: Adım 29.
