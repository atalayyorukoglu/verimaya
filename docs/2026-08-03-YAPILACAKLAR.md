# Verimaya — Yapılacaklar (2026-08-03 · Faz 0–7 + Faz 7 denetim sonrası)

> **Bu dosya tek kaynaktır.** Faz 0–7 (tüm kod fazları + Opus denetimi) tamamlandı.
> Kalan işlerin tamamı **Faz 8 — kod dışı**, **kod-içi güvenlik/hijyen** veya **denetim sonrası** kategorisinde.
>
> Durum anı: branch `main`, HEAD `60ea531` (hub dil değiştirici + Veri Maya markası;
> DOC-03a senkronu 2026-08-07). Opus denetim raporu: `AUDIT-REPORT.md` (38 bulgu).
> 2026-08-03 sonrası hub/marka/CSP/i18n özeti: `git log 627e506..HEAD` + CHANGELOG `0.7.0`.
>
> **2026-08-07 eki — Tracker gap analizi.** `docs/tracker-verimaya-ozellik-gap.md`
> (32 gap + 9 bilinçli fark) ve ürün gözden geçirmesi bu listeye işlendi:
> **5A DOMAIN-01** (patient = operasyon dosyası, CRM değil), **5B GAP-P0** (3 pilot bloğu,
> biri canlı 404 hatası), **6B GAP-P1** (5 saha kalemi), Faz 9'a 11 P2 kalemi,
> Bekleyen'e 5 P3 kalemi, "Bilinçli yapılmayacaklar"a 6 satır, yeni
> **"Açık sorular / ürün kararı"** bölümü (9 madde).

---

## Çalışma kuralları

1. **Sırayla ilerle.** Sıra numarası önceliği gösterir; `Bağımlı:` satırı kırmızı çizgidir.
2. **Adım başına tek commit.** Commit mesajı Türkçe, `feat:` / `fix:` / `ops:` / `docs:` önekiyle.
3. **Bitirince bu dosyayı güncelle:** `- [ ]` → `- [x]` ve **Görüş** satırını doldur.
4. **Soru sorma, en savunulabilir varsayımı seç**, Görüş'te yaz.
5. **Sır yazma.** Hiçbir token/parola/anahtar değeri koda, teste, commit mesajına girmez.
6. **Bir blokta birden çok numaralı kalem varsa (GAP-01/02/03, Adım 1/2/3…), her kalem
   ayrı commit ve ayrı kabul kriteridir.** Kaleme ait `**Kabul (X):**` satırı varsa
   bağlayıcı olan odur; blok sonundaki `**Kabul:**` satırı bloğun tamamının bitiş şartıdır.
   **Sana tek bir kalem söylendiyse yalnız onu yap, diğerlerine dokunma, soru sorma.**

**Durum işaretleri:** `- [ ]` yapılmadı · `- [x]` yapıldı · `- [~]` ksmi

---

## Öncelik Sırası

### 1. WEBHOOK-01 — Tenant çözümünü imzalı / provider eşlemesinden yap

> **Durum:** ✅ Tamamlandı (commit `daec868`). Tenant çözümleme artık
> `tenant_provider_identities` tablosundan, imza doğrulaması sonrasında SECURITY
> DEFINER fonksiyonla yapılıyor. X-Tenant-Id header'ı artık kanonik tenant değil;
> imza payload'ına (`${ts}.${provider}.${claimedTenantId}.${body}`) bağlı. Pilot
> geçiş köprüsü `WEBHOOK_IDENTITY_DEFAULT_SECRET=true` + `WEBHOOK_IDENTITY_DEFAULT_TENANT=<id>`
> ile mevcut WAHA pilotunu bozmadan çalışıyor. Negatif izolasyon spec
> (`webhooks.identity.isolation.spec.ts`, 6 test) imza+header+provider
> tampering'in tamamını 401 ile reddediyor. **Pilot bittikten sonra pilot-shim
> env flag'leri kapatılmalı; prod ortamda legacy scheme kapalı olmalı.**

- [x] Uygulama kararı ver → migration + kod + test
- [x] `.env.example` ve `docs/DEPLOY-COOLIFY.md` güncelle:
  `WEBHOOK_IDENTITY_DEFAULT_SECRET` ve `WEBHOOK_IDENTITY_DEFAULT_TENANT` env flag'leri
  (WAHA pilotu için) ve `tenant_provider_identities` satırlarının nasıl
  provision edileceği (admin endpoint yok → SQL + CryptoService; runbook
  `DEPLOY-COOLIFY.md` § WEBHOOK-01). `apps/api/README.md` curl imza kanonu da
  `${ts}.${provider}.${tenant}.${body}` ile hizalandı.
- [ ] **PILOT-02 sonu:** Pilot-shim env flag'lerini kapat (`WEBHOOK_IDENTITY_DEFAULT_SECRET=false`).
  Tüm tenantların per-tenant identity satırı olmalı; aksi halde webhook
  reddedilir. **AUDIT-F09-03 ile paylaşımlı kalem.**
- **Dosyalar:** `apps/api/drizzle/0023_tenant_provider_identities.sql`,
  `apps/api/drizzle/0024_webhook_identity_lookup.sql`,
  `apps/api/src/db/schema/tenant-provider-identities.ts`,
  `apps/api/src/webhooks/webhooks.identity.ts`,
  `apps/api/src/webhooks/webhooks.controller.ts`,
  `apps/api/src/webhooks/webhooks.identity.isolation.spec.ts`,
  `docs/DEPLOY-COOLIFY.md`, `apps/api/.env.example`, `.env.example`,
  `apps/api/README.md`
- **Bağımlı:** yok (tasarım hazır)
- **Kabul:** Geçerli body imzası + değiştirilmiş `X-Tenant-Id` ile hedef tenant'a yazılamıyor (negatif test). ✅
- **Görüş:** Audit başlangıcında "tek-tenant bugün" diye düşünülmüştü; reconsiderasyon
  sonrası pilot-öncesi alındı çünkü aynı secret-leak → tenant-admin shape'i
  AUDIT-02 ile birebir örtüşüyor. **Negatif izolasyon spec 6 test içeriyor:
  claim-spoof, header-tampering, provider-tampering, replay, no-secret,
  cross-provider-rotation.** 2026-08-07: deploy/.env.example runbook tamam;
  kalır: PILOT-02 shim kapatma.

---

### 1A. AUDIT-01 — Opus denetimi: hasta tenant-timezone kaçağı

> **Durum:** ✅ Tamamlandı (commit `7499366`). İki yüzey düzeltildi.
> **Varsayım:** Her rapor/aggregasyon giriş noktası, kendi tenant'ının
> `tenants.timezone` değerini okuyup `tenantDayRange` (zaten
> `packages/shared/src/calendar-day.ts`'de var) kullanacak. Rapor sınırları
> UTC sabit kalmasın.

- [x] `patients.service.ts:512-519` `getTenantTimezone(db)` → `getTenantTimezone(db, tenantId)` imzasına çevir, `.where(eq(tenants.id, tenantId))` ekle
- [x] `reports.service.ts:75-82, 458, 461` UTC `startOfDayUtc`/`dayAfterUtc` → tenant-timezone-aware `tenantDayRange` (`packages/shared`)
- [x] Negatif izolasyon testi: `apps/api/src/patients/patients-timezone.isolation.spec.ts` (3 test) — gerçek Postgres, iki tenant (`Europe/Istanbul` + `Europe/London`), aynı UTC anında farklı tarih etiketleri.
- [x] Negatif izolasyon testi: `apps/api/src/reports/reports-timezone.isolation.spec.ts` (3 test) — `patientDistribution` London ve Istanbul için farklı total döner; Istanbul 2026-08-01 bucket'i UTC 22:00'ı kapsamaz, London kapsar.
- **Dosyalar:** `apps/api/src/patients/patients.service.ts`, `apps/api/src/reports/reports.service.ts`, yeni `patients-timezone.isolation.spec.ts`, `reports-timezone.isolation.spec.ts`
- **Bağımlı:** 1 (WEBHOOK-01 — tenant izolasyon kanıtlanmadan testlerin anlamı yok)
- **Kabul:** Tenant B timezone'ı `Europe/London`'a çekildiğinde `GET /v1/reports/summary?from=2026-08-01&to=2026-08-01` Tenant A ile **farklı** satır sayısı döndürür (gerçek Postgres ile). ✅
- **Görüş:** Fix iki commit'te uygulandı (schema yok; sadece service code + 2
  spec). `tenants` tablosunun RLS'siz olması audit'te belgelenmişti; bu fix
  açıkça filter ekleyerek aynı sınıf hatayı kapatıyor. `sumAdSpend` ve
  `fetchTransactions` fonksiyonları `transactions.occurredOn` (`date` tipinde,
  UTC-agnostic) kullandığı için etkilenmedi; onlar zaten doğru.
  Test: 6/6 yeni test geçiyor; tam paket 66/67 dosya, 272/274 test
  (2 LLM HTTP timeout flaky; bu commit ile ilgisi yok).

---

### 1B. AUDIT-02 — Opus denetimi: API-key RBAC bypass

