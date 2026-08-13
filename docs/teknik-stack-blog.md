# Verimaya'nın mutfağı: bir WhatsApp mesajı, muhasebe kaydına nasıl dönüşüyor?

> Not: Bu yazı **çalışan bir sistemi** anlatıyor. Aşağıdaki her akış üretimde koşuyor,
> gerçek bir klinik verisiyle. Ölçümler pilot dönemine ait; henüz ikinci müşteri yok.

---

Diyelim ki saat 14:20. Klinik koordinatörünün WhatsApp'ına bir mesaj düşüyor:

> "Ayşe hanımın implant ödemesi geldi, 15.000 TL, havale"

Kimse panele girmiyor. Kimse form doldurmuyor.

14:21'de Verimaya'nın Finans ekranında bir **taslak işlem** beliriyor: tutar 15.000 ₺, tür gelir, kişi *Ayşe Yılmaz*, kategori *Tedavi*, durum *onay bekliyor*. Koordinatör bakıyor, doğru; onaylıyor. Kayıt defterine düşüyor.

Bu yazı o bir dakikada arka planda ne olduğunu anlatıyor.

---

## Ürün tek cümleyle

Sağlık turizmi acenteleri ve klinikleri için **çok kiracılı operasyon ve finans paneli**: kişiler, randevular, para, dosyalar ve reklam getirisi tek yerde.

Ayrım noktası şu: satış tarafı burada değil. Lead, pipeline, satış aşaması — hepsi GoHighLevel'da kalıyor. Verimaya **satış kapandıktan sonrası** ile ilgileniyor. Bu bir eksiklik değil, mimarinin en üst kararı; ürünün adı da oradan geliyor.

---

## Büyük resim: kim nerede duruyor?

| Katman | Ne | Ne iş yapıyor |
|--------|-----|----------------|
| Panel | **SvelteKit** | Kişiler, randevu, finans, raporlar |
| API | **NestJS + Fastify** | Sözleşmeli uçlar, guard'lar, idempotency |
| Sözleşme | **Zod** (`packages/shared`) | Tek şema; OpenAPI buradan üretilir |
| Veritabanı | **Postgres + RLS** | Kiracı yalıtımı satır seviyesinde |
| ORM | **Drizzle** | Şema + numaralı SQL migration |
| Kimlik | **better-auth** | Oturum, organizasyon, 2FA |
| Kuyruk | **BullMQ + Redis** | Senkron, sweep, webhook işleme |
| CRM | **GoHighLevel** | Kişi kaynağı — tek yönlü çekim |
| Reklam | **Meta + Google Ads** | Günlük harcama → ROAS |
| Mesaj | **WhatsApp (WAHA)** | Gelen mesaj → AI ayrıştırma |
| AI | **OpenAI-uyumlu istemci** | Mesajdan işlem taslağı |
| Dosya | **S3 / R2** | Presigned yükleme, imzalı indirme |
| E-posta | **Resend** | Şifre sıfırlama, bildirim |
| Barındırma | **Coolify @ Hetzner** | API + Postgres + Redis |
| Kenar | **Cloudflare** | DNS, TLS, gerçek istemci IP'si |
| Gözlem | **Sentry** + yapılandırılmış log | "Ne bozuldu, hangi kiracıda?" |

Panel statik bir imaj. API tek bir Nest süreci. **Asıl zorluk ise ne panelde ne API'de** — veritabanının kendisinde.

---

## Ayrım noktası: bu bir para ürünü, üstelik çok kiracılı

Bir RSS okuyucuda yanlış kullanıcıya yanlış haber göstermek can sıkıcıdır. Burada **A kliniğinin hastası B kliniğine görünürse** iş biter — hem hukuken hem ticari olarak.

Bu yüzden yalıtım uygulama katmanına bırakılmıyor. Postgres'in kendi satır güvenliği açık, üstelik zorlayıcı modda:

```sql
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;

CREATE POLICY contacts_tenant_isolation ON contacts
  FOR ALL
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
```

