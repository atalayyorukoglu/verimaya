# Verimaya — Faz 7 Genel Kontrol Raporu (2026-08-03)

> **Denetçi:** Opus (bu oturum). **Kapsam:** `docs/2026-08-03-YAPILACAKLAR.md` Faz 7 / adım 7.1.
> **Denetlenen aralık:** `bb6aca2` → `02bf99b` (Faz 0–6 commit zinciri) + commit edilmemiş Faz 5 çalışma ağacı.
> **Yöntem:** Sonnet'in **Görüş** satırlarındaki iddialara güvenilmedi; her kabul kriteri ya koddan
> ya da gerçek Postgres'e karşı koşan testten doğrulandı.

---

## 0. Yönetici özeti

Bu denetimin en önemli sonucu, Faz 0.3'ten beri süren **"kod doğru görünüyor ama hiç çalıştırılamadı"**
durumunun kapanmış olmasıdır. Docker olmayan bir ortamda Postgres 16.14 kullanıcı alanına kurularak
migration'lar uygulandı ve API test paketi **ilk kez uçtan uca koşturuldu.**

İlk koşuda **3 test kırmızı çıktı.** Üçü de Sonnet'in "doğrulanamayan" diye işaretlediği eşzamanlılık
testleriydi ve **gerçek bir üretim hatasını** ortaya çıkardılar: IDEM-01 ve EVENT-01'in
eşzamanlı-yarış kurtarma yolları hiçbir zaman devreye girmiyordu — yani 4.1 ve 4.2'nin bu yarısı
**yazıldığı hâliyle ölü koddu.** Düzeltildi; şu an 260/260 test yeşil.

Toplam **9 bulgu**; 5'i bu oturumda düzeltildi, 4'ü karara bağlandı ve açık bırakıldı.

**Pilot readiness kararı:** `docs/2026-08-03-YAPILACAKLAR.md` Faz 8'deki **PILOT-01 (tek tenant,
kendi firmamız) için kod tarafı hazır**; **PILOT-02 / ikinci tenant için hazır değil.** Ayrıntı §5.

---

## 1. Denetim ortamı — 0.3'ün kapanması

Sandbox'ta `docker` yok ve root yetkisi yok; `apt-get`, `ports.ubuntu.com` proxy'de 403 aldığı için
paket kurulumu da mümkün değil. Çözüm: Postgres binary'lerini **npm üzerinden** getirmek.

```
npm i @embedded-postgres/linux-arm64@16.14.0-beta.17   # docker-compose'daki postgres:16 ile aynı major
initdb -D /tmp/pgdata -U verimaya
postgres -D /tmp/pgdata -p 5433                        # docker-compose ile aynı port
# + docker/postgres/init-app-role.sh'ın SQL eşdeğeri (verimaya_app, NOSUPERUSER NOBYPASSRLS)
```

Sonuç:

| Komut | Sonuç |
|---|---|
| `drizzle-kit migrate` | **başarılı** — 0000–0022 arası tüm migration'lar, elle yazılan 0019/0020/0021/0022 dahil |
| `vitest run` (apps/api) | **63 dosya / 260 test yeşil** (düzeltmelerden sonra) |
| `vitest run` (packages/shared) | 57 test yeşil |
| `vitest run` (apps/web) | 3 dosya / 23 test yeşil |
| `tsc --noEmit` (api, shared) | temiz |
| `svelte-check` (web) | 0 error / 0 warning |
| `prettier --check` + `eslint` (web) | temiz (F-05 düzeltildikten sonra) |
| `vite build` (web) | başarılı (F-09 düzeltildikten sonra) |

**Redis kurulamadı.** npm/PyPI'da çalıştırılabilir bir redis binary'si yok, kaynak indirme yolları
(github/redis.io) proxy'de kapalı. Dolayısıyla **5.2'nin queue readiness smoke testi bu ortamda
koşturulamadı** — tek doğrulanamayan test dosyası budur ve zaten CI'da (gerçek `redis:7-alpine`
service'iyle) koşacak şekilde yazılmıştır. Bkz. §6 runbook.

> **Not:** 0.3'ün kutusu bu raporla kapanıyor. Bundan sonra herhangi bir oturumda DB'li doğrulama
> yapmak için yukarıdaki üç satır yeterli — Docker gerekmiyor.

---

## 2. Bulgular

### F-01 — `isUniqueViolation` hiçbir 23505'i tanımıyordu (P1, **düzeltildi**)