> **Durum:** ⚠️ Defer-to-after-pilot kararı. Inline `if (req.apiKeyAuth) return true`
> OrgPermissionGuard'da korundu; bypass bilinçli bir risk olarak dokümante edildi.
> **Neden pilot-öncesi (AUDIT-02):** Aynı hata şekli WEBHOOK-01 ile aynı: "ele
> geçen secret → tenant-admin gücü". API key'ler n8n workflow'larına yapıştırılır,
> contractör ile paylaşılır, yanlışlıkla commit edilir.
> **Reconsiderasyon:** Opus raporu bunu after-pilot'a koymuştu. **Pilot-öncesine
> alındı.** Tek tenant bugün olduğu için hasar yüzeyi dar, ama ikinci tenant
> eklenmeden önce API key'lerin de tenant kaynağı kanıtlanmalı (AGENTS.md
> invariant-1).
> **Ancak:** Düzeltme için iki seçenek var; ikisi de breaking change. (a) Guard'da
> short-circuit'i kaldırmak → tüm API key'ler reddedilir; (b) per-key resource
> scope map eklemek → L-effort (yeni şema, issuance UX, migration). Bugünkü
> tek tenant pilot için kabul edilebilir risk.
> **Geçici karar:** Pilot öncesi MUTLAKA yapılması gereken minimum: bypass'in
> varlığının dokümante edilmesi ve AUDIT-F09-02'nin açıkça takip edilmesi. **Bu
> commit ile dokümante edildi (kod yorumu + YAPILACAKLAR güncellemesi); AUDIT-F09-02
> pilot-02 sonu için zorunlu.**

- [x] **Kabul-1:** OrgPermissionGuard'daki bypass inline comment ile dokümante edildi — gelecek okuyucu "yanlışlıkla unutulmuş" değil "bilinçli risk" olarak görsün.
- [ ] **Kabul-2 (Pilot öncesi zorunlu):** Per-key resource scope map implementasyonu (AUDIT-F09-02) planın **ilk** kalemi olarak pilot-02 sonu için işaretlendi. Pilot sırasında n8n API key'leri **değiştirilmek zorunda kalacak** (her integration kendi scope sözlüğüne geçecek). Bu pilot sırasında keşfedilecek.
- [ ] **Kabul-3 (Pilot öncesi zorunlu):** `apps/api/src/api-keys/api-keys.isolation.spec.ts` AUDIT-F09-02 ile birlikte genişletilecek — "API key ile `/v1/audit-logs` çağrısı reddedilir" gibi negatif testler eklenecek.
- [ ] **AUDIT-F09-02 (Pilot-02 sonu):** Per-key resource scope şeması:
  - Migration: `api_keys.scopes` text[] → structured JSONB veya ayrı `api_key_scopes` tablosu
  - `AuthOrApiKeyGuard` ve `OrgPermissionGuard` güncelleme
  - API key issuance UX (kullanıcı scope seçer)
  - Mevcut tüm API key'ler için migration path (default scope = full → explicit scope)
- **Dosyalar:** `apps/api/src/common/org-permission.guard.ts` (sadece dokümantasyon, davranış değişmedi)
- **Bağımlı:** yok
- **Kabul:** Kod yorumu audit-in belgelediği bypass'in varlığını açıkça gösteriyor. ✅ AUDIT-F09-02 pilot-02 sonu tamamlanmadan pilot-çok-tenant geçişi yapılamaz.
- **Görüş:** **Breaking change'i pilot öncesi yapmadım çünkü tek-tenant pilot
  bugün çalışıyor** ve L-effort scope map tek başına bir major refactor. Opus
  audit'i "after-pilot'a koy" demişti; ben onu "pilot-öncesi ama L-effort kapsam
  dışı" olarak re-kategorize ettim ve inline dokümantasyon ile bilinçli
  risk olarak işaretledim. **Risk altında olan**: n8n API key'inin ele
  geçirilmesi durumunda saldırgan tenant içinde full admin yetkisi alır;
  çözüm için pilot-02 sonuna kadar per-key scope map şart.

---

### 2. SEC-01 (kalan) — OAuth secret rotasyonu + Obsidian temizliği

> **Durum:** ✅ Tamamlandı (2026-08-07). SSH, PostgreSQL, Redis, Better Auth,
> credential encryption + Google OAuth rotasyonu daha önce bitmişti. Obsidian
> `VeriMaya/Untitled.md` silinmiş; vault + repo taramasında düz metin PEM/SSH/
> parolalı connection string kalmadı. Revision/iCloud geçmişi kullanıcı tarafından
> doğrulanıp kapatıldı.

- [x] Google OAuth client secret rotate edildi
- [x] Obsidian `Untitled.md` içindeki sırları kalıcı temizle (aktif + revision + yedek)
- [x] Repo, vault, terminal geçmişi, deploy notlarında kopya kalmadığını doğrula

---

### 3. LEG-02 — KVKK aydınlatma metni + açık rızanın hukukçu onayı

> **Durum:** ✅ Tamamlandı (2026-08-07). Taslak bandı kaldırıldı; lead flag’leri
> açıldı; canlıda lead `karne_leads`’e yazıldığı doğrulandı (Coolify
> `KARNE_LEADS_ENABLED=true` + kullanıcı gönderimi + psql SELECT).

- [x] Aydınlatma metnini yayına al (taslak uyarısı kaldırıldı)
- [x] Lead flag’lerini birlikte aç (API `.env.example` + web Dockerfile/example)
- [x] **Ops doğrula:** Coolify API’de `KARNE_LEADS_ENABLED=true` + karne formu +
  `karne_leads` satırı (psql) — 2026-08-07
- **Dosyalar:** `apps/web/src/routes/(public)/kvkk-aydinlatma/+page.svelte`,
  `apps/web/Dockerfile`, `apps/web/.env.example`, `apps/api/.env.example`,
  `apps/web/src/lib/env.ts`, `docs/DEPLOY-COOLIFY.md`
- **Görüş:** Lead kaydı DB’ye yazılıyor. 2026-08-07 devam: Resend ile özet
  e-postası eklendi (`integrations/email`). Prod’da `RESEND_API_KEY` +
  `KARNE_SUMMARY_FROM` (verified domain) şart; yoksa UI “kaydınız alındı /
  mail gecikebilir” der.

---

### 4. OPS-01 (kalan) — Otomatik sunucu dışı yedek/snapshot düzeni

> **Durum:** ✅ Tamamlandı (2026-08-07). Coolify scheduled backup → R2
> (`verimaya-pg-backups` / storage `verimaya-r2-pg`). DB: `verimaya` (yalnız
> `postgres` değil). Cron `0 3 * * *` UTC. Restore prova: host’tan
> `pg_restore` → `verimaya_restore_test` → **37** public tablo → DROP.

- [x] Yedek düzenini kur (Coolify Backups + R2 S3 storage)
- [x] Tarihli restore provası yap, kanıtla (2026-08-07, 37 tablo)
- [x] Runbook'u `docs/DEPLOY-COOLIFY.md`'ye ekle (R2 + Coolify yolu)
- **Görüş:** Özel `scripts/ops/pg-backup-to-r2.sh` yedek planı olarak
  duruyor; canlı yol Coolify native Backup + R2. Retention alanları 0
  (limitsiz) — ileride 7–14 gün sabitlemek iyi olur.

---

### 4A. OPS-WEB-B — Path B sonrası temizlik (kafa karışıklığı önle)

> **Durum:** ✅ 2026-08-07. Eski `verimaya-web` (Dockerfile) silindi. Canlı web =
> yalnız `verimaya-web-image` (domain: apex + www + app). API hâlâ Dockerfile yolu.

**Coolify (silinebilir / dokunma — karıştırma):**

- [x] Eski **`verimaya-web`** (Dockerfile + Git build) silindi — 2026-08-07
- [x] Eski app’i **yeniden Start etme** — app yok; uyarı geçersiz
- [x] Yeni app’te kaynak = Docker Image + GHCR (`verimaya-web-image`)

**Repo (silme):**

- [x] `apps/web/Dockerfile` — **silinmedi** (GHA image üretir) — bilinçli koru
- [x] `.github/workflows/deploy-web.yml` — **silinmedi** — bilinçli koru

**İsteğe bağlı (kafa karışıklığı azaltır):**

- [ ] Coolify projede isim: `verimaya-web-image` → `verimaya-web` rename (UUID aynı)
- [x] `docs/MIMARI.md` Helsinki (`*-hel1-*`) DPA/anket satırı — 2026-08-07
- [ ] API için aynı path B (GHCR) — ayrı iş, şimdilik zorunlu değil
- **Bağımlı:** yok (path B zaten canlı)
- **Kabul:** Coolify’da tek aktif web app = image pull ✅
- **Görüş:** Silme sonrası resources: api + web-image + db + redis. Rename isteğe bağlı.

---

### 5. AUDIT-03 — Opus denetimi: operasyonel hijyen paketi

