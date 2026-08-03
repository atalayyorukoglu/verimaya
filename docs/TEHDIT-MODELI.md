# Tehdit Modeli — Auth Tabloları ve Ops Yüzeyi

> Faz 1.3 kapsamında yazıldı. Kod değil; sonraki fazların (özellikle Faz 2 tenant sınırı ve
> Faz 7 Opus denetimi) hangi riski bilerek erteledigini kayıt altına alır. Kanıtlar bu oturumda
> (2026-08-03, `main` HEAD sonrası) okunan koda dayanır — satır referansları zamanla kayabilir.

Her başlık için sabit format: **Mevcut durum** → **Saldırı senaryosu** → **Önerilen kontrol** →
**Karar** (`şimdi` / `pilot sonrası` / `kabul edilen risk`).

---

## 1) better-auth tablolarında domain RLS deseninin olmaması

**Mevcut durum.** Domain tablolarının tamamı (`patients`, `appointments`, `transactions`,
`contacts`, `case_notes`, `files`, `audit_logs`, `tenant_credentials`, `api_keys`, `jobs`,
`integration_events`, `ai_corrections`, `scorecard_*`, `tenant_settings`, `external_ids` — bkz.
`apps/api/drizzle/0004_core_domain.sql`, `0006_queue_platform.sql`, `0008..0018_*.sql`) her biri
`ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` ile `tenant_id = app.current_tenant_id()`
politikasına bağlı. better-auth'un yönettiği tablolar — `user`, `session`, `account`,
`verification`, `organization`, `member`, `invitation`, `two_factor`
(`apps/api/src/db/schema/auth.ts`, ilk şema `apps/api/drizzle/0001_auth_rls.sql`) — bu desenin
**dışında**. Repo genelinde bu tablolar için tek RLS örneği, aynı migration'daki artık silinmiş
`demo_notes` demosuydu; `user`/`session`/`account`/`organization`/`member` için hiç politika
yazılmamış. Bu tablolara erişim tamamen better-auth'un kendi sorgu mantığına (uygulama katmanı,
`organizationId`/`userId` filtreleriyle) bırakılmış — veritabanı seviyesinde ikinci bir savunma
katmanı yok.