**Kanıt:** üç eşzamanlılık testi de ham `DrizzleQueryError` ile 500 veriyordu. Enstrümantasyon:

```
DBG caught DrizzleQueryError code= undefined causecode= 23505 match= false
```

drizzle-orm ≥0.44 her sürücü hatasını `DrizzleQueryError` ("Failed query: …") içine sarar ve gerçek
postgres.js hatasını **`cause` zincirinde** taşır. `apps/api/src/common/postgres-errors.ts` yalnız
hatanın kendi `code`/`constraint_name` alanlarına bakıyordu → her zaman `false` → IDEM-01'in ve
EVENT-01'in `catch` blokları **hiç çalışmıyordu.**

Bu, 4.1 ve 4.2'nin Görüş'lerinde "kod doğru ama DB'siz kanıtlanamaz" denen tam noktadır; kod doğru
değildi. Sadece testler koşturulabilseydi ilk denemede yakalanırdı — bu, 0.3'ün neden gerçek bir
engel olduğunun en somut kanıtı.

**Düzeltme:** `isUniqueViolation` artık `cause` zincirini geziyor (derinlik sınırı 8). Sürücü
doğrudan fırlatsa da, drizzle sarmalayıcıyı kaldırsa da çalışır.

### F-02 — Webhook spec'lerinin test harness'ı üretimi sadık modellemiyordu (P2, **düzeltildi**)

`webhooks.waha.spec.ts` ve `webhooks.provider.spec.ts` kendi `withTenant` sahtesini yazıyor ve
**session** ömürlü `set_config('app.current_tenant_id', …, false)` kullanıp `finally` bloğunda
paylaşılan havuzdaki bağlantıda tenant'ı siliyordu. Eşzamanlı senaryoda başka bir isteğin sorgusu
tenant'sız bir bağlantıya düşüp RLS tarafından boş döndürülebiliyordu — yani test, üretimde olmayan
bir hatayı üretiyor, üretimde olan bir hatayı ise maskeleyebiliyordu.

Üretimdeki `TenantContextService` **transaction** ömürlü `SET LOCAL` kullanır ve repo'daki diğer
20+ isolation spec'i de öyle; bu iki dosya tek istisnaydı.

**Düzeltme:** her iki spec artık sahte yerine gerçek `TenantContextService`'i örnekliyor;
test-tarafı okuma yardımcısı da `sql.begin` + `set_config(..., true)`'ya geçirildi.

### F-03 — Idempotency ve webhook dedup'ı handler'ı iki kez çalıştırıyordu (P1, **düzeltildi**)

F-01 düzeltildikten sonra 500'ler bitti ama IDEM-01 testi hâlâ kırmızıydı: `expected 2 to be 1`.
Salt select-then-insert deseninde iki eşzamanlı istek de "yok" görür, **ikisi de handler'ı
çalıştırır**, kaybedenin transaction'ı geri alınır. Dışarıdan bakınca sonuç doğru görünür (tek satır,
tek yanıt) ama handler'ın **DB dışı** yan etkisi (dış API çağrısı, e-posta, kuyruk job'ı) iki kez
gerçekleşir. Webhook tarafında aynı desen `enqueueDefaultJob`'ın ikinci kez çağrılması riskini
taşıyordu — queue-first akışın tam da engellemesi gereken şey.

**Düzeltme:** her iki yolda da transaction-ömürlü advisory lock:

```ts
pg_advisory_xact_lock(hashtextextended(<kimlik>, 0))
```

Kimlik idempotency'de `tenant|key|method|normalized_path`, webhook'ta `tenant|provider|external_id`.
İkinci istek birincinin commit'ini bekler, sonra replay/duplicate satırını görür. Kilit
commit/rollback ile otomatik bırakılır, kapsam yalnız o kimliktir (genel bir kuyruk oluşturmaz).
F-01'in düzelttiği 23505 yakalama yolu **ikinci savunma hattı olarak korundu.**

### F-04 — Spec dosyaları hiç typecheck edilmiyor (P2, **açık bırakıldı**)