Uygulamanın kullandığı rol `NOBYPASSRLS`. Yani bir servis `WHERE tenant_id = ...` yazmayı unutursa sorgu yanlış veri döndürmüyor — **hiçbir şey** döndürmüyor.

Kiracı bağlamı da isteğin ömrüne değil, transaction'ın ömrüne bağlı:

```ts
db.transaction(async (tx) => {
  await tx.execute(sql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
  return fn({ db: tx });
});
```

Üçüncü parametre `true` — "yalnız bu transaction". `false` yazmak, bağlantı havuzundan gelen bir sonraki isteğe önceki kiracının kimliğini miras bırakır. Repo kuralı bunu tek cümleyle yasaklıyor ve testler kontrol ediyor.

Ve tenant'lı **her** endpoint'e negatif izolasyon testi zorunlu: "A, B'nin verisini göremez." Bugün 550'nin üzerinde testin epey bir kısmı sadece bunu kanıtlıyor.

---

## Senaryo 1: WhatsApp mesajı → taslak işlem

Baştaki mesaja dönelim.

1. **Webhook düşer.** WAHA mesajı `/v1/webhooks/...` ucuna gönderir. İmza doğrulanır — ve kiracı, istek gövdesinden **değil**, sağlayıcı kimliğinden çözülür. İstemcinin gönderdiği bir kiracı numarasına asla güvenilmez.
2. **Gelen kutusuna yazılır.** Ham mesaj `inbound_messages` tablosuna düşer. Bu noktada henüz hiçbir yorum yok.
3. **Kuyruğa iş atılır.** İşleme senkron değil; webhook'un görevi kabul etmek, yorumlamak değil.
4. **AI ayrıştırır.** İstemci mesajı okur ve yapılandırılmış bir taslak üretir: tutar, para birimi, tür, aday kişi, kategori.
5. **Taslak onay bekler.** Panelde bir kart olarak görünür. Onaylanana kadar defterde yoktur.

Beşinci adım ürünün en bilinçli kararı. **AI hiçbir zaman doğrudan muhasebe kaydı yazmıyor.** Taslak üretiyor, insan onaylıyor. Para söz konusuysa "genelde doğru" yeterli değil.

### Model düşerse ne oluyor?

Bir de yedek ayrıştırıcı var — düz kural tabanlı, modelsiz. Log şöyle görünüyor:

```
WARN [OpenAiCompatibleLlmClient] LLM parse failed, falling back to heuristic
```

Sağlayıcı yavaşlarsa, kotayı aşarsak veya cevap bozuk gelirse mesaj kaybolmuyor; daha kaba ama çalışan bir ayrıştırmayla taslak yine çıkıyor. Yapay zekâ bir bağımlılık, tek nokta değil.

### Düzeltmeler saklanıyor

Koordinatör taslağı düzeltirse — tutar yanlış okunmuşsa, kişi eşleşmemişse — hem orijinal hem düzeltilmiş hâl `ai_corrections` tablosuna yazılıyor. Bu, "AI iyileşiyor mu" sorusunun tek dürüst ölçüsü: düzeltme oranı zamanla düşüyor mu?

---

## Senaryo 2: GHL'den kişiler — ve kimin neye sahip olduğu

Kişiler Verimaya'da yaratılmıyor; GoHighLevel'da yaratılıyor. Panel onları çekiyor.

Çekim zamanlanmış bir iş. Son 7 günde güncellenmiş kayıtlara bakıyor, sayfa sayfa geziyor, her birini kiracının tablosuna yazıyor.

İşin ilginç kısmı çekim değil, **çakışma**. Aynı kişi iki yerde değişirse kim kazanır? Cevap kodda, tek bir dosyada:

```ts
export const GHL_CONTACT_FIELD_OWNERSHIP = {
  fullName: 'ghl',
  phone:    'ghl',
  email:    'ghl',
  status:   'ghl',
  notes:    'verimaya'
};
```

Ad, telefon, e-posta GHL'e ait — panel onları geri yazmaz. Notlar Verimaya'ya ait. Sahiplik ihlali bir yorum satırı değil, çalışma zamanında hata fırlatan bir fonksiyon.

