# Verimaya — Tüm açık işler (2026-08-10 envanter)

> **Amaç:** Repo + `docs/` + arşivdeki açık yapılacakları tek yerde görmek.
> **Aktif çalışma sırası hâlâ:** `docs/2026-08-09-YAPILACAKLAR.md` (bu dosya envanter; öncelik orada).
> **Kaynaklar:** `2026-08-09-YAPILACAKLAR.md`, `2026-08-10-KISILER-BIRLESME-PLANI.md`,
> `2026-08-09-PROD-SMOKE-REHBERI.md`, `tracker-verimaya-ozellik-gap.md`,
> `Arşiv/2026-08-03-YAPILACAKLAR.md`, `AUDIT-REPORT.md`, kod yer tutucuları.

---

## Faz 8 ne demek? (karışıklığı kes)

| Anlam | Durum |
|-------|--------|
| **Kod fazları 0–7** (panel, API, RLS, WhatsApp, Ads iskeleti, raporlar, denetim…) | **Bitmiş.** Arşiv: `2026-08-03-YAPILACAKLAR.md` üst satırı. |
| **Yol haritası “Faz 8” (eski)** = ETL apply + dahili pilot + go-live ops + ürün karne | Büyük kısmı yapıldı veya **PILOT-*** / **OPS-02** / **MARKET-*** olarak yeniden adlandırıldı. |
| **UI’daki “Faz 8’de”** (`/settings/import-export`) | **Özellik henüz yok** — bilinçli yer tutucu. Kapsam dokümanda kilitli (**GAP-08**); **uygulama yapılmadı**. İkinci müşteriden önce zorunlu; MARKET-02 sonrası / “Bekleyen”de. |

Özet: “Hepsi bitmişti” = ürün çekirdeği + çoğu gap. **İçe/dışa aktarım uygulaması bitmedi**; sadece plan/kapsam kilitlendi.

Durum: `[ ]` yapılmadı · `[~]` kısmi · `—` checkbox yok ama açık.

---

## A. Öncelik sırası (pilot → pazar)

### A1. PILOT-01 — prod smoke + artıklar

- [ ] Prod smoke turu — `docs/2026-08-09-PROD-SMOKE-REHBERI.md` §1–§3 (soft-delete, filtre, sayı; insan tıklaması)
- [ ] Pilot boyunca ikinci organizasyon yaratmama (demo/test org dahil) — devam eden kural
- [ ] Tenant adı: `Demo Klinik` rename veya bırak — karar + Görüş
- [x] Migration `0033`–`0038` prod (DOMAIN-02 ile gitti)

### A2. MARKET-01 — üç stratejik karar (17 Ağu review öncesi; kod yok)

- [ ] (a) Birincil segment: acente mi klinik mi?
- [ ] (b) OrbisMed çıkar çatışması (veri/tüzel/erişim/audit/anlatı)
- [ ] (c) Kapasite: haftalık sabit gün/saat + feature freeze taahhüdü

### A3. OPS-02 — Meta + Google Ads go-live + attribution

- [~] **OPS-02e** `patients`/`contacts` `source` doluluğu — giriş UI ✅; kapanış: **yeni kayıtlarda ≥ %80** (`ATTRIBUTION_COVERAGE_THRESHOLD`). Geçmiş 757 satır bilinçli kaynaksız.
- [ ] Meta go-live: 7 gün veri, idempotent sync, log denetimi
- [ ] Google go-live: aynı (TRY hesabı)
- [ ] Hata yüzeyleme + sync penceresi doğrulaması  
  **Not:** ROAS dışarıya attribution guard yeşil olmadan gösterilmez. Kod iskeleti + guard var; **canlı hesap go-live** açık.

### A4. DOMAIN-02 — Hastalar + Kişiler birleşme

- [x] Faz A–D, B2/B3, F (sözleşme, migration, API, panel, temizlik)
- [~] **Faz E** — E2'/E3 ✅; **kalan: E4 GHL çift yönlü senkron testi** (ad/soyad). Bilinçli ertelendi.  
  DOMAIN-02 gövdede kalır; E4 olmadan “kapanmış” sayılmaz. Plan: `2026-08-10-KISILER-BIRLESME-PLANI.md`.

### A5. PILOT-02 — 2–4 hafta feature-freeze dahili piloto

Bağımlı: A1 smoke temiz + A2(c) freeze + A4 (E4 dahil) kapanmış.

- [ ] Pilot planı + KPI’lar (ölçüm sorguları/ekranları gömülü)
- [ ] Feature freeze ilanı (yalnız bugfix + güvenlik + veri düzeltme migration)
- [ ] 2–4 hafta + haftalık rapor

