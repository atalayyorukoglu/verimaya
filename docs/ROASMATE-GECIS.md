# RoasMate → Verimaya Geçiş Planı

**Karar (2026-07-22):** RoasMate ayrı ürün olarak büyütülmez. Reklam matematiği, uyumluluk ve pazarlama UX’i Verimaya’ya gömülür; tek gelişen ürün Verimaya’dır. İlk hedef kitle: sağlık turizmi acenteleri / klinikleri.

Kaynak repo: `~/Projects/roasmate` (referans; kod taşıma değil, **bilgi + formül + UX kalıbı** taşıma — `docs/legacy-reference/` prensibiyle aynı).

Bu dosya repo içi geçiş referansıdır. Günlük takip Obsidian’da (`SecondBrain-Remote/03-Areas/Verimaya`); faz bitişlerinde burası işaretlenir. Ana yol haritası: [`YOL-HARITASI.md`](./YOL-HARITASI.md).

---

## 1. Neden birleşiyoruz?

| | RoasMate | Verimaya |
|---|---|---|
| Ürün tipi | Eğitim + araç (B2C eğilimli) | Multi-tenant B2B operasyon SaaS |
| Çekirdek değer | Platform ROAS → gerçek kâr matematiği | Hasta/lead, randevu, finans, entegrasyon |
| Veri | Mock / FS store | PostgreSQL + RLS, gerçek domain |
| Ads | `MockAdsConnector` | `ad_metrics_daily` + Faz 5 OAuth (planlı) |
| CRM / finans | Yok | Hasta pipeline + tahsilat + rapor |

RoasMate’in boşluğu (CRM, finans, tenant) Verimaya’da dolu. Verimaya’nın boşluğu (birim ekonomi, “gerçek ROAS”, sağlık reklam compliance) RoasMate’de olgun. Birleşince acente tek yerde hem operasyonu hem “bu reklam gerçekten kâr mı?” sorusunu görür.

**Taşınmaz:** RoasMate SSG/Vercel mimarisi, Paraglide i18n, Student/Pro Stripe, FS auth, mavi marka (`#598AD9`), community/academy ürün yüzeyi (içerik isteğe bağlı P2).

---

## 2. Kaynak envanteri (RoasMate)

### 2.1 Olgun — öncelikli artefact (`packages/core`)

| Modül | Dosyalar | Ne yapar |
|---|---|---|
| Truth Calculator | `truth-calculator/*` | Platform ROAS → katkı payı, gerçek ROAS, başabaş, maks. reklam maliyeti |
| Ad Simulator | `ad-simulator/*` | CPC/CVR/satış oranı → CPL, satış başı maliyet, trafik ışığı, ölçek tavanı |
| Compliance | `compliance/*` | Sağlık dikeyi yasaklı kelime taraması |
| Trust Score | `trust-score/*` | Consent / EMQ / CAPI / SST / CRM feedback checklist skoru |
| Templates | `templates/*` | UTM builder, 3:2:2 split, 60/30/10 bütçe |
| AdsConnector | `ads/connector.ts` | Arayüz + mock (yalnız sözleşme fikir olarak) |

Hepsi Vitest’li saf TypeScript; Verimaya’ya en temiz taşınan parça burasıdır.

### 2.2 UX kalıpları (UI yeniden yazılır, TR + TickPort)

| RoasMate route | Anlamı | Verimaya hedefi |
|---|---|---|
| `/app/hesap` | Truth Calculator | `/pazarlama/hesap` (veya `/raporlar/gercek-roas`) |
| `/app/simulator` | Reklam matematiği simülatörü | `/pazarlama/simulator` |
| `/app/compliance` | Yasaklı dil tarayıcı | `/pazarlama/uyumluluk` |
| `/app/panel` | Ads + gerçek ROAS overlay | `/raporlar` + pazarlama ROAS kartı (gerçek veri) |
| `/app/guven-modulu` | Trust Score | `/pazarlama/olcum` veya ayarlar checklist |
| `/app/sablonlar` | UTM / bütçe şablonları | `/pazarlama/sablonlar` |
| `/app/sihirbaz` | Kampanya kapıları | P2 — yayın öncesi checklist |
| Academy / Community | Müfredat + vaka | P2 — yardım/docs veya iç notlar |

