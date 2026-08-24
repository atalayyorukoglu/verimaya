# @verimaya/waha-relay

WAHA → Verimaya webhook imzalama aracı.

## Neden var

WAHA webhook'a yalnız **sabit** başlık ekleyebiliyor. Verimaya ise her istekte taze
timestamp ve `${ts}.waha.${tenantId}.${gövde}` üzerinden hesaplanmış HMAC istiyor
(WEBHOOK-01). WAHA bunu üretemez; aradaki farkı bu araç kapatıyor.

```
WhatsApp → WAHA → waha-relay → POST /v1/webhooks/waha
```

Eski Tracker bu sorunu sabit token kabul ederek çözüyordu
(`whatsapp_webhook.py`). Verimaya'da o yol bilinçli olarak kapalı — WEBHOOK-01'in
tüm gerekçesi buydu.

## Ne yapıyor

1. WAHA'dan gelen isteği sabit token ile doğruluyor (`X-Webhook-Token`).
2. Payload'daki `session` alanından hangi firma olduğunu buluyor (`RELAY_SESSIONS`).
3. O firmanın secret'ıyla imzayı hesaplayıp başlıkları ekliyor.
4. Gövdeyi **bayt bayt aynen** iletiyor — tek karakter değişse imza tutmaz.
5. Verimaya'nın döndüğü durum kodunu aynen geri veriyor (WAHA'nın yeniden deneme
   mantığı buna bakıyor).

## Kurallar

- **Eşlenmemiş oturum iletilmez** (404). Yanlış firmaya mesaj yazmaktansa reddetmek.
- **Mesaj içeriği loglanmaz.** Bu bileşen ham hasta verisi görüyor — `pii-mask.ts`
  kapısının önünde duruyor. Yalnız oturum, firma ve durum kodu loglanır.
- **Bağımlılık yok.** Sadece Node standart kütüphanesi.

## Firma ekleme

1. Secret üret: `openssl rand -hex 32`
2. `tenant_provider_identities` satırını aç (`docs/DEPLOY-COOLIFY.md` § WEBHOOK-01)
3. Aynı secret'ı `RELAY_SESSIONS`'a o oturum adıyla ekle
4. WAHA'da o oturumun webhook URL'ini bu araca yönlendir

## Test

```
pnpm --filter @verimaya/waha-relay test
```

`test/sign.test.mjs` içindeki "API tarafındaki kanon değişmemiş" testi, API'nin imza
kanonu değişirse kırmızıya döner — canlıda sessizce 401 almaktansa testte görmek için.