#### PILOT-02 sonu kapıları (ikinci müşteri öncesi zorunlu)

- [ ] **WEBHOOK-01** shim kapat: `WEBHOOK_IDENTITY_DEFAULT_SECRET=false`; tüm tenant’ta `tenant_provider_identities` satırı doğrula. Runbook: `DEPLOY-COOLIFY.md`.
- [ ] **AUDIT-F09-02** per-key API scope map (breaking): `api_keys.scopes` → JSONB / tablo; guard + permissions + issuance UX; mevcut key migrate/rotate; negatif izolasyon testleri. Yeni endpoint’ler scope haritasına dahil.

### A6. MARKET-02 — 30 günlük pazar kapısı

Bağımlı: PILOT-02 verileri.

- [ ] 20 müşteri görüşmesi (+ rakip demo/fiyat)
- [ ] Fiyat kartı + iptal/taahhüt modeli
- [ ] Kapı kararı (≥ 3 ücretli ön-sipariş / yazılı pilot niyeti hedefi)

---

## B. Faz 9 — denetim + gap (sıra dışı; kapasite / pilot geri bildirimi)

### B1. Ops / güvenlik / KVKK

- [x] **OPS-03** Deploy CI kapısı: `workflow_run` → CI success + main + push; paths gate job'da; `workflow_dispatch` kaçış kaldı (2026-08-10).
- — **AUDIT-F09-06** `tenants` FK → `restrict` + soft-delete (`deleted_at`); 10y mali saklama ↔ KVKK. **(L)**
- — **AUDIT-F09-07** KVKK m.11: `/v1/me/data-export`, `/v1/me/data-deletion-request` + `tenants.data_retention_until` (anonimleştirme; hard-delete yok). **(L)**
- [x] **AUDIT-F09-20** `corsOrigins` allowlist hot-reload — no-op (AUDIT «Fix: None required»; boot-time env bilinçli; 2026-08-10).

### B2. Test / kalite

- — **TEST-02** TestSprite 15 senaryo DOMAIN-02’ye: TC002/TC003 `/patients` → Kişiler (Hasta filtresi, ad/soyad, kaynak→medium); isteğe bağlı organizations senaryosu. `testsprite_tests/`, `2026-08-09-TESTSPRITE-15-SENARYO.md`. **(M)**

### B3. Tracker gap P2 (PILOT-02 seçer)

- — **GAP-F09-19** Kişiye bağlı not thread’i — Açık sorular §5. **(M)**
- — **GAP-F09-20** Randevu checklist şablonları — skip adayı (Tracker’da 0 satır). **(L)**
- — **GAP-F09-23** Dosya silme endpoint’i (soft-delete + audit; KVKK). Aynı choke point (`file-mime` / storage). **(M)**

---

## C. Bekleyen — MARKET-02 sonrası / ikinci müşteri öncesi

### C1. İçe/dışa aktarım (= UI’daki “Faz 8”)

- — **GAP-08 uygulama** — Kapsam kilitli: `ETL-ESLEME.md` §3 eşleme, 26 sütun kişi şablonu, formül enjeksiyonu sanitizasyonu; Tracker’da ~1482 satırlık bundle+contact import/export.  
  Verimaya: `apps/web/src/routes/settings/import-export/+page.svelte` → metin **"Faz 8’de"** (uygulama yok).  
  **İkinci müşteriden önce zorunlu** (Açık sorular §9).

### C2. Tracker P3 / ürün

- — **GAP-25** Kapsamlı veri silme (`/data/delete-scope`) + wipe — “tehlikeli” onay korunur
- — **GAP-26** AI prompt özelleştirme — Açık sorular §6
- — **GAP-27** Toplu `reorder` endpoint (kısmen PATCH ile var)
- — **GAP-28** Dev panel gerçek arka uç veya ekranı gizle (bugün yalnız MSW)
- — **GAP-29** Randevu öncesi eksik iletişim bilgisi uyarısı
- — **PRODUCT-01** Komisyon takibi discovery (acente seçilirse)
- — **IOS-01** iOS donmuş + birikmiş drift (DOMAIN-01 enum / marketing adları) — çözülürse ilk kalem

### C3. Hukuk / marka / ops hijyen

- — Marka tescili: `verimaya.com` / `.com.tr` + Türk Patent 9/35/42/44 (görünen **"Veri Maya"**)
- — CSP/HSTS canlıda kanıtlı denetim
- ✅ pnpm audit / Dependabot CI’da — Dependabot haftalık + CI `dependency-audit`
  (continue-on-error; OPS-03 deploy’u bloklamaz). Bulgu düzeltmesi ayrı.
