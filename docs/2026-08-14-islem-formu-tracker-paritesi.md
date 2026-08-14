# İşlem formu — Tracker paritesi (2026-08-14)

Tracker referansı: `fixrav-tracker/.../TransactionsPage.tsx` (formda `title` yok; hasta/case ve sorumlu ayrı kavramlar).

## A) Başlık kaldırıldı

- `transactions.title` artık NULL olabilir (migration `0050`); mevcut dolu başlıklar korunur.
- Shared: `title: z.string().max(255).nullable()` + `deriveTransactionLabel()` (title → kategori › alt → kişi → açıklama ilk satırı → —).
- Form (`TransactionFormDialog`) başlık input’unu göndermez (`title: null`). AI taslak kartına dokunulmadı.
- Liste sütunu `finance.col.label` (“İşlem” / “Transaction”); boş başlıkta türetilmiş etiket.

**Test:** `packages/shared/src/transaction.label.test.ts` — her fallback dalı.

## B) Hasta (`case_contact_id`)

- Migration `0051`: `case_contact_id` + `(tenant_id, case_contact_id)` index.
- Formda “Hasta” Combobox (yalnız `Hasta` tipi); opsiyonel, kategori zorunluluğu yok.
- API: Hasta değilse `400 invalid_contact_type`.
- `financeSummary`: `contact_id = X OR case_contact_id = X` (çift eşleşen satır bir kez).
- Liste filtresi: `?case_contact=` → `case_contact_id` (contact filtresi kalıbı).

**Testler:**
- `transactions.case-responsible.isolation.spec.ts` — tip reddi + Hasta kabul + liste filtresi.
- `contacts-finance-summary-case.isolation.spec.ts` — OR + çift saymama.

**Kırmızı-yeşil:** `financeSummary` yalnız `contact_id` iken test `transaction_count` 2 beklenen 3’e düştü (kırmızı); OR geri gelince yeşil. Tip guard kapatılınca Hasta olmayan `case_contact_id`/`responsible_contact_id` create yeşil kalıyordu (kırmızı); guard geri → yeşil.

## C) Sorumlu + Personel

- `DEFAULT_CONTACT_TYPE_NAMES` → `Personel`.
- Migration `0052`: mevcut tenant’lara idempotent `Personel` insert + `responsible_contact_id` + index.
- Formda “Sorumlu” Combobox (yalnız `Personel`); Personel değilse API 400.
- Rapor: `GET /v1/reports/by-responsible` — giderler sorumluya göre, boşlar “Atanmamış”; `reports/+page.svelte` özet sekmesinde.

**Test:** `reports.by-responsible.isolation.spec.ts`.

## Bilinçli dışı

- P2P (payer/payee), kategori bazlı zorunluluk / denetim motoru bu turda yok.
- Mobil form `min-w-0` grid + Combobox korundu; layout.css 16px kuralı bozulmadı.
