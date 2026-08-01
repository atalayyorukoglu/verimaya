# Google Ads go-live (Adım 39)

Kod hazır (`GoogleAdsAdapter`, OAuth offline + refresh, `ad_metrics.sync`). Bu dosya
**canlı doğrulama** runbook’udur. Canlı kabul olmadan Adım 39 kapanmış sayılmaz.

> Bağımlılık: Coolify/API public URL (Adım 31). `ADS_OAUTH_REDIRECT_BASE` canlı API kökü olmalı.
> Developer token onayı **haftalar** sürebilir — erken başlat; bloke olursa Adım 40’a geç,
> buraya sonra dön.

## 1. Google Cloud + Ads API

1. [Google Cloud Console](https://console.cloud.google.com/) → proje oluştur.
2. **APIs & Services → OAuth consent screen** (External veya Internal).
3. Scope: `https://www.googleapis.com/auth/adwords`.
4. **Credentials → OAuth 2.0 Client ID** (Web application).
5. **Authorized redirect URIs:**

```text
{ADS_OAUTH_REDIRECT_BASE}/v1/integrations/ads/google/callback
```

Örnek: `https://api.verimaya.com/v1/integrations/ads/google/callback`

6. [Google Ads API Center](https://ads.google.com/aw/apicenter) → **Developer token** iste.
   - Test hesabı ile Basic Access denenebilir; prod harcama için token seviyesi gerekir.
7. Client ID + Client Secret + Developer token → Coolify / `.env`.

## 2. Ortam değişkenleri (API)

| Key | Zorunlu | Not |
|---|---|---|
| `GOOGLE_ADS_CLIENT_ID` | evet | OAuth client |
| `GOOGLE_ADS_CLIENT_SECRET` | evet | Coolify secret; **asla loglama** |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | evet | Ads API header |
| `GOOGLE_ADS_API_VERSION` | hayır | varsayılan `v25` (sunset sürümler HTML 404 döner) |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | MCC ise | Manager (MCC) hesabı ile erişimde `login-customer-id` header (tire yok, yalnız rakam) |
| `ADS_OAUTH_REDIRECT_BASE` | evet | Public API kökü |
| `WEB_PUBLIC_URL` | evet | Callback sonrası dönüş |
| `TRUSTED_ORIGINS` | evet | Panel origin |
| `CREDENTIALS_ENCRYPTION_KEY` | evet | AES-GCM |
| `ENABLE_INTEGRATION_SCHEDULERS` | go-live sonrası | `true` → 6s `ad_metrics.sync` |

## 3. Uçtan uca akış

1. Panel → **Ayarlar → Bağlantılar → Reklamlar** (`/settings/connections/ads`).
2. Google **Bağlan** → `GET /v1/integrations/ads/google/authorize` → Google OAuth
   (`access_type=offline`, `prompt=consent` → refresh token).
3. Callback → `listAccessibleCustomers` → ilk customerId + refreshToken
   `tenant_credentials` (provider=`google`) AES-GCM.
4. Sync tetikle (scheduler veya manuel job).
5. Doğrula:
   - `GET /v1/ad-metrics` → son 7 gün Google spend.
   - Raporlarda **Platform ROAS** (Google satırı).
6. Sync’i **ikinci kez** koştur → satır sayısı artmamalı
   (unique: tenant+provider+date+campaign).

## 4. Token ömrü

- Saklanan secret: `{ refreshToken, customerId }` JSON.
- Her metrik çekiminde refresh_token → access_token (adapter içinde).
- Refresh iptal / revoke sonrası: panelden **Kes → Bağlan**.

## 5. Log / sızıntı denetimi (zorunlu)

Bağlan + bir sync sonrası loglarda **olmamalı**:

- `GOOGLE_ADS_CLIENT_SECRET` / `developer-token` ham değeri
- `refresh_token` / `access_token`
- çözülmüş `tenant_credentials` içeriği

## 6. Kabul kaydı

| Tarih (UTC) | Ortam | Bağlan OK | 7g metrik | 2. sync idempotent | Log temiz | Not |
|---|---|---|---|---|---|---|
| _örn. 2026-…_ | prod | | | | | developer token seviyesi: … |

> Canlı satır olmadan Adım 39 checkbox’ı açık kalır.

## 7. Sorun giderme

| Belirti | Kontrol |
|---|---|
| `Developer token is not approved` | Ads API Center onay durumu; test hesabı mı. |
| MCC / permission denied | `GOOGLE_ADS_LOGIN_CUSTOMER_ID` = manager customer id (rakam). |
| Redirect URI mismatch | Google konsol URI birebir callback yolu. |
| Refresh token yok | `prompt=consent` + `access_type=offline`; önceki grant’i iptal edip yeniden bağlan. |
| Fixture satırlar | OAuth cred yoksa sync fixture yazar — `google` satırı var mı. |
