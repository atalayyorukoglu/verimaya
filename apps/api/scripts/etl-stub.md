# Fixrav Tracker → Verimaya ETL (Faz 8 stub)

Kaynak: `~/Projects/fixrav-web/_projects/fixrav-tracker` (PostgreSQL, tek tenant). Hedef: Verimaya multi-tenant Postgres; ilk tenant = kendi firmamız.

## Önkoşullar

- Tracker DB salt-okunur snapshot (prod kopyası veya `pg_dump`)
- Verimaya migrasyonları uygulanmış boş tenant + org (better-auth)
- `docs/legacy-reference/` entity notları ve alan eşlemeleri

## Fazlar

1. **Keşif** — Tracker `schema.sql` (legacy README komutu) + satır sayıları; Verimaya Drizzle şeması diff.
2. **Sözlük** — Sabit listeler: contact türleri, finans kategorileri, randevu türleri → Verimaya `settings` / seed.
3. **Kişiler & hastalar** — `contacts` → `contacts`; `cases`/patients → `patients`; external_id map tablosu (`legacy_tracker`, eski PK).
4. **İlişkili veri** — Randevular, işlemler (minor unit), dosya meta (blob taşınmaz; Drive URL veya sonra R2), case notları.
5. **Doğrulama** — Satır sayısı, checksum örnekleri, duplicate merge durumu; Tracker rapor özeti ile Verimaya `/v1/reports` karşılaştırması.
6. **Kesim** — ETL idempotent (`ON CONFLICT`, batch); dry-run raporu; prod cutover'da Tracker salt-okunur.

## Çalıştırma (plan)

```bash
# Stub — henüz implemente değil
pnpm --filter @verimaya/api etl:dry-run
```

Gerçek CLI: `apps/api/src/migration/` altında NestJS olmayan Node script(ler); `DATABASE_URL` + `TRACKER_DATABASE_URL` + hedef `tenant_id`.

## Erteleme

Audit geçmişi, WhatsApp ham mesajları, dev-users — ilk cutover dışı.
