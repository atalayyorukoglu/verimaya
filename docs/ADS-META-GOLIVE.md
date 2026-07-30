# Meta Ads go-live (Adım 38)

Kod hazır (`MetaAdsAdapter`, OAuth, `ad_metrics.sync`). Bu dosya **canlı doğrulama**
runbook’udur. Canlı kabul olmadan Adım 38 kapanmış sayılmaz.

> Bağımlılık: Coolify/API public URL (Adım 31). `ADS_OAUTH_REDIRECT_BASE` canlı API kökü olmalı.

## 1. Meta for Developers

1. [developers.facebook.com](https://developers.facebook.com/) → uygulama oluştur (Business / Marketing).
2. Ürün: **Marketing API** (veya Facebook Login + ads).
3. İzin: `ads_read`.
4. **Valid OAuth Redirect URIs:**

```text
{ADS_OAUTH_REDIRECT_BASE}/v1/integrations/ads/meta/callback
```

Örnek: `https://api.verimaya.app/v1/integrations/ads/meta/callback`

5. App ID + App Secret → Coolify / `.env` (aşağı).

## 2. Ortam değişkenleri (API)

| Key | Zorunlu | Not |
|---|---|---|
| `META_APP_ID` | evet | Meta App ID |
| `META_APP_SECRET` | evet | Coolify secret; **asla loglama** |
| `META_API_VERSION` | hayır | varsayılan `v21.0` |
| `ADS_OAUTH_REDIRECT_BASE` | evet | Public API kökü (`https://api…`) |
| `WEB_PUBLIC_URL` | evet | Callback sonrası dönüş (`https://app…`) |
| `TRUSTED_ORIGINS` | evet | Panel origin |
| `CREDENTIALS_ENCRYPTION_KEY` | evet | AES-GCM; kaybolursa reconnect gerekir |
| `ENABLE_INTEGRATION_SCHEDULERS` | go-live sonrası | `true` → 6s `ad_metrics.sync` |

`.env.example` alanları mevcut. Prod’da Coolify secret store kullan.

## 3. Uçtan uca akış

1. Panel → **Ayarlar → Bağlantılar → Reklamlar** (`/settings/connections/ads`).
2. Meta **Bağlan** → API `GET /v1/integrations/ads/meta/authorize` → Meta OAuth.
3. Callback → `tenant_credentials` (provider=`meta`) AES-GCM ciphertext.
4. Sync tetikle:
   - Scheduler açıksa bekle, veya
   - Manuel: `enqueueAdMetricsSync` / ops job / API’den sync tetikleyici (mevcut worker).
5. Doğrula:
   - `GET /v1/ad-metrics` (veya raporlar pazarlama) → son 7 gün spend dolu.
   - Raporlarda **Platform ROAS** dolu (RM-3).
6. Sync’i **ikinci kez** koştur → `ad_metrics_daily` satır sayısı artmamalı
   (unique: tenant+provider+date+campaign).

## 4. Token ömrü

- OAuth sonrası adapter **uzun ömürlü** token’a yükseltir (`fb_exchange_token`, ~60 gün).
- Yükseltme başarısızsa kısa ömürlü token saklanır; connect yine tamamlanır.
- Süre dolunca: panelden **Kes → Bağlan** (yeniden bağlan). Otomatik refresh Meta user
  token’da yok; süre dolumu UX’i “yeniden bağlan”.

## 5. Log / sızıntı denetimi (zorunlu)

Bağlan + bir sync sonrası loglarda şunlar **olmamalı**:

- `META_APP_SECRET`
- `access_token` / `accessToken` ham değeri
- `client_secret`
- `tenant_credentials.ciphertext` çözülmüş hali

Kontrol (örnek):

```bash
# Coolify / docker logs — son OAuth denemesi penceresi
rg -i 'access_token|app_secret|client_secret|tok-' /var/log/... || true
```

Callback ve `storeCredential` secret’ı loglamaz; yine de **gözle** doğrula.

## 6. Kabul kaydı

| Tarih (UTC) | Ortam | Bağlan OK | 7g metrik | 2. sync idempotent | Log temiz | Not |
|---|---|---|---|---|---|---|
| _örn. 2026-…_ | prod | | | | | |

> Canlı satır olmadan Adım 38 checkbox’ı açık kalır.

## 7. Sorun giderme

| Belirti | Kontrol |
|---|---|
| Callback 401 | Session cookie API host’ta mı? `SameSite=Lax` top-level GET’te gelir. |
| Redirect URI mismatch | Meta konsol URI = `ADS_OAUTH_REDIRECT_BASE` + `/v1/integrations/ads/meta/callback` birebir. |
| Boş insights | Ad account izinleri; uygulama Live mi; `ads_read` onaylı mı. |
| Fixture satırlar | OAuth cred yoksa sync fixture yazar — `tenant_credentials` `meta` satırı var mı. |