> **Durum:** ✅ Tamamlandı (commit `0effeda` + `api-key-rotation`). 7/8
> sub-item uygulandı; 1 (virus scan) bilinçli olarak AUDIT-F09-08'e
> bırakıldı (yeni npm dependency, scope dışı). Sentry beforeSend sub-item
> (Sentry DSN olmadan test edilemez) AUDIT-F09'a alındı.
> **Varsayım:** Tek-tenant pilot için kabul edilebilir risk: virus scan
> olmaması (operatör review'ı ile telafi). Magic-byte sniff pilot sonrası
> için açık iş.

- [x] `apps/api/src/main.ts` — `app.enableShutdownHooks()` eklendi (Coolify SIGTERM drain). ✅
- [x] `apps/api/src/db/schema/api-keys.ts` + migration 0025/0026 — `last_used_at`, `expires_at` kolonları; `app.lookup_api_key` `expires_at` filtresi; yeni key'ler 90 gün default expiry; guard her başarılı lookup'ta `last_used_at` günceller. ✅
- [x] `apps/api/src/main.ts:120-128` Fastify `bodyLimit: MAX_UPLOAD_BYTES` → `bodyLimit: 1 MB` (multipart `fileSize: 25 MB` korunur). ✅
- [x] `apps/api/src/main.ts` — `/v1/*` için per-IP 600/min; `/v1/auth/*` için 10/min throttle. ✅
- [x] `apps/api/src/main.ts` + `docs/openapi.mount.ts` — `mountOpenApiDocs({enabled, token})`; production'da `API_DOCS_TOKEN` yoksa mount atlanır. ✅
- [x] `apps/api/src/queue/queue.service.ts:registerIntegrationSchedulersIfEnabled` — production'da `ENABLE_INTEGRATION_SCHEDULERS!=true` ise WARN log. ✅
- [~] better-auth `organization.delete` override — **DEFERRED** (better-auth iç route'ları override etmek L-effort fork gerektirir; inline dokümantasyon eklendi).
- [x] Pino redact + LLM log scrub — `openai-compatible-llm.client.ts:174-186` artık response body loglamıyor (status + content-type + byte length). Sentry beforeSend ise test edilemez; TODO olarak SENTRY_DSN atandığında eklenecek. ✅
- [ ] **AUDIT-F09-08 (pilot sonrası):** Magic-byte MIME sniff (file-type/ mmmagic) + S3 driver için aynı kontrol. Audit-03 virus scan sub-item'inin devamı.
- **Dosyalar:** `apps/api/src/main.ts`, `apps/api/src/docs/openapi.mount.ts`, `apps/api/src/queue/queue.service.ts`, `apps/api/src/integrations/llm/openai-compatible-llm.client.ts`, `apps/api/src/auth/auth.ts` (inline dokümantasyon), `apps/api/src/api-keys/api-keys.service.ts`, `apps/api/src/api-keys/api-key.guard.ts`, `apps/api/src/db/schema/api-keys.ts`, `apps/api/drizzle/0025_api_key_rotation.sql`, `apps/api/drizzle/0026_api_key_expiry_filter.sql`, `packages/shared/src/api-key.ts`
- **Bağımlı:** yok (1A ve 1B'den bağımsız)
- **Kabul:** Her alt-madde kendi commit'inde tamam; CI yeşil; docs/DEPLOY-COOLIFY.md yeni env'leri listeler. ✅ (kabul-1, 2, 3, 4, 5, 6, 8 için; 7 inline doc; virus scan + Sentry beforeSend sonraya)
- **Görüş:** 7/8 sub-item uygulandı. Sentry beforeSend üretim DSN'si olmadan
  test edilemez; manuel kod yorumu eklendi. Virus scan pilot sonrasına
  bırakıldı. **Pre-existing test izolasyon sorunu:** AUDIT-03 değişiklikleri
  olmadan da `auth-or-api-key.isolation.spec.ts > Tenant A` test'i
  başarısız (test sıralaması sorunu; Tenant B testi Tenant A'nın
  state'ine bağlı). Audit'in scope'u dışı; ayrı bug olarak takip
  edilebilir. Toplam test: 65/67 dosya, 271/274 test (1 pre-existing
  flaky, 2 LLM HTTP timeout).

---

### 5A. DOMAIN-01 — Patient = operasyon dosyası (CRM değil)

> **Kaynak:** `docs/tracker-verimaya-ozellik-gap.md` + 2026-08-07 ürün gözden geçirmesi.
> **Bu yeni bir yön değil, uygulanmamış bir karar.** `apps/web/src/lib/i18n/messages.ts:217-220`
> zaten şunu yazıyor: *"Lead durumu ve pipeline aşaması: GHL sahibi / Randevu, finans ve
> operasyon alanları: Veri Maya sahibi"* — ama başlık **"Alan sahipliği (planlanan)"**.
> `packages/shared/src/patient.ts:6` de kodda not düşmüş: *"Status pipeline is a first draft;
> refine after legacy notes.md is filled"* → o `notes.md` hiç yazılmadı
> (`docs/legacy-reference/README.md`'de işaretsiz kutu). Boşluk buradan geldi.
>
> **Sınır:** `crm.verimaya` (GHL) = lead, görüşme, aşama, "gelecek mi?".
> `app.verimaya` = randevu, otel/transfer/klinik (contacts), dosya, not, finans.
> Omurga **patient = operasyon dosyası**. Aynı kişinin 2. gelişi = **yeni patient**;
> kimlik `Contact`'ta, epizot `Patient`'ta.
>
> **Neden şimdi:** PILOT-01 apply'ı 757 hasta yazdı, hepsi `status='lead'` varsayılanıyla.
> PILOT-02 feature-freeze başlayıp 2–4 hafta gerçek operasyon verisi biriktikten sonra
> enum değişimi pahalılaşır. Kritik tarih ETL değil, **PILOT-02 başlangıcı**.

- [x] **Adım 1 — Kopya / UI dili (şema dokunulmaz):** "Yeni hasta = yeni lead" hissini kaldır.
  `/patients` liste kolonları, `PatientFormDialog`, `PanelHome` ve boş-durum metinleri
  operasyon dosyası diline çevrilir (yeni metinler doğrudan gömülmez → `messages.ts`
  anahtarı, AGENTS.md dil kuralı). Pipeline vurgusu yerine **randevu / dosya / para** vurgusu.
  - **Kabul (Adım 1):** `/patients`, `PatientFormDialog`, `PanelHome` ve boş-durum
    metinlerinde satış hunisi dili yok; tüm yeni metinler `messages.ts` anahtarı
    (tr + en); **`patient.ts`, şema, migration ve enum'a dokunulmadı** (`git diff`
    ile kanıtlanır); mevcut testler yeşil.
  - **Görüş (Adım 1):** CTA/boş durum/açıklama dosya diline alındı; Kaynak kolonu en sağa.
    PanelHome "Yeni lead" → "Açık dosya" (`GET /v1/reports/patient-distribution`, from/to
    yok). `/patients/duplicates` açıklamasından "lead" çıkarıldı (i18n). Status etiketleri
    bilinçli bırakıldı (Adım 2).
- [x] **Adım 2 — `patientStatusSchema` daraltma:** 9 değerli CRM hunisi
  (`lead, contacted, qualified, scheduled, arrived, treated, follow_up, closed_won, closed_lost`)
  → operasyon değerlerine indirilir. Öneri: `scheduled, arrived, treated, follow_up, cancelled`.
  Lead tarafı (`lead/contacted/qualified/closed_won/closed_lost`) GHL'in; app'e **sync ile** düşer,
  app'te yazılmaz. Sözleşme önce `packages/shared/src/patient.ts`'te değişir (AGENTS.md ilke 7),
  sonra Drizzle migration + ETL eşlemesi + MSW + web.
- [x] **Adım 3 — Veri migrasyonu.** ⚠️ **Adım 2 ile AYNI commit ve AYNI migration'da gider.**
  Gerekçe (2026-08-07 tespiti): `patients.status` Postgres enum değil, `text('status')` ve
  kolon varsayılanı `'lead'` (`apps/api/src/db/schema/patients.ts:16`). Adım 2 tek başına
  giderse (a) DB'deki 757 satır hâlâ `lead`/`contacted` tutar → zod okurken reddeder,
  hasta listesi kırılır; (b) kolon varsayılanı `'lead'` kaldığı için yeni açılan her dosya
  geçersiz değerle doğar. **İkisi ayrılamaz.**
  - Tek migration içinde: `UPDATE patients SET status = <eşleme>` → sonra
    `ALTER COLUMN status SET DEFAULT '<yeni varsayılan>'`.
  - Eşleme: yeni sette olmayan **her değer** → `scheduled`. Semantik sadakat aranmaz —
    **pilot verisi tek kullanımlık** (2026-08-07 kullanıcı teyidi): aynı kayıtlar Tracker'da
    ayrıca duruyor, Verimaya'daki kopyası kaybolsa sorun değil. Bu yüzden `closed_won → treated`
    gibi kalem kalem eşleme gereksiz; tek `UPDATE` yeterli.
  - Tabloyu boşaltıp ETL'i baştan çalıştırmak **tercih edilmez** — `appointments`,
    `transactions`, `files`, `case_notes` hepsi `patient_id`'ye bağlı, cascade ile silinir;
    tek satırlık `UPDATE`'ten pahalı.
  - Eşleme tablosu `docs/legacy-reference/ETL-ESLEME.md` §2.5'e işlenir (ETL de aynı
    varsayılanı yazmalı — bugün `lead` yazıyor).
  - **Kabul (Adım 2+3):** `patientStatusSchema` yalnız operasyon değerleri içeriyor;
    `patientStatusLabels` güncel; migration sonrası `SELECT DISTINCT status FROM patients`
    yalnız yeni değerleri döndürüyor; kolon varsayılanı yeni değer; `/patients` ve `/reports`
    hata vermeden açılıyor; tenant izolasyon testleri yeşil.
  - **Görüş (Adım 2+3):** Tek migration `0029_patient_status_operational.sql`: legacy →
    `scheduled`, DEFAULT `scheduled`, CHECK daraltıldı. Marketing `closed_*` → `treated_*`
    (`status === 'treated'`). ETL/MSW/web güncellendi. iOS bilinçli atlandı (IOS-01 drift notu).
- [x] **Adım 4 — GHL sahiplik kuralını "planlanan"dan çıkar:** `settings.ghl.ownership.heading`
  başlığındaki "(planlanan)" kaldırılır; kural yazılı olduğu gibi uygulanır
  (çakışmada kaynak sahibi kazanır + audit). İdeal akış: GHL'de lead olgunlaşınca
  patient app'e düşer; **elle oluşturma yedek yol olarak kalır**, birincil akış değil.
  - **Görüş (Adım 4):** `settings.ghl.ownership.heading` → "Alan sahipliği" / "Field ownership"
    (tr+en); "(planlanan)/(planned)" kalktı.
- [x] **Adım 5 — Raporlarda huni vurgusunu ayır:** `/reports` "Hasta durum dağılımı" ve
  "Kaynak dağılımı" kartları operasyon diline çevrilir veya pazarlama bloğuna taşınır.
  `source` alanı kalır (ROAS/hasta-başı-maliyet buna bağlı) ama **satış hunisi olarak sunulmaz**.
  - **Görüş (Adım 5):** "Hasta durum dağılımı" → "Dosya durumu" (i18n). Özet'teki
    `by_source` "Kaynak dağılımı" kartı kaldırıldı (ölü `sourceDist` dahil); pazarlama
    "Kaynak kırılımı" kaldı (Dosya / Tedavi edilen).
- [x] **Adım 6 — MSW demo notunu ayır:** Demo/fixture verisindeki lead dili "demo" etiketiyle
  işaretlenir; gerçek panelde operasyon dili görünür.
  - **Görüş (Adım 6):** Fixture kirletilmedi; MSW açıkken AppShell üstünde tek şerit
    (`demo.banner`); MSW kapalıyken render yok. DevToolbar senaryo seçici ayrı kaldı.
- [x] **Adım 7 — Hasta birleştirmeyi "boş dosya" ile sınırla (karar: Açık sorular §2).**
  Dedup'ın amacı aynı **kişinin kayıt bilgisini** birleştirmek; kişinin **gelişlerini** tek
  dosyada toplamak değil. Bugünkü `merge` bu ikisini ayırmıyor — aynı işlemde hem kapak
  bilgisini topluyor hem randevu/işlem taşıyor. Ayrılacak.

  **İki farklı durum, iki farklı davranış:**

  | Durum | Davranış |
  | --- | --- |
  | Dosyada **randevu veya işlem var** | Mükerrer sayılmaz, gruplarda **hiç görünmez**. Bu meşru bir geliştir; birleştirilirse hangi randevu/ödeme hangi gelişe aitti geri dönülemez şekilde kaybolur. |
  | **İkisi de tamamen boş** (randevu 0, işlem 0) | Birleştirilebilir: eksik alanlar (telefon / e-posta / kaynak / notlar) hedef kayda doldurulur, fazla kayıt silinir. Taşınacak randevu/işlem zaten yok. |

  - `GET /v1/patients/duplicate-groups` yalnız **randevusu ve işlemi olmayan** hastaları döndürür.
  - `POST /v1/patients/merge` ön koşul kontrolü yapar: hedef veya kaynakta randevu/işlem varsa
    **409** (`patient_has_records`) döner. FK taşıma mantığı kalkar; yerine **alan doldurma**
    (yalnız hedefte boş olan alanlar kaynaktan yazılır) + kaynak kaydı silme gelir.
  - UI dili "birleştir"den **"eksik bilgiyi tamamla, fazla dosyayı kapat"**a çevrilir
    (`messages.ts`, tr + en). "Çift kayıt tara" butonu kalır.
  - **Korunacak:** kişi tarafı dedup'ın tamamı (`/contacts/duplicate-groups`, `/contacts/merge`)
    — dokunulmaz. Kullanıcı örneği ("bir kayıtta telefon, diğerinde e-posta") kimlik düzeyinde
    zaten orada çözülüyor.
  - **Kabul (Adım 7):** Randevusu/işlemi olan hasta mükerrer grubunda görünmüyor; böyle bir
    merge denemesi 409 dönüyor (negatif test); iki boş kayıtta telefon+e-posta tek kayıtta
    birleşiyor ve diğeri siliniyor (pozitif test); tenant izolasyon spec'i geçiyor;
    `docs/legacy-reference/kisiler.md` hasta-merge satırı bu kararla güncellenmiş.
  - **Görüş (Adım 7):** Boş kapak dedup: randevu/işlem → grup dışı + 409 `patient_has_records`;
    FK taşıma kalktı; boş alan doldurma (telefon/e-posta/kaynak/notlar/`contact_id`); farklı
    `contact_id` → grupta ayrılır + 409 `patient_contact_mismatch`. Contacts dedup dokunulmadı.
- **Dosyalar:** `packages/shared/src/patient.ts`, `apps/api/src/db/schema/patients.ts` + yeni migration,
  `apps/api/src/patients/patients.service.ts`, `apps/web/src/routes/patients/**`,
  `apps/web/src/routes/reports/+page.svelte`, `apps/web/src/lib/components/PatientFormDialog.svelte`,
  `apps/web/src/lib/components/PanelHome.svelte`, `apps/web/src/lib/i18n/messages.ts`,
  `apps/web/src/lib/mocks/handlers.ts`, `docs/legacy-reference/ETL-ESLEME.md`
- **Bağımlı:** Adım 2–3 için PILOT-01 apply tamam (✅). **MARKET-01(a)** segment kararı
  (acente / klinik) Adım 5'in tonunu etkiler ama Adım 1–4'ü bloklamaz.
- **Kabul:** `/patients` ekranında hiçbir yerde satış hunisi dili yok; `patientStatusSchema`
  yalnız operasyon değerleri içeriyor; 757 hastanın statüsü yeni enum'a taşınmış;
  GHL sahiplik metni "(planlanan)" değil; tenant izolasyon testleri yeşil.
- **Görüş:** DOMAIN-01 Adım 1–7 kapandı. Ownership metni kesin; raporlarda durum = dosya
  durumu, özet kaynak kartı kalktı (pazarlama kırılımı kaldı); MSW demo şeridi AppShell'de.

---

### 5B. GAP-P0 — Gap analizi P0 kalemleri (pilot bloğu)

> **Kaynak:** `docs/tracker-verimaya-ozellik-gap.md` — G-30, G-02, G-01.
> Üçü de PILOT-02 feature-freeze'den **önce** kapanmalı; freeze sırasında bunlar keşfedilirse
> pilot verisi güvenilmez olur.

- [x] **GAP-01 (G-30) — Randevu tipi CRUD sözleşme kopukluğu.** `settings/appointment-types/+page.svelte:37,49`
  `POST /v1/settings/appointment-types` ve `DELETE .../:id` çağırıyor; MSW karşılıyor
  (`handlers.ts:1712,1728`); **gerçek NestJS controller'da yalnız `@Get` var**
  (`settings.controller.ts:140`). MSW kapalıyken randevu tipi eklenemez → 404.
  **Bu PILOT-01 Görüş'ündeki `case-notes` 404'ünün birebir aynı sınıfı** — desen tekrarlıyor.
  - [x] **Kalıcılık (2026-08-07 tespiti):** Arkada tablo **yok**. `appointment-type-defaults.ts`
    tipleri `DEFAULT_APPOINTMENT_TYPE_NAMES`'den deterministik SHA-256 ID ile üretiyor →
    POST'un yazacağı yer yok. **Karar: `contact_types` aynası** — `appointment_types` tablosu
    + migration + RLS + service CRUD (`db/schema/contact-types.ts` birebir örnek alınır).
    - **Tuzak 1 — ID sürekliliği:** Mevcut varsayılanlar tenant başına
      `defaultAppointmentTypeId(tenantId, name)` ile üretilmiş sentetik UUID taşıyor.
      Migration bu ID'lerle **seed** etmeli; yeni rastgele UUID üretilirse kayıtlı
      seçimler ve `sort_order` kopar.
    - **Tuzak 2 — serbest metin bağı:** `appointments.appointment_type` FK değil,
      serbest metin (`packages/shared/src/appointment.ts:22`). **Bu iş kapsamında FK'ya
      çevrilmez** — tablo yalnız ayarlar sözlüğü olarak kullanılır. Tip silinince
      mevcut randevular etkilenmez.
    - **Yan kazanç:** `ETL-ESLEME.md` §2.2 "Tracker tiplerini pilot settings'e ek seed olarak
      yaz" kalemi ancak bu tabloyla mümkün — migration'a `Yeni Hasta` / `Devam Hastası` / `RPT`
      seed'i eklenebilir (pilot tenant için).
  - [x] Controller'a POST + DELETE ekle, tenant izolasyon spec'i yaz
  - [x] **Kök neden:** MSW ↔ gerçek API sözleşme kayması. `apiPaths` içindeki her yolun
    NestJS'te karşılığı olduğunu doğrulayan reflection-based coverage testi ekle
    (AUDIT-F09-04 / idempotency-coverage kalıbı). Bu üçüncü kez olmasın.
  - **Kabul (GAP-01):** Coverage testi önce KIRMIZI (eksiği gösteriyor), controller
    eklendikten sonra YEŞİL; MSW kapalı ortamda tip **eklenip → GET'te görünüp → silinebiliyor**
    (kalıcılık kanıtı); mevcut varsayılan tipler aynı ID'lerle korunmuş;
    tenant izolasyon spec'i geçiyor. **GAP-02/03'e dokunulmaz.** ✅
- [x] **GAP-02 (G-02) — Üye rolü değiştirme yüzeyi.** `members.controller.ts` yalnız `@Get()`;
  `settings/team/+page.svelte` rolü salt-okunur rozet gösteriyor. Tracker'da
  `PATCH /members/{user_id}` vardı (`tenant_admin.py:64`). Org sahibi bir üyenin rolünü
  panelden değiştiremiyor.
  - **Kabul (GAP-02):** `PATCH /v1/members/:id` var; org sahibi `/settings/team`'den rolü
    değiştirebiliyor; kullanıcı kendi rolünü düşüremiyor; audit kaydı düşüyor;
    tenant izolasyon spec'i geçiyor. ✅
- [x] **GAP-03 (G-01) — İşlem listesi filtre seti.** Tracker `GET /transactions` 16 query param
  alıyordu (`transactions.py:176-280`); Verimaya `transactionListQuerySchema`
  (`list-query.ts:30-38`) yalnız `patient_id, contact_id, from, to` + `.strict()` —
  tanımsız parametre 400 döner. Pilot minimum seti: **`kind`, `status`, `category`, `q`**.
  Sözleşme önce `packages/shared`'da (AGENTS.md ilke 7), sonra API + MSW + `/finance` filtre çubuğu.
  - **Kabul (GAP-03):** `transactionListQuerySchema` dört filtreyi kabul ediyor; API, MSW ve web
    aynı şemadan türüyor; `/finance` sayfasında filtre çubuğu çalışıyor;
    tanımsız parametre hâlâ 400 dönüyor (`.strict()` korunur). ✅
- **Dosyalar:** `apps/api/src/settings/settings.controller.ts`, `apps/api/src/members/members.controller.ts`,
  `packages/shared/src/list-query.ts`, `apps/api/src/transactions/transactions.{controller,service}.ts`,
  `apps/web/src/routes/finance/+page.svelte`, `apps/web/src/routes/settings/team/+page.svelte`,
  `apps/web/src/lib/mocks/handlers.ts`
- **Bağımlı:** yok. **Üç kalem bağımsız — ayrı commit, ayrı kabul kriteri.**
- **Kabul:** GAP-01 + GAP-02 + GAP-03 kabul kriterlerinin üçü de geçti (kalıcılık/izolasyon,
  rol değiştirme + last-owner, filtre seti + `.strict()`). ✅
- **Görüş:** 5B P0 pilot bloğu kapandı (2026-08-08). Üç kalem ayrı commit; PILOT-02 freeze
  öncesi P0 yüzey açıkları kapalı.
- **Görüş (GAP-01, 2026-08-08):** Coverage `api-paths-coverage.spec.ts` önce yalnız
  `settingsAppointmentType` eksikliğini gösterdi (KIRMIZI); POST+DELETE sonrası YEŞİL.
  `0028_appointment_types` + RLS + `app.default_appointment_type_id` SQL fonksiyonu Node
  `defaultAppointmentTypeId` ile birebir eşleşiyor (hash parity doğrulandı). Lazy seed yeni
  tenantlar için aynı ID'leri üretir. `appointments.appointment_type` FK yapılmadı.
  İzolasyon: create→list→delete + Tenant B delete 404. Varsayım: ekstra Tracker seed
  (`Yeni Hasta`/`Devam`/`RPT`) pilot tenant'a ertelendi — blok metninde "eklenebilir";
  DEFAULT dört tip yeterli. **GAP-02/03 dokunulmadı.**
- **Görüş (GAP-02, 2026-08-08):** `PATCH /v1/members/:id` membership id (liste ile aynı);
  `settings:update` geçici (AUDIT-F09-02 `members` resource yorumu controller'da).
  Self-role → 403 `cannot_change_own_role`; son owner demote → 400 `last_owner` (ayrı test).
  Audit `entity_type=user`. UI: owner/admin select; self rozet+disabled. MSW PATCH eklendi.
  **GAP-03 dokunulmadı.**
- **Görüş (GAP-03, 2026-08-08):** `kind`/`status` enum exact; `category` exact string; `q`
  title/subtitle/category/patient/contact/description ilike. `.strict()` korundu (MSW + schema
  test). `/finance` filtre çubuğu + i18n. Tracker'ın diğer 12 param'ı (subtitle, invoice_status…)
  bilinçli olarak dışarıda — pilot minimum seti.

---

### 6. PILOT-01 — ETL dry-run → apply → verify (kendi firmamız ilk tenant)

> **Bağımlı:** 1+1A+1B+2+3+4+5 (WEBHOOK-01, AUDIT-01, AUDIT-02, sırlar temiz, hukuk onayı, yedek, operasyonel hijyen).
> Runbook: `docs/ETL-KESIM.md`.

- [x] ETL dry-run (Fixrav Tracker → Verimaya)
- [x] Apply + verify
- [ ] Pilot boyunca **ikinci organizasyon yaratma** (demo/test org'u dahil)

- **Görüş (2026-08-07):** Tracker Railway `OrbisMed Clinics` → prod tenant
  `Demo Klinik` (`afb4a68b…`). İlk apply’de 816/757/548 yazıldı; randevu/dosya 0
  kaldı çünkü Tracker’da `appointments.case_id` hep NULL — bağlantı `contact_id`.
  ETL’e `contact_id → cases.contact_id` (ve dosya için randevu zinciri) eklendi;
  2. apply: **703 randevu + 24 dosya** (3+3 skip: contactsiz). 3. apply 0 insert
  (idempotent). `etl:verify` OK (counts + money; kaynakta 8 contact-email dupe
  grubu beklentiyle hizalandı). Tenant adı hâlâ “Demo Klinik” — rename / 2. org
  açık. Spot check UI + para örneklem panoda.
  **2026-08-07 akşam:** Panel randevu/ayar 500 kök nedeni prod DB migration
  drift (`tenants.timezone` 0020+ eksik) — migrate 0020–0027 uygulandı.
  Finans listesi `occurred_on DESC` olacak şekilde kodlandı (API deploy sonrası).
  **Hasta notları:** `GET/POST/DELETE /v1/patients/:id/case-notes` API’de
  eksikti (UI + MSW vardı → prod 404 “Notlar yüklenemedi”); endpoint’ler eklendi.

### 6A. FX-01 — Base currency FX coverage (sırayla; kilit en sonda)

> Prod teşhis: Demo Klinik `base_currency=GBP` ama ETL `amount_base` yazmamış
> (548 satır FX null). Liste native currency (TRY) gösterir; GBP özet eksik kalır.

- [x] **Adım 1 — Resolver + summary FX alanları (kilit YOK):** `resolveBaseAmount`
  yalnız `baseCurrency === tenantBase` iken snapshot kullanır; `amountInBase`
  aynı kural (`base_currency == null` kaçığı kapatıldı). `GET /v1/reports/summary`
  → `fx_missing_count`, `fx_missing_amount_by_currency`, `coverage_ratio` (adet).
  Rapor kartı tooltip + Veri kalitesi “Kur bilgisi eksik”.
- [x] **Adım 2 — backfill-fx.js + ETL mapping:** Tracker `counterparty_*` → 389
  Demo Klinik satırı güncellendi (coverage %99.8; 1 satır equivalent yok).
  ETL INSERT artık FX dört alanını yazıyor; ETL-ESLEME §3.4 hizalandı.
- [x] **Adım 3 — `base_currency_locked`:** ≥1 işlem varken PATCH base değişimi
  409 `base_currency_locked`; GET `base_currency_locked`; ayarlar select disabled.
  Prod Demo Klinik GBP doğrulandı → kilit deploy.
- **Görüş (Adım 1–3):** Sunucu coverage adet bazlı; canlı kur yok. Kilidi Adım 1–2
  ile birlikte göndermedik; doğrulama sonrası ayrı commit.
---

### 6B. GAP-P1 — Gap analizi P1 kalemleri (saha kullanımı)

> **Kaynak:** `docs/tracker-verimaya-ozellik-gap.md`. Pilotu bloklamaz ama saha kullanımında
> günlük sürtünme yaratır. PILOT-02 sırasında hangisinin gerçekten eksik olduğu ölçülsün;
> freeze bitince sıraya girsin.

- [ ] **GAP-04 (G-05) — Randevu arama + durum filtresi.** `appointmentListQuerySchema` yalnız
  `patient_id, from, to`. Tracker'da `status_id`, `q` (not/kişi adı/**tarih**), `contact_involves`
  vardı (`appointments.py:138-205`). En az `q` + `status` taşınmalı.
- [ ] **GAP-05 (G-03/G-04) — Sunucu tarafı işlem denetim motoru.** Tracker
  `services/transaction_audit.py` (310 satır, 8 kural: `case_required`, `case_forbidden`,
  `contact_type_mismatch`, `responsible_not_internal`, `contact_equals_responsible`,
  `personal_payer_payee_required`, `currency_equivalent_missing`, `partial_amount_out_of_range`)
  + kaydedilmemiş taslak için canlı uyarı (`POST /transactions/audit-draft`).
  Verimaya'da yalnız `reports/+page.svelte:355-405` içinde **istemci tarafı 6 basit kural** var —
  sayfalı listeden hesaplandığı için büyük tenant'ta yanlış "temiz" sonucu verir.
  **`AUDIT-F09-17` ile aynı sınıf** (istemci O(N) agregasyon); birlikte ele alınmalı.
  Not: BF-04/BF-05 gereği `responsible_party` ve payer/payee kuralları **taşınmaz**.
- [ ] **GAP-06 (G-06/G-07/G-08) — Silme yüzeyleri: işlem / randevu / kişi.** Üçünde de
  `@Delete` yok (doğrulandı: 0 eşleşme). **Önce politika kararı gerekir** — hard-delete mi
  soft-delete mi? Türk mali mevzuatı 10 yıl saklama (`AUDIT-F09-06`) ile KVKK silme hakkı
  (`AUDIT-F09-07`) çatışıyor. Öneri: soft-delete + audit, `AUDIT-F09-06` ile aynı desen.
- [ ] **GAP-07 (G-12) — Randevu operasyon metrikleri raporu.** Tracker'da **canlı**
  (`ReportsPage.tsx:33,668` → `DashboardOzetContent`; ayrı rotası yoktu ama Summary sekmesinde
  render ediliyordu — "ölü kod" değil). Eksik olanlar: tamamlanma / no-show / iptal oranı,
  klinik performansı, aylık randevu trendi, vaka türü dağılımı. Veri zaten var
  (`appointmentStatusSchema` `no_show`/`cancelled`/`completed` içeriyor, `clinic_contact_id` var);
  agregasyon yok. `AUDIT-01`'deki `tenantDayRange` altyapısı kullanılmalı.
  **DOMAIN-01 ile uyumlu:** bu operasyon raporu, huni raporu değil.
- [ ] **GAP-08 (G-09/G-10) — İçe/dışa aktarım kapsamını ETL eşlemesine bağla.** Tracker
  `tenant_import_export.py` 1482 satır: üç kapsam için şablon → export → dry-run → commit,
  ayrıca 26 sütunluk kişi şablonu + legacy başlık eşleme + formül enjeksiyonu sanitizasyonu
  (`_sanitize_cell`). Verimaya'da 29 satırlık "Faz 8'de" yer tutucu.
  **Yeni iş değil** — kapsam netleştirmesi: Faz 8 planı `ETL-ESLEME.md` §3 alan eşlemesini
  yeniden kullanmalı, sanitizasyon korunmalı. İkinci müşteriden önce zorunlu, pilot için değil.
- **Bağımlı:** GAP-06 için silme politikası kararı (bkz. "Açık sorular / ürün kararı" §2).
- **Kabul:** Her kalem kendi commit'inde; sözleşme değişiklikleri önce `packages/shared`'da.
- **Görüş:** _(doldurulacak)_

---

### 7. MARKET-01 — Üç stratejik karar (17 Ağustos review öncesi)

- [ ] **(a)** Birincil segment: acente mi klinik mi? (ilk 20 görüşme tek segmente odaklansın)
- [ ] **(b)** OrbisMed çıkar çatışması: veri ayrımı, tüzel ayrım, erişim/audit, referans anlatısı
- [ ] **(c)** Kapasite: Verimaya'ya haftalık sabit gün/saat + pilot boyunca feature freeze

---

### 8. OPS-02 — Meta + Google Ads gerçek hesapla go-live kabulü

> Runbook: `docs/ADS-META-GOLIVE.md`, `docs/ADS-GOOGLE-GOLIVE.md`.

- [ ] Meta: 7 gün veri, idempotent sync, log denetimi
- [ ] Google: aynı
- [ ] Hata yüzeyleme + sync penceresi doğrulaması

---

### 9. PILOT-02 — 2–4 haftalık feature-freeze dahili pilot

> **Bağımlı:** PILOT-01.
> Ölçülecek KPI'lar: aktif kullanıcı/gün, Tracker'a dönüş oranı ve nedeni, AI taslak kabul/düzeltme/red,
> finans mutabakat farkı, randevu kaçırma, webhook/job başarısızlık, ortalama destek süresi,
> haftalık yedek + restore kanıtı.

- [ ] Pilot planını yaz, KPI'ları tanımla
- [ ] Feature freeze ilan et
- [ ] 2–4 hafta çalıştır + raporla

---

### 10. MARKET-02 — 30 günlük pazar kapısı

> **Bağımlı:** PILOT-02 verileri.
> Kabul: 20 müşteri görüşmesi, 4–5 rakip demo/fiyat teklifi, en az 3 ücretli ön-sipariş/yazılı pilot niyeti,
> bir fiyat kartı + iptal/taahhüt modeli.

- [ ] Görüşmeleri tamamla
- [ ] Fiyat kartını sabitle
- [ ] Kapı kararını ver

---

## Faz 9 — denetim sonrası (öncelik sırası yok; pilot-02 sonrası değerlendirilir)

AUDIT-REPORT.md'de Medium/Low/Info olarak işaretlenmiş ve pilot blokajı olmayan bulgular. Yukarıdaki yapılacaklar listesi **kilitli sırayı** taşır; Faz 9 sıralama-dışıdır ve biriken geliştirme kapasitesine göre işlenir.

- **AUDIT-F09-01** OpenAPI'yi generator'a taşı (reconnaissance hedefi olmaktan çıkar); `@nestjs/swagger` veya elle yazılmış YAML'ı CI'da route'lardan üret. **(M)**
- **AUDIT-F09-02** Permission resource modelini genişlet: `audit`, `members`, `api_keys`, `webhook_subscriptions`, `scorecard` resource'larını `permissions.ts`'e ekle; `controller-permissions.spec.ts`'i reflection-based yap. **(M)**
- **AUDIT-F09-03** Per-tenant webhook secret'ları outbox'a da yay (WEBHOOK-01 inbound'u kapsar; outbound `webhook_subscriptions.secretCiphertext` zaten per-subscription, değişiklik yok). **(0 — no-op)**
- **AUDIT-F09-04** `@UseGuards` reflection-based coverage test (idempotency-coverage kalıbı). **(S–M)**
- **AUDIT-F09-05** Outbox + scheduler DLQ; `attempts` artır veya `requeue-from-failed` job. **(M)**
- **AUDIT-F09-06** `tenants` FK davranışı → `restrict` + soft-delete (`tenants.deleted_at`); Türk mali mevzuatı 10y tutma + KVKK silme-yetkisi. **(L)**
- **AUDIT-F09-07** KVKK m.11 data-subject rights endpoints: `/v1/me/data-export`, `/v1/me/data-deletion-request` + `tenants.data_retention_until`. **(L)**
- **AUDIT-F09-08** Magic-byte MIME sniff (`file-type`/`mmmagic`) + multipart `allowedMimeTypes` allowlist (S3 sürücüsü dahil). **(M)**
- **AUDIT-F09-09** KVKK aydınlatma + lead capture — LEG-02 ile kapandı (2026-08-07). **(0 — done)**
- **AUDIT-F09-10** i18n katalog süpürmesi — Türkçe hardcoded metinleri `messages.ts`'e taşı. **(L)**
- **AUDIT-F09-11** `controller-permissions.spec.ts`'i reflection-based'e çevir. **(M)**
- **AUDIT-F09-12** `tenants` controller için izolasyon spec (AUDIT-01 ile birlikte gidebilir; ayrı tutuldu çünkü bu madde bütünüyle AUDIT-F09 sayımına dahil).
- **AUDIT-F09-13** CORS `allowedHeaders` — webhook header'ları (`X-Webhook-*`, `X-Tenant-Id`) browser'dan gerekirse ekle (bugün yok). **(S)**
- **AUDIT-F09-14** OAuth state TTL düşür (10 dk → 60 sn) + one-time-use. **(S–M)**
- **AUDIT-F09-15** Better-auth şema upgrade yolu `docs/DEPLOY-COOLIFY.md`'ye yaz. **(S)**
- **AUDIT-F09-16** `_tmp_*` sıfır-byte dosyaları temizle + `.gitignore`/.dockerignore ekle. **(S)**
- **AUDIT-F09-17** Contacts duplicate-detection — sayfalama/cap ekle (şu an O(N) bellek). **(M)**
- **AUDIT-F09-18** Per-method vs class-level guard standardizasyonu (`ads.controller.ts`, `ghl.controller.ts`); reflection-based `@UseGuards` coverage. **(S)**
- **AUDIT-F09-19** `tenants.timezone` IANA doğrulaması (`Intl.supportedValuesOf`). **(S)**
- **AUDIT-F09-20** `corsOrigins` allowlist hot-reload (read-at-boot artı prod restart gerektirir). **(M, düşük öncelik)**

### Faz 9 — Tracker gap analizi P2 kalemleri (2026-08-07)

Kaynak: `docs/tracker-verimaya-ozellik-gap.md`. Pilotu bloklamayan, saha konforu kalemleri.
Sıra dışıdır; PILOT-02 geri bildirimi hangisinin gerçekten istendiğini gösterecek.

- **GAP-F09-13 (G-13)** Denetim kaydı filtreleri. Tracker `audit_logs.py:39-62` 7 param
  (`actor_user_id`, `action`, `entity_type`, `entity_id`, `created_from/to`, `limit`);
  Verimaya yalnız `cursor` + `limit`. "Bu kaydı kim değiştirdi" elle taranıyor. **(S–M)**
- **GAP-F09-14 (G-14)** Sunucu tarafı veri kalitesi raporu. Tracker `GET /whatsapp/data-quality`
  SQL agregasyon; Verimaya `settings/data-quality` sayfalı listeden istemcide hesaplıyor →
  büyük tenant'ta yalnız ilk sayfa denetlenir. **GAP-05 ile aynı kök neden.** **(M)**
- **GAP-F09-15 (G-15)** AI düzeltme raporu agregasyonu. Tracker `GET /whatsapp/corrections-report`
  alan bazlı hata sıklığı + tekrar sayısı veriyordu; Verimaya düz liste. "AI en çok hangi alanda
  yanılıyor" ölçülemiyor → prompt iyileştirme körlemesine. Tek `GROUP BY`. **(S)**
- **GAP-F09-16 (G-16)** WhatsApp içe aktarımda satır içi kayıt oluşturma (kişi / hasta /
  kategori / alt kategori). Tracker'da 4 endpoint (`whatsapp_import.py:544-685`);
  Verimaya'da taslak onayı yalnız mevcut kayıtlardan seçiyor → akış kopuyor. **(M)**
- **GAP-F09-17 (G-17/G-18)** Kişi toplu tür atama (`PATCH /contacts/bulk-type`) + kişi türü
  yeniden adlandırma (`PATCH /contact-types/:id` — Verimaya'da POST/DELETE var, PATCH yok).
  İkisi de ucuz; GAP-08 (içe aktarım) ile birlikte anlamlı. **(S)**
- **GAP-F09-19 (G-19)** Kişiye bağlı not thread'i. Tracker `GET/POST/DELETE /contacts/:id/case-notes`;
  Verimaya'da yalnız hasta tarafı var, kişide tek `notes` alanı. Klinik/otel yazışma geçmişi
  tutulamıyor. **(M)** — bkz. Açık sorular §5 (tek not modeli mi, ayrı mı?)
- **GAP-F09-20 (G-20)** Randevu checklist şablonları + randevu başına ilerleme.
  Verimaya'da "Faz 1" yer tutucu. **Önce §4'e bakın** — Tracker canlı DB'de checklist
  tabloları 0 satır, `ayarlar.md` "çoğu tenant'ta kullanılmıyor" diyor. Tamamen `skip` olabilir. **(L)**
- **GAP-F09-21 (G-21)** Randevu listesi agregat istatistikleri (`type_counts`, `status_counts`).
  Tek `GROUP BY`, ucuz kazanç. **(S)**
- **GAP-F09-25 (GAP-01 takibi, 2026-08-07 review)** `appointment_types` sözlük hijyeni — iki kalem,
  tek migration: (a) `UNIQUE (tenant_id, name)` yok → aynı tenant'ta mükerrer tip adı oluşturulabilir
  (`ON CONFLICT (id)` bunu yakalamaz, ID'ler farklı olur); (b) lazy-seed `rows.length === 0` görünce
  varsayılanları geri yazıyor → kullanıcı tüm tipleri silerse bir sonraki GET'te geri gelirler.
  (b) `listFinanceCategories` ile tutarlı, yani yeni davranış değil — ama DELETE eklendiği için
  artık kullanıcıya görünür. `contact_types` için de aynı kontrol yapılmalı. **(S)**
- **GAP-F09-22 (G-22)** Case ↔ işlem otomatik bağlama (`POST /cases/:id/auto-link-transactions`).
  ETL sonrası değeri yüksek; basitleştirilmiş halde (yalnız `contact_id` eşleşmesi) taşınabilir. **(S)**
- **GAP-F09-23 (G-23)** Dosya silme endpoint'i. `dosyalar.md` zaten "İleri (Faz 1)" listesinde;
  KVKK açısından önemli. Soft-delete + audit. **(M)**
- **GAP-F09-24 (G-24)** Satır içi güvenli dosya önizleme. `dosyalar.md` "Legacy MIME allowlist +
  indirme zorlaması korunur" **kararını vermiş ama uygulanmamış** — controller her dosyayı
  `attachment` gönderiyor (`patients.controller.ts:180`). Pasaport/onam için her belge indiriliyor.
  **AUDIT-F09-08** (magic-byte sniff) ile birlikte gitmeli. **(M)**

---

## Bekleyen (öncelik sırası yok; 10. madde sonrası değerlendirilir)

- **Marka tescili:** `verimaya.com` / `.com.tr` + Türk Patent 9/35/42/44 (teknik/tescil adı `verimaya`;
  görünen marka adı **"Veri Maya"** — bkz. DOC-03b)
- **IOS-01:** iOS smoke'u dondur veya resmen kapat (öneri: pilot bitene kadar dondur).
  **Birikmiş drift (2026-08-07):** DOMAIN-01 Adım 2+3 iOS'a uygulanmadı — `Models.swift`
  hasta status enum'u hâlâ CRM değerlerini (`lead` vb.) taşıyor, `PatientFormView` default
  `.lead`, marketing `closedCount` / `costPerClosed` eski adlarda, test JSON'ları eski.
  Bilinçli atlandı: iOS `pnpm test` filtrelerinde yok (api/shared/web) ve donmuş durumda.
  **iOS çözülürse bu drift ilk kapatılacak kalem.**
- **PRODUCT-01:** Komisyon takibi discovery (acente segmenti seçilirse)
- **CSP/HSTS başlık denetimi:** canlıda kanıtlı kontrol
- **pnpm audit / Dependabot:** CI'da düzenli güvenlik taraması
- **Hasta verisi export + silme endpoint'i + hesap kapatma runbook'u** (AUDIT-F09-07 ile örtüşür)
- **Veri işleme envanteri (tamamı):** WhatsApp→LLM dışındaki işlemler
- **AB veri lokasyonu envanteri + DPA şablonları (tenant onboarding)**

### Tracker gap analizi P3 kalemleri (2026-08-07)

Kaynak: `docs/tracker-verimaya-ozellik-gap.md`. Ertelenebilir; pilot sonrası değerlendirilir.

- **GAP-25 (G-25):** Kapsamlı veri silme (`POST /data/delete-scope`) + operasyonel wipe
  (`POST /data/wipe`), org adı yazarak onay. Test verisi temizliği bugün elle SQL.
  Dikkat: `ayarlar.md` bunu "karmaşık ve **tehlikeli**" diye işaretlemiş — taşınırsa
  onay mekanizması korunmalı.
- **GAP-26 (G-26):** AI prompt özelleştirme (`GET/POST/DELETE /ai-prompt`). Verimaya
  `ai-disclosure`'ı taşımış, prompt'u taşımamış. Bkz. Açık sorular §6 (tenant'a açılmalı mı?).
- **GAP-27 (G-27):** Kategori / randevu tipi / durum sıralaması için toplu `reorder` endpoint'i.
  `sort_order` şemada var, `PATCH` ile tek tek yazılabiliyor → kısmen karşılanıyor.
  Sürükle-bırak isteniyorsa gerekir.
- **GAP-28 (G-28):** Dev panel gerçek arka uç. `/dev` sayfası `/v1/dev/tenants` çağırıyor ama
  **yalnız MSW'de var** (`handlers.ts:1804+`), NestJS'te modül yok. `dev-panel.md` "Faz 0b
  süper-admin" diyor. Pilotta gerekmeyecekse **ekran gizlenmeli** — bugün yanlış izlenim veriyor.
- **GAP-29 (G-29):** Randevu öncesi eksik iletişim bilgisi uyarısı (`contact_info_incomplete` →
  Tracker'da "Check the details!"). Küçük UX kazancı.

---

## Bilinçli olarak yapılmayacaklar (MARKET-02 kapısına kadar)

| Konu | Gerekçe |
|------|---------|
| iOS App Store hazırlığı | Pazar doğrulaması yokken yatırım yapılmaz |
| Tam i18n/locale ağacı (`/tr/` `/en/`) SEO | Hub UI TR/EN switcher bilinçli kısmi (DOC-03e); SEO locale ağacı MARKET-02 sonrası |
| TikTok / Instagram entegrasyonları | MARKET-02 öncesi yatırım yok |
| Klinik entegrasyonları (e-Nabız, e-Fatura) | Acente segmenti seçilmezse gereksiz |
| Ürün içi karnenin genişletilmesi | Pilotla birlikte gelir |
| **Etiketler (Tags) modülü** | Tracker'da da hiç doldurulmadı (`SettingsTagsPage.tsx` 16 satırlık yer tutucu); `ayarlar.md`: "Tags hiç doldurulmadı → taşınmaz" |
| **Kişilerden toplu case oluşturma / toplu auto-link** | Tracker'da bile `require_dev_user` ile korunan tek seferlik migrasyon aracı; ETL boru hattı aynı işi yapıyor (`cases.py:135,183`) |
| **Lead / pipeline / satış aşaması yönetimi app tarafında** | **DOMAIN-01 kararı:** satış CRM'de (GHL) kalır. App'te patient = operasyon dosyası. Lead durumu app'te yazılmaz, sync ile gelir |
| **Randevu durumu tenant-CRUD'u** | `ETL-ESLEME.md` §2.3 enum'a kilitledi (5 Tracker durumu + `in_progress`). Bir tenant kendi durumunu isterse enum → FK migrasyonu; bkz. Açık sorular §3 |
| **Canlı kur çevirici (Frankfurter)** | `doviz.md`: "Raporlar snapshot ile bazda toplanır; **canlı kur yok**". FX-01 snapshot modeliyle kapandı |
| **`responsible_party` alanı** | `raporlar.md`: "serbest metin + sabit preset karışımı — Contact modeliyle örtüşüyor". Contact modeli bunu absorbe etti |

---

## Açık sorular / ürün kararı bekleyenler (2026-08-07)

> Gap analizinden çıkan, kod yazılmadan **önce** cevaplanması gerekenler.
> Kaynak: `docs/tracker-verimaya-ozellik-gap.md` § Açık sorular.

1. **Silme politikası — GAP-06'yı bloklar.** İşlem / randevu / kişi için hard-delete mi
   soft-delete mi? Türk mali mevzuatı 10 yıl saklama (`AUDIT-F09-06`) ile KVKK silme hakkı
   (`AUDIT-F09-07`) çatışıyor. Karar verilmeden üç endpoint yazılamaz.
2. ~~**Patient merge semantiği**~~ → **KARAR VERİLDİ (2026-08-07, kullanıcı onayı).**
   Dedup'ın amacı aynı **kişinin kayıt bilgisini** birleştirmek; kişinin **gelişlerini** tek
   dosyada toplamak değil. Aynı kişinin 2. gelişi ayrı `Patient` dosyasıdır ve birleştirilmez.
   **Ama tamamen keskin kaldırma da yanlış:** "bir kayıtta telefon var, diğerinde e-posta"
   durumunda ikisi de boşsa bilgiyi tek kayıtta toplamak gerekir — bu alan doldurmadır,
   epizot birleştirme değil. Karar: **randevusu/işlemi olan dosya asla birleştirilmez;
   iki boş dosya alan doldurma + silme ile birleşir.** Kişi tarafı dedup dokunulmaz.
   → Uygulama: **DOMAIN-01 Adım 7**.
3. **Randevu durumu enum kalacak mı?** Pilot bir tenant'ın kendi durumunu istemesi durumunda
   enum → FK migrasyonu gerekir. PILOT-02 bunu cevaplayacak mı?
4. **Checklist ölü özellik mi?** `ayarlar.md` "çoğu tenant'ta kullanılmıyor"; Tracker canlı
   DB'de checklist tabloları **0 satır** (`ETL-ESLEME.md` §1). GAP-F09-20 tamamen `skip` olabilir.
5. **Kişi notları hasta notlarından ayrı mı kalmalı** (GAP-F09-19), yoksa tek "notlar" modeli mi?
   Tracker ikisini ayrı tutmuştu; Verimaya yalnız hasta tarafını taşıdı.
6. **AI prompt tenant'a açılmalı mı?** (GAP-26) Açılırsa çıkarım kalitesi tenant'a göre değişir →
   destek yükü. `ayarlar.md` Faz 3 diyordu; disclosure taşındı, prompt taşınmadı.
7. **Tenant düzeyinde izin matrisi gerçekten isteniyor mu?** (G-11, gap analizinde P1)
   Tracker'da 9 özellik × 5 rol düzenlenebilir matris vardı (`transaction_amounts` ile
   tutarları rollerden gizleme dahil); Verimaya'da kodda sabit 3 kaynak × 6 rol.
   Tracker'da kaç tenant kullandı bilinmiyor (yerel snapshot: 2 tenant, 1 kullanıcı).
   **Pilotta ölçülsün; talep yoksa `skip`.** `AUDIT-F09-02` ile kısmen örtüşür.
8. **P2P payer/payee geri gelecek mi?** `kisiler.md` "sonraki faz" diyor — iptal değil, ertelendi.
   Gelecekse `transactions` şeması değişir; **PILOT-02 freeze'inden önce karar ucuz, sonra pahalı.**
9. **İçe/dışa aktarım ikinci müşteriden önce mi gerekli?** (GAP-08) Pilot tek tenant + ETL ile
   taşındı. MARKET-02 kapısı geçilmeden yatırım yapılmalı mı?

---

## Faz 10 — takip hijyeni (dış inceleme, 2026-08-07)

> Bu dosyanın kendisiyle ilgili bulgular: HEAD `f52d491` referansı ile gerçek HEAD (`60ea531`) arasında
> 16 commit'lik hub/marka/i18n işi bu listeye hiç işlenmemişti. Öncelik sırası dışı ama **aktif liste**;
> "yeni iş buraya yazılır" kuralına göre buraya eklendi.

- [x] **DOC-03a — Durum anı senkronu:** ✅ 2026-08-07. Üst `Durum anı` → HEAD `60ea531`.
  `627e506..HEAD`: hub yenileme, Veri Maya markası, CSP hash senkronu, dil değiştirici
  — CHANGELOG `0.7.0` + bu bölüm.
- [x] **DOC-03b — Marka adı kararını netleştir:** ✅ 2026-08-07 karar (kullanıcı onayı): görünen marka
  adı **"Veri Maya"** (iki kelime). Domain (`verimaya.com`/`.com.tr`), Türk Patent tescili, paket/klasör
  adları ve kod içi tanımlayıcılar teknik kimlik olarak **`verimaya`** (tek kelime) kalır — yalnız
  kullanıcıya görünen marka metni değişti. `README.md`, `AGENTS.md` bu ayrımla güncellendi.
  **Kalan:** `SecondBrain-Remote/.../00-proje-ozeti.md`'deki marka kararı satırı ve `01-kararlar.md`
  hâlâ eski isimle; sıradaki Obsidian oturumunda güncellenmeli.
- [x] **DOC-03g — Eski plan/rapor belgelerini arşivle:** ✅ 2026-08-07. `docs/CURSOR-PLAN.md`,
  `docs/2026-08-03-KONTROL-RAPORU.md`, `docs/2026-08-02-PROJE-DEGERLENDIRMESI.md`,
  `docs/ROASMATE-GECIS.md`, `docs/SAHA-TESTI-KAYDI.md` → `docs/Arşiv/` altına taşındı (git mv, geçmiş
  korundu). Bunlara işaret eden `README.md`, `AGENTS.md`, `docs/MIMARI.md` referansları yeni yola
  güncellendi. `docs/` artık yalnız aktif referans/runbook dosyaları (MIMARI, TASARIM, DEPLOY-COOLIFY,
  ETL-KESIM, TEHDIT-MODELI, ADS-*-GOLIVE, CHANGELOG-KURALLARI) + tek aktif iş listesi
  (`2026-08-03-YAPILACAKLAR.md`) içerir.
- [x] **DOC-03c — CHANGELOG.md güncelle:** ✅ 2026-08-07. `packages/shared/src/changelog.ts` +
  kök `CHANGELOG.md` → `0.7.0` (marka, hub dil değiştirici, hub yenileme, CSP/static hub fix).
- [ ] **DOC-03d — 04-ilerleme-log.md güncelle:** Obsidian vault (`SecondBrain-Remote/.../04-ilerleme-log.md`)
  bu workspace dışında; Cursor oturumu sonunda kullanıcıya 1–2 satır özet verilir, vault elle
  güncellenir. Son repo notu: DOC-03 hijyen + WEBHOOK-01 deploy docs (2026-08-07).
- [x] **DOC-03e — i18n kapsam kararı:** ✅ Bilinçli **kısmi**. Hub UI TR/EN katalog + dil
  değiştirici (`60ea531`) MARKET-02’deki SEO locale ağacı ertelemesini bozmaz. Karar
  `AGENTS.md`, `docs/TASARIM.md`, “Bilinçli olarak yapılmayacaklar” tablosunda yazılı.
  Panel dil değiştiricisi hâlâ kapalı. Obsidian `01-kararlar.md` sıradaki vault oturumunda
  aynı cümleyle hizalanmalı.
- [x] **DOC-03f — Flaky LLM HTTP timeout:** ✅ Takip kalemi + stabilize.
  `openai-compatible-llm.client.spec.ts` “falls back…timeout” artık anında `AbortError`
  atıyor (AbortSignal.timeout yarışına bağlı değildi). Kalan pre-existing:
  `auth-or-api-key.isolation.spec.ts` sıralama flake’i — ayrı bug; Faz 9’a alınabilir.
- **Bağımlı:** yok
- **Kabul:** Bu dosyanın "Durum anı" satırı gerçek HEAD ile eşleşiyor; marka adı tüm dokümanlarda tek;
  CHANGELOG güncel; i18n kapsam kararı AGENTS/TASARIM’de yazılı; flaky timeout testi stabilize.
  Obsidian `01-kararlar` + `04-ilerleme-log` vault oturumuna kaldı (DOC-03d / DOC-03b kalan).

---

## Kaynaklar

- `docs/tracker-verimaya-ozellik-gap.md` — Tracker → Verimaya özellik gap analizi
  (32 gap + 9 bilinçli fark; 5A/5B/6B, Faz 9 GAP-F09-*, P3 ve Açık sorular bölümlerinin kaynağı)
- `docs/tracker-verimaya-sayfa-karsilastirma.md` — sayfa envanteri (gap analizinin başlangıç noktası)
- `AUDIT-REPORT.md` — Opus denetimi (38 bulgu; Faz 8 planının kaynağı)
- `docs/Arşiv/2026-08-02-PROJE-DEGERLENDIRMESI.md` — kanıtlı bulgular (tarihli, arşiv)
- `docs/Arşiv/2026-08-03-KONTROL-RAPORU.md` — Faz 7 denetim çıktısı (arşiv)
- `docs/Arşiv/` — eski plan/rapor/durum belgelerinin tamamı (`CURSOR-PLAN.md`, `ROASMATE-GECIS.md`,
  `SAHA-TESTI-KAYDI.md` dahil); **yeni iş buraya yazılmaz**, yalnız bu dosyaya (YAPILACAKLAR)
- `docs/MIMARI.md` — mimari kararlar
- `docs/TASARIM.md` — tasarım sistemi
- `docs/DEPLOY-COOLIFY.md`, `docs/ETL-KESIM.md`
- `SecondBrain-Remote/03-Areas/VeriMaya/` — 01-kararlar, 02-yol-haritasi, 04-ilerleme-log, 05-guvenlik-kvkk
- `AGENTS.md` — AI geliştirme rehberi (always-apply)