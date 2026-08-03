# Verimaya — Yapılacaklar (2026-08-03)

> **Bu dosya tek kaynaktır.** Bugünden itibaren Verimaya işleri buradan yürür.
> Birleştirilen kaynaklar: `docs/2026-08-02-PROJE-DEGERLENDIRMESI.md` §8 tablosu,
> `docs/CURSOR-PLAN.md` açık ops adımları (31/32/38/39),
> `SecondBrain/03-Areas/VeriMaya/02-yol-haritasi.md` "Sırada ne var",
> `SecondBrain/03-Areas/VeriMaya/Görevler/00-Görevler.md`.
>
> Durum anı: branch `chore/en-routes-i18n`, HEAD `61abde7`, çalışma ağacı iki `_tmp_*` dosyası dışında temiz.

---

## Çalışma kuralları (Sonnet için)

**Rolü:** Bu listedeki **tüm kodu Sonnet yazar.** Opus (denetçi) kod yazmaz; tüm fazlar bitince
Faz 7'de genel kontrolü yapar.

1. **Sırayla ilerle.** Faz atlama yok. Bir faz içindeki adımlar numaralandırılmış sırada yapılır;
   `Bağımlı:` satırı olan adım, bağımlılığı bitmeden başlatılmaz.
2. **Adım başına tek commit.** Commit mesajı Türkçe, `feat:` / `fix:` / `test:` / `docs:` / `chore:`
   önekiyle. Adım ID'sini mesaja yaz (ör. `fix: CACHE-01 tenant kapsamlı query key'ler`).
3. **Bitirince bu dosyayı güncelle:** adımın `- [ ]` kutusunu `- [x]` yap ve hemen altındaki
   **Görüş:** satırını doldur (2–4 cümle: ne yaptın, neyi değiştirmedin, hangi risk kaldı,
   Opus'un bakması gereken yer). Bu dosya değişikliğini adımın commit'ine dahil et.
4. **Kapsam dışına çıkma.** Adımın `Dosyalar:` alanında yazmayan bir yeri değiştirmen gerekiyorsa,
   değiştir ama **Görüş** satırında açıkça yaz.
5. **Her adımda testler yeşil olmalı.** İlgili paket testi + `pnpm --filter @verimaya/api check` ve
   `pnpm --filter @verimaya/web check` çalıştırılmadan adım kapatılmaz.
6. **Şema değişikliği önce `packages/shared`'da.** API ve web aynı şemaya bağlanır; MSW de aynı
   şemayı kullanır.
7. **RLS, queue-first webhook akışı ve insan-onaylı AI taslak ilkesi değiştirilmez.** Bunlar
   projenin doğru olan temelidir; sadece üzerine eklenir.
8. **Sır yazma.** Hiçbir token/parola/anahtar değeri koda, teste, dokümana veya commit mesajına
   girmez. `.env.example` sadece anahtar adı içerir.
9. **Soru sorma, dur ve bekleme.** Belirsiz bir karar noktasına gelirsen en savunulabilir varsayımı
   seç, uygula ve **Görüş** satırında "varsayım: …" diye yaz. Opus Faz 7'de bunları denetler.
10. **Model önerisi** her adımın altında `Model:` satırında. Cursor'da o adımı açarken kullan.

**Durum işaretleri:** `- [ ]` yapılmadı · `- [x]` yapıldı · `- [~]` kısmi (Görüş'te neden yazılır)

---

## Faz haritası

| Faz | Konu | Neden bu sırada | Adım |
|---|---|---|---|
| 0 | Zemin temizliği | Kirli ağaç ve kırmızı lint, sonraki her adımın sinyalini bozar | 0.1–0.4 |
| 1 | P0 güvenlik kapıları | Pilot öncesi kapanması zorunlu tek gerçek engel | 1.1–1.3 |
| 2 | Tenant sınırı + sözleşme | Yanlış veri gösterimi, güvenlikten sonraki en yüksek hasar | 2.1–2.4 |
| 3 | Para ve zaman doğruluğu | Ürünün satış vaadi bu; yanlışsa pilot değersiz | 3.1–3.3 |
| 4 | Platform sağlamlığı | Idempotency/event tekilliği, pilot yükünde patlar | 4.1–4.2 |
| 5 | CI ve kalite kapısı | Yukarıdaki kazanımların geri gitmesini engeller | 5.1–5.3 |
| 6 | Doküman senkronu | Eski always-apply kurallar AI'a yanlış mimari ürettiriyor | 6.1–6.4 |
| 7 | **Opus genel kontrolü** | Kod bittikten sonra tek seferlik denetim | 7.1 |

**Faz 8+ (kod değil, kullanıcı işi)** en altta ayrı bölümde — Sonnet bunlara dokunmaz.

---

## Faz 0 — Zemin temizliği

### 0.1 — Çalışma ağacını ve branch'i temizle
- [x] Yapıldı

`_tmp_21_38a74bc3f7b539d167c57b89290dafff` ve `_tmp_21_a91e16ffc5c05949a80825b348209ba5` boş artık
dosyalar; sil. `.gitignore`'a `_tmp_*` satırı ekle. `chore/en-routes-i18n` branch'ini `main`'e
merge et (fast-forward veya merge commit, rebase etme — geçmiş korunsun) ve bundan sonraki tüm işi
`main` üzerinden yürüt; her faz için ayrı kısa ömürlü branch açma.

- **Dosyalar:** repo kökü, `.gitignore`
- **Kabul:** `git status` temiz; `git branch --show-current` → `main`; `origin/main` güncel.
- **Model:** Composer 2.5 Fast · düşük reasoning · dar context

**Görüş:** İki `_tmp_*` dosyası silindi, `.gitignore`'a `_tmp_*` eklendi. Önceden AGENTS.md/README.md'de
bekleyen (bu listeyi tek kaynak olarak bağlayan) commit'lenmemiş değişiklikler vardı — kapsam dışı
ama ayrı bir `docs:` commit'inde birleştirildi, davranış/kural değişikliği içermiyorlar.
`chore/en-routes-i18n` main'e 13 commit fast-forward ile birleşti (main hiç ilerlememiş, divergence
yoktu — merge commit gerekmedi). `git status` temiz, aktif branch `main`, HEAD `06bdafb`. Risk yok;
Opus'un bakması gereken bir yer yok.

---

### 0.2 — Lint ve format borcunu kapat
- [x] Yapıldı

Denetim anında 10 ESLint hatası ve 46 dosyada Prettier farkı vardı. Bunları **tek ve ayrı** bir
commit'te kapat — davranış değiştiren hiçbir düzeltme bu commit'e girmesin. ESLint hatası ancak
davranış değiştirerek kapanıyorsa o dosyayı atla ve Görüş'te listele.

- **Dosyalar:** repo geneli (yalnız format/lint)
- **Kabul:** `pnpm lint` ve `pnpm format:check` (yoksa `prettier --check .`) sıfır hata.
- **Model:** Composer 2.5 Standard · düşük reasoning · dar context

**Görüş:** Repo genelinde yalnız `apps/web`'in `lint` script'i gerçek Prettier+ESLint çalıştırıyor
(`prettier --check . && eslint .`); `apps/api`'nin `lint`'i `tsc --noEmit`, `packages/shared`'da hiç
`lint`/`format` script'i yok — dolayısıyla "10 ESLint hatası / 46 dosyada Prettier farkı" tamamen
`apps/web` kapsamındaymış (doğrulandı: 10 ESLint hatası, 45 dosyada Prettier farkı — sayı çok yakın,
muhtemelen denetim sonrası küçük bir dosya değişikliğinden). Tüm düzeltmeler davranış değiştirmeden
yapıldı: kullanılmayan import/değişken/atama temizliği, `TransactionFormDialog.svelte` ve
`finance/ai-transaction/+page.svelte`'de her koşul dalında yeniden atanan değişkenlerin gereksiz
`= null` başlangıç değerleri kaldırıldı (control-flow her durumda kullanımdan önce atıyor).
`HubHome.svelte`'de gerçek bir parse hatası vardı: `{@html}` içindeki JSON-LD `<script>` template
literal'inde ham `</script>` dizisi Svelte parser'ını kilitliyordu; `<\/script>` kaçışıyla çözüldü —
bu üretilen string'i **değiştirmiyor** (JS'te `\/` == `/`), yalnız parser'ı doğru yönlendiriyor.
Ortaya çıkan iki ek kural (svelte/no-at-html-tags, no-useless-escape) gerekçeli
`eslint-disable-next-line` ile kapatıldı (statik JSON-LD, kullanıcı girdisi yok → XSS riski yok).
Kalan diff tamamen Prettier'ın deterministik SVG/attribute biçimlendirmesi (ör.
`LogoHorizontal.svelte`'deki büyük görünen diff, satır kırılımı dışında birebir aynı whitespace).
Node_modules kurulumu ve `pnpm`/`turbo` komutları bu oturumda mounted proje klasöründe SQLite
"readonly database" hatasıyla çalışmadı (muhtemelen bind-mount sınırlamaları); iş `/tmp` üzerinde
hızlı bir kopya ile yapıldı, sonuçlar yalnız değişen dosyalarla mounted repoya geri kopyalandı.
Opus'un bakması gereken yer: `HubHome.svelte`'deki eslint-disable gerekçesi ve
`TransactionFormDialog`/`ai-transaction` sayfasındaki tip daraltmalarının (`let x: T | null;`
initializer'sız) gerçekten her code path'te atandığını bağımsız doğrulamak.

---

### 0.3 — FINAL-DB: DB gerektiren test paketini yerelde çalıştır
- [ ] Yapıldı

Önceki oturumda Postgres kurulamadığı için `org-permission.guard.spec.ts`,
`auth-or-api-key.isolation.spec.ts` dahil 38 suite çalıştırılamadı; AUTH-01 kodu tamam ama
**doğrulanmadı**. `docker compose up -d` ile Postgres+Redis kaldır, `db:migrate` çalıştır, tüm API
testlerini koştur. Kırmızı çıkan varsa düzelt.

- **Dosyalar:** `docker-compose.yml` (gerekirse), kırmızı çıkan spec/kaynak dosyalar
- **Kabul:** `pnpm --filter @verimaya/api test` tamamı yeşil; sayı Görüş'e yazılır (denetim anı: 52 spec / 170 test).
- **Model:** Composer 2.5 Standard · orta reasoning · dar context (yalnız failing suite + log)

**Görüş:** _(Sonnet doldurur)_

---

### 0.4 — Sır sızıntısı için CI taraması ekle
- [~] Yapıldı (kısmi — bkz. Görüş)

SEC-01'in kod tarafındaki tek kalıcı önlemi: CI'a `gitleaks` (veya eşdeğeri) adımı ekle; PR'da
private key / token deseni yakalanırsa build kırılsın. Mevcut geçmişte bulunan sırların
rotasyonu kullanıcı işi (Faz 8), burada **yalnız gelecekteki sızıntı engellenir**.

- **Dosyalar:** `.github/workflows/ci.yml`, `.gitleaks.toml` (yeni)
- **Kabul:** CI'da secret-scan job'ı var; bilerek eklenmiş sahte bir anahtarla lokal denemede kırılıyor (deneme commit'lenmez).
- **Model:** Composer 2.5 Standard · düşük reasoning · dar context

**Görüş:** `.github/workflows/ci.yml`'e ayrı bir `secret-scan` job'ı eklendi (`gitleaks/gitleaks-action@v2`,
`.gitleaks.toml` konfigürasyonuyla, `useDefault = true` + repo'ya özgü zararsız yol/regex allowlist'i:
lockfile, bu config dosyasının kendisi, CI'daki sabit test secret'ı). **Varsayım/kısıt:** bu sandbox
ortamında GitHub'ın release indirme uç noktalarına (ve GitHub API'sine) proxy 403 ile erişim
engelli olduğu için gitleaks binary'sini indirip **gerçek bir lokal deneme çalıştıramadım.** Bunun
yerine `.gitleaks.toml`'ın geçerli TOML olduğunu (`python3 -m toml` ile parse) ve gitleaks'ın
varsayılan AWS-access-key desenine (`AKIA[0-9A-Z]{16}`) karşı bilinen sahte örnek anahtarın
(`AKIAIOSFODNN7EXAMPLE`) eşleştiğini doğruladım — ama bu, gerçek `gitleaks` CLI'ının çalıştığının
kanıtı değil, yalnızca desenin mantığının doğru olduğunun kanıtı. **Opus'un veya Atalay'ın
bakması gereken yer:** ilk PR/push'ta bu job'ın gerçekten çalıştığını ve CI ortamında bilerek
eklenmiş sahte bir anahtarla kırıldığını GitHub Actions'ta doğrulaman gerekiyor — kabul kriteri
tam anlamıyla henüz doğrulanmadı, bu yüzden kutuyu `[~]` işaretledim.

---

## Faz 1 — P0 güvenlik kapıları

### 1.1 — WEBHOOK-01: Tenant'ı istemci başlığından değil, provider eşlemesinden çöz
- [ ] Yapıldı
- **Bağımlı:** 0.3

Bugün `apps/api/src/webhooks/webhooks.controller.ts` tenant'ı `X-Tenant-Id` başlığından okuyor,
HMAC ise yalnız `${timestamp}.${rawBody}` imzalıyor (`webhooks.signature.ts:39-46`). Provider
secret'ını bilen taraf başlığı değiştirip **başka tenant'a yazabilir.**

Yap:
1. Migration: `tenant_provider_identities` tablosu — `(provider, external_id)` unique, `tenant_id` FK,
   `created_at`. RLS deseni domain tablolarıyla aynı olsun.
2. Webhook akışı: imza doğrulandıktan **sonra**, payload'daki provider'a özgü external ID'den
   (GHL: `locationId`; generic `:provider`: sözleşmede tanımlı alan) tenant çöz. Eşleşme yoksa
   `404`/`202 ignored` — hiçbir koşulda header'a düşme.
3. `X-Tenant-Id` başlığına artık **güvenilmez**; okunuyorsa yalnız log/telemetri amaçlı kalsın.
4. WAHA **kapsam dışı** — şu an tek tenant/pilot. Kodda bu istisna açık bir yorumla belirtilsin.
5. Ayarlar > Bağlantılar ekranında eşlemeyi görüntüleme/ekleme yüzeyi (minimum: liste + ekle/sil).

- **Dosyalar:** `apps/api/drizzle/` (yeni migration), `apps/api/src/db/schema/`,
  `apps/api/src/webhooks/webhooks.controller.ts`, `apps/api/src/webhooks/*.spec.ts`,
  `apps/web/src/routes/settings/` (bağlantılar), `packages/shared/src/`
- **Kabul:** Geçerli body imzası + değiştirilmiş `X-Tenant-Id` ile gönderilen webhook, hedef
  tenant'a **yazamıyor** (negatif test). Eşlemesi olmayan provider event'i kuyruğa girmiyor.
  Queue-first akış (integration_events → jobs → worker) aynen korunmuş.
- **Model:** Claude Opus 5 · yüksek reasoning · dar kanıt paketi (bu adım güvenlik sınırı; Sonnet
  uygular, Opus 5 ile plan/diff review yaptır)

**Görüş:** _(Sonnet doldurur)_

---

### 1.2 — Karne lead kapısını testle sabitle
- [ ] Yapıldı

LEG-01 canlıda kapalı (`720593e`) ama **regresyon testi yok**; biri flag'i yanlışlıkla açarsa
sessizce e-posta toplamaya başlar. `KARNE_LEADS_ENABLED` yokken/false iken endpoint'in
`503 karne_leads_disabled` döndürdüğünü ve web'de formun render edilmediğini teste bağla. Ayrıca
`apps/web/src/lib/karne/telemetry.ts` içinde lead capture'ın telemetry kapalıyken bile session
açabildiği yol kapatılsın.

- **Dosyalar:** `apps/api/src/karne/karne.controller.spec.ts`,
  `apps/web/src/lib/components/KarneEmailCapture.svelte`, `apps/web/src/lib/karne/telemetry.ts`,
  yeni web testi
- **Kabul:** Flag yokken API 503; flag yokken form DOM'da yok; flag açıkken ikisi de çalışıyor —
  üç durum da testli.
- **Model:** GPT-5.6 Terra · orta reasoning · dar context

**Görüş:** _(Sonnet doldurur)_

---

### 1.3 — Auth tabloları ve ops yüzeyi için tehdit modeli notu
- [ ] Yapıldı

Kod değil, kısa bir belge — ama Faz 1'de olması gerekiyor çünkü sonraki kararları belirliyor.
`docs/TEHDIT-MODELI.md` yaz: better-auth tablolarında domain RLS deseninin olmaması,
`verimaya_app` rolünün auth tablolarına erişim kapsamı, production'da OpenAPI/Scalar ve Bull Board
erişim politikası, provider rate-limit'inin Redis yerine process-local olması. Her madde için:
mevcut durum, gerçekçi saldırı senaryosu, önerilen kontrol, karar (şimdi/pilot sonrası/kabul edilen risk).

- **Dosyalar:** `docs/TEHDIT-MODELI.md` (yeni)
- **Kabul:** Dört başlığın her biri için karar satırı var; "araştırılacak" cevabı yok.
- **Model:** Claude Sonnet 5 Thinking · orta/yüksek reasoning · orta context

**Görüş:** _(Sonnet doldurur)_

---

## Faz 2 — Tenant sınırı ve sözleşme

### 2.1 — CONTRACT-01: Shared list query şemaları
- [ ] Yapıldı
- **Bağımlı:** Faz 1

Web ve MSW `from`, `to`, `patient_id`, `contact_id`, `type_id` gönderiyor; gerçek controller'lar
yalnız `cursor`/`limit` okuyor (`appointments.controller.ts:35-42`, `transactions.controller.ts:35-42`,
`contacts.controller.ts:34-42` — `contacts` ayrıca `q`). Filtreler **sessizce yok sayılıyor**:
hasta detayında başka hastanın kayıtları görünebilir.

Yap:
1. `packages/shared` içinde endpoint bazlı list query şemaları: `appointmentListQuerySchema`,
   `transactionListQuerySchema`, `contactListQuerySchema`, `patientListQuerySchema`. Filtre
   semantiği açıkça yazılsın (tarih aralığı **kapsayıcı**, `from`/`to` tenant timezone'unda
   calendar-day — Faz 3.3 ile hizalanacak, şimdilik UTC gün kabul et ve Görüş'te not düş).
2. API controller + service'leri bu şemaya bağla; filtreler gerçekten SQL'e insin, tenant indeksleri
   kullanılsın.
3. Web istemcisi ve MSW handler'ları aynı shared şemayı kullansın; yerel DTO tanımları kaldırılsın.
4. Bilinmeyen query parametresi **sessizce yok sayılmasın** → `400`.

- **Dosyalar:** `packages/shared/src/`, `apps/api/src/{appointments,transactions,contacts,patients}/`,
  `apps/web/src/lib/api*`, `apps/web/src/lib/mocks/handlers.ts`
- **Kabul:** Her filtre için API testi var; bilinmeyen parametre 400; web'de hasta detayı yalnız o
  hastanın kayıtlarını çekiyor.
- **Model:** GPT-5.6 Terra · orta reasoning · orta context (domain klasörü + shared + migration)

**Görüş:** _(Sonnet doldurur)_

---

### 2.2 — CONTRACT-02: MSW ↔ API parity test paketi
- [ ] Yapıldı
- **Bağımlı:** 2.1

Aynı fixture ve aynı senaryo, iki backend'e karşı: MSW ve gerçek API. Filtre, sıralama, cursor
davranışı ve response şekli aynı çıkmalı. Sapma varsa test kırılsın. Bu, "demo'da çalışıyordu"
sınıfı hataların kalıcı panzehiri.

- **Dosyalar:** `apps/web/src/lib/mocks/`, yeni `apps/api/test/contract-parity.spec.ts` (veya web
  tarafı eşdeğeri), paylaşılan fixture dizini
- **Kabul:** En az 4 kaynak (patients, appointments, transactions, contacts) × (filtre + cursor)
  senaryosu iki backend'de aynı sonucu veriyor.
- **Model:** Composer 2.5 Standard · orta reasoning · dar context

**Görüş:** _(Sonnet doldurur)_

---

### 2.3 — CACHE-01: Tenant/kullanıcı kapsamlı query key'leri
- [ ] Yapıldı

`apps/web/src/lib/query-client.ts` global; key'ler `['patients', ...]` gibi kapsamsız. 30 saniyelik
stale pencerede org/kullanıcı değişince önceki kapsamın verisi görünebilir. CACHE-02 (logout/switch
cache temizliği) `e666b28` ile kapandı, bu onun eksik yarısı.

Yap:
1. Merkezi key factory: `queryKeys.patients.list(params)` → `[scope, tenantId, userId, 'patients', params]`.
2. ~20 route dosyasını bu factory'ye geçir; elle yazılmış dizi key kalmasın (lint kuralı veya grep
   ile doğrula).
3. `tenantId`/`userId` `GET /v1/me`'den; henüz yüklenmemişken query'ler `enabled: false`.
4. Org/kullanıcı değişiminde önce `cancelQueries`, sonra `clear`, sonra yeni scope ile mount.

- **Dosyalar:** `apps/web/src/lib/query-client.ts`, yeni `apps/web/src/lib/query-keys.ts`,
  `apps/web/src/routes/**`, `apps/web/src/lib/components/AppShell.svelte`
- **Kabul:** Aynı sekmede org A → org B geçişinde A'nın hiçbir kaydı görünmüyor (test veya kayıtlı
  manuel senaryo). Kapsamsız key kalmadığı grep ile gösteriliyor.
- **Model:** Claude Sonnet 5 Thinking · orta reasoning · orta context (geniş ama mekanik refactor)

**Görüş:** _(Sonnet doldurur)_

---

### 2.4 — TEST-01: Contacts / appointments / transactions izolasyon testleri
- [ ] Yapıldı
- **Bağımlı:** 2.1

`patients`, `members`, `karne`, `reports` vb. için izolasyon spec'i var; **contacts, appointments,
transactions için yok** — bunlar ürünün en çok yazılan üç tablosu. Tenant A token'ıyla Tenant B
kaydına `GET`/`PATCH`/`DELETE` ve list filtreleri sınansın.

- **Dosyalar:** `apps/api/src/contacts/contacts.isolation.spec.ts`,
  `apps/api/src/appointments/appointments.isolation.spec.ts`,
  `apps/api/src/transactions/transactions.isolation.spec.ts` (üçü de yeni)
- **Kabul:** Üç kaynakta da A token'ı B verisini list/get/update/delete edemiyor; filtreyle de
  sızdıramıyor (ör. `patient_id` B'nin hastasını gösterse bile 404).
- **Model:** Composer 2.5 Standard · orta reasoning · dar context (mevcut `patients.isolation.spec.ts` şablon)

**Görüş:** _(Sonnet doldurur)_

---

## Faz 3 — Para ve zaman doğruluğu

### 3.1 — MONEY-01: AI onayını tek atomik/idempotent sunucu komutuna taşı
- [ ] Yapıldı
- **Bağımlı:** Faz 2

`apps/web/src/routes/finance/ai-transaction/+page.svelte:208-269` bugün: koda gömülü yaklaşık
GBP/EUR/USD kurları, koşulsuz `paid` + `paid_amount = amount`, transaction/correction/inbox-approve
**üç ayrı çağrı**, idempotency key yok. Kısmi hatada mükerrer kayıt ve ödenmemiş işlemin ödenmiş
yazılması mümkün.

Yap:
1. Yeni endpoint: `POST /v1/whatsapp/inbox/:id/approve-drafts` — transaction insert(ler)i +
   `ai_corrections` kaydı + inbox status güncellemesi **aynı DB transaction'ında**, tek
   `Idempotency-Key` ile.
2. Kur koda gömülmez. Onay ekranında **zorunlu alan**: kur (kullanıcı girer veya tenant ayarındaki
   varsayılan kur tablosundan gelir), ödeme durumu (`unpaid`/`partial`/`paid`), `paid_amount`,
   karşı taraf. Hiçbiri sessiz varsayılan almaz.
3. Web bu tek komutu çağırsın; `apiSend` idempotency key üretsin (tüm mutation'lar için — 4.1 ile
   hizalı).
4. İnsan-onaylı taslak ilkesi korunur: AI hâlâ yalnız taslak üretir.

- **Dosyalar:** `apps/api/src/whatsapp/`, `packages/shared/src/`,
  `apps/web/src/routes/finance/ai-transaction/+page.svelte`, `apps/web/src/lib/api*`
- **Kabul:** Aynı key ile iki kez onay → tek transaction seti. Kur/ödeme alanları boşken onay
  butonu pasif. Kısmi hata → hiçbir şey yazılmamış (rollback testli).
- **Model:** Claude Opus 5 · yüksek reasoning · şema + sorgu + test (finansal doğruluk; farklı
  aileden ikinci görüş — GPT-5.6 Sol — diff review'da zorunlu)

**Görüş:** _(Sonnet doldurur)_

---

### 3.2 — MONEY-02: Raporlar tek kaynaktan; bakiye semantiğini tanımla
- [ ] Yapıldı
- **Bağımlı:** 3.1

`apps/web/src/routes/reports/+page.svelte` bugün karışık: kategori kartı server aggregate'ten,
hero ve pending tutarı `limit: 100` ile çekilen **kısmi** listeden (satır 122-132, 214-243), hasta
dağılımı ilk 100 hastadan (197-203, 289-307). Aynı ekranda iki farklı gerçeklik.
`finance/balances/+page.svelte:32-49` para birimlerini ayrı grupluyor (bu doğru) ama brüt `amount`
kullanıyor, `paid_amount`/ödeme durumunu yok sayıyor ve `contact_label`'ı kimlik gibi kullanıyor.

Yap:
1. Tüm finansal kart ve özetler **yalnız** server aggregate endpoint'lerinden beslensin. Client'ta
   toplama yok.
2. Eksik aggregate endpoint'lerini ekle (pending toplamı, hasta dağılımı, dönemsel hero).
3. Bakiye: `contact_id + currency` bazında hesaplansın (`contact_label` değil). "Açık tutar" =
   `amount - paid_amount`; "tahsil edilmiş" ayrı gösterilsin. Bu tanımı `docs/MIMARI.md`'ye yaz.
4. Drill-down cursor pagination kullansın ve kartla **aynı sorgu tanımına** bağlansın.

- **Dosyalar:** `apps/api/src/reports/`, `apps/api/src/transactions/`, `packages/shared/src/`,
  `apps/web/src/routes/reports/+page.svelte`, `apps/web/src/routes/finance/balances/+page.svelte`,
  `docs/MIMARI.md`
- **Kabul:** Kart, detay ve export aynı toplamı veriyor (test). 100'den fazla kayıtlı fixture'da
  hero ve pending doğru. Bakiye ekranı iki kişi aynı isimdeyken karışmıyor.
- **Model:** Claude Opus 5 veya GPT-5.6 Sol · yüksek reasoning · şema + sorgu + test

**Görüş:** _(Sonnet doldurur)_

---

### 3.3 — TIME-01: Tenant timezone modeli ve calendar-day yardımcıları
- [ ] Yapıldı

`apps/web/src/routes/appointments/+page.svelte:40-64,97-110` yerel gece yarısı üretip
`toISOString().slice(0,10)` ile gün anahtarına çeviriyor. Europe/Istanbul'da yerel pazartesi 00:00,
UTC'de pazardır → **randevular bir gün kayabilir.**

Yap:
1. Tenant tablosuna `timezone` alanı (migration), varsayılan `Europe/Istanbul`. Ayarlar > Organizasyon
   ekranında seçilebilir olsun.
2. Ortak calendar-day yardımcıları (`packages/shared`): `toTenantDayKey(date, tz)`,
   `tenantDayRange(dayKey, tz)`. `Date` + `toISOString` dilimlemesi ile gün anahtarı üretimi
   repo genelinden kaldırılsın (grep ile doğrula).
3. API tarafında `from`/`to` filtreleri tenant timezone'unda calendar-day olarak yorumlansın
   (2.1'de bırakılan not burada kapanır).
4. Testler: Europe/Istanbul (DST'li) + bir DST'siz timezone (ör. `Asia/Riyadh`) — gün sınırı,
   DST geçiş günü ve ay sonu vakaları.

- **Dosyalar:** `apps/api/drizzle/` (migration), `apps/api/src/db/schema/`, `packages/shared/src/`,
  `apps/web/src/routes/appointments/+page.svelte`, `apps/web/src/routes/settings/`, ilgili testler
- **Kabul:** İki timezone testi geçiyor; `toISOString().slice(0,10)` deseni gün anahtarı için
  repoda kalmamış.
- **Model:** GPT-5.6 Terra · orta reasoning · orta context

**Görüş:** _(Sonnet doldurur)_

---

## Faz 4 — Platform sağlamlığı

### 4.1 — IDEM-01: Idempotency kimliğini düzelt, tüm mutation'ları kapsa
- [ ] Yapıldı

`apps/api/src/common/idempotency.service.ts:23-37` replay lookup'ı **yalnız `key`** ile yapıyor;
`method` ve `path` kaydediliyor ama sorguya girmiyor. Aynı tenant'ta aynı key farklı endpoint'te
kullanılırsa **önceki endpoint'in yanıtı replay edilir.** Ayrıca settings, scorecard, WhatsApp ve
bazı integration mutation'ları bu servisi hiç kullanmıyor.

Yap:
1. Lookup ve unique index: `tenant_id + key + method + normalized_path` (migration gerekli).
   `normalized_path` = path parametreleri yerine route şablonu (ör. `/v1/patients/:id`).
2. Mevcut kayıtlar için geriye dönük migration stratejisi Görüş'te yazılsın (tablo küçükse temizle).
3. Tüm mutating endpoint'lerin envanterini çıkar; ortak interceptor/decorator ile idempotency
   zorunlu hale gelsin. Kapsam dışı bırakılan varsa kod içinde gerekçeli yorumla.
4. Web `apiSend` her mutation'da key üretsin (3.1 ile hizalı).

- **Dosyalar:** `apps/api/src/common/idempotency.service.ts`, `apps/api/drizzle/`,
  `apps/api/src/db/schema/`, mutation içeren tüm controller'lar, `apps/web/src/lib/api*`
- **Kabul:** Aynı key farklı path'te yanlış replay yapmıyor (test). Envanterdeki her mutating
  endpoint ya idempotent ya da gerekçeli istisna.
- **Model:** Claude Opus 5 · yüksek reasoning · dar kanıt paketi (migration + geri dönüşsüz karar)

**Görüş:** _(Sonnet doldurur)_

---

### 4.2 — EVENT-01: `integration_events` tekilliğini tenant kapsamına al
- [ ] Yapıldı

`apps/api/src/db/schema/queue.ts:37-42` unique index `(provider, external_event_id)` — **global.**
Duplicate araması ise RLS yüzünden tenant-scoped (`webhooks.controller.ts:223-241`). İki tenant aynı
provider event ID'sini üretirse SELECT diğerini göremez, INSERT `23505` ile **500** verir.

Yap:
1. Provider ID'lerinin global uniqueness garantisi belgelenemiyorsa index'i
   `tenant_id + provider + external_event_id` yap (migration).
2. Eşzamanlı duplicate yarışında `23505` yakalansın ve **idempotent `202`** yanıtına dönsün, 500'e
   değil.
3. Payload-hash fallback kuralı da tenant-scoped sabitlensin.
4. Testler: cross-tenant aynı ID → iki kayıt, 500 yok; aynı tenant aynı ID → tek kayıt, 202.

- **Dosyalar:** `apps/api/src/db/schema/queue.ts`, `apps/api/drizzle/`,
  `apps/api/src/webhooks/webhooks.controller.ts`, ilgili spec
- **Kabul:** Yukarıdaki iki test geçiyor; queue-first akış değişmemiş.
- **Model:** Claude Opus 5 · yüksek reasoning · dar kanıt paketi

**Görüş:** _(Sonnet doldurur)_

---

## Faz 5 — CI ve kalite kapıları

### 5.1 — CI-01: Eksik kapıları CI'a ekle
- [ ] Yapıldı
- **Bağımlı:** 0.2 (lint/format borcu kapalı olmalı, yoksa CI kırmızı doğar)

Mevcut `.github/workflows/ci.yml` shared typecheck + API migrate/check/build/test + web check/test
çalıştırıyor. **Eksik:** shared Vitest testleri (36 test), ESLint, Prettier check, web production
build.

- **Dosyalar:** `.github/workflows/ci.yml`, gerekirse `package.json` script'leri
- **Kabul:** CI tüm kapıları temiz geçiyor; kapılardan biri kasten kırıldığında build kırmızı.
- **Model:** Composer 2.5 Standard · orta reasoning · dar context

**Görüş:** _(Sonnet doldurur)_

---

### 5.2 — CI-02: Redis servisi + queue/readiness smoke
- [ ] Yapıldı
- **Bağımlı:** 5.1

CI'da Postgres var, Redis yok — kuyruk yolu hiç sınanmıyor. Redis service ekle; readiness
endpoint'i ve minimum bir job akışı (enqueue → worker → completed) CI'da doğrulansın.

- **Dosyalar:** `.github/workflows/ci.yml`, yeni smoke spec
- **Kabul:** Ready endpoint 200; bir job kuyruğa girip tamamlanıyor — ikisi de CI'da.
- **Model:** Composer 2.5 Standard · orta reasoning · dar context

**Görüş:** _(Sonnet doldurur)_

---

### 5.3 — Erişilebilirlik borcunu ortak bileşenlerden kapat
- [ ] Yapıldı

`svelte-check` 10 a11y uyarısı veriyor. Ekran ekran değil, **ortak bileşenden** başla:
Dialog (unique title ID, focus trap, initial focus, focus return), command palette input,
karne skor butonları (erişilebilir isim + state), `TransactionDraftCard.svelte` label ilişkileri.
Ayrıca WCAG AA 4.5:1 altında kalan tema token'larını düzelt.

- **Dosyalar:** `apps/web/src/lib/components/` (Dialog, command palette, TransactionDraftCard),
  tema token dosyası
- **Kabul:** `svelte-check` a11y uyarısı 0; kontrast düzeltmeleri Görüş'te ölçülen değerlerle
  listelenmiş. (Tam axe/Lighthouse taraması Faz 7'de.)
- **Model:** Claude Sonnet 5 Thinking · orta reasoning · bileşen + importlar + test

**Görüş:** _(Sonnet doldurur)_

---

## Faz 6 — Doküman senkronu

> Bu faz kozmetik değil: `AGENTS.md` ve `.cursor/rules` always-apply kurallar; eski olduklarında
> AI yeni kodu **yanlış mimariye göre** üretiyor.

### 6.1 — DOC-02: AGENTS.md ve TASARIM.md'yi gerçek host mimarisine getir
- [ ] Yapıldı

İkisi de public yüzeyi hâlâ `/vitrin` + prerender kapalı gibi anlatıyor. Gerçek:
`(public)/+layout.ts` `ssr=true`, `prerender=true`; build `/vitrin` HTML'ini `hub.html` olarak
kopyalıyor (`apps/web/scripts/inject-spa-noindex.mjs:34-38`); nginx apex `/` → `hub.html`,
`/vitrin` → 301 `/` (`apps/web/nginx.conf:7-29`). Yani: **apex `verimaya.com` = marketing hub,
`app.verimaya.com` = panel + auth gate.**

- **Dosyalar:** `AGENTS.md`, `docs/TASARIM.md`, `.cursor/rules/frontend.mdc`,
  `.cursor/rules/multi-tenant.mdc`, `.cursor/rules/integrations.mdc`
- **Kabul:** Her iki dosyada `/vitrin` aktif rota olarak geçmiyor; apex/app ayrımı ve prerender
  durumu doğru anlatılmış.
- **Model:** Composer 2.5 Standard · düşük reasoning · diff + karar kaynakları

**Görüş:** _(Sonnet doldurur)_

---

### 6.2 — DOC-01: Obsidian yol haritasını sıfırdan yaz + güvenlik notunu düzelt
- [ ] Yapıldı
- **Bağımlı:** 6.1

2026-08-03'te eski yol haritası arşive alındı (`Arşiv/2026-07-30-yol-haritasi.md`) — kod
gerçekliğinin gerisindeydi: prerender'ın kapalı, karnenin sıradaki iş, GHL OAuth/reconcile ve ETL
`--apply`'ın yok olduğunu söylüyordu; apex hub / app host ayrımı hiç geçmiyordu.
`02-yol-haritasi.md` şu an kısa bir stub.

Yap:
1. `02-yol-haritasi.md`'yi **sıfırdan yaz.** "Sırada ne var" bölümü olmayacak — öncelik sırası
   yalnız bu dosyada yaşar; yol haritası **durum belgesi**dir. Faz durumlarını üç eksende göster:
   **kod kapsamı / pilot hazırlığı / canlı operasyon.** Tek rozet gerçeği anlatmıyor.
   Kaynak: repo kodu + `docs/2026-08-02-PROJE-DEGERLENDIRMESI.md` §4.
2. `04-ilerleme-log.md`'ye 1–3 Ağustos kaydını düş: apex hub / app host ayrımı, Ads düzeltmeleri,
   AUTH-01 commit zinciri, SEC-02 + LEG-01 kapanışı, 3 Ağustos liste birleştirmesi ve arşivleme.
3. `05-guvenlik-kvkk.md`: tamamlanmış teknik kontrolleri işaretle. Şu an tamamlananlar
   tamamlanmayanlarla aynı görünüyor. Teknik kontroller ile hukuki/operasyonel kontrolleri **ayrı
   bölümlere** al — biri kod, diğeri dış onay gerektiriyor.

- **Dosyalar:** `SecondBrain-Remote/03-Areas/VeriMaya/02-yol-haritasi.md`, `04-ilerleme-log.md`,
  `05-guvenlik-kvkk.md`, `Özellikler/00-Özellikler.md` (tablo 6.4 taksonomisiyle yeniden yazılır)
- **Kabul:** Yol haritasında kod gerçeğiyle çelişen tek cümle yok; üç eksen ayrı. Güvenlik notunda
  teknik ve hukuki/operasyonel kontroller ayrışmış. Arşivdeki eski dosyalar kaynak olarak
  kullanılmamış (yalnız geçmiş referansı).
- **Model:** Claude Sonnet 5 Thinking · orta reasoning · orta context

**Görüş:** _(Sonnet doldurur)_

---

### 6.3 — CURSOR-PLAN'ı arşiv olarak etiketle
- [ ] Yapıldı

`docs/CURSOR-PLAN.md` (1683 satır) artık aktif yol haritası değil; **tamamlanmış büyük uygulama
planının arşivi.** Başına arşiv notu ekle (tarih + "aktif liste: `docs/2026-08-03-YAPILACAKLAR.md`")
ve sonuna kısa bir "post-44 kapanış eki" yaz: apex hub, app host, `/vitrin` 301, marka/PWA
varlıkları, Google Ads müşteri hesabı + hata yüzeyleme + sync penceresi düzeltmeleri.

- **Dosyalar:** `docs/CURSOR-PLAN.md`
- **Kabul:** Dosyanın ilk 10 satırında arşiv etiketi ve aktif listeye işaretçi var.
- **Model:** Composer 2.5 Fast · düşük reasoning · dar context

**Görüş:** _(Sonnet doldurur)_

---

### 6.4 — DOC-03: Özellik durum taksonomisi
- [ ] Yapıldı

`/features` sayfası GHL/Ads'i "geliştiriliyor" diyor, `/changelog` aynı şeyi kullanıcıya eklenmiş ve
çalışır gibi anlatıyor. `apps/web/src/lib/status-tone.ts` içindeki `gelistiriliyor/yayinda` ikilisi
yetmiyor. Dört durum tanımla: **`kod-hazir` · `pilotta` · `yayinda` · `harici-onay-bekliyor`.**
Tüm özellikleri yeniden etiketle; kuralı `docs/CHANGELOG-KURALLARI.md`'ye yaz.

- **Dosyalar:** `apps/web/src/lib/status-tone.ts`, `apps/web/src/routes/features/+page.svelte`,
  `apps/web/src/routes/changelog/+page.svelte`, `docs/CHANGELOG-KURALLARI.md`
- **Kabul:** Her özellik dört durumdan birinde; GHL/Ads iki dosyada aynı durumu gösteriyor.
- **Model:** Composer 2.5 Standard · düşük reasoning · dar context

**Görüş:** _(Sonnet doldurur)_

---

## Faz 7 — Genel kontrol (Opus / bu oturumun denetçisi)

### 7.1 — Tüm kod bittiğinde genel denetim
- [ ] Yapıldı

**Sonnet bu adımı yapmaz.** Faz 0–6 tamamlanıp tüm kutular işaretlendiğinde Atalay bu oturuma
"Faz 7'yi başlat" der; denetim şunları kapsar:

- Faz 1–4'ün her kabul kriterinin gerçekten karşılandığı — koddan doğrulama, iddiaya güvenmeden
- Sonnet'in **Görüş** satırlarındaki tüm "varsayım: …" notlarının tek tek karara bağlanması
- Güvenlik sınırlarının bağımsız ikinci gözle okunması: WEBHOOK-01, IDEM-01, EVENT-01, RLS
- Para doğruluğu regresyonu: multi-currency, kısmi ödeme, unpaid/partial/paid, tarih aralığı,
  cursor, idempotent retry — tek pakette
- Tenant switch chaos testi: aynı sekmede kullanıcı/org değişiminde cache, service worker ve
  local/session storage sızıntısı
- Browser tabanlı axe + Lighthouse + klavye/focus geçişi
- Kapsam sapması: Sonnet'in `Dosyalar:` dışına çıktığı yerlerin gerekçe denetimi
- Çıktı: `docs/2026-08-XX-KONTROL-RAPORU.md` + pilot readiness kararı (dört kapı: güvenlik, veri
  doğruluğu, operasyon, kullanıcı kabulü)

**Görüş:** _(Opus doldurur)_

---

## Faz 8 — Kod dışı işler (Atalay; Sonnet dokunmaz)

Bunlar sağlayıcı konsolu, hukuk, sunucu veya gerçek müşteri gerektiriyor. Kod fazlarıyla
**paralel** yürüyebilir; PILOT-01 dışında hiçbiri Faz 0–7'yi bekletmez.

- [ ] **SEC-01 (P0, kalan):** OAuth client secret rotasyonu sağlayıcı konsollarında; Obsidian
      aktif/revision/yedek kopyalarının temizliği. *SSH, PostgreSQL, Redis, Better Auth ve
      credential encryption sırları döndürüldü — bu ikisi kalınca bulgu kapanmıyor.*
- [ ] **LEG-02 (P0):** KVKK aydınlatma metni + açık rıza tasarımının hukukçu onayı. Onay gelmeden
      `KARNE_LEADS_ENABLED` ve `PUBLIC_KARNE_LEADS_ENABLED` birlikte açılmaz.
- [ ] **OPS-01 (P1, kalan):** Sunucu **dışı** otomatik yedek/snapshot düzeni. *Dump/restore provası,
      Coolify deploy bağlantısı ve canlı curl kabulü tamamlandı.*
- [ ] **OPS-02 (P2):** Meta ve Google Ads gerçek hesapla go-live kabulü — 7 günlük veri, idempotent
      ikinci sync, log denetimi. Runbook: `docs/ADS-META-GOLIVE.md`, `docs/ADS-GOOGLE-GOLIVE.md`.
- [ ] **PILOT-01 (P2):** ETL dry-run → apply → verify; kendi firmamız ilk tenant.
      **Bağımlı: Faz 1–4 + OPS-01.** Runbook: `docs/ETL-KESIM.md`.
- [ ] **PILOT-02 (P2):** 2–4 haftalık feature-freeze dahili pilot. Ölçülecek: aktif kullanıcı/gün,
      Tracker'a geri dönülen iş sayısı ve nedeni, AI taslak kabul/düzeltme/red oranı, finans
      mutabakat farkı, randevu kaçırma oranı, webhook/job başarısızlık ve retry oranı, ortalama
      destek süresi, haftalık yedek + restore kanıtı.
- [ ] **MARKET-01 (P2):** Üç karar yazıya dökülsün — (a) birincil segment: acente **mi** klinik mi
      (ilk 20 görüşme tek segment olsun), (b) OrbisMed çıkar çatışması cevabı: veri ayrımı, tüzel
      ayrım, erişim/audit süreci, referans anlatısı, (c) `Kapasite.md`'de Verimaya'ya haftalık
      sabit gün/saat tahsisi + pilot sırasında feature freeze. **17 Ağustos review'dan önce.**
- [ ] **MARKET-02 (P2):** 30 günlük kapı — 20 müşteri görüşmesi, 4–5 rakip demo/fiyat teklifi, en az
      3 ücretli ön-sipariş veya yazılı pilot niyeti, bir fiyat kartı + iptal/taahhüt modeli.
- [ ] **Marka (bekleyen):** `verimaya.com` / `.com.tr` tescili, Türk Patent 9/35/42/44 ön araştırma.
- [ ] **IOS-01 (P4):** iOS smoke'u kapat **veya bilinçli dondur.** Kapasite kararı verilmeden
      açık görev olarak durması yanlış sinyal veriyor. Öneri: pilot bitene kadar dondur.
- [ ] **PRODUCT-01 (P3):** Komisyon takibi discovery — acente segmenti seçilirse. P0/P1 kapıları
      kapanmadan geliştirme sırasına **alınmaz.**

---

## Bilinçli olarak yapılmayacaklar (şimdilik)

MARKET-02 kapısı (3 ücretli ön-sipariş / yazılı pilot niyeti) karşılanmadan bunlara yatırım yok:

- iOS App Store hazırlığı (Privacy Manifest, imzalama, push, WidgetKit, watchOS)
- Tam i18n/locale ağacı
- TikTok / Instagram entegrasyonları
- Kapsamlı klinik entegrasyonları (e-Nabız, e-Fatura, dijital onam)
- Ürün içi karnenin genişletilmesi (pilotla birlikte gelir, öncesinde değil)

---

## Kaynaklar

- `docs/2026-08-02-PROJE-DEGERLENDIRMESI.md` — bulguların kanıt ve satır referansları
- `docs/CURSOR-PLAN.md` — arşiv (bkz. 6.3)
- `docs/MIMARI.md`, `docs/TASARIM.md`, `docs/DEPLOY-COOLIFY.md`, `docs/ETL-KESIM.md`
- `SecondBrain-Remote/03-Areas/VeriMaya/` — 01-kararlar, 02-yol-haritasi, 04-ilerleme-log, 05-guvenlik-kvkk