**Saldırı senaryosu.** `SessionGuard` (`apps/api/src/auth/session.guard.ts`) her istekte
`getAuth().api.getSession()` çağırıyor ve dönen session'a güveniyor — bu akışın kendisi güvenli.
Risk, **gelecekte** yazılacak bir kod yolunda: bir debug/admin endpoint'i, bir raw-SQL script'i
(ör. `apps/api/scripts/*.js` gibi operasyonel script'ler) veya bir yeni "kullanıcı arama" özelliği
`db.select().from(session)` ya da `db.select().from(account)` gibi bir sorguyu
organization/tenant filtresi eklemeyi **unutarak** yazarsa, RLS bunu yakalamaz — çünkü bu
tablolarda hiç politika yok. Domain tablolarında aynı hata otomatik olarak engellenir (RLS
"unutulmuş filtreye rağmen" doğru satırları döner); auth tablolarında engellenmez. Somut hasar:
başka bir organizasyonun `session.token`'ı veya `account.access_token`/`refresh_token`'ı (OAuth
sırları) yanlışlıkla döner.

**Önerilen kontrol.** better-auth şemasını RLS'siz bırakmak endüstri pratiğiyle uyumlu (better-auth
kendi sorgularını organization-scoped kurar, RLS eklemek onun query builder'ıyla çakışabilir —
`SET LOCAL app.current_tenant_id` her istek için ayarlanmıyor bu tablolar için). Bunun yerine:
(a) bu tablolara doğrudan erişen **yeni kod** için code-review kontrol listesine "auth tablosuna
elle sorgu yazıyorsan organizationId/userId filtresi zorunlu" maddesi eklensin (bu belge o
kontrol listesinin kaynağı olsun); (b) `session`/`account` üzerinde en azından `user_id` ve
`organization_id` (session'da `active_organization_id` zaten var) üzerinden bir **read-only
audit view** düşünülebilir ki yanlışlıkla geniş SELECT çalıştıran bir script hemen fark edilsin.

**Karar: kabul edilen risk (pilot sonrasına not).** Tek tenant/pilot aşamasında (bugünkü durum)
hasar yüzeyi sınırlı — ikinci bir gerçek tenant olmadan cross-tenant sızıntısı zaten mümkün değil.
Faz 8 PILOT-02 çok-tenant'lı hâle geldiğinde bu madde yeniden değerlendirilmeli; o zamana kadar
kod tarafında yeni bir auth-tablosu sorgusu **yazılmayacak** (mevcut better-auth entegrasyonu
yeterli).

---

## 2) `verimaya_app` rolünün auth tablolarına erişim kapsamı

**Mevcut durum.** `apps/api/drizzle/0003_app_role.sql`: `verimaya_app` rolü `NOSUPERUSER
NOBYPASSRLS` ile oluşturuluyor (doğru — domain tabloları için RLS bypass edemiyor) ama yetki
grant'i **şema seviyesinde**: `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA
public TO verimaya_app` + `ALTER DEFAULT PRIVILEGES ... GRANT ... ON TABLES`. Bu, `public`
şemasındaki **her tabloya** (auth tabloları dahil) tam CRUD izni veriyor — madde 1'deki RLS
eksikliğiyle birleşince, `verimaya_app` bağlantısı üzerinden çalışan **herhangi bir** sorgu
(yanlışlıkla yazılmış da olsa) `user`/`session`/`account` tablolarının tamamını okuyabilir/
yazabilir/silebilir; hiçbir DB-seviyesi sınır yok. `.env.example`'da runtime bağlantısının
(`DATABASE_URL_APP`) zaten `verimaya_app` olarak ayarlı olduğu doğrulanmış — yani API'nin normal
çalışma zamanı tam olarak bu rolü kullanıyor.

**Saldırı senaryosu.** Madde 1'deki senaryoyla aynı kod hatası + burada ek olarak: rol düzeyinde
"auth tablolarına salt-okunur ya da hiç erişim yok" gibi bir ikinci bariyer bulunmadığından, hata
DB seviyesinde de durdurulamıyor. Ayrıca `verimaya_app` **DELETE** de yapabiliyor —
`session`/`verification` gibi tablolarda yanlışlıkla geniş bir `DELETE FROM session WHERE ...`
çalıştıran bir bakım script'i tüm kullanıcıların oturumlarını düşürebilir (hasar: DoS, veri
sızıntısı değil ama operasyonel kesinti).

**Önerilen kontrol.** İki seçenek var: (a) `verimaya_app`'e auth tabloları için ayrı, daha dar bir
grant seti tanımlamak (ör. `two_factor.secret`/`account.access_token` gibi sır kolonlarını
column-level grant ile kısıtlamak) — ama better-auth'un kendi query'lerinin hangi kolonlara
eriştiği net değilse bu kırılgan olur; (b) mevcut şema-geneli grant'i **korumak** ama madde 1'deki
code-review kuralını burada da tekrarlamak; DB rolü tarafında ek kısıtlama şimdilik eklenmesin
çünkü better-auth'un iç sorgularının hangi izinlere ihtiyaç duyduğu tam envanterlenmedi — yanlış
kısıtlama runtime'da auth'u kırabilir.

**Karar: kabul edilen risk (pilot sonrasına not).** Şu an için (b) — mevcut geniş grant korunuyor,
kısıtlama denenmiyor. Çok-tenant pilotu öncesinde better-auth'un gerçekte hangi SQL'leri
çalıştırdığı (query log ile) envanterlenip, madde 1 ile birlikte column/row-level bir daraltma
planı Faz 7'de veya PILOT-02 öncesinde ayrı bir iş olarak açılmalı.

---

## 3) Production'da OpenAPI/Scalar ve Bull Board erişim politikası

**Mevcut durum — OpenAPI/Scalar.** `apps/api/src/docs/openapi.mount.ts`:
`mountOpenApiDocs(app)` **koşulsuz** çağrılıyor (`apps/api/src/main.ts:186`) — `isDevelopment`
kontrolü yok. `/v1/docs` (Scalar UI) ve `/v1/openapi.yaml` production dahil **her ortamda,
kimlik doğrulamasız** olarak yayında. İçerik salt-okunur (statik YAML dosyası) ama tüm endpoint
envanterini, request/response şemalarını ve muhtemelen iç alan adlandırma kurallarını
(`tenant_id`, `contact_label` gibi) dışarıya açık ediyor.

**Mevcut durum — Bull Board.** `apps/api/src/queue/bull-board.mount.ts`: `isBullBoardEnabled` →
`isDevelopment || Boolean(adminQueueToken)`. Dev'de tüm kimlik doğrulaması **atlanıyor**
(`isAuthorized` doğrudan `true` dönüyor). Prod'da `ADMIN_QUEUE_TOKEN` set edilmemişse panel hiç
mount edilmiyor (fail-closed, iyi); set edilmişse tek koruma `X-Admin-Queue-Token` header'ının
**sabit karşılaştırma** (`===`, `apps/api/src/queue/bull-board.mount.ts:31`) ile eşleşmesi — süre
sabit olmayan (non-constant-time) karşılaştırma, teorik bir timing side-channel'a açık; token
rotasyonu veya deneme sayısı sınırlaması (lockout/rate-limit) yok.

**Saldırı senaryosu.** OpenAPI: bir saldırgan `/v1/openapi.yaml`'ı çekip API'nin tüm yüzeyini
(hangi endpoint'ler var, hangi alanlar zorunlu, hangi hata kodları dönüyor) reconnaissance için
kullanır — başlı başına bir ihlal değil ama sonraki saldırıları (ör. webhook sahteciliği,
enumeration) kolaylaştırır. Bull Board: `ADMIN_QUEUE_TOKEN` production'da set edilip de bir yerde
(log, `.env` commit, tarayıcı geçmişi) sızarsa, saldırgan kuyruktaki tüm job payload'larını
(müşteri verisi içerebilir) görür ve BullMQ üzerinden **job retry/silme** gibi operasyonel
müdahale yapabilir.

**Önerilen kontrol.** OpenAPI/Scalar için: prod'da ya tamamen kapatmak ya da en az temel bir
paylaşılan-secret query param / header ile korumak (public bir SaaS pazarlama sayfası değilse
kapalı tutmak daha güvenli — bu bir iç panel API'si, üçüncü taraf entegratör yok). Bull Board için:
sabit karşılaştırmayı `crypto.timingSafeEqual`'a çevirmek (ucuz, hemen yapılabilir); token
rotasyon politikasını `docs/DEPLOY-COOLIFY.md`'ye yazmak.

**Karar: `ADMIN_QUEUE_TOKEN` karşılaştırması için `şimdi`** (ucuz, düşük riskli bir değişiklik —
ayrı bir P1 fix olarak Faz 4/5 kapsamına eklenmesi önerilir, bu belge kapsamında kod
değiştirilmedi). **OpenAPI/Scalar'ın prod'da kapatılması/korunması için `pilot sonrası`** —
pilot öncesi API'yi kullanan tek taraf zaten biziz (kendi tenant'ımız), tek gerçek maliyet
reconnaissance kolaylığı; dışarıdan gerçek müşteri/entegratör trafiği başlamadan bu karar
ertelenebilir, ama PILOT-01/02 öncesi mutlaka gözden geçirilmeli.

---

## 4) Provider rate-limit'inin Redis yerine process-local olması

**Mevcut durum.** `apps/api/src/integrations/ghl/ghl.client.http.ts`: `GhlHttpClient` her istek
öncesi `this.throttle()` çağırıyor; bu, `this.lastRequestAt` adlı **instance-local** (process
belleğinde) bir alanla `MIN_REQUEST_GAP_MS` (120ms) aralığını koruyor (satır 27, 87, 231-238).
Redis veya başka bir paylaşılan store'a dokunmuyor — yalnızca tek bir Node process'i içinde
anlamlı.

**Saldırı senaryosu (aslında bir dış-tehdit değil, bir kendi-kendini-DoS riski).** Bugün tek API
process'i çalışıyor, yani throttle etkili. API yatay ölçeklendiğinde (2+ process/instance,
Coolify'de replica sayısı artırıldığında) her process kendi `lastRequestAt`'ini tutar; N process
paralel çalışırsa efektif istek hızı `N × (1000/120) ≈ N × 8.3 istek/sn` olur — GHL'in
"~100 istek / 10 sn" sınıfı limitini (koddaki yorum, satır 26) kolayca aşar. Sonuç saldırı değil
ama gerçek hasar: GHL 429'larla yanıt vermeye başlar, retry/backoff (kod zaten var) devreye girer
ama yük altında senkronizasyon gecikir veya OAuth rate-limit cezası (bazı sağlayıcılar tekrarlayan
429'da geçici IP/credential ban uygular) tetiklenebilir — bu bir tenant'ın değil **tüm** GHL
entegrasyonunun kesintiye uğraması demektir.

**Önerilen kontrol.** Redis tabanlı bir token-bucket/sliding-window (ör. `rate-limiter-flexible`
'in Redis store'u, ya da mevcut BullMQ/Redis bağlantısını kullanan basit bir
`INCR` + `PEXPIRE` deseni) `lastRequestAt`'in yerini alsın; tüm process'ler aynı sayaçı paylaşsın.

**Karar: pilot sonrası.** Bugün tek process/tek tenant çalışıyor (Coolify'de replica=1 varsayımı,
`docs/DEPLOY-COOLIFY.md` ile doğrulanmalı); risk şu an **teorik**. Yatay ölçeklendirme kararı
alınmadan (Faz 8 OPS/PILOT-02 kapsamı) bu değişikliği yapmak erken optimizasyon olur — ama
replica sayısı 1'in üzerine çıkarılmadan önce bu maddenin kapatılması **zorunlu ön koşul**
olarak işaretlensin.

---

## Özet karar tablosu

| # | Konu | Karar | Ne zaman yeniden değerlendirilir |
|---|---|---|---|
| 1 | Auth tablolarında RLS yok | Kabul edilen risk | Çok-tenant pilotu (PILOT-02) öncesi |
| 2 | `verimaya_app` auth tablolarına tam CRUD | Kabul edilen risk | Madde 1 ile birlikte, query-log envanteri sonrası |
| 3a | Bull Board token karşılaştırması sabit-zamanlı değil | Şimdi (ayrı fix) | — |
| 3b | OpenAPI/Scalar prod'da açık | Pilot sonrası | Gerçek 3. taraf entegratör/müşteri trafiği başlamadan önce |
| 4 | Provider rate-limit process-local | Pilot sonrası | Replica sayısı 1'in üzerine çıkmadan **önce** zorunlu |
