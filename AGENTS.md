# Verimaya — AI Geliştirme Rehberi

## Proje nedir?

Türkiye'deki sağlık turizmi firmaları (saç ekimi, diş, estetik klinikleri/acenteleri) için multi-tenant B2B SaaS operasyon platformu. Modüller: hasta/lead takibi, randevu, finans (WhatsApp AI işlem aktarımı dahil), raporlama, GHL + Meta/Google Ads + n8n entegrasyonları. Solo geliştirici + Cursor AI ile ilerler.

Bu proje, `~/Projects/fixrav-web/_projects/fixrav-tracker` (FastAPI + React, dahili kullanımda) ürününün sıfırdan, yeni stack ile yeniden inşasıdır. Eski sistemin şeması ve iş kuralları `docs/legacy-reference/` altında referanstır — kod taşınmaz, bilgi taşınır.

## Stack ve yapı

- pnpm workspaces + Turborepo: `apps/api` (NestJS + Fastify + Drizzle), `apps/web` (SvelteKit + Svelte 5 + TanStack Query (svelte) + Tailwind + shadcn-svelte), `packages/shared` (zod şemaları + API sözleşmesi).
- PostgreSQL 16 + RLS, BullMQ + Redis, better-auth (organization), Sentry + pino.
- Deploy: Hetzner + Coolify, önde Cloudflare. Web, `adapter-static` ile SPA modunda çalışır; SSR kullanılmaz, tüm iş mantığı API'dedir. SvelteKit'in sunucu özellikleri (`+page.server.ts`, form actions, API routes) kullanılmaz.
- Svelte kodu daima **Svelte 5 runes** sözdizimiyle yazılır (`$state`, `$derived`, `$effect`, `$props`); Svelte 4 sözdizimi (`export let`, `$:` reaktif ifadeler, store auto-subscribe ile yeni state) yasaktır.

## Değişmez mimari ilkeler

1. **Multi-tenant:** her iş tablosunda `tenant_id NOT NULL`; RLS her tenant tablosunda aktif; request başında `SET LOCAL app.current_tenant_id`. Aktif tenant JWT/session'dan çözülür, istemciden gelen tenant_id'ye güvenilmez.
2. **Queue-first webhook:** endpoint yalnız imza doğrular, ham payload'ı `integration_events`e yazar, 202 döner; işleme BullMQ worker'da. İş mantığı asla webhook endpoint'inde olmaz.
3. **Idempotency:** `UNIQUE (provider, external_event_id)` (yoksa `payload_hash`); tüm public mutasyon endpoint'leri `Idempotency-Key` header'ını destekler.
4. **Kayıt kaynağı PostgreSQL'dir:** Redis/BullMQ geçicidir; `jobs`, `integration_events`, `outbox_events` tabloları denetlenebilir kaynaktır. Giden webhook'lar outbox üzerinden gider.
5. **Adaptör katmanı:** dış servisler (GHL, Meta, Google, WhatsApp) `apps/api/src/integrations/<provider>/` altında; domain kodu provider'ı bilmez, httpx/fetch'i doğrudan çağırmaz.
6. **AI çıkarımı taslaktır:** WhatsApp mesajından çıkarılan veri insan onayı olmadan kesin kayda yazılmaz.
7. **Sözleşme `packages/shared`'dadır:** API request/response şemaları zod ile burada tanımlanır; api ve web bunlardan türetir. Şema değişikliği önce shared'da yapılır.
8. **Cache anahtarında daima `tenant_id`** bulunur.

## Kod konvansiyonları

- TypeScript strict; `any` yasak (zorunluysa gerekçe yorumuyla).
- Tarihler ISO-8601 UTC; para birimleri minor unit (kuruş/cent) integer.
- API: `/v1` prefix, cursor sayfalama (`?cursor=&limit=`), standart hata gövdesi (`error.code`, `error.message`, `request_id`).
- Dokümantasyon ve commit mesajları Türkçe; kod, tanımlayıcılar ve log mesajları İngilizce.
- **Rota ve slug'lar İngilizce** (`/patients`, `/settings/connections/ads`). Kullanıcıya görünen metin `apps/web/src/lib/i18n/messages.ts` kataloğundan gelir. Detay ve gerekçe: aşağıdaki "Dil ve slug" bölümü.
- UI'da yayındaki tek dil **Türkçe**, ama **i18n altyapısı kuruldu** — yeni metin doğrudan Türkçe yazılmaz, kataloğa anahtar olarak eklenir. Tema: **açık (varsayılan) + koyu**, üst bardan değiştirilir. Renk: **TickPort warm neutrals** (terracotta `#D97757`); layout CF dashboard deseni — `docs/TASARIM.md`. Changelog/özellik sayfası kuralları: `docs/CHANGELOG-KURALLARI.md`.
- Test: her tenant'lı endpoint için negatif izolasyon testi ("Tenant A, Tenant B verisini göremez") zorunludur.