### 2.3 Bilinçli olarak taşınmayanlar

- Landing, bülten, pricing, signup/login (B2C)
- Stripe / Turnstile / Resend / PostHog ürün yüzeyi (Verimaya’da ayrı karar)
- Supabase migration stub’ları ve `.data/` FS store
- Vercel adapter, prerender varsayımları
- İngilizce i18n iskeleti (Verimaya tek dil TR)

---

## 3. Hedef mimari (Verimaya’ya oturma)

```text
RoasMate core formülleri
        │
        ▼
packages/shared  (zod + saf hesap fonksiyonları + Vitest)
        │
        ├─► apps/api  (gerekirse /v1/marketing/* veya rapor aggregate)
        │         │
        │         ├─ ad_metrics_daily (spend)
        │         ├─ patients.source + status (attribution)
        │         └─ transactions / finance-summary (gelir)
        │
        └─► apps/web  /pazarlama/* + /raporlar (TR UI, Svelte 5 runes)

Meta/Google OAuth (Faz 5)
        │
        ▼
integrations/meta|google → BullMQ ad_metrics.sync → ad_metrics_daily
```

**İlkeler (AGENTS.md ile uyumlu):**

1. Sözleşme önce `packages/shared`.
2. Domain kodu provider bilmez; Ads sync adaptör katmanında.
3. Multi-tenant: her tabloda `tenant_id` + RLS; cache anahtarında `tenant_id`.
4. AI/çıkarım taslaktır — burada geçerli değil; ROAS sayıları ise **onaylı finans + sync metrik** kaynaklı olmalı (hesaplanabilir, denetlenebilir).
5. UI Türkçe; TickPort warm neutrals (`docs/TASARIM.md`).

### 3.1 Önerilen menü / özellik kimliği

- Sol menü grubu: **Pazarlama** (yeni) — Hesap, Simülatör, Uyumluluk, Şablonlar, Ölçüm olgunluğu.
- Raporlar’a ek kart: **Gerçek ROAS** (spend ↔ tahsilat / kapalı hasta).
- `packages/shared/src/features.ts`: yeni feature id’leri (`truth-calculator`, `ad-simulator`, `ad-compliance`, `real-roas`, …) — `/ozellikler` ile senkron.
- Changelog: `docs/CHANGELOG-KURALLARI.md` — kullanıcı dilinde, `featureId` bağlı.

### 3.2 ROAS tanımı (ürün kararı)

Tek ekranda iki katman gösterilir; karışıklık önlenir:

| Metrik | Formül (özet) | Kaynak |
|---|---|---|
| Platform ROAS | Ads paneli / raporlanan dönüşüm değeri ÷ spend | Meta/Google (ileride) veya manuel girdi |
| Gerçek ROAS (Verimaya) | Dönem tahsilatı (veya kapalı hasta geliri) ÷ Ads spend | `transactions` + `ad_metrics_daily` |
| Hasta başı maliyet (CPL/CPA) | Spend ÷ lead veya kapalı hasta sayısı | `patients` + `ad_metrics_daily` |
| Katkı / başabaş | Truth Calculator girdileri | Kullanıcı birim ekonomisi + opsiyonel clinic defaults |

Attribution V1: `patient.source` (serbest metin / bilinen değerler: meta, google, ghl, whatsapp). V2’de UTM / campaign_id eşlemesi ayrı iş.

---

## 4. Faz planı

Mevcut `YOL-HARITASI.md` Faz 5 (Ads) ve Faz 7 (Rapor) ile **örtüşür**; RoasMate birleşimi onları genişletir, yerine geçmez. Aşağıdaki alt fazlar (`RM-*`) geçiş iş paketleridir.

### RM-0 — Dokümantasyon ve sınırlar ✅