Bunun pratik sonucu şu: panelde birinin adını değiştirirsen, bir sonraki senkronda geri döner. Kullanıcıya tuhaf gelir, mimariye gelmez — **isim tek bir yerde yaşıyor.**

Bu arada küçük bir ders: GHL kişiyi hem ayrı `firstName`/`lastName` alanlarıyla hem birleşik bir isim alanıyla veriyor. Bir süre birleşik olanı okuyup ilk boşluktan böldük. "Ancuta Monica / Naste-0" olması gereken kayıt "Ancuta / Monica Naste-0" oldu. Kaynak size zaten bölünmüş veri veriyorsa, onu birleştirip yeniden bölmeyin.

---

## Senaryo 3: Reklam parası → ROAS

Meta ve Google Ads bağlantıları OAuth ile kuruluyor; token'lar `tenant_credentials` tablosunda **AES-GCM ile şifreli** duruyor. Şifreleme anahtarı kaybolursa çözüm yok, yeniden bağlanmak gerekiyor — bu bilinçli.

Günlük harcama 6 saatte bir çekiliyor ve şu benzersizlik kısıtıyla yazılıyor:

```
unique (tenant_id, provider, date, campaign)
```

Bu tek satır, senkronun kaç kez koştuğunu önemsiz hâle getiriyor. Aynı günü on kez çekersen on kez üzerine yazar, satır sayısı artmaz. Go-live kabul kriterlerinden biri tam da bu: *"senkronu ikinci kez çalıştır, toplam değişmemeli."*

ROAS'ın diğer yarısı ise reklam tarafında değil, kişi tarafında: her kişinin bir **kaynağı** olmalı. Kaynak boşsa harcama biliniyor ama getiri bilinmiyor ve oran anlamsız. Bu yüzden panelde kaynak alanı zorunlu, hatta "Bilinmiyor" bile bir seçenek — boş bırakmak değil, bilmediğini söylemek.

---

## Ara not: neden her mutasyonda idempotency var?

Kullanıcı "Kaydet"e iki kez bastı. Ağ koptu, tarayıcı isteği tekrarladı. Mobil uygulama yeniden denedi.

Bir haber okuyucuda bu, mükerrer bir satır demek. Burada **15.000 TL'lik ikinci bir tahsilat** demek.

Bu yüzden mutasyon uçları `Idempotency-Key` başlığı bekliyor; aynı anahtar aynı sonucu döndürüyor, ikinci kez iş yapmıyor. Muaf tutulan uçlar var — ama muafiyet bir bayrak değil, **gerekçe yazmayı zorunlu kılan** bir dekoratör:

```ts
@IdempotencyExempt(
  'True upsert via onConflictDoUpdate — PUT replace semantics; ' +
  'repeat calls converge to the same stored value.'
)
```

Gerekçe yazmadan muafiyet alınamıyor. Bir test de kapsamı sayıyor, sessizce muaflaşan uç olmuyor.

---

## Senaryo 4: Dosyalar

Hasta dosyaları, röntgenler, sözleşmeler. Bunlar API üzerinden geçmiyor.

Panel önce bir **presigned URL** istiyor, dosyayı doğrudan depolamaya yüklüyor, sonra API'ye "yükledim" diyor. API dosyanın içeriğini hiç görmüyor; sadece metadata ve sahiplik kaydını tutuyor. İndirme de aynı şekilde, süreli imzalı bağlantıyla.

Yarım kalan yüklemeler için günlük bir süpürme işi var — onay gelmemiş kayıtları temizliyor.

---

## Veri modeli tek bakışta