- — Veri işleme envanteri (tamamı)
- — AB veri lokasyonu envanteri + DPA şablonları
- — Coolify `verimaya-web-image` → `verimaya-web` rename (isteğe bağlı)
- — API için GHCR path B (isteğe bağlı)

### C4. Dokümantasyon artıkları (kullanıcı / vault)

- — **DOC-03b/d:** Obsidian `00-proje-ozeti.md` + `01-kararlar.md` marka satırları; `04-ilerleme-log.md` (vault oturumu)

---

## D. Açık ürün kararları (kod yazmadan önce)

Karar verilmiş (uygulandı): §1 soft-delete; §2 patient/contact merge semantiği.

3. Randevu durumu enum kalacak mı? (tenant CRUD → enum→FK) — PILOT-02
4. Checklist ölü mü? → GAP-F09-20 skip olabilir
5. Kişi notları ayrı mı / tek model mi? → GAP-F09-19
6. AI prompt tenant’a açılsın mı? → GAP-26
7. Tenant izin matrisi isteniyor mu? — pilotta ölç; AUDIT-F09-02 ile kısmen örtüşür
8. P2P payer/payee geri gelecek mi? — freeze öncesi ucuz, sonra pahalı
9. İçe/dışa aktarım ikinci müşteriden önce mi? → C1 / GAP-08

---

## E. Bilinçli olarak yapılmayacaklar (MARKET-02 kapısına kadar)

Bunlar backlog değil; **yapılmama kararı** (liste tam metin: YAPILACAKLAR):

- iOS App Store hazırlığı  
- Hub SEO locale ağacı `/tr/` `/en/` (UI switcher kısmi bilinçli)  
- TikTok / Instagram entegrasyonları  
- e-Nabız / e-Fatura  
- Ürün içi karne genişletmesi  
- Etiketler (Tags)  
- Kişilerden toplu case / toplu auto-link (ETL kapsamı)  
- Lead/pipeline CRM app’te (GHL’de kalır — DOMAIN-01)  
- Randevu durumu tenant-CRUD  
- Canlı kur çevirici  
- `responsible_party` alanı (Contact absorbe etti)

---

## F. Kodda görünen eksik yüzeyler (doğrulama)

| Yüzey | Durum |
|-------|--------|
| `/settings/import-export` | Yer tutucu “Faz 8’de” — uygulama yok |
| Ads Meta/Google | Kod + runbook var; **canlı go-live** açık (A3) |
| DOMAIN-02 E4 | GHL çift yön henüz test edilmedi |
| Deploy vs CI | ✅ OPS-03 — CI yeşil olmadan auto-deploy yok (`workflow_dispatch` kaçış); audit job continue-on-error |
| Tedarik zinciri | ✅ Dependabot + `pnpm audit` CI (rapor; bloklamaz) |
| TestSprite TC002/TC003 | Hâlâ `/patients` senaryosu (TEST-02) |
| Dosya silme | Endpoint yok (GAP-F09-23) |
| Kişi not thread | Yok (GAP-F09-19) |
| Dev panel Nest modülü | Yok; MSW-only (GAP-28) |

---

## G. Ne kapanmış sayılır? (kısa; şüpheyi azaltmak için)

Faz 0–7 kodu · DOMAIN-01 · GAP P0/P1 (01–08 kapsam kilidi dahil, **uygulama C1 hariç**) · DOMAIN-02 A–D/F · çok sayıda Faz 9 AUDIT/GAP (OpenAPI generator, i18n süpürme, MIME sniff, preview, audit filtreleri, corrections-report, bulk-type, auto-link, type_counts, DLQ, duplicate scan, OAuth state, guard coverage, flaky spec…) — kanıt: YAPILACAKLAR “Son kapananlar” + arşiv `2026-08-03`.

---

## H. Sayı özeti (açık kalem, kabaca)

| Blok | Açık / kısmi |
|------|----------------|
| A öncelik (PILOT/MARKET/OPS/DOMAIN E4) | ~20 checkbox + kısmi OPS-02e + E4 |
| B Faz 9 | 6 madde (OPS-03 kapandı) |
| C bekleyen | ~15 madde (GAP-08 dahil; audit/Dependabot kapandı) |
| D açık sorular | 7 karar |
| E yapılmayacaklar | N/A (bilinçli) |

**En sık karıştırılan:** “Faz 8 bitti” ≠ “import/export bitti”. Import/export **bilerek ertelenmiş özellik**; panelde hâlâ yer tutucu.
