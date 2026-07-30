# Fixrav Tracker → Verimaya ETL (Faz 8)

Kaynak: `~/Projects/fixrav-web/_projects/fixrav-tracker` (PostgreSQL, tek tenant). Hedef: Verimaya multi-tenant Postgres; ilk tenant = kendi firmamız.

## Önkoşullar

- Tracker DB salt-okunur snapshot (prod kopyası veya `pg_dump`)
- Verimaya migrasyonları uygulanmış boş tenant + org (better-auth)
- `docs/legacy-reference/` entity notları ve alan eşlemeleri — **`ETL-ESLEME.md` (Adım 26)**

## Fazlar

1. **Keşif** — Tracker `schema.sql` (legacy README komutu) + satır sayıları; Verimaya Drizzle şeması diff.
2. **Sözlük** — Sabit listeler: contact türleri, finans kategorileri, randevu türleri → Verimaya `settings` / seed (`DEFAULT_*` shared).
3. **Kişiler & hastalar** — `contacts` → `contacts`; `cases` → `patients`; external_id map (`legacy_tracker`, eski PK).
4. **İlişkili veri** — Randevular, işlemler (major → minor unit `*100`), dosya meta (blob/Drive taşınmaz; sonra R2), case notları.
5. **Doğrulama** — Satır sayısı, checksum örnekleri, duplicate merge; Tracker rapor özeti ↔ Verimaya `/v1/reports`.
6. **Kesim** — ETL idempotent (`ON CONFLICT`, batch); dry-run raporu; prod cutover'da Tracker salt-okunur.

## Dry-run CLI (şu an)

Fixture tabanlı eşleme stub'ı çalışır; DB yazmaz.

```bash
# Varsayılan fixture: apps/api/fixtures/etl-sample.json
pnpm --filter @verimaya/api etl:dry-run

# Özel fixture
pnpm --filter @verimaya/api etl:dry-run -- --fixture ./fixtures/etl-sample.json

# --apply şimdilik reddedilir (yazma yolu yok)
pnpm --filter @verimaya/api etl:dry-run -- --apply
```

Script: `apps/api/scripts/etl-dry-run.js`

### Fixture → Verimaya şekilleri

| Tracker (fixture) | Verimaya | Not |
|-------------------|----------|-----|
| `contacts[]` | `contacts` create shape | `type` → `contact_type_name` (seed eşlemesi apply aşamasında) |
| `cases[]` | `patients` | `contact_id` legacy int → mapped UUID |
| `appointments[]` | `appointments` | `case_id` → `patient_id`; `type` → `appointment_type` |
| `transactions[]` | `transactions` | `amount_major` → `amount` minor (`*100`) |
| `files[]` | `files` meta | `storage_key='local://pending'`; Drive/blob cutover dışı |

Dry-run çıktısı: özet sayılar + her türden bir örnek mapped kayıt; `tenant_id` placeholder; legacy id → deterministik UUID (yalnız rapor için).

## Sonraki (gerçek apply)

- `TRACKER_DATABASE_URL` + hedef `tenant_id` ile Nest dışı Node script (`apps/api/src/migration/` adayı)
- External id tablosu / `ON CONFLICT` batch insert
- Finans: kur/`amount_base` kuralları tenant bazına göre
- Dosya: meta-only first; blob sonra local/`UPLOAD_DIR` veya R2

## Erteleme

Audit geçmişi, WhatsApp ham mesajları, dev-users, Drive blob — ilk cutover dışı.
