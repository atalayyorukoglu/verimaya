# Verimaya — Mimari

Bu doküman hedef mimariyi ve gerekçeleri tutar. Karar geçmişi Obsidian'da (`03-Areas/Verimaya/01-kararlar.md`).

## Hedef mimari

```text
SvelteKit SPA (+ PWA)             [ileride mobil: önce PWA, gerekirse Capacitor]
        |
        | HTTPS + JWT (Cloudflare önde)
        v
NestJS API (Fastify)
        |
        +--> PostgreSQL 16 (domain data, RLS, audit, outbox, integration_events, jobs)
        |
        +--> Redis (BullMQ broker, rate-limit, lock, kısa süreli cache)
        |
        +--> BullMQ Worker'ları
               - GHL sync            - rapor üretimi
               - Meta/Google import  - outbound webhook teslimi
               - WhatsApp işleme     - AI extraction (taslak üretimi)
```

## Stack gerekçeleri (özet)

- **Uçtan uca TypeScript:** solo + AI geliştirmede tek dil, `packages/shared` üzerinden paylaşılan tip zinciri (API → web → mobil). Tip güvenliği solo geliştiricinin QA'idir.
- **NestJS:** katı konvansiyonlar AI ile üretimde tutarlılık sağlar; modül yapısı entegrasyon adaptör katmanına oturur.
- **Drizzle:** SQL'e yakın; RLS/`SET LOCAL` gibi ham kontrol gerekiyor.
- **SvelteKit SPA (2026-07-17'de React yerine seçildi):** geliştirici tercihi + tickport'taki SvelteKit deneyimi. `adapter-static` ile saf SPA olarak kullanılır; SSR/form actions/sunucu route'ları kapalıdır, tüm iş mantığı API'de kalır. **UI renkleri (2026-07-20):** TickPort warm neutrals paleti — `docs/TASARIM.md`. Bilinen ödünler: React Native bilgi paylaşımı yok (mobil planı zaten PWA-first; gerekirse Capacitor) ve AI kod üretiminde React'e göre daha ince ekosistem (Svelte 5 runes kuralı `.cursor/rules/frontend.mdc` ile sabitlendi).
- **BullMQ + Redis:** rate-limit'li dış API çağrıları, retry/backoff, hazır dashboard (Bull Board).
- **Hetzner + Coolify + Cloudflare:** AB veri lokasyonu (KVKK/GDPR), düşük maliyet, düşük DevOps yükü.

## Değişmez ilkeler

Detaylı hali `AGENTS.md` ve `.cursor/rules/` içinde; özet:

1. Ortak şema multi-tenancy: `tenant_id NOT NULL` + PostgreSQL RLS + CI'da negatif izolasyon testleri.
2. Queue-first webhook + idempotency (`UNIQUE (provider, external_event_id)`).
3. Denetlenebilir kayıt kaynağı PostgreSQL: `jobs`, `integration_events`, `outbox_events`.
4. Provider adaptör katmanı; domain kodu dış servisi bilmez.
5. GHL senkronunda alan bazlı sahiplik; reklam metrikleri `ad_metrics_daily`den okunur.
6. AI çıkarımı taslak/onay akışıyla; otomatik kesin kayıt yok.
7. Cache anahtarlarında `tenant_id`.

## Güvenlik çerçevesi

- Cloudflare (WAF/DDoS/TLS) → Hetzner firewall (yalnız 80/443) → Coolify/Docker network (Postgres/Redis dışa kapalı).
- better-auth: e-posta/şifre + admin'e TOTP 2FA; JWT access/refresh, refresh rotation.
- Tenant credential'ları AES-GCM şifreli, anahtar yalnız deploy secret'ında.
- Günlük otomatik Postgres yedeği + sunucu dışı kopya + aylık restore provası.
- KVKK: veri işleme envanteri, export/silme endpoint'i, LLM'e giden veride PII minimizasyonu.

## Eski sistemle ilişki

Fixrav Tracker (FastAPI + React, `~/Projects/fixrav-web/_projects/fixrav-tracker`) dahili kullanımda çalışmaya devam eder. Şeması ve rota listesi `docs/legacy-reference/` altına çıkarılır; Verimaya şeması bunun düzeltilmiş portudur. Faz 8'de ETL ile veri göçü yapılır, kendi firmamız ilk tenant olur.