- [x] Bu geçiş planı (`docs/ROASMATE-GECIS.md`)
- [x] `YOL-HARITASI.md` içine RoasMate birleşimi referansı (Faz 5/7 notu)
- [x] `MIMARI.md`’ye pazarlama hesap katmanı + ROAS tanımı (kısa)
- [ ] Obsidian: “RoasMate → Verimaya tek ürün” kararı (1–2 satır)

### RM-1 — Core formülleri shared’a (P0) — ~3–5 gün ✅

**Amaç:** RoasMate hesap motorunu Verimaya sözleşmesine almak; UI’sız bile testli paket.

- [x] `packages/shared` altında `marketing/` (veya `roas/`) dizini:
  - [x] `truth-calculator` — tipler + `calculateTruthMetrics` + golden testler
  - [x] `ad-simulator` — tipler + `calculateAdSimulation` + testler
  - [x] `compliance` — `DEFAULT_BANNED_TERMS` + `scanLandingCopy` + testler
  - [x] `templates` — `buildUtmUrl`, `split322`, `split603010` + testler
  - [x] `trust-score` — checklist skoru + testler
- [x] Para birimi: Verimaya minor unit (kuruş) ile uyum kararı — formül girdileri minor unit integer; UI’da TL formatı
- [x] Zod şemaları (input/output) shared’da; web/api aynı tiplerden türer
- [ ] RoasMate repo’suna not: “canonical artık Verimaya `packages/shared`” (opsiyonel README uyarısı)

**Kabul kriteri:** `pnpm --filter @verimaya/shared test` (veya mevcut test runner) golden’ları yeşil; RoasMate sayısal sonuçlarıyla parity.

✅ 22 golden test yeşil; RoasMate ile sayısal parity (para = kuruş ×100, oranlar birebir); Infinity para → null.

**Taşınmaz:** `MockAdsConnector` implementasyonu; yalnız ileride adaptör için interface notu `MIMARI.md`.

### RM-2 — Pazarlama araç UI (P0) — ~1 hafta ✅

**Amaç:** Acente MSW veya gerçek API ile birim ekonomi araçlarını kullanır; Ads OAuth gerekmez.

- [x] AppShell menü: **Pazarlama** grubu
- [x] `/pazarlama` hub (kısa açıklama + araç kartları)
- [x] `/pazarlama/hesap` — Truth Calculator (URL state opsiyonel)
- [x] `/pazarlama/simulator` — Ad Simulator (trafik ışığı, ölçek, hedef satış)
- [x] `/pazarlama/uyumluluk` — metin yapıştır → yasaklı kelime hit listesi
- [x] `/pazarlama/sablonlar` — UTM + 60/30/10 + 3:2:2
- [x] `/pazarlama/olcum` — Trust Score checklist (manuel checkbox; entegrasyon yok)
- [x] `features.ts` + changelog + `/ozellikler` güncellemesi
- [x] Mobil + açık/koyu tema (mevcut tasarım sistemi)

**Kabul kriteri:** Demo tenant’ta araçlar çalışır; hesaplar shared fonksiyonlarından gelir (UI’da formül kopyası yok).

### RM-3 — Gerçek ROAS paneli (P1) — Faz 5 ile birlikte / hemen sonrası — ~1–2 hafta

**Amaç:** Harcama + CRM/finans birleşik rapor.

Bağımlılık: `ad_metrics_daily` dolu (OAuth sync veya geçici fixture/manuel); dönemsel tahsilat aggregate (Faz 7 mevcut).

- [ ] Shared: `RealRoasInput/Result` (dönem, spend, revenue, leads, closed patients)
- [ ] API: `GET /v1/reports/marketing` (veya `/v1/reports/roas`) — tenant scoped:
  - spend: `ad_metrics_daily` aggregate (`from`/`to`/`provider`)
  - revenue: dönem gelir işlemleri (ve/veya kapalı hasta finans özeti politikası — **karar notu aşağıda**)
  - counts: yeni lead / `closed_won` (veya eşdeğer status) by `source`
