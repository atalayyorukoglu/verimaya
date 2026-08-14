# Mobil UX düzeltmeleri — 2026-08-14

Pilot öncesi finans formu / işlem listesi şikayetleri. Kod değişiklikleri A maddelerinde; B maddeleri kod okuması + küçük bağlantı (yoksa rapor).

## A) Düzeltilenler

### 1. Yeni işlem formu yatay kayıyor

**Kök sebep:** Dialog paneli `w-full` iken iç grid (`sm:grid-cols-3`) ve native `input[type=date]` iOS/WebKit intrinsic min-width ile hücreyi viewport’tan taşıyordu. `body` üzerindeki `overflow-x: hidden` bunu örtüyordu; üstünü örtmek yerine kaldırıldı.

**Ne yapıldı:** `overflow-x: hidden` ile gizlenmedi. Dialog’a `min-w-0 max-w-full`, gövdeye `min-w-0`, form grid hücrelerine `min-w-0`, alan sınıflarına `min-w-0 max-w-full box-border` eklendi. Combobox listesi `absolute` değil in-flow (dialog `overflow-y` içinde kesilmesin / taşmasın).

**Dosyalar:** `apps/web/src/lib/components/Dialog.svelte`, `TransactionFormDialog.svelte`, `apps/web/src/lib/api.ts` (`fieldClass` / `textareaClass`), `apps/web/src/routes/layout.css`

**375px:** form `flex/grid` + `min-w-0` + date `max-width:100%` — yatay taşma üreten sabit `min-width` kalmadı. Dialog portal `fixed inset-0` olduğu için `AppShell` main’deki mevcut `overflow-x-hidden` bu formu zaten kesmiyordu; asıl örtü `body` idi.

### 2. Mobilde tarih alanı sığmıyor

**Ne yapıldı:** Global `input[type=date]`: `display:block; width:100%; min-width:0; max-width:100%; box-sizing:border-box; -webkit-appearance:none`. WebKit değer hizası: `::-webkit-date-and-time-value { text-align:left; min-width:0 }`. Form hücresi `min-w-0`.

**Dosyalar:** `layout.css`, `TransactionFormDialog.svelte`, `finance/+page.svelte`

### 3. iOS focus zoom (font-size < 16px)

**Ne yapıldı:** `@media (max-width: 767px)` içinde `input, textarea, select { font-size: 16px }` — katmansız kural, Tailwind `text-sm` üzerine biner. Masaüstü `text-sm` / `h-9` duruyor.

**Dosyalar:** `layout.css`

### 4. Kişi/firma araması yoktu

**Ne yapıldı:** Projede hazır combobox yoktu. Minimal erişilebilir `Combobox.svelte`: `role=combobox` / `listbox` / `option`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, ok/Enter/Escape, yazdıkça filtre. İşlem formunda native `<select>` yerine bu kullanılıyor.

**Dosyalar:** `apps/web/src/lib/components/Combobox.svelte` (yeni), `TransactionFormDialog.svelte`, `messages.ts`

### 5. Ödeme yöntemi serbest metindi

**Bulgu:** API/DB/Zod’da enum veya lookup tablo **yok** — `payment_method` `text`/`varchar(64)` nullable. Tracker legacy şema da aynı (`docs/legacy-reference/schema.sql`). Migration **yazılmadı** (serbest metin korunur).

**Ne yapıldı:** `packages/shared` sabit liste: Nakit, Kredi Kartı, Banka Havalesi/EFT, Çek, Senet, Diğer. UI `<select>`; kayıtlı ama listede olmayan değer (ör. eski `Havale` / `Kart`) seçenek olarak eklenir. Gösterim i18n; saklanan değer Türkçe kanonik string.

**Dosyalar:** `packages/shared/src/transaction.ts`, `TransactionFormDialog.svelte`, `messages.ts`

### 6. İşlemler arama çubuğu çok dar

**Ne yapıldı:** Arama + filtre kontrolleri mobilde `h-11` (44px) + `text-base` (16px); `lg:` ve üstünde eski `h-9 text-sm`.

**Dosyalar:** `apps/web/src/routes/finance/+page.svelte`

### 7. Tarih aralığı filtresi