## Dil ve slug — 2026-07-26 kuralı

Üç yüzey birbirinden ayrıdır; biri için verilen karar diğerine uygulanmaz.

| Yüzey | Dil | Locale prefix | Gerekçe |
| --- | --- | --- | --- |
| **API yolu** (`/v1/...`) | **İngilizce** — değiştirilemez | yok | Dış `/v1` API + n8n + OpenAPI tüketicileri var; Türkçe yol yayınlanırsa geri dönüş kırıcı değişiklik olur. Tek kaynak: `packages/shared/src/api.ts` → `apiPaths`. |
| **Panel rotası** (login arkası) | **İngilizce** | **yok** | SPA + `noindex`, SEO değeri sıfır → slug bir ürün kararı değil, kod tutarlılığı kararı. Şema/tablo/dizin adları (`Patient`, `patients`) İngilizce olduğu için Türkçe rota kalıcı bir çeviri katmanı yaratır ve AI üretiminde hata kaynağıdır. |
| **Vitrin** (login öncesi, public) | her dil kendi dilinde | **ileride ikisi de** | SEO'nun çalıştığı tek yer; Türkçe slug Türkçe aramada avantaj. Bugün tek public sayfa `/vitrin` ve `prerender = false` → karar henüz gerekmiyor (aşağıya bak). |

**Panel rotaları dile göre çoğaltılmaz.** `/patients` vardır; `/tr/hastalar` + `/en/patients` yoktur. Dil kullanıcı tercihidir, URL'in parçası değildir — aksi halde rota yüzeyi ikiye katlanır ve kullanıcı dil değiştirdiğinde derin linkler kırılır.

**Metin nasıl yazılır:** `apps/web/src/lib/i18n/messages.ts`'e anahtar eklenir, bileşende `t('key')` ile okunur (`import { t } from '$lib/i18n/locale.svelte'`). `tr` kataloğu tip kaynağıdır — `en`'e eklenmeyen anahtar **derleme hatası** verir. Bileşene doğrudan Türkçe string gömülmez.

> Mevcut ekranlardaki Türkçe metinler henüz kataloğa taşınmadı (ayrı iş). Kural **yeni ve dokunulan** kod için bağlayıcıdır; eski ekran düzenlenirken o ekranın metinleri de kataloğa taşınır.

**Vitrin locale ağacı bilinçli olarak kurulmadı.** Ön koşul eksik: `apps/web/src/routes/+layout.ts` içinde `ssr = false` + `prerender = false`, yani vitrin Google'a boş `index.html` iskeleti olarak gidiyor — hiçbir locale/slug stratejisi bugün karşılık üretmez. Sıra: (1) vitrini prerender edilebilir hale getir, (2) `/tr/` + `/en/` ağacını kur, (3) `/` için Cloudflare'de uçta **302** yönlendirme tanımla (JS ile yönlendirme SEO'yu öldürür), `hreflang` etiketlerini ekle. Hangi dilin birincil olacağı o yönlendirme kuralına iner — segment kararı (acente / klinik) verilene kadar sabitlenmez.

## Süreç

- Yol haritası Obsidian'da: `SecondBrain-Remote/03-Areas/VeriMaya/02-yol-haritasi.md` (2026-07-30'dan itibaren tek kaynak; repo içi `docs/YOL-HARITASI.md` kaldırıldı). Fazların dışına çıkan işlere başlamadan kullanıcıya sor.
- Önemli mimari kararlar `docs/MIMARI.md`'ye işlenir; proje takibi Obsidian'dadır (`SecondBrain-Remote/03-Areas/Verimaya`), oturum sonunda kullanıcıya log'a düşülecek 1-2 satır özet ver.
- Faz 0a tamamlandı (MSW demo). Faz 0b'de `apps/api` gerçek Postgres/Redis üzerine kurulur; web MSW kapanana kadar paralel kalır.