- [ ] Negatif izolasyon testi: Tenant A, Tenant B metriklerini göremez
- [ ] Web: Raporlar’a “Pazarlama / Gerçek ROAS” bölümü + isteğe Truth overlay (katkı oranı kullanıcı girdisi)
- [ ] Ayarlar > Bağlantılar > Reklamlar: “hasta başına maliyet · kaynak bazında” deep-link

**Ürün kararı (RM-3 başlamadan netleştir):**

1. Payda (gelir): **tahsilat (nakit)** mi, **fatura/sözleşme tutarı** mı, yoksa **kapalı hasta beklenen gelir** mi?
2. Attribution: yalnızca `source` mı, yoksa kampanya düzeyi V1’de yok mu?
3. Para birimi: spend USD/TRY karışımı — tek rapor para birimi kuralı.

Öneri (varsayılan): V1 **tahsilat (income transactions) ÷ Ads spend**; attribution `patient.source`; kampanya kırılımı V2.

### RM-4 — Ads OAuth ve connector (P1) — mevcut Faz 5 tamamlama

RoasMate’ten gelen “panel” ancak burada gerçek olur.

- [ ] Meta Marketing API OAuth → `tenant_credentials`
- [ ] Google Ads OAuth → `tenant_credentials`
- [ ] Adaptörler: `apps/api/src/integrations/meta|google/`
- [ ] `ad_metrics.sync` worker: fixture yerine gerçek pull; idempotent upsert
- [ ] Offline conversion yol haritası notu (Google) — uygulama P2 olabilir
- [ ] UI: bağlantı durumu, son sync, hata (Bull Board / jobs ile uyumlu)

**Kabul kriteri:** En az bir gerçek tenant credential ile `ad_metrics_daily` doluyor; RM-3 raporu canlı veri gösteriyor.

### RM-5 — Ölçüm olgunluğu ve kampanya kapıları (P1–P2) — ~1 hafta

- [ ] Trust Score’u tenant ayarına bağlama (persist: `tenant_settings` veya benzeri JSON)
- [ ] Checklist maddelerini Verimaya gerçeklerine map et:
  - consent / KVKK notu
  - Enhanced conversions / CAPI (entegrasyon durumu)
  - CRM → Ads feedback (offline conversion job var mı?)
  - EMQ / lead kalitesi (ileride GHL opportunity)
- [ ] Kampanya sihirbazı (hafif): yayın öncesi checkbox’lar (compliance + birim ekonomi + trust eşiği) — zorunlu gate değil, uyarı bandı
- [ ] Compliance: reklam metni / LP metni kaydı opsiyonel (audit log)

### RM-6 — İçerik ve radar (P2) — isteğe bağlı

- [ ] Academy müfredatından “lead ≠ hasta”, CAPI, 3:2:2, 60-30-10 → `docs/` veya uygulama içi yardım
- [ ] Community vaka şablonu (yaptım / sayılar / öğrendim) — dahili pilot notları; public community yok
- [ ] Değişiklik Radarı: Meta/Google/TikTok politika uyarıları (seed + admin approve) — ops uyarı modeli
- [ ] RoasMate marketing sitesi / changelog yüzeyi — Verimaya `/yenilikler` yeterli

### RM-7 — RoasMate emeklilik

- [ ] RoasMate README: “Yeni geliştirme Verimaya’da; bu repo arşiv”
- [ ] Gerekirse repo archive / read-only
- [ ] Domain/DNS ve Vercel projesi kapatma veya Verimaya vitrine yönlendirme
- [ ] Stripe test ürünleri iptal (varsa)

---

## 5. Dosya / paket eşlemesi

