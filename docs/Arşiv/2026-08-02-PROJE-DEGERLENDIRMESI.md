# Verimaya Proje Değerlendirmesi — 2 Ağustos 2026

> Değerlendirme anı: 2026-08-02  
> Repo: `chore/en-routes-i18n`, HEAD `79c504a`, çalışma ağacı temiz  
> Kapsam: repo, `docs/CURSOR-PLAN.md`, SecondBrain VeriMaya alanı ve bağlı ürün notları

## 1. Kapsam, yöntem ve güven düzeyi

Bu rapor aşağıdaki kaynakların birlikte incelenmesiyle hazırlandı:

- Repo mimarisi, uygulama kodu, migration'lar, testler, CI ve ürün belgeleri
- `docs/CURSOR-PLAN.md` içindeki Adım 1–44 planı ve açık operasyon adımları
- `SecondBrain-Remote/03-Areas/VeriMaya` altındaki yol haritası, kararlar, ilerleme,
  güvenlik/KVKK, rakip analizi, kurul değerlendirmesi, görev ve fikir notları
- Bağlı Yapay Zeka Karnesi şartnameleri ve kapasite notu
- 2 Ağustos 2026 tarihli Cursor model ve ürün belgeleri

Bulgularda üç güven düzeyi kullanıldı:

- **Doğrulandı:** Kod veya belgede doğrudan kanıt var.
- **Test gerekli:** Kod güçlü bir hata/risk işareti taşıyor; davranış entegrasyon veya tarayıcı
  testiyle sabitlenmeli.
- **Dış ortamda doğrulanmalı:** Coolify, Cloudflare, sağlayıcı konsolu, hukuk veya gerçek pilot
  verisi gerekiyor.

Önemli güvenlik notu: SecondBrain'de düz metin sır içeren dosya tespit edildi. Bu rapor
**hiçbir secret, parola, token veya özel anahtar değerini tekrar etmez**. Bu çalışma bir
penetrasyon testi veya hukuki görüş değildir.

### 1.1 İlerleme güncellemesi — 2 Ağustos 2026

Bu raporun değerlendirme anı korunmuştur; aşağıdaki durumlar daha sonra tamamlanan canlı
çalışmaları gösterir:

- ✅ **SEC-02:** Üretimde şifreli credential/webhook kaydı olmadığı doğrulandı (Senaryo A);
  `CREDENTIALS_ENCRYPTION_KEY` kontrollü döndürüldü, API yeniden başlatıldı ve canlı sağlık
  kontrolleri geçti.
- ✅ **LEG-01:** Karne lead toplama API ve web'de varsayılan kapalı olacak şekilde
  kalıcılaştırıldı; `720593e` commit'i API/web'e deploy edildi. Canlı endpoint `503
  karne_leads_disabled` döndürüyor ve sonuç ekranı lead formunu göstermiyor.
- 🟡 **SEC-01:** SSH (ops + ayrı Coolify deploy anahtarı), PostgreSQL, Redis, Better Auth ve
  credential encryption sırları döndürüldü. OAuth client secret rotasyonu ile Obsidian
  aktif/revision kopyalarının temizliği henüz açık.
- 🟡 **OPS-01:** PostgreSQL dump ve restore provası, Coolify deploy bağlantısı ve canlı curl
  kabulü tamamlandı. Otomatik sunucu dışı yedek/snapshot düzeni henüz kurulmadı.

Durum işaretleri: ✅ tamamlandı · 🟡 kısmi/devam ediyor · ⬜ bekliyor.

### 1.2 İlerleme güncellemesi — Cowork Tasks oturumu

- ✅ **AUTH-01:** Server-side permission guard ve `/me` rolü tamamlandı. Tüm authenticated
  controller'lar (patient, contacts, appointments, transactions, settings, audit-logs, members,
  tenants, webhook-subscriptions, api-keys, whatsapp, reports, ad-metrics, ads/GHL OAuth,
  scorecard) en az yetki prensibiyle `RequireOrgPermission` decorator'ına bağlandı; API key
  read/write scope davranışı korundu; public/health/webhook/OAuth-callback/Karne uçlarına org
  guard uygulanmadığı testle sabitlendi. Web tarafında `sessionStorage` demo rolü kaldırıldı,
  gerçek rol `GET /v1/me`'den okunuyor; logout ve organization switch sonrası TanStack Query
  cache'i temizleniyor. Commit zinciri: `100ac37` → `c6fa240` → `a873859` → `9c8b2b4` →
  `aa991b7` → `e666b28`. DB gerektiren izolasyon testleri (`org-permission.guard.spec.ts`,
  `auth-or-api-key.isolation.spec.ts` vb., 38 suite) bu oturumun sandbox'ında Postgres
  kurulamadığından çalıştırılamadı — **FINAL-DB** listesine eklendi, kod tamamlandı.