- `tenants` — kiracı. Kimlik tarafındaki `organization` ile aynı `id`'yi paylaşıyor
- `contacts` — kişiler. Hasta, klinik, otel, transfer… hepsi **tek tablo**, tür bir sözlük satırı
- `contact_types` — kiracıya ait tür sözlüğü; acente "Hasta" yerine "Misafir" diyebilir
- `appointments` — randevu; kişiye, kliniğe, otele, transfere ayrı ayrı bağlanabiliyor
- `transactions` — para. Kişiye bağlı ama kişi silinse bile duruyor
- `files` — metadata; içerik S3'te
- `inbound_messages` + `ai_corrections` — mesaj ve AI'ın düzeltilme geçmişi
- `ad_metrics_daily` — kiracı × sağlayıcı × gün × kampanya
- `tenant_credentials` — şifreli OAuth sırları
- `audit_logs` — kim, ne zaman, neyi
- `data_deletion_requests` + `contact_data_deletion_requests` — KVKK talep defteri

Tek disiplin şu: **her tabloda `tenant_id` var ve her tabloda politika açık.** İstisna yok; olan istisna zaten bir açık demektir.

---

## Silme: hiçbir şey gerçekten silinmiyor

Kişi silindiğinde satır gitmiyor, `deleted_at` doluyor. Sebebi muhasebe: o kişiye bağlı 40.000 TL'lik işlem geçmişi duruyor ve durmak zorunda.

KVKK talebi geldiğinde ise farklı bir şey oluyor — **anonimleştirme**. Ad, soyad, telefon, e-posta ve serbest metin notlar maskeleniyor; mali kayıtlar ve kişi bağı olduğu gibi kalıyor. Kimlik gidiyor, defter kalıyor.

Dürüst olmak gerekirse burada kapatılmamış bir kenar var: personelin yazdığı vaka notlarının gövdesi ve yüklenen dosya adları hâlâ ad taşıyabiliyor. Bunu bilerek açık bıraktık — serbest metni bir betikle güvenle maskeleyemezsiniz, ve sağlık kaydı saklama yükümlülüğü silme hakkıyla çatışıyor. Karar hukukçuya bağlı, koda değil.

---

## Tek diyagramda akış

```text
[WhatsApp]        [GoHighLevel]      [Meta / Google Ads]
     │                   │                    │
     ▼                   │                    │
  webhook                │                    │
  (imza + kiracı         │                    │
   kimlikten çözülür)    │                    │
     │                   ▼                    ▼
     │            zamanlanmış çekim ──► BullMQ kuyruğu ◄── günlük harcama
     │                   │                    │
     ▼                   ▼                    ▼
inbound_messages    contacts            ad_metrics_daily
     │              (sahiplik: GHL)     (unique: kiracı+gün+kampanya)
     ▼
  AI ayrıştırma ──► düşerse ──► sezgisel yedek
     │
     ▼
 taslak işlem ──► 👤 insan onayı ──► transactions
     │                                    │
     └──► ai_corrections                  ▼
                                     raporlar / ROAS
                                          │
   ┌──────────────────────────────────────┘
   ▼
Postgres — her tabloda RLS, her transaction'da SET LOCAL
   │
   ▼
NestJS API ──► SvelteKit panel
```

---

## Neden bu kadar parça?

Çünkü ürün üç zor şeyi aynı anda istiyor:

1. **Yalıtım** — iki klinik aynı veritabanında yaşıyor ve birbirini asla göremiyor. Bu bir özellik değil, var olma şartı.
2. **Doğruluk** — para söz konusu. AI taslak üretir, insan onaylar; tekrarlanan istek ikinci kayıt açmaz; silinen kişi defteri bozmaz.
3. **Sahiplik** — kişi GHL'de, para Verimaya'da, reklam Meta ve Google'da yaşıyor. Her alanın tek bir sahibi var ve çakışma kuralı yorum satırında değil, kodda.

SvelteKit tek başına kiracı yalıtmaz; Postgres tek başına WhatsApp mesajı okumaz; model tek başına hangi kaydın kimin olduğunu bilmez. Birlikte, saat 14:20'de gelen bir mesajı 14:21'de onay bekleyen bir muhasebe taslağına çeviriyorlar.

Bir dahaki sefere Finans ekranında o taslak kartı gördüğünde arkasında bir imza doğrulaması, bir kuyruk işi, bir yedek ayrıştırıcı ve reddedilmeye hazır bekleyen bir onay adımı olduğunu bilmek… biraz sihirbozan, biraz da güven verici.
