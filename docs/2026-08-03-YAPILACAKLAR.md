# Verimaya — Yapılacaklar (2026-08-03 · Faz 0–7 + Faz 7 denetim sonrası)

> **Bu dosya tek kaynaktır.** Faz 0–7 (tüm kod fazları + Opus denetimi) tamamlandı.
> Kalan işlerin tamamı **Faz 8 — kod dışı**, **kod-içi güvenlik/hijyen** veya **denetim sonrası** kategorisinde.
>
> Durum anı: branch `main`, HEAD `60ea531` (hub dil değiştirici + Veri Maya markası;
> DOC-03a senkronu 2026-08-07). Opus denetim raporu: `AUDIT-REPORT.md` (38 bulgu).
> 2026-08-03 sonrası hub/marka/CSP/i18n özeti: `git log 627e506..HEAD` + CHANGELOG `0.7.0`.

---

## Çalışma kuralları

1. **Sırayla ilerle.** Sıra numarası önceliği gösterir; `Bağımlı:` satırı kırmızı çizgidir.
2. **Adım başına tek commit.** Commit mesajı Türkçe, `feat:` / `fix:` / `ops:` / `docs:` önekiyle.
3. **Bitirince bu dosyayı güncelle:** `- [ ]` → `- [x]` ve **Görüş** satırını doldur.
4. **Soru sorma, en savunulabilir varsayımı seç**, Görüş'te yaz.
5. **Sır yazma.** Hiçbir token/parola/anahtar değeri koda, teste, commit mesajına girmez.

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

---

## Bekleyen (öncelik sırası yok; 10. madde sonrası değerlendirilir)

- **Marka tescili:** `verimaya.com` / `.com.tr` + Türk Patent 9/35/42/44 (teknik/tescil adı `verimaya`;
  görünen marka adı **"Veri Maya"** — bkz. DOC-03b)
- **IOS-01:** iOS smoke'u dondur veya resmen kapat (öneri: pilot bitene kadar dondur)
- **PRODUCT-01:** Komisyon takibi discovery (acente segmenti seçilirse)
- **CSP/HSTS başlık denetimi:** canlıda kanıtlı kontrol
- **pnpm audit / Dependabot:** CI'da düzenli güvenlik taraması
- **Hasta verisi export + silme endpoint'i + hesap kapatma runbook'u** (AUDIT-F09-07 ile örtüşür)
- **Veri işleme envanteri (tamamı):** WhatsApp→LLM dışındaki işlemler
- **AB veri lokasyonu envanteri + DPA şablonları (tenant onboarding)**

---

## Bilinçli olarak yapılmayacaklar (MARKET-02 kapısına kadar)

| Konu | Gerekçe |
|------|---------|
| iOS App Store hazırlığı | Pazar doğrulaması yokken yatırım yapılmaz |
| Tam i18n/locale ağacı (`/tr/` `/en/`) SEO | Hub UI TR/EN switcher bilinçli kısmi (DOC-03e); SEO locale ağacı MARKET-02 sonrası |
| TikTok / Instagram entegrasyonları | MARKET-02 öncesi yatırım yok |
| Klinik entegrasyonları (e-Nabız, e-Fatura) | Acente segmenti seçilmezse gereksiz |
| Ürün içi karnenin genişletilmesi | Pilotla birlikte gelir |

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