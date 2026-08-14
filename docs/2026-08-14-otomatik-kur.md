# Otomatik döviz kuru (2026-08-14)

Hasta finans özetinin (`financeSummary` → `resolveBaseAmount`) `amount_base` boş
satırları sessizce atlaması yüzünden işlem formunda baz tutarın elle kalması
raporu bozuyordu. Bu iş: Frankfurter v1/ECB’den tarihli kur çekip formu doldurur,
kurları `fx_rates`’te süresiz önbellekler.

## Uç sözleşmesi

`GET /v1/fx/rate?from=&to=&on=`

| | |
| --- | --- |
| Auth | `SessionGuard` + `ActiveOrgGuard` + `OrgPermissionGuard` (`finance:read`) |
| Query | `from`, `to`: `TRY\|GBP\|EUR\|USD`; `on`: `YYYY-MM-DD` |
| 200 | `{ from, to, rate, date, provider: "frankfurter", cached }` |
| `date` | Sağlayıcının döndürdüğü kur günü (hafta sonu/tatilde istenen `on`’dan önce olabilir) |
| `cached` | `true` = `fx_rates` veya `from===to` kısa devresi; sağlayıcıya gidilmedi |

Hata gövdesi standart: `{ error: { code, message }, request_id }`.

| Durum | HTTP | `error.code` |
| --- | --- | --- |
| Geçersiz query | 400 | `validation_error` |
| Frankfurter 4xx / 5xx / eksik rate | 502 | `rate_provider_error` veya `rate_unavailable` |
| Timeout (1 yeniden deneme sonrası) | 504 | `rate_provider_timeout` |

Shared: `packages/shared/src/fx.ts` → `fxRateQuerySchema` / `fxRateResponseSchema`;
`apiPaths.fxRate(...)`.

## Önbellek davranışı

Tablo: `fx_rates` (migration `0048_fx_rates`).

- **Global referans verisi** — `tenant_id` yok, RLS yok (ECB kuru tenant’tan bağımsız).
  Gerekçe: `AGENTS.md` madde 1 istisnası + `docs/MIMARI.md`.
- Unique: `(rate_date, from_currency, to_currency)`.
- `rate_date` = sağlayıcının tarihi (istenilen tarih değil).
- Geçmiş ECB kurları değişmez → süresiz cache; `ON CONFLICT DO NOTHING`.
- `from === to` → cache/sağlayıcı yok, `rate: 1`, `date` = kırpılmış `on`.
- İleri `on` → bugüne (UTC) kırpılır (Frankfurter ileri tarihe 404 verir).

Hafta sonu: istek Cumartesi ise Frankfurter Cuma döner; satır Cuma ile yazılır.
Aynı Cumartesi için ikinci istek cache’te Cumartesi anahtarı bulamaz ve sağlayıcıya
yine gider (nadir; iş günü istekleri ikinci seferde cache isabeti alır). Bilinçli
basitlik — yanlış iş günü kuru uydurulmaz.

## Form davranışı (`TransactionFormDialog`)

- Para birimi ≠ tenant baz → `GET /v1/fx/rate`; `amount_base` / `fx_rate` / `fx_dated` otomatik.
- `amountBaseTouched` (Tracker `equivTouched`): kullanıcı baz tutar veya kur alanına
  dokunursa otomatik ezmez; alanı temizlerse yeniden açılır. Para birimi değişince sıfırlanır.
- Düzenlemede kayıtlı `amount_base` varsa başlangıçta touched = true.
- Kur yüklenirken / tarih bilgisinde / hata uyarısında metinler `messages.ts` anahtarları.
- **Sağlayıcı çökerse kayıt engellenmez** — uyarı, elle giriş veya boş `amount_base` serbest.

## Tracker’dan alınan / değiştirilen

| Tracker | Verimaya |
| --- | --- |
| İleri tarihi bugüne çek | Aynı |
| Timeout’ta 1 retry; 4xx’te hemen fail | Aynı (Frankfurter client) |
| `equivTouched` | `amountBaseTouched` + `$derived` gösterim (effect ile state yazılmaz) |
| Yalnız çevrilmiş tutar | + `fx_rate` / `fx_dated` / `base_currency` snapshot |
| Önbellek yok | `fx_rates` süresiz |
| v1 Frankfurter | Aynı konvansiyon (`api.frankfurter.dev/v1`, v2 yok) |

## Dosyalar

- `apps/api/drizzle/0048_fx_rates.sql`
- `apps/api/src/integrations/frankfurter/frankfurter.client.ts`
- `apps/api/src/fx/*`
- `packages/shared/src/fx.ts`
- `apps/web/src/lib/components/TransactionFormDialog.svelte`