**Bulgu:** Sözleşme ve API zaten `from`/`to` (inclusive `occurred_on`) kabul ediyor; web göndermiyordu. Raporlar `PeriodSelector` kullanıyor — işlem listesi ayrı.

**Ne yapıldı:** Filtre bloğuna başlangıç–bitiş date input; `listUrl(..., { from, to })`. Client-side değil, mevcut backend filtresi. Isolation testi eklendi. Migration yok.

**Dosyalar:** `finance/+page.svelte`, `messages.ts`, `packages/shared/src/list-query.test.ts`, `apps/api/src/transactions/transactions.isolation.spec.ts`

---

## B) İnceleme

### 8. Gelir/gider kategorileri kullanıcı düzenleyebilir mi?

**Evet — tam CRUD var, hardcoded değil.**

- UI: `/settings/categories` (`apps/web/src/routes/settings/categories/+page.svelte`) — ekle / düzenle / sil
- Hub: Ayarlar → Kategoriler
- API: `GET/POST/PATCH/DELETE /v1/settings/finance-categories` + `PUT .../reorder`
- DB: `finance_categories` (tenant’lı)

Büyük feature gerekmez. Küçük borçlar (ayrı iş, bu turda yapılmadı): ekranda hâlâ gömülü Türkçe (“Kategoriler”, “Yeni”, “Ad”, `confirm(...)`); i18n kuralına göre dokunulunca kataloğa taşınmalı.

### 9. Döviz kuru otomatik geliyor mu?

**Hayır — bilinçli snapshot modeli.** Canlı kur yok (`docs/legacy-reference/doviz.md`, gap BF-06). Tracker `GET /whatsapp/convert-rate` / Frankfurter işlem formuna taşınmadı.

- Form: para birimi ≠ tenant baz ise baz tutar + kur **elle**; ikisi de input, kullanıcı sonradan değiştirebilir (kayıt anı snapshot’ı API’ye gider).
- Frankfurter yalnızca ads spend FX backfill script’inde (`backfill-ad-spend-fx.js`) — işlem formu değil.
- “Formda tetiklenmeyen küçük bağlantı” yok; bağlanacak endpoint ürün kararıyla kaldırılmış. Bu turda otomatik fetch **eklenmedi**.

### 10. “Etiket” alanı ne işe yarıyor?

`contact_label`: dizinde kişi yokken serbest karşı taraf adı. `contact_id` seçilince disabled + display_name yazılır.

**Tüketildiği yerler:** bakiye listesi, rapor net bakiye, işlem `q` araması, WhatsApp/AI taslak, kişi silme sonrası denormalize etiket. Ölü alan değil. (Ayrı Tags modülü Tracker’da da placeholder’dı ve taşınmıyor — bu o değil.)

### 11. Tracker’da “başlık” var mıydı?

**Evet.** Legacy `transactions.title varchar(255) NOT NULL`. ETL boşsa `"İşlem"` yazar. Verimaya formda **zorunlu** Başlık (`required` + `title.min(1)`); boş varsayılan `"İşlem"` yok. Tracker React form kaynak kodu repo’da yok; şema + ETL kanıtı bu.

---

## Değişen dosyalar (özet)

| Dosya | Neden |
| --- | --- |
| `apps/web/src/lib/components/Dialog.svelte` | min-w-0 / max-w-full, kapat i18n |
| `apps/web/src/lib/components/Combobox.svelte` | yeni aranabilir combobox |
| `apps/web/src/lib/components/TransactionFormDialog.svelte` | taşma, combobox, ödeme select, i18n |
| `apps/web/src/routes/finance/+page.svelte` | 44px arama, from/to |
| `apps/web/src/routes/layout.css` | date sığdırma, mobil 16px, body overflow örtüsü kaldırıldı |
| `apps/web/src/lib/api.ts` | field min-w-0 / box-border |
| `apps/web/src/lib/i18n/messages.ts` | tr+en anahtarlar |
| `packages/shared/src/transaction.ts` | `TRANSACTION_PAYMENT_METHODS` |
| `packages/shared/src/list-query.test.ts` | from/to kabul |
| `apps/api/src/transactions/transactions.isolation.spec.ts` | from/to + negatif izolasyon |
