# Fixrav Tracker → Verimaya ETL (Faz 8)

Kaynak: `~/Projects/fixrav-web/_projects/fixrav-tracker` (PostgreSQL). Hedef: Verimaya multi-tenant Postgres; ilk tenant = kendi firmamız.
Eşleme: `docs/legacy-reference/ETL-ESLEME.md`. Script: `apps/api/scripts/etl.js`.

## Önkoşullar

- Tracker DB salt-okunur snapshot **veya** anonim fixture (`fixtures/etl-sample.json`)
- Verimaya migrasyonları + boş tenant + org
- Apply yazmaları: `DATABASE_URL_APP` (RLS; bypass yok) + `SET LOCAL app.current_tenant_id`

## Fazlar

1. **Keşif** — `schema.sql` + satır sayıları (`ETL-ESLEME.md`) ✅
2. **Sözlük** — contact_types, finance_categories, appointment_types ✅ (Adım 28)
3. **Kişiler & hastalar** — contacts + patients + `external_ids` ✅ (Adım 28)
4. **İlişkili veri** — randevu, işlem, dosya meta, case notları ✅ (Adım 29)
5. **Doğrulama** — `etl:verify` satır / para / duplicate ✅ (Adım 30)
6. **Kesim** — `docs/ETL-KESIM.md` kontrol listesi ✅ (Adım 30)

## CLI

```bash
pnpm --filter @verimaya/api etl
pnpm --filter @verimaya/api etl -- --fixture ./fixtures/etl-sample.json

pnpm --filter @verimaya/api etl -- --apply --tenant-id <verimaya-tenant-uuid> \
  --fixture ./fixtures/etl-sample.json

# Doğrulama (fark varsa exit 1)
pnpm --filter @verimaya/api etl:verify -- --tenant-id <uuid> --fixture ./fixtures/etl-sample.json

TRACKER_DATABASE_URL=postgresql://… \
  pnpm --filter @verimaya/api etl:verify -- --tenant-id <uuid> --tracker-tenant-id <tracker-tenant-uuid>
```

Kesim runbook: `docs/ETL-KESIM.md`.

### Apply katmanları

| Katman | Kaynak → hedef | Idempotency |
|--------|----------------|-------------|
| 1 | contact_types, finance_categories, `etl.appointment_types`, contacts, patients | isim / `external_ids` |
| 2 | appointments, transactions (`*100` minor), files (`local://pending`), case_notes | `external_ids` |

Kırık FK → satır **skip** + `stats.errors` (sessiz düşürme yok). İkinci koşu 0 insert.

### Para

`amount_major` (fixture) veya Tracker `amount` (numeric major) → `round(x * 100)` minor integer. Örnek: 100 TRY → 10000; 450.5 → 45050.

## Erteleme

Audit, WhatsApp ham mesajları, üyeler, Drive/blob byte taşıma, P2P payer/payee — cutover 1 dışı.
