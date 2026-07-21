# Döviz / para birimi

## Model

- Tenant `base_currency`: TRY | GBP | EUR | USD
- İşlem: `amount` + `currency`
- Yabancı para: zorunlu snapshot `amount_base` (+ `base_currency`, isteğe `fx_rate` / `fx_dated`)
- Raporlar snapshot ile bazda toplanır; canlı kur yok
- P2P net: para birimine göre ayrı (karıştırılmaz)

## Tracker hataları (tekrarlama)

- GBP hardcode (Frankfurter, AI, Excel)
- Karşılık yoksa raporda sessiz atlama
- Default’lar sayfalar arası tutarsız

## Demo

Formda para birimi + baz tutar; raporda “Kur eksik: N”.