| RoasMate | Verimaya |
|---|---|
| `packages/core/src/truth-calculator/` | `packages/shared/src/marketing/truth-calculator/` ✅ |
| `packages/core/src/ad-simulator/` | `packages/shared/src/marketing/ad-simulator/` ✅ |
| `packages/core/src/compliance/` | `packages/shared/src/marketing/compliance/` ✅ |
| `packages/core/src/trust-score/` | `packages/shared/src/marketing/trust-score/` ✅ |
| `packages/core/src/templates/` | `packages/shared/src/marketing/templates/` ✅ |
| `packages/core/src/ads/connector.ts` | Referans → `integrations/meta\|google` + mevcut `ad-metrics` |
| `/app/hesap` UI | `apps/web/src/routes/pazarlama/hesap/` |
| `/app/simulator` UI | `apps/web/src/routes/pazarlama/simulator/` |
| Panel ROAS | `GET /v1/reports/marketing` + `apps/web` raporlar |
| Auth / billing / community | Taşınmaz |

---

## 6. Test ve kalite kapıları

- Shared: RoasMate golden test parity (aynı input → aynı output).
- API: her yeni tenant’lı marketing/rapor endpoint’i için negatif izolasyon testi.
- Web: kritik formüller UI’da yeniden yazılmaz; shared import.
- Para: minor unit integer; ISO-8601 UTC dönemler.
- MSW: RM-2 araçları istemci tarafı shared ile çalışabilir; RM-3 için MSW’de örnek `ad-metrics` + rapor fixture.

---

## 7. Riskler ve mitigasyon

| Risk | Mitigasyon |
|---|---|
| “ROAS” tanımı kullanıcıda karışır | UI’da Platform vs Gerçek etiketleri; tooltip |
| Spend para birimi ≠ tahsilat | Rapor para birimi kuralı + dönüşüm notu |
| Attribution zayıf (`source` serbest) | V1 bilinçli sade; UTM/campaign V2 |
| Faz 5 OAuth gecikir | RM-2 bağımsız ship; RM-3 fixture/manuel spend ile demo |
| Kapsam şişmesi (academy/community) | P2 kapısı; çekirdek RM-1…3 bitmeden başlama |
| İki repoda diverging formül | Canonical = Verimaya shared; RoasMate arşiv |

---

## 8. Önerilen sıra (özet)

```text
RM-0 doküman ──► RM-1 shared core ──► RM-2 pazarlama UI
                      │
                      └─► (paralel) Faz 5 Ads OAuth (RM-4)
                                      │
                                      ▼
                              RM-3 gerçek ROAS raporu
                                      │
                                      ▼
                              RM-5 trust/kapılar → RM-6 içerik → RM-7 arşiv
```

**İlk ship değeri:** RM-1 + RM-2 — Ads hesabı olmadan bile acenteye “gerçek kâr matematiği + compliance” sunar.  
**Tam birleşim değeri:** RM-3 + RM-4 — Verimaya’nın CRM/finans avantajı devreye girer.

---

## 9. Açık kararlar (başlamadan cevaplanacak)

1. Gelir paydası V1: tahsilat mı, başka mı? → **Öneri: tahsilat.**
2. Menü adı: “Pazarlama” mı, “Reklam” mı? → **Öneri: Pazarlama.**
3. Academy içeriği ürün içi mi, sadece docs mu? → **Öneri: önce docs; ürün içi P2.**
4. RoasMate domain’i ne zaman kapanır? → RM-2 public olduktan sonra yönlendirme yeterli olabilir.
5. `YOL-HARITASI.md` Faz numarası: RM işleri Faz 5/7 altına mı, yoksa “Faz 5b Pazarlama matematiği” mi? → **Öneri: Faz 5b (RM-1/2) + Faz 7b (RM-3); Faz 5 OAuth = RM-4.**

---

## 10. Obsidian log (oturum özeti şablonu)

> RoasMate ayrı ürün bırakıldı; geçiş planı `docs/ROASMATE-GECIS.md`. İlk iş: shared’a Truth Calculator + Simulator + compliance (RM-1), sonra `/pazarlama` UI (RM-2).

---

## Durum

| Paket | Durum |
|---|---|
| RM-0 Plan dokümanı | ✅ Bu dosya |
| RM-1 Core shared | ✅ |
| RM-2 Pazarlama UI | ✅ |
| RM-3 … RM-7 | ⬜ Başlanmadı |
| RoasMate arşiv | ⬜ |