`apps/api/tsconfig.json` → `"exclude": [..., "src/**/*.spec.ts"]`. Yani `pnpm --filter @verimaya/api
check` (ve dolayısıyla CI) test dosyalarındaki tip hatalarını **hiç görmüyor.** Exclude kaldırılıp
çalıştırıldığında **24 dosyada 101 tip hatası** çıkıyor (62'si tek başına
`controller-permissions.spec.ts`'te).

Bu, 2.4'ün Görüş'ünde "önceden bilinen repo kısıtı" diye geçiliyordu; sayısı ölçüldü. Hataların
tamamı test-içi tip gevşekliği (eksik fixture alanları, `as` dönüşümleri) — testler koşuyor ve
geçiyor, üretim kodunu etkilemiyor. Ama F-02'nin harness hatası tam olarak bu boşlukta yaşayabildi.

**Karar:** şimdi düzeltilmedi (101 hatayı kapatmak Faz 7 kapsamının çok dışında, ayrı bir `test:`
adımı hak ediyor). Bu oturumda değiştirilen üç spec dosyasının exclude kaldırılmış hâlde de **temiz**
olduğu ayrıca doğrulandı. Öneri: Faz 9 olarak açılsın, tek commit'te kapatılsın.

### F-05 — `changelog/+page.svelte` Prettier'a uymuyordu → CI kırmızı doğacaktı (P2, **düzeltildi**)

6.4 commit'i (`32ee3c1`) formatlanmamış bir dosya bıraktı. Tek başına zararsızdı; ama 5.1 CI'a
`pnpm --filter @verimaya/web lint` (`prettier --check` dahil) eklediği için **ilk push'ta build
kırmızı olacaktı.** `prettier --write` ile düzeltildi.

### F-06 — TIME-01'in kaçırdığı son üretim yüzeyi (P2, **düzeltildi**)

`apps/api/src/patients/patients.service.ts:495` (denetim öncesi):

```ts
const datePart = appt.startsAt.toISOString().slice(0, 10);
```

3.3'ün Görüş'ünde "patients.service satır etiketindeki slice kapsam dışı bırakıldı" deniyordu.
Ama `starts_at` bir `timestamptz` ve bu, hasta dosyasındaki randevu bağlantı etiketini üretiyor:
Europe/Istanbul'da **yerel 4 Ağustos 01:00 = UTC 3 Ağustos 22:00** → etikette bir gün geriye kayma.
TIME-01'in kapatmayı amaçladığı hatanın birebir aynısı, sadece başka bir ekranda.

**Düzeltme:** `toTenantDayKey(appt.startsAt, timezone)`; timezone RLS altında `tenants` satırından
okunuyor. Ayrıca `packages/shared` içine `DEFAULT_TENANT_TIMEZONE` sabiti eklendi (dört yerde
tekrarlanan `'Europe/Istanbul'` literal'i için tek kaynak).

Kalan `toISOString().slice(0, 10)` kullanımları denetlendi ve **kabul edildi**: ad-metrics /
Google / Meta adaptörleri (sağlayıcı sözleşmesi gereği UTC gün anahtarı) ve
`apps/web/src/lib/mocks/data.ts` (yalnız demo fixture üretimi).

### F-07 — Bull Board token'ı sabit zamanlı karşılaştırmıyordu (P2, **düzeltildi**)

`docs/TEHDIT-MODELI.md` madde 3, bu düzeltme için **"şimdi"** kararı vermişti; 1.3 belge adımı
olduğu için kod değiştirilmemiş, sonraki fazlarda da kimse almamıştı. `bull-board.mount.ts:31`
`header === expected` kullanıyordu — erken çıkışlı, karakter karakter timing sızdırır.
`node:crypto.timingSafeEqual` ile değiştirildi (uzunluk farkında da sahte bir karşılaştırma yapılıp
`false` dönüyor, böylece uzunluk da sızmıyor).

### F-08 — MONEY-02 "yalnız server aggregate" kriteri kısmen karşılanıyor (P2, **açık bırakıldı**)

3.2'nin kabul kriteri "Tüm finansal kart ve özetler **yalnız** server aggregate endpoint'lerinden
beslensin. Client'ta toplama yok." `apps/web/src/routes/reports/+page.svelte` gerçekte
**server-öncelikli, sessiz client fallback'li:**

```ts
const totals = $derived.by(() => {
    if (summaryQuery.data) return { ...summaryQuery.data };
    return clientTotals;              // limit:100 ile çekilen KISMİ listeden hesap
});
```

Aynı desen aylık grafikte de var (`monthlyQuery` yoksa `filteredTx`'ten). Sonuç: aggregate endpoint
hata verirse veya henüz yüklenmemişse, ekran **≤100 işlemden hesaplanmış yanlış toplamları doğru
gibi gösterir.** `fxSkipped` sayacı da her koşulda kısmi listeden.

**Karar:** bu denetim pasında düzeltilmedi — 900+ satırlık rapor şablonunda `totals`'ı nullable
yapmak tarayıcı doğrulaması olmadan riskli, ve hata yalnız aggregate endpoint düştüğünde görünür.
**Önerilen düzeltme (ayrı adım):** fallback kaldırılsın; `summaryQuery` yüklenmemiş/hatalıysa kart
sayı yerine yükleniyor/hata durumu göstersin. "Sessizce yanlış" yerine "görünür şekilde eksik".

### F-09 — CI'ın yeni "Web production build" adımı temiz checkout'ta kırılırdı (P1, **düzeltildi**)

`packages/shared/package.json` exports'u production koşulunda `./dist/index.js`'e çözülüyor ve
`dist/` gitignore'da. CI hiçbir yerde `@verimaya/shared build` çalıştırmıyor. Temiz bir checkout'ta
5.1'in eklediği adım şununla kırılıyor:

```
[vite]: Rolldown failed to resolve import "@verimaya/shared"
    from "apps/web/src/routes/marketing/calculator/+page.svelte"
```

Yerelde geçmesinin tek sebebi eski bir `dist/` klasörünün duruyor olması — bu, 5.1'in
"yerelde web build temiz" kanıtının neden yanıltıcı olduğunu da açıklıyor.

**Düzeltme:** CI'a `Shared build` adımı eklendi (shared tests ile API migrate arasında). Boş `dist/`
ile yeniden üretilip doğrulandı: `vite build` → `rc=0`, `Wrote site to "build"`.

---

## 3. Kabul kriterlerinin doğrulanması

İddiaya değil, koda/teste bakılarak.

| Adım | Kabul kriteri | Doğrulama | Sonuç |
|---|---|---|---|
| 1.1 WEBHOOK-01 | tenant provider eşlemesinden çözülür | `webhooks.controller.ts:72` hâlâ `request.headers['x-tenant-id']`; `tenant_provider_identities` tablosu yok | **AÇIK** (başlanmadı) |
| 1.2 LEG-01 | flag yokken 503 + form DOM'da yok | `karne.controller.spec.ts` 5 test yeşil; `gate.ts`'in üç fonksiyonu `bb6aca2^` sürümündeki inline koşullarla **birebir** eşleşiyor (diff ile karşılaştırıldı) | **GEÇTİ** |
| 1.3 | dört başlıkta karar satırı var | `docs/TEHDIT-MODELI.md` okundu; madde 3'ün "şimdi" kararı uygulanmamıştı → F-07 | **GEÇTİ** (F-07 ile) |
| 2.1 CONTRACT-01 | her filtre testli, bilinmeyen param 400 | `contract-parity.isolation.spec.ts` + üç isolation spec'i gerçek Postgres'te yeşil | **GEÇTİ** |
| 2.2 CONTRACT-02 | 4 kaynak × (filtre + cursor) iki backend'de aynı | MSW yarısı 9 test, API yarısı gerçek DB'de yeşil | **GEÇTİ** |
| 2.3 CACHE-01 | kapsamsız key kalmadığı grep ile | `grep -rn "queryKey:\s*\[" \| grep -v "keys\."` → yalnız `me-query.ts` ve `dev/+page.svelte`, ikisi de belgelenmiş kasıtlı istisna | **GEÇTİ** (runtime org-switch doğrulaması hariç, §6) |
| 2.4 TEST-01 | A token'ı B verisini list/get/update/delete edemiyor | üç spec gerçek RLS altında yeşil; DELETE/GET uçları kodda **yok** — kapsam sapması dosya başlarında belgelenmiş | **GEÇTİ** (kabul edilen sapma) |
| 3.1 MONEY-01 | aynı key iki kez → tek set; kısmi hata → rollback | `approve-drafts.isolation.spec.ts` yeşil; F-03 sonrası handler gerçekten tek kez koşuyor | **GEÇTİ** |
| 3.2 MONEY-02 | kart/detay/export aynı toplam | 9 isolation testi yeşil; ama client fallback duruyor → F-08 | **KISMİ** |
| 3.3 TIME-01 | iki timezone testi + slice deseni kalmamış | 10 unit test yeşil; kalan bir üretim yüzeyi bulundu → F-06 | **GEÇTİ** (F-06 ile) |
| 4.1 IDEM-01 | aynı key farklı path'te yanlış replay yapmıyor | `idempotency.isolation.spec.ts` 5 test yeşil; `idempotency-coverage.spec.ts` 53 mutating handler'ın hepsinde politika buluyor | **GEÇTİ** (F-01/F-03 ile) |
| 4.2 EVENT-01 | cross-tenant iki kayıt, aynı tenant tek kayıt, 500 yok | `webhooks.provider.spec.ts` + `webhooks.waha.spec.ts` yeşil | **GEÇTİ** (F-01/F-03 ile) |
| 5.1 CI-01 | CI tüm kapıları temiz geçiyor | F-05 ve F-09 olmadan geçmezdi; ikisi de düzeltildi | **GEÇTİ** (F-05/F-09 ile) |
| 5.2 CI-02 | ready 200 + job completed | Redis kurulamadı — **yalnız CI'da doğrulanabilir** | **DOĞRULANMADI** |
| 5.3 a11y | `svelte-check` 0 uyarı + kontrast değerleri | 0/0; yedi kontrast oranının **hepsi** bağımsız hesaplandı, Görüş'teki değerlerle iki ondalığa kadar aynı | **GEÇTİ** |
| 6.1–6.4 | doküman senkronu | `/vitrin` aktif rota olarak geçmiyor; `(public)/vitrin` kaynak dosyası prerender + `hub.html` kopyası için **kalmalı** (`inject-spa-noindex.mjs:12,34`) — 6.1'in sorusu böyle cevaplanıyor | **GEÇTİ** |

### RLS — bağımsız doğrulama

Gerçek şemaya karşı `pg_class` / `pg_policy` sorgusu:

- `tenant_id` kolonu olan **25 tablonun 25'inde** RLS açık ve en az bir policy var. Boşluk yok.
- `tenant_id` olmayan 12 tablo: better-auth (`user`, `session`, `account`, `verification`, `member`,
  `organization`, `invitation`, `two_factor`), karne public tabloları, `tenants`. Tehdit modelindeki
  liste ile **birebir** aynı.
- `verimaya_app`: `rolsuper=false`, `rolbypassrls=false` — doğru.
- `verimaya_app`'in better-auth tablolarındaki yetkisi: hepsinde **SELECT+INSERT+UPDATE+DELETE**,
  RLS yok. Tehdit modeli madde 2'nin iddiası **doğrulandı** (varsayım değil, ölçüldü).

---

## 4. Varsayımların karara bağlanması

Sonnet'in Görüş satırlarındaki her "varsayım"/kapsam sapması:

| # | Varsayım | Karar |
|---|---|---|
| 0.2 | `HubHome.svelte`'de `<\/script>` kaçışı + iki `eslint-disable` | **KABUL.** JS'te `\/ == /`, üretilen JSON-LD string'i değişmiyor; statik içerik, kullanıcı girdisi yok. |
| 0.2 | `let x: T \| null` initializer'sız daraltmalar her path'te atanıyor | **KABUL.** `tsc --noEmit` strict + `strictNullChecks` açık ve temiz — derleyici zaten kanıtlıyor. |
| 0.4 | gitleaks lokalde çalıştırılamadı | **AÇIK.** Bu ortamda da doğrulanamadı (GitHub release indirme kapalı). İlk push'ta Actions'ta görülecek. Kutu `[~]` kalmalı. |
| 1.3 | better-auth RLS eksikliği "kabul edilen risk" | **ŞARTLI KABUL.** Yalnız tek tenant için. **PILOT-01 ikinci bir org (demo/test dahil) yaratırsa bu karar bozulur** — §5'te kapı koşulu yapıldı. |
| 2.1 | Faz 1 açıkken 2.1'e başlamak | **KABUL.** WEBHOOK-01 (inbound webhook auth) ile CONTRACT-01 (authenticated list) ayrı yüzeyler; sıralama süreç amaçlıydı, teknik ön koşul değil. Doğru yorum. |
| 2.1 | `drizzle-kit generate` bozuk → migration elle yazıldı | **KABUL + DOĞRULANDI.** 0019–0022 gerçek Postgres'e temiz uygulandı. Kök neden (eksik `meta/` snapshot zinciri) repo'nun mevcut durumu, bu adımların sorunu değil. |
| 2.2 | cursor token formatı bilerek eşitlenmedi | **KABUL.** Web `next_cursor`'ı hiç parse etmiyor (grep ile doğrulandı) — opak token, byte eşitliği sözleşme gereği değil. |
| 2.2 | `msw/node` için `location` polyfill'i | **KABUL.** Yalnız Node test ortamında devreye giriyor, tarayıcı davranışı değişmiyor. |
| 2.3 | iki kapsamsız query key (`me`, `dev`) | **KABUL.** `me` scope'u üreten sorgu (kendini kapsayamaz); `dev` süper-admin paneli, tasarım gereği başka tenant'ları listeler. Kapsamak burada hata olurdu. |
| 2.4 | DELETE/GET uçları olmadığı için test edilmedi | **KABUL.** Var olmayan uç test edilemez; dosya başlarında belgelenmiş. DELETE eklenirse test de eklenmeli — F-04 ile aynı takip listesine. |
| 3.1 | `approve-drafts` izni `finance.create` | **KABUL.** Geri döndürülemez etki para yazmak; inbox durum geçişi aynı kullanıcı eyleminin muhasebe yan etkisi. `patient.update`'i de zorunlu kılmak finans rolünü akışı tamamlayamaz hale getirirdi. |
| 3.1 | tenant varsayılan kur tablosu yok, kullanıcı girer | **KABUL.** Sessiz varsayılan kur, MONEY-01'in kapattığı hatanın ta kendisiydi. Kur tablosu ayrı bir ürün kararı. |
| 3.1 | manuel yapıştırma atomik endpoint'e giremez | **KABUL.** Atomiklik inbox kaydına bağlı; kuyruk seçimini zorunlu kılmak doğru kısıt. |
| 3.1 | karşı taraf serbest metin `contact_label` | **KABUL, ama not:** 3.2 bakiyeleri `contact_id` bazında hesaplıyor → yalnız `contact_label` ile yazılan işlemler bakiye ekranından **düşüyor**. Bilinçli, ama pilotta ölçülmeli (kaç işlem `contact_id`'siz kalıyor). |
| 3.2 | kategori drill-down hâlâ lokal `limit:100` | **AÇIK** → F-08. |
| 3.3 | ad-metrics UTC gün anahtarı bilinçli | **KABUL.** Sağlayıcı sözleşmesi UTC; tenant TZ'ye çevirmek veriyi bozardı. |
| 3.3 | heuristic parse varsayılanı Europe/Istanbul | **KABUL** (tenant TZ'ye bağlanması ucuz bir iyileştirme, acil değil). |
| 3.3 | `patients.service` slice kapsam dışı | **REDDEDİLDİ** → F-06, düzeltildi. |
| 4.1 | eski `idempotency_keys` satırları truncate edilmedi | **KABUL.** Yeni index eskisinin üst kümesi, çakışma imkânsız; key'ler tek kullanımlık taze UUID. |
| 4.1 | `scorecard.startBaseline` + `whatsapp.createCorrection` ertelendi | **KABUL.** İkisi de düşük hacimli, finansal olmayan; kod içi TODO'ları duruyor. `startBaseline` PILOT-02'de gerçek kullanıma girerse önce bağlanmalı. |
| 4.2 | yarış testlerinde yapay gecikme yok | **KABUL — ve artık gereksiz.** F-03'ten sonra advisory lock yarışı deterministik olarak seri hale getiriyor; testler gecikme olmadan da gerçek yarışı kanıtlıyor (F-01/F-03'ü yakaladılar). |
| 4.2 | `inbound_messages` tarafına kapsam dışı sağlamlaştırma | **KABUL.** Aynı dosyada aynı hata sınıfı; tutarlılık doğru tercih. |
| 5.1 | "kasten kırma" denemesi yapılmadı | **REDDEDİLDİ** → F-05 ve F-09 tam olarak bu yüzden gözden kaçtı. Bir kapı eklendiğinde en az bir kez temiz checkout'ta koşturulmalı. |
| 6.2 | pilotta özellik yok → çoğu `kod-hazir` | **KABUL.** PILOT-01 başlayınca ilgili satırlar `pilotta`'ya geçmeli. |
| 6.4 | Ads `harici-onay-bekliyor` mı `kod-hazir` mı | **KARAR: `harici-onay-bekliyor` doğru.** OAuth kodu hazır ama kullanıcı için değerin ön koşulu Google/Meta hesap onayı (OPS-02). Kullanıcıya "hazır" demek yanlış sinyal. |

---

## 5. Pilot readiness — dört kapı

### Kapı 1 — Güvenlik: **KIRMIZI (tek tenant için sarı)**

- **WEBHOOK-01 (1.1) açık.** Tenant hâlâ `X-Tenant-Id` başlığından çözülüyor, HMAC yalnız
  `${timestamp}.${rawBody}` imzalıyor. Sağlayıcı secret'ını bilen taraf başlığı değiştirip **başka
  tenant'a yazabilir.** Tek tenant varken sömürülecek "başka tenant" yok; ikinci tenant'la birlikte
  bu canlı bir açık hale gelir.
- better-auth tablolarında RLS yok, `verimaya_app` tam CRUD sahibi (ölçüldü). Aynı mantık: tek
  tenantta hasar yüzeyi sınırlı.
- SEC-01'in kalan yarısı (OAuth client secret rotasyonu) ve LEG-02 Faz 8'de, kod dışı.
- Düzelen: F-07 (timing), F-01/F-03 (yarış → 500 ve çift yan etki).

### Kapı 2 — Veri doğruluğu: **YEŞİL**

RLS 25/25 doğrulandı; tenant izolasyonu, filtreler, cursor, parity, idempotency ve para akışı gerçek
Postgres'e karşı 260 testle yeşil. Kalan tek çekince F-08 (aggregate düşerse rapor sessizce kısmi
toplam gösterir) — pilot ölçeğinde (≤100 işlem) görünür bir fark üretmez, ama pilot **büyürken**
kapatılmalı.

### Kapı 3 — Operasyon: **SARI**

- CI artık gerçekten yeşil olabilir (F-05, F-09 düzeltildi) ama **hiç koşmadı** — bunu ilk push
  doğrulayacak.
- 5.2 queue smoke ve 0.4 gitleaks yalnız CI'da doğrulanabilir.
- OPS-01 (sunucu dışı yedek) Faz 8'de açık ve **PILOT-01'in bağımlılığı.**

### Kapı 4 — Kullanıcı kabulü: **DEĞERLENDİRİLMEDİ**

Kod dışı; MARKET-01/02 ve PILOT-02'ye bağlı.

### Karar

> **PILOT-01 (kendi firmamız, tek tenant) için kod tarafı HAZIR** — şu üç koşulla:
> 1. CI ilk push'ta yeşil geçmeli (5.2 smoke + 0.4 gitleaks orada doğrulanacak).
> 2. OPS-01 (sunucu dışı yedek) tamamlanmalı — zaten PILOT-01'in bağımlılığı.
> 3. **ETL/seed sırasında DB'de ikinci bir organizasyon yaratılmamalı** (demo/test org'u dahil).
>    Yaratılırsa 1.3'ün "kabul edilen risk" kararı bozulur ve WEBHOOK-01 canlı açığa dönüşür.
>
> **PILOT-02 ve ikinci tenant için HAZIR DEĞİL.** Ön koşul: WEBHOOK-01 (1.1) kapanmalı; better-auth
> RLS kararı yeniden değerlendirilmeli; F-08 kapatılmalı.

---

## 6. Atalay'ın çalıştırması gerekenler

### 6.1 CI doğrulaması (en yüksek öncelik)

Bu commit'ler push edildikten sonra GitHub Actions'ta:

- `secret-scan` job'ı çalıştı mı? (0.4'ün kabul kriteri — kutusu hâlâ `[~]`)
- `Shared build` → `Web production build` zinciri geçti mi? (F-09)
- `API tests` içinde `queue-readiness.smoke.spec.ts` **2/2 geçti mi**? (5.2'nin tek doğrulaması)

Üçü de yeşilse 0.4 `[x]`, 5.2 doğrulanmış olur.

### 6.2 Tarayıcı tabanlı kontroller (bu ortamda yapılamaz)

```bash
pnpm --filter @verimaya/shared build
pnpm --filter @verimaya/web build
pnpm --filter @verimaya/web preview          # http://localhost:4173
npx @axe-core/cli http://localhost:4173 --exit
npx lighthouse http://localhost:4173 --only-categories=accessibility --view
```

Elle bakılacaklar (5.3'ün kod tarafı doğrulandı, davranışı doğrulanmadı):

1. **Dialog:** aç → ilk odaklanabilir öğeye odak düşüyor mu; Tab/Shift+Tab dialog içinde kalıyor mu;
   Esc kapatıyor mu; kapanınca odak **tetikleyen butona** dönüyor mu.
2. **Command palette:** aynı dört madde + `aria-live` durum metni ekran okuyucuda duyuluyor mu.
3. **Scorecard 0–4:** ok tuşlarıyla gezilebiliyor mu; seçili seçenek `aria-checked` ile duyuluyor mu.
4. **Kontrast:** hesaplanan değerler doğrulandı, ama gerçek render'da `--brand-text`'in her
   kullanıldığı yerde `bg-brand-subtle` üstünde olduğunu Lighthouse teyit etsin.

### 6.3 Tenant switch chaos testi (bu ortamda yapılamaz)

Gerçek `better-auth` oturumu gerektirir. Aynı sekmede org A → org B geçişinde:

- A'nın hiçbir kaydı görünmüyor mu (30 sn stale penceresi içinde bile)
- `localStorage` / `sessionStorage` / service worker cache'inde A'ya ait kalıntı var mı
- Hızlı A→B→A geçişinde yanlış scope'lu bir istek uçuyor mu

Kod tarafı savunma derinliği doğrulandı (`resetQueryScope`: `cancelQueries` → `clear`, artı
kapsamlı key'ler); **runtime davranışı doğrulanmadı.**

### 6.4 Yerelde DB'li doğrulama (Docker olmadan)

```bash
npm i -g @embedded-postgres/linux-arm64@16.14.0-beta.17   # veya kendi platformun
# initdb + postgres -p 5433, sonra:
pnpm --filter @verimaya/api db:migrate
pnpm --filter @verimaya/api test
```

Docker varsa `docker compose up -d` her zaman daha basit.

---

## 7. Bu oturumda değişen dosyalar

**Kod düzeltmeleri (F-01, F-03, F-06, F-07, F-09):**

- `apps/api/src/common/postgres-errors.ts` — `cause` zinciri gezme
- `apps/api/src/common/idempotency.service.ts` — advisory lock
- `apps/api/src/webhooks/webhooks.controller.ts` — iki ingest yolunda advisory lock
- `apps/api/src/patients/patients.service.ts` — tenant TZ gün anahtarı
- `apps/api/src/queue/bull-board.mount.ts` — `timingSafeEqual`
- `packages/shared/src/tenant.ts` — `DEFAULT_TENANT_TIMEZONE`
- `.github/workflows/ci.yml` — `Shared build` adımı

**Test harness düzeltmesi (F-02):**

- `apps/api/src/webhooks/webhooks.waha.spec.ts`, `apps/api/src/webhooks/webhooks.provider.spec.ts`

**Format (F-05):**

- `apps/web/src/routes/changelog/+page.svelte`

**Commit edilmemiş Faz 5 çalışmasının commit'lenmesi:**

- `b9782dc ci: CI-01 + CI-02 …` — `.github/workflows/ci.yml`, `package.json`,
  `apps/api/src/health/queue-readiness.smoke.spec.ts`
- `02bf99b fix: 5.3 a11y …` — 12 web dosyası

**Ayrıca:** `.git/` içinde önceki oturumlardan kalan 30+ artık kilit dosyası
(`index.lock.bak*`, `HEAD.lock`, `refs/heads/main.lock.*`) `.git/f7-trash/`'e taşındı. Bunlardan
biri (`refs/heads/main.lock.f7-*`) git'in "bad object" uyarısı vermesine yol açıyordu. Mount
üzerinden `unlink` yetkisi olmadığı için silinemedi; **`.git/f7-trash/` klasörü senin makinende
elle silinebilir.**

---

## 8. Takip listesi (yeni açılması önerilen)

| Kod | Konu | Öncelik |
|---|---|---|
| 1.1 | WEBHOOK-01 — ikinci tenant öncesi zorunlu | **P0** |
| F-08 | Rapor ekranında sessiz client fallback'i kaldır | P2 |
| F-04 | `apps/api/tsconfig.json` spec exclude'unu kaldır, 101 tip hatasını kapat | P2 |
| — | `whatsapp.createCorrection` + `scorecard.startBaseline` idempotency'e bağla (gerçek çağıran çıkarsa) | P3 |
| — | Üç kaynağa DELETE eklenirse 2.4 spec'lerine izolasyon testi ekle | P3 |
| — | `contact_label`-only işlemlerin oranını pilotta ölç (bakiyeden düşüyorlar) | P3 |
