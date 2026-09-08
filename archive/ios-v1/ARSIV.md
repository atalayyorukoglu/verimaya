# ios-v1 — arşiv (2026-09-08)

Bu klasör **kullanılmıyor.** İlk iOS denemesi; kullanıcı kararıyla bırakıldı,
yerine `apps/ios` altında sıfırdan yazılıyor. Silinmedi çünkü içinde işe yarayan
bilgi var: sözleşme eşleşmeleri, biçimler, çalışan testler.

Derlemek gerekirse: `cd archive/ios-v1 && xcodegen generate && open Verimaya.xcodeproj`

## Neden bırakıldı

Arayüz web paneline benzetilmeye çalışıldı ama tutmadı; üstüne birkaç kusur
üst üste bindi. Sıfırdan başlamak, yamamaktan temiz görüldü.

## Yeni sürümde tekrarlanmaması gereken hatalar

1. **Sayaçlar sunucudan okunmalı.** Liste yanıtı `items` + `next_cursor` +
   **`total_count`** döner. `CursorPage` modeli `total_count`'u hiç çözümlemiyordu,
   ekranda yüklü sayfanın uzunluğu yazıyordu — panel "51 kişi" derken uygulama
   "1 kişi" diyordu. Sayaç **her zaman** `total_count`.

2. **Süzgeçler sunucuda uygulanır.** `q`, `from`, `to`, `kind`, `status`,
   `type_id`, `appointment_type` — hepsi `packages/shared/src/list-query.ts`
   içindeki şemalarda tanımlı ve `.strict()`. Yüklü sayfayı istemcide süzmek
   yanlış sonuç verir. Boş değer göndermek 400 döndürür.

3. **Sunucuda "hasta" varlığı yok.** Herkes bir **kişi**: `/v1/contacts`.
   Hasta/klinik/otel ayrımı `contact_type` ile. `display_name` sunucuda
   ad+soyaddan türetilir, istekle gönderilmez. Yeni kişide `contact_type_id`
   zorunlu. Durum değerleri: `scheduled/arrived/treated/follow_up/cancelled`
   ve **opsiyonel** (yalnız Hasta tipinde dolu).

4. **`GET /v1/me` düz nesne döner** (`email`, `display_name`, `tenant_id`, …) —
   better-auth'un `user`/`session` sarmalayıcısı **yok**.

5. **`GET /v1/whatsapp/inbox` zarfı `items` değil `messages`.**

6. **Zaman aşımı şart.** `URLSession.shared` varsayılanı 60 sn; sunucu cevap
   vermeyince giriş ekranı o süre boyunca donuk kalıyordu. İstek 20 sn.

7. **Biçimler web ile aynı olmalı** (`apps/web/src/lib/format.ts`):
   para simgesi **başta** (`₺1.234,56`), tarih `4 Eyl 2026`, saat `16:30`.

8. **Ölü düğme koyma.** Karşılığı olmayan ekranın düğmesi hiç konmamalı.

## Ortam notları

- Yerel API **3001** portunda (`pnpm dev:api`), 3000 değil.
- Cihaza kurulum imzası: takım `7WF8S67UUW` (ALBION), joker profil, 2027'ye kadar.
  Kişisel takım `5F42K6674K` 7 günde bir doluyor.
- Ana ekrandan açılan uygulamada ortam değişkeni yoktur; sunucu adresi
  Info.plist'e gömülür.
- UI testleri canlı API ister; değişkenler `TEST_RUNNER_` önekiyle geçirilir
  (XCUITest koşucusu ayrı süreç).
- Prod `TRUSTED_ORIGINS` içinde `verimaya://ios` **var** (2026-09-07'de eklendi),
  yoksa cihazdan giriş 403 `INVALID_ORIGIN` alır.

## main'e push artık canlıyı kapatmıyor (2026-09-08'de düzeltildi)

Eskiden Coolify `main`'e her push'ta API'yi yeniden derliyordu — yalnız iOS
dosyası değişse bile — ve derleme boyunca `api.verimaya.com` birkaç dakika
cevap vermiyordu. Coolify'da **Advanced → Auto deploy = Manual deployments
only** yapıldı; tetikleme `.github/workflows/deploy-api.yml`'ye taşındı ve
yol süzgecine bağlandı (`apps/api/`, `packages/shared/`, `docker/`,
kilit/paket dosyaları). Ayrıntı: `docs/DEPLOY-COOLIFY.md`.