- ⬜ **WEBHOOK-01:** Tasarım tamamlandı (`tenant_provider_identities` tablosu; payload imzası
  doğrulandıktan sonra provider-specific external_id → tenant_id çözümü; `X-Tenant-Id`
  header'ına artık güvenilmeyecek). Kullanıcı kararıyla implementasyon bu oturumda
  uygulanmadı — WAHA şu an tek tenant/pilot olduğu için WAHA kapsam dışı bırakıldı, GHL +
  generic `:provider` ucu için migration + kod değişikliği ayrı bir onayla ileride yapılacak.
- 🟡 **CACHE-01/02:** Logout/organization switch'te query cache temizliği (CACHE-02)
  tamamlandı. Query key'lerine tenant/kullanıcı kapsamı ekleme (CACHE-01) — ~20 route
  dosyasını kapsayan geniş bir refactor olduğu için bu oturumda ertelendi; sunucu tarafı
  izolasyon (RLS + `activeOrganizationId`) ve CACHE-02 bu riski büyük ölçüde azaltıyor.
- ⬜ **CONTRACT-01/02/03, IDEM-01, EVENT-01, MONEY-01/02, TIME-01, TEST-01, CI-01/02:** Bu
  oturumda ele alınmadı — her biri kendi başına çok dosyalı bir iş; ayrı oturumlarda planlanmalı.



Verimaya'nın teknik temeli, yol haritasının gösterdiğinden daha ileride. Multi-tenant RLS,
queue-first webhook, kalıcı job/event ledger'ı, outbox, adaptör katmanı, AES-GCM credential
saklama, Svelte 5 paneli, ücretsiz ve ürün içi karne, GHL/Ads iskeleti ve ETL araçları mevcut.
`CURSOR-PLAN` kapsamındaki kod adımlarının büyük bölümü gerçekten kapanmış.

Buna rağmen ürün için bugün doğru ifade **“özellik kapsamı geniş, pilot güvenlik ve veri
doğruluğu kapıları henüz kapanmamış”** olmalıdır. “Production-ready” veya “fazlar tamam”
ifadesi erken olur.

En önemli sonuçlar:

1. **P0 — Düz metin üretim sırları:** SecondBrain `Untitled.md` içinde bir SSH özel anahtarı
   ve birden fazla üretim sırrı bulunuyor. Ana runtime sırları döndürüldü; OAuth ve
   senkron/geçmiş temizliği açık.
2. **P0 — Yetkilendirme:** API'de organization rolleri tanımlı fakat mutation uçlarında
   uygulanmıyor. Web tarafındaki rol kontrolü `sessionStorage` tabanlı demo mekanizması.
3. **P0 — Webhook tenant yönlendirmesi:** HMAC, timestamp + body'yi imzalıyor; `X-Tenant-Id`
   imzaya bağlı değil. Aynı provider secret'ını bilen taraf tenant başlığını değiştirebilir.
4. **P0 — KVKK yayın kapısı:** Hukukçu onayı bekleyen taslak metin açıkça “e-posta
   toplamayın” diyor. Bu risk LEG-01 ile teknik olarak kapatıldı; hukuk onayı olmadan iki
   production feature flag birlikte açılmıyor.
5. **P1 — Veri bağlamı:** TanStack Query anahtarları tenant/kullanıcı kapsamı taşımıyor ve
   logout/org değişiminde cache temizlenmiyor.
6. **P1 — API–MSW sözleşme sapması:** Web ve MSW; tarih, hasta, kişi ve tür filtreleri
   gönderiyor. Gerçek appointments/transactions/contacts controller'ları bu filtreleri
   okumuyor. Aynı tenant içinde yanlış kayıtlar yanlış ekranda gösterilebilir.
7. **P1 — Finans doğruluğu:** AI işlem akışı sabit yaklaşık kurlar, koşulsuz `paid` durumu ve
   birbirinden ayrı transaction/approve çağrıları kullanıyor. Raporların bazı parçaları ilk
   100 kayıttan, bazıları sunucu aggregate'ından hesaplanıyor.
8. **P1 — Saat dilimi:** Randevu gün anahtarı yerel gece yarısı ile UTC ISO gününü karıştırıyor;
   İstanbul saatinde bir günlük kayma üretebilir.
9. **P1 — Tek kaynak kaymış:** Obsidian `02-yol-haritasi.md`, 30 Temmuz kod gerçekliğinin ve
   1 Ağustos apex hub mimarisinin gerisinde.
10. **Stratejik kapı:** Acente/klinik segmenti, OrbisMed çıkar çatışması, kapasite tahsisi,
    fiyat ve pazar doğrulaması hâlâ karara bağlanmış değil.

Önerilen sıra:

> **Sırları sınırla → yetki ve tenant sınırını düzelt → finans/veri doğruluğunu sabitle →
> dokümanları senkronla → canlı kabul → ETL/pilot → yeni özellik**

## 3. Güçlü ve korunması gereken alanlar

### 3.1 Multi-tenant veri temeli

- `TenantContextService`, transaction içinde `set_config('app.current_tenant_id', ..., true)`
  kullanıyor: `apps/api/src/tenant/tenant-context.service.ts:21-26`.
- Günlük uygulama rolü `NOBYPASSRLS`; domain tablolarında RLS ve `FORCE ROW LEVEL SECURITY`
  migration'ları var.
- Çok sayıda negatif izolasyon testi bulunuyor.
- Aktif organization normal panel/API trafiğinde session veya API key'den çözülüyor.

Bu temel doğru. Eksik endpoint testleri tamamlanmalı; RLS yaklaşımı değiştirilmemeli.

### 3.2 Queue-first entegrasyon platformu

- Webhook akışı imza doğrulama → `integration_events`/`inbound_messages` → `jobs` →
  BullMQ worker şeklinde.
- PostgreSQL, `jobs`, `integration_events` ve `outbox_events` ile denetlenebilir kayıt kaynağı.
- Giden webhook'lar outbox üzerinden imzalanıyor.
- GHL, Meta, Google ve LLM erişimi adaptör katmanında.

Tenant çözümü düzeltilirken queue-first akış korunmalı.

### 3.3 Credential ve AI taslak yaklaşımı

- Tenant credential'ları AES-256-GCM ile şifreleniyor.
- WhatsApp/LLM verisinde PII maskeleme katmanı var.
- AI çıktısı önce taslak/inbox kaydı olarak tutuluyor; insan onayı kavramı mevcut.

Sorun, finans kaydının onay anındaki varsayılanlarında ve atomiklikte. İnsan-onaylı taslak
ilkesi korunup tek idempotent sunucu komutuna taşınmalı.

### 3.4 Web ve sözleşme temeli

- Svelte 5 runes kullanılıyor; legacy `export let`, `$:` ve açık `any` bulunmadı.
- SvelteKit server route/form action kullanılmıyor; panel SPA ilkesi korunuyor.
- Panel rotaları İngilizce.
- Açık/koyu tema ve merkezi token altyapısı var.
- Public sayfalar build-time prerender ediliyor; panel fallback'i `noindex`.
- `packages/shared` Zod şemaları ve `apiPaths` için doğru merkez.

Eksik olan, shared sözleşmenin query/response kapsamını tamamlamak ve runtime doğrulamayı
web istemcisine bağlamak.

### 3.5 Test ve operasyon temeli

Denetim snapshotındaki kontroller:

- API: 52 spec dosyası, 170 test başarılı
- Web: 5 test başarılı
- Shared: 36 test başarılı
- `svelte-check`: 0 hata, 10 erişilebilirlik uyarısı
- ESLint: 10 hata
- Prettier: 46 dosyada biçim farkı

Test kültürü oluşmuş durumda; ancak CI bu kontrollerin tamamını kapı haline getirmiyor.

## 4. Yol haritası ve gerçek durum uzlaştırması

### 4.1 `CURSOR-PLAN.md`

Kod açısından doğrulanan ana kapsam:

- Public prerender, ücretsiz karne ve telemetry altyapısı
- Storage portu, S3/R2 ve yetim dosya süpürme
- WhatsApp imza, PII maskeleme, worker ve AI düzeltme kayıtları
- ETL dry-run/apply/verify araçları ve kesim runbook'u
- Ürün içi 43 kriterli karne
- GHL OAuth/HTTP/sahiplik/reconcile
- Meta/Google OAuth ve go-live runbook'ları

Planın açık bıraktığı gerçek işler:

- **Adım 31:** Coolify canlı kabul, dış yedek ve restore/curl kanıtı
- **Adım 32:** ETL apply ve 2–4 haftalık dahili pilot
- **Adım 38:** Meta Ads gerçek hesapla go-live kabulü
- **Adım 39:** Google Ads gerçek hesapla go-live kabulü

Plan sonrası, plana işlenmemiş 1 Ağustos değişiklikleri:

- Apex `verimaya.com` üzerinde marketing hub
- `app.verimaya.com` üzerinde panel ve auth gate
- `/vitrin` için legacy 301
- Marka/PWA varlıkları
- Google Ads müşteri hesabı, hata yüzeyleme ve sync pencere düzeltmeleri

Sonuç: `CURSOR-PLAN` artık aktif yol haritası değil, **tamamlanan büyük uygulama planının
arşivi** olarak etiketlenmeli. Post-44 değişiklikleri kısa bir kapanış ekiyle kaydedilebilir.

### 4.2 Obsidian tek kaynak sapmaları

`SecondBrain-Remote/03-Areas/VeriMaya/02-yol-haritasi.md` “tek kaynak” diyor; fakat şu
ifadeler güncel değil:

- “Vitrin prerender henüz açık değil”
- Ücretsiz karnenin sıradaki iş olduğu
- GHL OAuth/HTTP/reconcile'ın olmadığı
- ETL `--apply` seçeneğinin olmadığı
- Ürün içi karnenin başlamadığı
- Faz 3'te bütün alt maddeler işaretli olduğu halde rozetin hâlâ kısmi kalması
- Apex hub ve app host ayrımının hiç yer almaması

`04-ilerleme-log.md` son kaydı 30 Temmuz. 1 Ağustos domain/hub ve Ads düzeltmeleri yazılmamış.
`05-guvenlik-kvkk.md` içindeki birçok tamamlanmış teknik kontrol hâlâ boş; buna karşılık
tamamlanmayan hukuki/operasyonel kontrollerle aynı görünümde.

### 4.3 Bugün için doğru faz ifadesi

Tek bir faz rozeti gerçekliği anlatmıyor. Aşağıdaki üç eksen ayrı tutulmalı:

- **Kod kapsamı:** Faz 0b–8 özelliklerinin önemli bölümü mevcut.
- **Pilot hazırlığı:** P0/P1 güvenlik ve veri doğruluğu kapıları açık.
- **Canlı operasyon:** Coolify/yedek/restore, KVKK, Ads kabulü ve pilot kanıtları eksik veya
  repo dışından doğrulanamıyor.

Önerilen kısa durum:

> “Kod kapsamı pilot seviyesine yakın; güvenlik, veri doğruluğu ve canlı kabul kapıları
> kapatılıyor. Dahili pilot henüz resmi olarak başlamadı.”

## 5. Hatalar ve riskler

### P0-01 — SecondBrain'de düz metin üretim sırları

**Güven:** Doğrulandı  
**Kanıt:** `SecondBrain-Remote/03-Areas/VeriMaya/Untitled.md`

**2026-08-02 durum:** 🟡 Kısmi — SSH, PostgreSQL, Redis, Better Auth ve credential encryption
sırları döndürüldü ve canlıda test edildi. OAuth client secret'ları ile Obsidian
aktif/revision temizliği tamamlanmadan bu bulgu kapanmış sayılmaz.

Dosyada bir SSH özel anahtarı ile OAuth, veritabanı/cache, auth ve credential encryption
kategorilerinde üretim sırları bulunuyor. Obsidian klasörü uzak senkronize edildiği için yalnız
dosyayı silmek yeterli olmayabilir.

**Etki:** Sunucu erişimi, kullanıcı session'ları, veritabanı/cache erişimi, OAuth hesabı ve
şifreli tenant credential'ları etkilenebilir.

**Acil sıra:**

1. Yeni SSH anahtarı üret, erişimi test et, sonra eski anahtarı revoke et.
2. OAuth client secret'larını sağlayıcı konsollarında rotate et.
3. PostgreSQL/Redis parolalarını ve bağlantı secret'larını rotate et.
4. Auth secret rotasyonunun mevcut session'ları geçersiz kılacağını kabul ederek planlı uygula.
5. `CREDENTIALS_ENCRYPTION_KEY` için eski anahtarla decrypt → yeni anahtarla re-encrypt
   migration'ı hazırla; mevcut ciphertext varken anahtarı körlemesine değiştirme.
6. Dosyayı aktif vault'tan kaldır; SecondBrain senkron/revision geçmişi ve yedeklerdeki
   kopyaları sağlayıcının imkânları ölçüsünde temizle.
7. Repo, vault, terminal geçmişi ve deploy notlarında aynı değerlerin kopyalarını
   **değerleri ekrana dökmeden** ara.

### P0-02 — API'de organization rolü uygulanmıyor

**Güven:** Doğrulandı  
**Kanıt:**

- Rol/permission tanımları: `apps/api/src/auth/permissions.ts:13-62`
- Controller guard'ları: ör. `apps/api/src/transactions/transactions.controller.ts:26-27`
- `/v1/me` rol döndürmüyor: `apps/api/src/auth/me.controller.ts:9-21`
- Web demo rolü: `apps/web/src/lib/rbac.ts:3-47`

Controller'lar session/API key ve active organization kontrol ediyor; session kullanıcısının
`owner/admin/agent/finance/readonly` rolüne göre permission guard görünmüyor. Web görünürlüğü
`sessionStorage` içindeki değiştirilebilir demo rolüne dayanıyor ve bilinmeyen rotaları
fail-open kabul ediyor.

**Etki:** Bir organization üyesi, UI menüsü gizlense bile doğrudan API çağrısıyla yetkisi
dışındaki finans, ayar veya mutation işlemlerini deneyebilir.

**Çözüm yönü:** Session üyeliğini server'da çöz; shared bir permission matrisi veya
better-auth access-control kaynağından Nest guard/decorator üret. UI yalnız görünürlüğü kırsın.
`/v1/me`, aktif organization rolünü döndürsün. Readonly ve finance için negatif API testleri
zorunlu olsun.

### P0-03 — Webhook tenant başlığı HMAC'e bağlı değil

**Güven:** Doğrulandı  
**Kanıt:**

- Tenant header okuma: `apps/api/src/webhooks/webhooks.controller.ts:28,54-59`
- HMAC girdisi yalnız `${timestamp}.${rawBody}`:
  `apps/api/src/webhooks/webhooks.signature.ts:39-46`
- Request tenant context'i header ile açılıyor:
  `apps/api/src/webhooks/webhooks.controller.ts:213-223`

**Etki:** Provider başına ortak secret'ı bilen bir taraf, geçerli body imzasını koruyup
`X-Tenant-Id` değerini değiştirebilir. Bu, multi-tenant sınırının yetki kaynağını istemci
başlığına bırakır.

**Çözüm yönü:** Tenant'ı provider external account/location ID eşlemesinden server-side çöz
veya tenant başına secret/opaque endpoint kullan. Header kullanılacaksa tenant kimliği imzalı
mesajın parçası ve secret tenant'a özgü olmalı. Mevcut queue-first akış değişmemeli.

### P0-04 — Taslak KVKK metniyle e-posta toplanabiliyor

**Güven:** Doğrulandı; hukuki yeterlilik dış uzman gerektirir  
**Kanıt:**

**2026-08-02 durum:** ✅ Teknik risk kapatıldı — API `KARNE_LEADS_ENABLED`, web
`PUBLIC_KARNE_LEADS_ENABLED` için fail-closed çalışıyor. `720593e` canlıda; form gizli ve
endpoint `503 karne_leads_disabled` döndürüyor. Hukuki metin onayı ayrı bir dış kapı olarak
açık kalır.

- “Onaylanmadan üretimde e-posta toplamayın”:
  `apps/web/src/routes/(public)/kvkk-aydinlatma/+page.svelte:39-45`
- Aktif form: `apps/web/src/lib/components/KarneEmailCapture.svelte:23-48,63-121`
- Lead capture telemetry kapalıyken de session açabilir:
  `apps/web/src/lib/karne/telemetry.ts:206-229,251-288`

**Etki:** Ürünün kendi metniyle çelişen kişisel veri toplama; aydınlatma, açık rıza ve saklama
süreçlerinde uyum riski.

**Çözüm yönü:** Hukuk onayına kadar formu ve lead endpoint'ini ayrı bir production feature
flag ile kapat. Metin, veri sorumlusu bilgisi, amaç, hukuki sebep, saklama, aktarım, haklar ve
iletişim kanalı hukukçu tarafından onaylandıktan sonra aç.

### P1-01 — Query cache tenant/kullanıcı sınırı taşımıyor

**Güven:** Doğrulandı; veri görünümü için tarayıcı testi gerekli  
**Kanıt:**

- Global QueryClient: `apps/web/src/lib/query-client.ts:3-12`
- Örnek keys: `['patients', ...]`, `['transactions', ...]`, `['tenants', 'current']`
- Logout cache temizlemiyor: `apps/web/src/lib/components/AppShell.svelte:136-142`

**Etki:** Aynı sekmede kullanıcı veya organization değişiminden sonra 30 saniyelik stale
pencerede önceki kapsamın cache verisi gösterilebilir.

**Çözüm yönü:** Merkezi query-key factory kullan:
`[scope, tenantId, userId, resource, params]`. Logout ve organization değişiminde önce
query'leri cancel et, sonra cache'i temizle ve yeni scope ile yeniden oluştur.

### P1-02 — Web/MSW filtreleri gerçek API'de uygulanmıyor

**Güven:** Doğrulandı  
**Kanıt:**

- Web randevu filtreleri: `apps/web/src/routes/appointments/+page.svelte:66-83`
- Gerçek appointments list yalnız cursor/limit okuyor:
  `apps/api/src/appointments/appointments.controller.ts:35-42`
- Transactions list yalnız cursor/limit:
  `apps/api/src/transactions/transactions.controller.ts:35-42`
- Contacts list yalnız cursor/limit/q:
  `apps/api/src/contacts/contacts.controller.ts:34-42`

Web tarafında `from`, `to`, `patient_id`, `contact_id`, `type_id` gibi parametreler kullanılıyor;
MSW bunların bir kısmını destekliyor. Gerçek API çoğunu sessizce yok sayıyor.

**Etki:** Hasta detayında başka hastaların kayıtları, tarih dışı randevular, yanlış finans
drill-down'ı veya çalışmayan kişi türü filtresi.

**Çözüm yönü:** Önce `packages/shared` içinde list query şemalarını tanımla; API, web ve MSW'yi
aynı şemaya bağla. Aynı contract testlerini MSW ve gerçek API üzerinde çalıştır.

### P1-03 — AI işlem kaydı atomik/idempotent değil, kur varsayımları güvenilmez

**Güven:** Doğrulandı  
**Kanıt:** `apps/web/src/routes/finance/ai-transaction/+page.svelte:208-269`

Akış:

- GBP/EUR/USD için kod içine gömülü yaklaşık kurlar kullanıyor.
- İşlemi koşulsuz `paid` ve `paid_amount = amount` oluşturuyor.
- Transaction oluşturma, correction gönderme ve inbox approve ayrı çağrılar.
- Web `apiSend` çağrısında idempotency key üretmiyor.

**Etki:** Yanlış baz para tutarı, gerçekte ödenmemiş işlemin ödenmiş yazılması ve kısmi hata
sonrası mükerrer kayıt.

**Çözüm yönü:** “Taslakları doğrula ve onayla” adlı tek server komutu oluştur. Transaction
kayıtları + correction + inbox status aynı DB transaction'ında, tek `Idempotency-Key` ile
yazılsın. Kur, ödeme durumu, paid amount ve karşı taraf onay ekranında zorunlu alanlar olsun.

### P1-04 — Finans ve rapor ekranlarında tam/kısmi veri karışıyor

**Güven:** Doğrulandı  
**Kanıt:**

- Rapor transaction listesi `limit: 100`:
  `apps/web/src/routes/reports/+page.svelte:122-132`
- Pending tutarı bu kısmi listeden:
  `apps/web/src/routes/reports/+page.svelte:214-243`
- Hasta dağılımları ilk 100 hastadan:
  `apps/web/src/routes/reports/+page.svelte:197-203,289-307`
- Category kartı server aggregate, hero/list kısmi client verisi:
  `apps/web/src/routes/reports/+page.svelte:389-450`
- Bakiye ekranı currency'yi ayrı grupluyor fakat brüt `amount` kullanıyor:
  `apps/web/src/routes/finance/balances/+page.svelte:32-49`

Ön incelemedeki bir iddia düzeltilmelidir: bakiye ekranı farklı para birimlerini birbirine
toplamıyor. Doğrulanmış sorun; ödeme/tahsilat durumunu ve `paid_amount`ı hesaba katmadan brüt
gelir/gideri “borç–alacak” gibi sunması, ayrıca `contact_label`ı kimlik gibi kullanmasıdır.

**Çözüm yönü:** Finansal kartları yalnız server aggregate endpoint'lerinden besle. P2P bakiye,
`contact_id + currency` bazında ve açık/tahsil edilmiş tutar semantiği tanımlanarak hesaplansın.
Drill-down cursor pagination kullansın; kart ve detay aynı sorgu tanımına bağlı olsun.

### P1-05 — Randevu günlerinde UTC/yerel saat karışıyor

**Güven:** Doğrulandı; Europe/Istanbul testi gerekli  
**Kanıt:** `apps/web/src/routes/appointments/+page.svelte:40-64,97-110`

Yerel gece yarısı oluşturulup `toISOString().slice(0, 10)` ile gün anahtarına çevriliyor.
Europe/Istanbul'da yerel pazartesi 00:00, UTC'de pazar günüdür.

**Çözüm yönü:** Tenant saat dilimini veri modelinde açıkça tanımla. Calendar-day işlemlerinde
`Date` + UTC dilimleme yerine mevcut `@internationalized/date` benzeri timezone-aware yaklaşım
kullan. DST'li ve DST'siz iki timezone testi ekle.

### P1-06 — Idempotency kapsamı ve anahtar kimliği eksik

**Güven:** Doğrulandı  
**Kanıt:**

- Replay lookup yalnız `key`: `apps/api/src/common/idempotency.service.ts:23-37`
- `method` ve `path` kaydediliyor fakat lookup'a dahil değil: aynı dosya `43-49`
- Settings, scorecard, WhatsApp ve bazı integration mutation'larında ortak servis yok

**Etki:** Aynı tenant'ta yanlışlıkla aynı key farklı endpoint'te kullanılırsa önceki endpoint
yanıtı replay edilebilir. Bazı public mutation'lar retry sırasında çift yazabilir.

**Çözüm yönü:** Unique/lookup kimliğini `tenant_id + key + method + normalized_path` yap.
Mutating public endpoint'lerin tümünü envanterle ve ortak interceptor/decorator ile zorunlu
hale getir.

### P1-07 — `integration_events` unique anahtarı tenant kapsamı taşımıyor

**Güven:** Doğrulandı; provider global ID garantisi dışarıdan doğrulanmalı  
**Kanıt:**

- Unique `(provider, external_event_id)`:
  `apps/api/src/db/schema/queue.ts:37-42`
- Duplicate araması RLS nedeniyle tenant-scoped:
  `apps/api/src/webhooks/webhooks.controller.ts:223-241`

İki tenant aynı provider event ID'sini üretirse SELECT diğer tenant kaydını göremez; INSERT
global unique ihlali verebilir.

**Çözüm yönü:** Provider ID'lerinin global unique garantisini belgeleyemiyorsan index'i
`tenant_id + provider + external_event_id` yap. Eşzamanlı duplicate yarışında `23505` hatasını
idempotent 202 yanıtına dönüştür. Payload-hash fallback kuralını da tenant-scoped sabitle.

### P1-08 — Çekirdek endpoint izolasyon testleri eksik

**Güven:** Doğrulandı  
**Eksik görünen HTTP izolasyon testleri:** contacts, appointments, transactions

RLS migration'ı olsa da workspace kuralı her tenant endpoint'i için negatif test istiyor.
Tenant A token'ı ile Tenant B kaydına GET/PATCH/DELETE ve list filtreleri sınanmalı.

### P2-01 — CI mevcut kalite yüzeyinin tamamını çalıştırmıyor

**Güven:** Doğrulandı  
**Kanıt:** `.github/workflows/ci.yml:48-64`

Eksikler:

- Shared Vitest testleri
- ESLint ve Prettier kontrolü
- Web production build
- Redis servisi ve queue/readiness smoke
- E2E, browser ve a11y kapısı

Öneri: Önce mevcut kırmızı lint/format borcunu ayrı committe kapat; sonra CI kapısını aç.

### P2-02 — Dokümantasyon canlı mimarinin gerisinde

**Güven:** Doğrulandı

- `AGENTS.md` ve `docs/TASARIM.md`, public yüzeyi hâlâ `/vitrin` ve prerender kapalı gibi
  anlatıyor.
- Gerçekte `(public)/+layout.ts` `ssr=true`, `prerender=true`.
- Build script, prerender edilmiş `/vitrin` HTML'ini `hub.html` olarak kopyalıyor:
  `apps/web/scripts/inject-spa-noindex.mjs:34-38`.
- Nginx apex `/` isteğini `hub.html`e yönlendiriyor ve `/vitrin`i 301 ile `/`e taşıyor:
  `apps/web/nginx.conf:7-29`.
- `features.ts`, GHL/Ads'i “geliştiriliyor”; `changelog.ts` kullanıcıya eklenmiş ve çalışır
  gibi ifade ediyor.

Bu yalnız doküman sorunu değil: always-apply kurallar eski olduğunda AI yeni kodu yanlış
mimariye göre üretir.

### P2-03 — Shared sözleşme runtime sınırında tamamlanmamış

**Güven:** Doğrulandı

Web istemcisi birçok yanıtta `apiGet<T>` ile TypeScript cast yapıyor; response'u Zod ile
runtime doğrulamıyor. Bazı route'lar yerel DTO tanımlıyor. Query filtreleri de shared contract
kapsamında değil.

**Çözüm yönü:** Endpoint bazlı request/query/response şemalarını shared'da tamamla; web
istemcisini parse eden typed client'a geçir. Schema değişikliği önce shared kuralını gerçekten
uygulanabilir hale getir.

### P2-04 — Erişilebilirlik ve kontrast borcu

**Güven:** Doğrulandı; gerçek browser/axe testi gerekli

- `TransactionDraftCard.svelte` label ilişkilerinde uyarılar
- Ortak Dialog'da unique title ID, focus trap, initial focus ve focus return eksikleri
- Command palette input ve skor butonlarında erişilebilir isim/state eksikleri
- Bazı tema tokenlarının normal metin kontrastı WCAG AA 4.5:1 altında
- Doğrudan Türkçe metinler katalog geçişini atlıyor

Bu iş P0 güvenlik düzeltmelerinden sonra, ekran bazında ve ortak bileşenden başlanarak yapılmalı.

### P2-05 — Auth tabloları ve operasyon yüzeyi için tasarım incelemesi gerekli

**Güven:** Test/tehdit modeli gerekli

- Better-auth `member` dahil auth tablolarında domain RLS deseni yok; uygulama filtresine
  dayanılıyor.
- `verimaya_app` rolünün auth tablolarına erişim kapsamı geniş.
- OpenAPI/Scalar ve development Bull Board erişimi production/development politikasına göre
  tekrar değerlendirilmeli.
- Provider rate-limit'i Redis tabanlı değil; GHL istemcisinde process-local bekleme var.

Bunlar tek başına doğrulanmış veri sızıntısı değildir. Auth adapter gereksinimi, DB rolü ve
production network sınırıyla birlikte tehdit modeli çıkarılmalı.

### P3 — Düşük öncelikli teknik borç

- Büyük dosyalar: `reports/+page.svelte`, `AppShell.svelte`, MSW `handlers.ts`
- Root layout route değişimlerinde auth kontrolünü yeniden çalıştırıp ağacı remount edebilir
- Service worker “network first cache” diyor fakat başarılı API yanıtını cache'e yazmıyor
- i18n geçişi ekranların önemli bölümünde tamamlanmamış
- `+error.svelte` ve kapsamlı web component/E2E testleri yok
- Karne/session storage verileri runtime şemayla doğrulanmıyor

## 6. Fikirler

### 6.1 Kaynak notlardan çıkan fikirler

1. **Komisyon takibi:** Acente segmentinde rakiplerden ayrışan, mevcut finans modeline yakın
   doğal genişleme.
2. **Gerçek ROAS'ı satış omurgası yapma:** Ads harcaması → lead/hasta → tahsilat zinciri,
   GHL ve finansın ortak anlatısı olabilir.
3. **Pazarlama araçlarını lead hunisine bağlama:** Hesaplayıcı, simülatör ve compliance
   ekranları bugün kullanım üretip lead üretmiyorsa en ucuz büyüme fırsatı burada.
4. **GHL “ikinci abonelik” itiraz playbook'u:** “GHL'in yerine değil, sağlık turizmi operasyon
   ve tahsilat katmanı” konumlandırması satış dokümanına dönüşmeli.
5. **WhatsApp BSP seçeneği:** Doğrudan Cloud API onboarding yükü solo ekip için ağırsa BSP
   değerlendirmesi yapılabilir.
6. **Tracker–Verimaya paralel regresyon:** Pilot kesimde aynı haftanın finans/randevu
   sonuçlarını iki sistemde karşılaştıran rapor.
7. **EU AI Act şeffaflık yüzeyi:** WhatsApp AI ifşası ile karne 7.6 kriterini aynı ayar ve
   audit kaynağına bağlama.

### 6.2 Bu denetimden çıkan yeni öneriler

1. **Pilot readiness score:** Güvenlik, veri doğruluğu, operasyon ve kullanıcı kabulünden
   oluşan dört kapılı tek sayfalık durum belgesi.
2. **Contract parity suite:** Aynı senaryoyu MSW ve gerçek API'ye karşı çalıştırıp response ve
   filtre davranışını karşılaştıran test paketi.
3. **Money correctness suite:** Multi-currency, kısmi ödeme, unpaid/partial/paid, tarih aralığı,
   cursor ve idempotent retry vakalarını tek regresyon paketinde toplama.
4. **Tenant switch chaos testi:** Aynı browser sekmesinde kullanıcı/org değiştirip cache,
   websocket/service-worker ve local/session storage sızıntısını kontrol etme.
5. **Durum taksonomisi:** Özelliklerde “kod hazır”, “pilot”, “yayında”, “harici onay bekliyor”
   ayrımı; `gelistiriliyor/yayinda` ikilisinin yarattığı belirsizliği kaldırma.

Bu fikirler P0/P1 kapıları kapanmadan yeni geliştirme sırasına alınmamalı.

## 7. Stratejik öneriler

### 7.1 Segment kararını teknik işlerden önce kapat

Acente ve klinik aynı ürün değildir:

- Acente: komisyon, çoklu klinik, ödeme/tahsilat, GHL/WhatsApp, dış hasta akışı
- Klinik: e-Nabız/e-Fatura/dijital onam, klinik mevzuatı ve daha ağır entegrasyon beklentisi

Öneri: İlk 20 görüşmenin tek birincil segmenti olsun. “İkisine de” cevabı yol haritasını
büyütür ve pilot öğrenimini bulanıklaştırır.

### 7.2 OrbisMed çıkar çatışmasını yazılı cevapla çöz

Hedef müşteri, ürün sahibinin sağlık turizmi işletmesini rakip görebilir. Satıştan önce şu
konular yazılı olmalı:

- Veri ayrımı ve erişim modeli
- Tüzel/operasyonel ayrım
- Verinin rakip işletme tarafından görülmediği taahhüt
- Destek personelinin erişim/audit süreci
- Referans müşteri anlatısında OrbisMed'in rolü

### 7.3 Kod üretimini değil pazar doğrulamayı hızlandır

30 günlük kapı:

- 20 müşteri görüşmesi
- 4–5 rakip demo/fiyat teklifi
- En az 3 ücretli ön-sipariş veya güçlü yazılı pilot niyeti
- Bir fiyat kartı ve iptal/taahhüt modeli

Bu eşik karşılanmadan iOS App Store, locale ağacı, TikTok/Instagram veya kapsamlı klinik
entegrasyonlarına yatırım yapılmamalı.

### 7.4 Solo kapasiteyi görünür yap

`Kapasite.md` içinde Verimaya için haftalık gün/saat tahsisi yok. 17 Ağustos review öncesi:

- Haftalık sabit kapasite
- Hangi ürün/işten zaman alınacağı
- Acil destek rezervi
- Pilot sırasında feature freeze

yazılmalı.

### 7.5 Pilot başarı ölçütleri

2–4 haftalık pilot “kullanıldı” diye başarılı sayılmamalı. En az:

- Aktif kullanıcı/gün
- Tracker'a geri dönülen işlerin sayısı ve nedeni
- AI taslak kabul, düzeltme ve red oranı
- Finans kayıt mutabakat farkı
- Randevu hata/kaçırma oranı
- Webhook/job başarısızlık ve retry oranı
- Ortalama destek süresi
- Haftalık yedek ve restore kanıtı

ölçülmeli.

## 8. Öncelikli yapılacaklar

| ID | Durum | Öncelik | İş | Sahip | Bağımlılık | Kabul kriteri |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-01 | 🟡 Kısmi | P0 | SecondBrain sırlarını rotate et ve geçmiş kopyaları sınırla | Kullanıcı | Sağlayıcı/SSH erişimi | Eski değerler revoke; yeni erişim testli; aktif notta secret yok |
| SEC-02 | ✅ Tamamlandı | P0 | Encryption key yeniden şifreleme planı | Agent + kullanıcı | Eski ve yeni anahtara kontrollü erişim | Tüm credential'lar yeni anahtarla açılıyor; rollback var |
| LEG-01 | ✅ Tamamlandı | P0 | Karne lead toplamayı hukuk onayına kadar kapat | Agent + hukuk | Feature flag kararı | Prod form/endpoint kapalı; onay sonrası kontrollü açılıyor |
| AUTH-01 | ✅ Tamamlandı | P0 | Server-side permission guard ve `/me` rolü | Agent | Rol matrisi kararı | Readonly/finance negatif testleri geçiyor (non-DB); UI gerçek role bağlı — DB izolasyon testleri FINAL-DB'de |
| WEBHOOK-01 | 🟡 Tasarım hazır | P0 | Tenant'ı imzalı/provider eşlemesinden çöz | Agent | Kullanıcı onayı (implementasyon) | Header değişimi başka tenant'a yazamıyor — WAHA kapsam dışı, GHL/generic onay bekliyor |
| CONTRACT-01 | ⬜ Bekliyor | P1 | Shared list query şemaları | Agent | Filtre semantiği | API, web, MSW aynı query şemasını kullanıyor |
| CONTRACT-02 | ⬜ Bekliyor | P1 | MSW–API parity testleri | Agent | CONTRACT-01 | Aynı fixture her iki backend'de aynı filtre sonucunu veriyor |
| CACHE-01 | ⬜ Bekliyor | P1 | Tenant/user scoped query keys ve logout clear | Agent | `/me` aktif org/rolü | Org/user geçiş testinde eski veri görünmüyor |
| MONEY-01 | ⬜ Bekliyor | P1 | AI approve'u atomik/idempotent komuta taşı | Agent | Finans onay UX kararı | Retry tek transaction üretir; kur/ödeme kullanıcı onaylı |
| MONEY-02 | ⬜ Bekliyor | P1 | Server aggregate ve bakiye semantiği | Agent + kullanıcı | “Bakiye” ürün tanımı | Kart, detay ve export aynı toplamı verir |
| TIME-01 | ⬜ Bekliyor | P1 | Tenant timezone modeli ve calendar-day yardımcıları | Agent + kullanıcı | Varsayılan timezone | İstanbul ve DST timezone testleri geçiyor |
| IDEM-01 | ⬜ Bekliyor | P1 | Idempotency kimliği ve tüm mutation kapsamı | Agent | Migration | Aynı key farklı path'te yanlış replay yapmıyor |
| EVENT-01 | ⬜ Bekliyor | P1 | Tenant-scoped event uniqueness kararı | Agent | Provider ID garantisi | Cross-tenant aynı ID 500 üretmiyor; race 202 duplicate |
| TEST-01 | ⬜ Bekliyor | P1 | Contacts/appointments/transactions izolasyon testleri | Agent | Yok | A token'ı B verisini list/get/update/delete edemiyor |
| CI-01 | ⬜ Bekliyor | P1 | Shared test, lint, format, web build CI kapıları | Agent | Mevcut lint/format temizliği | CI tüm kapıları temiz geçiyor |
| CI-02 | ⬜ Bekliyor | P2 | Redis + queue/readiness smoke | Agent | CI service | Ready endpoint ve temel job akışı CI'da doğrulanıyor |
| DOC-01 | ⬜ Bekliyor | P1 | Obsidian yol haritasını repo ile senkronla | Agent + kullanıcı | Bu rapor | Faz/öncelik listesi gerçek kod ve açık ops'u ayırıyor |
| DOC-02 | ⬜ Bekliyor | P1 | AGENTS/TASARIM hub-prerender metnini güncelle | Agent | DOC-01 | Always-apply kurallar gerçek host mimarisini anlatıyor |
| DOC-03 | ⬜ Bekliyor | P2 | Features/changelog durum taksonomisi | Agent + kullanıcı | “Yayında” tanımı | GHL/Ads durumları aynı anlamı taşıyor |
| OPS-01 | 🟡 Kısmi | P1 | Coolify/yedek/restore/curl kabulünü kapat | Kullanıcı | SEC/LEG kapıları | Dış yedek ve tarihli restore kanıtı var |
| OPS-02 | ⬜ Bekliyor | P2 | Meta/Google gerçek go-live kabul tabloları | Kullanıcı | Sağlayıcı onayı | 7 günlük veri, idempotent ikinci sync ve log denetimi |
| PILOT-01 | ⬜ Bekliyor | P2 | ETL dry-run → apply → verify | Kullanıcı + agent | OPS-01 | Tolerans dışı fark yok; rollback uygulanabilir |
| PILOT-02 | ⬜ Bekliyor | P2 | 2–4 haftalık feature-freeze pilot | Kullanıcı | PILOT-01 | KPI raporu ve Tracker'a dönüş listesi oluştu |
| MARKET-01 | ⬜ Bekliyor | P2 | Segment, OrbisMed ve kapasite kararları | Kullanıcı | Görüşmeler | Karar notu + haftalık kapasite + satış cevabı |
| MARKET-02 | ⬜ Bekliyor | P2 | 20 görüşme / 3 ön-sipariş kapısı | Kullanıcı | MARKET-01 | Tarihli görüşme ve sonuç kaydı |
| PRODUCT-01 | ⬜ Bekliyor | P3 | Komisyon takibi discovery | Kullanıcı + agent | Acente segmenti | Problem doğrulanmış; shared schema öncesi spec onaylı |
| IOS-01 | ⬜ Bekliyor | P4 | iOS smoke'u kapat veya bilinçli dondur | Kullanıcı | Pilot önceliği | Aktif görev gerçeği ve kapasite kaydı uyumlu |

### İlk 7 günlük önerilen sıra

**Gün 0–1**

- SEC-01 containment ve rotasyon planı
- LEG-01 production lead gate
- Pilot/Ads scheduler gibi yazma yüzeylerini risk değerlendirmesine kadar dondurma

**Gün 1–3**

- AUTH-01 ve WEBHOOK-01 tasarım + test
- CACHE-01

**Gün 3–5**

- CONTRACT-01/02
- MONEY-01 ve TIME-01 için kabul testleri

**Gün 5–7**

- TEST-01 ve CI-01
- DOC-01/02
- Sonrasında OPS-01 kabulü

## 9. Cursor model, context ve reasoning politikası

### 9.1 Temel ilke

Pahalı modeli tüm işi yapması için değil, **yüksek etkili kararı sentezlemesi ve denetlemesi**
için kullan:

> Ekonomik model araştırır/düzenler → dengeli model uygular → premium model riskli sınırı
> inceler.

Model kataloğu ve fiyatlar değişebilir. 2 Ağustos 2026 için aşağıdaki seçimler geçerli bir
çalışma politikasıdır; Cursor model picker ve güncel pricing sayfası son otoritedir.

### 9.2 Context sınıfları

- **Dar context:** Diff + hedef test + doğrudan import edilen 5–15 dosya. Varsayılan.
- **Orta context:** Bir domain klasörü, shared sözleşme, ilgili migration ve ajan özetleri.
- **Geniş context:** Çok alanlı migration/denetim. Önce Explore özetleriyle küçült; 1M context
  yalnız ön eleme yetersizse.

### 9.3 Aşama bazlı seçim

| Aşama | İlk model | Reasoning | Context | Yükseltme koşulu |
| --- | --- | --- | --- | --- |
| Hızlı dosya/isim keşfi | Composer 2.5 Fast veya GPT-5.6 Luna | Düşük | Dar/orta | İki aramada tutarlı harita çıkmazsa Terra |
| Geniş salt-okunur tarama | Composer 2.5 Standard; alternatif Gemini Flash | Düşük | Alanlara bölünmüş orta | Son sentez için Terra/Sonnet |
| Küçük mekanik edit | Composer 2.5 Fast | Düşük | Dar | 3–5 dosyayı aşar veya semantik karar doğarsa Terra |
| Normal feature/fix | GPT-5.6 Terra veya Grok 4.5 Medium | Orta | Dar/orta | İlk test/fix turu başarısızsa Sonnet/Sol |
| Svelte 5 rutin iş | Composer Fast + Svelte MCP | Düşük/orta | Bileşen + importlar + test | Runes/lifecycle sorunu sürerse Sonnet Thinking |
| Planlama/mimari | Claude Sonnet 5 Thinking veya Terra | Orta/yüksek | Orta | Auth, para, migration veya geri dönüşsüz kararda Sol/Opus |
| Derin debug | GPT-5.6 Sol veya Grok 4.5 High | Yüksek/max | Repro + log + ilgili kod | Bir instrumentasyon turu sonuç vermezse Opus |
| RLS/güvenlik/migration | Claude Opus 5 High | Yüksek | Dar kanıt paketi | Bağımsız GPT-5.6 Sol ikinci görüşü |
| Finansal doğruluk | Opus 5 veya Sol | Yüksek | Şema + sorgu + test | Farklı aileden ikinci review zorunlu |
| CI/test düzeltme | Composer Standard veya Grok Medium | Orta | Yalnız failing suite/log | Flaky/race ise Grok High/Sol |
| Küçük diff review | Sonnet 5 Thinking | Orta | `@Branch`/working diff | Auth/RLS/para ise Opus/Sol |
| Doküman/özet | Composer Standard veya Luna | Düşük | Diff + karar kaynakları | Çelişkili ADR sentezinde Sonnet |
| Bağımsız ikinci görüş | Ana modelden farklı aile | Yüksek | Aynı sabit kanıt paketi | Yalnız yüksek etkili anlaşmazlıkta üçüncü görüş |

### 9.4 Kullanıcının saydığı modeller için net öneri

- **GPT-5.6 Sol:** Kritik debug, auth, RLS, finans, migration ve son sentez. Günlük mekanik
  işler için gereksiz pahalı.
- **GPT-5.6 Terra:** Günlük ciddi feature/fix ve mimari plan için en dengeli GPT seçimi.
- **GPT-5.5 `(xhigh)`:** GPT-5.5 kullanılabilir; `xhigh` güncel belgelerde ayrı model adı
  değil, picker'da model için sunulabilen effort ayarıdır. Picker'da görünüyorsa zor ikinci
  görüşte kullanılabilir; yeni varsayılan olarak Sol/Terra ailesinin önüne konmamalı.
- **Claude Fable 5:** Varsayılan kullanma. Opus/Sol ile çözülemeyen, çok uzun ve olağanüstü
  zor görevlerde; maliyet ve veri saklama/kurumsal politika koşulları kontrol edilerek.
- **Claude Opus 5:** Güvenlik, DB/RLS ve para doğruluğu için güçlü reviewer.
- **Claude Sonnet 5:** Planlama, kapsamlı refactor ve Svelte reactivity için dengeli.
- **Grok 4.5:** Hızlı alternatif hipotez, test/CI ve bağımsız ikinci görüş; Medium günlük,
  High karmaşık debug.
- **Composer 2.5:** Keşif, mekanik edit, test/lint düzeltme ve doküman. Standard toplu işte
  ekonomik; Fast gecikmenin önemli olduğu küçük işte.

### 9.5 Token bütçesi

Proje için önerilen hedef dağılım:

- **%70:** Composer/Luna/Grok Medium ile keşif, mekanik edit, test ve doküman
- **%25:** Terra/Sonnet ile feature, refactor ve sentez
- **%5:** Sol/Opus/Fable ile kritik denetim ve ikinci görüş

Bu bir faturalandırma garantisi değil, kullanım disiplinidir.

Token tasarrufu kuralları:

1. Rutin işte en fazla 2–3 paralel salt-okunur ajan.
2. Repo'yu `api`, `web`, `shared/db`, `docs/ops` olarak böl; her ajana tüm repoyu verme.
3. Premium modele ham terminal dökümü değil, kısa kanıt paketi ver.
4. Her bağımsız hedef için yeni sohbet; uzun oturumda özetle.
5. Küçük review'da tüm repo yerine diff/branch context'i kullan.
6. Generated asset, build ve vendor dosyalarını context dışında tut.
7. İlk başarısız denemede hemen modele yükselme; önce repro ve ölçüm üret.
8. İkinci görüşte aynı model ailesini değil farklı aileyi seç.
9. Güvenlik ve migration işinde Auto/Router yerine modeli sabitle.
10. Geniş context'i kalite ayarı sanma; gereksiz context dikkat ve maliyet kaybıdır.

### 9.6 Auto/Router ve Max Mode

- Solo bireysel hesapta görünen Router seçenekleri hesaba/rollout'a göre değişebilir.
- Cost/Auto rutin ve düşük riskli işlerde kullanılabilir.
- Mimari, güvenlik ve yeniden üretilebilir review'da manuel model seç.
- Max Mode güncel kullanım bazlı planlarda genel bir “daha akıllı” düğme olarak
  değerlendirilmemeli; modelin picker'daki context/effort seçenekleri esas alınmalı.
- Fast genellikle daha düşük gecikme seçeneğidir; otomatik kalite artışı değildir.

## 10. Bu tür bir denetim için önerilen prompt

Aşağıdaki prompt doğrudan kopyalanıp yollar/tarih değiştirilerek kullanılabilir:

```text
Amaç:
<proje adı> için kanıta dayalı, tarihli bir proje değerlendirmesi hazırla.

Kaynaklar:
- Repo: <repo mutlak yolu>
- Yol haritası/fikir notları: <not klasörü mutlak yolu>
- Son uygulama planı: <plan dosyası>
- Tarih: <YYYY-MM-DD>
- Çıktı: <repo>/docs/<YYYY-MM-DD>-PROJE-DEGERLENDIRMESI.md

Çalışma biçimi:
1. Önce salt-okunur araştırma yap; hiçbir dosyayı değiştirme.
2. Repo incelemesini api/db, web, docs/ops ve ürün/yol haritası olarak böl.
3. Her bulgu için dosya ve satır kanıtı ver.
4. Bulguları “doğrulandı / test gerekli / dış ortamda doğrulanmalı” diye etiketle.
5. Güvenlik sırrı görürsen değerini hiçbir çıktıya kopyalama; yalnız dosya, kategori,
   etki ve rotasyon önerisini yaz.
6. Kod gerçeği ile yol haritasını karşılaştır; tamamlandı iddialarını doğrula.
7. Önce soruların varsa en fazla iki kritik soru sor. Sonra plan sun.
8. Ben planı onaylamadan edit yapma. Onaydan sonra yalnız çıktı dosyasını oluştur.

Rapor bölümleri:
- Yönetici özeti
- Güçlü alanlar
- Yol haritası ↔ repo uzlaştırması
- Hatalar ve riskler (P0–P4)
- Fikirler
- Öneriler
- Sahip, bağımlılık ve kabul kriterli yapılacaklar
- İlk 7 günlük sıra
- Aşamaya göre Cursor model/context/reasoning seçimi
- Token tasarrufu ve pahalı modele yükseltme koşulları
- Belirsizlikler ve kaynak dizini
- Obsidian oturum logu için 1–2 satırlık özet

Model kullanımı:
- Keşif ve mekanik işlerde ekonomik model.
- Kritik sentezde güçlü model.
- Auth/RLS/para/migration için farklı aileden bağımsız ikinci görüş.
- En fazla 2–3 paralel ajan; tüm repoyu her ajana verme.

Kalite:
- Ön bulguları körlemesine birleştirme; çelişkileri kaynak koddan doğrula.
- Risk ile doğrulanmış hatayı ayır.
- Test etmediğin veya erişemediğin dış sistemi tamamlanmış sayma.
- Çıktıda secret, token, parola veya özel anahtar değeri bulunmadığını son kez kontrol et.
```

### Daha ekonomik iki aşamalı kullanım

Geniş denetimler için tek dev prompt yerine:

1. **Araştırma oturumu:** Salt-okunur bulgu paketi; dosya edit yok.
2. **Sentez oturumu:** Yalnız doğrulanmış bulgu paketi + üç ana kaynak ile rapor yazımı.

Bu ayrım, pahalı modelin aynı dosyaları tekrar tekrar okumasını azaltır.

## 11. Belirsizlikler ve dış doğrulamalar

- Canlı Coolify/Hetzner/Cloudflare durumu repo içinden tam doğrulanamaz.
- SecondBrain'deki sırların hangi sağlayıcılarda hâlâ aktif olduğu konsoldan kontrol edilmeli.
- OAuth provider ID'lerinin global uniqueness garantisi belgeyle doğrulanmalı.
- KVKK metni ve açık rıza tasarımı hukukçu tarafından onaylanmalı.
- Gerçek Meta/Google/GHL token yenileme ve rate-limit davranışı sandbox/gerçek hesap ister.
- Browser tabanlı Lighthouse, axe, klavye/focus ve tenant-switch E2E testi yapılmalı.
- Pilot başarı, gerçek kullanıcı ve operasyon kaydı olmadan değerlendirilemez.
- OrbisMed çıkar çatışması ve segment kararı teknik denetimle çözülemez.

## 12. Ana kaynak dizini

Repo:

- `AGENTS.md`
- `README.md`
- `docs/CURSOR-PLAN.md`
- `docs/MIMARI.md`
- `docs/TASARIM.md`
- `docs/CHANGELOG-KURALLARI.md`
- `docs/DEPLOY-COOLIFY.md`
- `docs/ETL-KESIM.md`
- `docs/ADS-META-GOLIVE.md`
- `docs/ADS-GOOGLE-GOLIVE.md`
- `docs/ROASMATE-GECIS.md`
- `.github/workflows/ci.yml`
- `apps/api/src/`
- `apps/api/drizzle/`
- `apps/web/src/`
- `packages/shared/src/`

SecondBrain:

- `03-Areas/VeriMaya/00-proje-ozeti.md`
- `03-Areas/VeriMaya/01-kararlar.md`
- `03-Areas/VeriMaya/02-yol-haritasi.md`
- `03-Areas/VeriMaya/03-yapilacaklar.md`
- `03-Areas/VeriMaya/04-ilerleme-log.md`
- `03-Areas/VeriMaya/05-guvenlik-kvkk.md`
- `03-Areas/VeriMaya/Rakip Analiz/00-Rakip Analiz.md`
- `03-Areas/VeriMaya/board-review-Verimaya-2026-07-26.md`
- Bağlı Yapay Zeka Karnesi fikir ve şartname notları
- `04-Resources/Kapasite.md`

Cursor model belgeleri:

- https://cursor.com/docs/models-and-pricing
- https://cursor.com/help/models-and-usage/available-models
- https://cursor.com/docs/cursor-router
- https://cursor.com/docs/agent/prompting
- https://cursor.com/docs/subagents
- https://cursor.com/docs/agent/plan-mode
- https://cursor.com/docs/agent/debug-mode
- https://cursor.com/docs/agent/agent-review

## 13. Oturum logu için kısa özet

> 2026-08-02 — Repo + SecondBrain denetimi tamamlandı. P0: düz metin üretim sırları,
> server-side RBAC, webhook tenant doğrulaması ve KVKK lead kapısı; P1: API–MSW filtre,
> tenant cache, finans/AI işlem ve timezone doğruluğu. Yol haritası 30 Temmuz kodu ve
> 1 Ağustos apex hub mimarisiyle senkronlanmalı.
