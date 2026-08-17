#!/usr/bin/env node
/**
 * `drizzle-kit generate` bu şemada KULLANILMAZ — migration'lar elle yazılır.
 *
 * Neden (2026-08-17'de ölçülerek doğrulandı):
 * Şema, drizzle-kit'in TypeScript tarafında modellemediği şeylere dayanıyor —
 * satır bazlı güvenlik politikaları, `FORCE ROW LEVEL SECURITY`, `verimaya_app`
 * rolüne verilen GRANT'ler, `app.current_tenant_id()` fonksiyonu ve SQL'de tanımlı
 * kısıtların bir bölümü. `generate` bunları "şemada yok" sayıp silmeyi öneriyor.
 *
 * Güncel şemaya karşı üretilen taslak migration şunu içeriyordu:
 *   · 32 tenant izolasyon politikası DROP
 *   · 32 tabloda ROW LEVEL SECURITY DISABLE
 *   · 30 check kısıtı DROP (yalnız 13'ü geri ekleniyor)
 *   · 89 index DROP (yalnız 60'ı geri ekleniyor)
 *
 * Yani araç, çok kiracılı izolasyonun tamamını sessizce kaldırıyor. Bu izolasyon
 * hem AGENTS.md ilke 7'nin, hem de müşteri sözleşmesindeki veri izolasyonu
 * taahhüdünün dayanağı.
 *
 * Yeni migration nasıl yazılır:
 *   1. `apps/api/drizzle/` içine sıradaki numarayla `.sql` dosyası aç.
 *      Örnek/desen: `0009_ad_metrics_daily.sql` veya `0054_ad_sync_status.sql`.
 *      Tenant'lı tabloda RLS + FORCE RLS + policy + GRANT bloğu ZORUNLU.
 *   2. `apps/api/drizzle/meta/_journal.json`'a aynı tag ile kayıt ekle.
 *   3. `pnpm --filter @verimaya/api db:migrate` ile uygula.
 *   4. Şemayı `apps/api/src/db/schema/` altında da güncelle (kod tarafı okuma için).
 *   5. Tenant'lı tabloysa negatif izolasyon testi yaz (AGENTS.md ilke 7).
 *
 * Gerçekten aracın çıktısını görmek istiyorsan (yalnız inceleme, ASLA uygulama):
 *   pnpm --filter @verimaya/api exec drizzle-kit generate
 */

const RED = '[31m';
const YELLOW = '[33m';
const RESET = '[0m';

console.error(`
${RED}db:generate bu projede devre dışı.${RESET}

Migration'lar elle yazılır. Sebebi: drizzle-kit, RLS politikalarını, FORCE RLS'i,
GRANT'leri ve SQL'de tanımlı kısıtları görmüyor; bunları "fazlalık" sayıp silen bir
migration üretiyor. Ölçüldü: 32 izolasyon politikası + 32 tabloda RLS + 30 check
kısıtı düşüyordu.

${YELLOW}Yeni migration için:${RESET}
  1. apps/api/drizzle/ içine sıradaki numarayla .sql yaz
     (desen: 0054_ad_sync_status.sql — RLS + FORCE RLS + policy + GRANT dahil)
  2. apps/api/drizzle/meta/_journal.json'a kaydı ekle
  3. pnpm --filter @verimaya/api db:migrate
  4. apps/api/src/db/schema/ altındaki şemayı da güncelle
  5. Tenant'lı tabloysa negatif izolasyon testi (AGENTS.md ilke 7)

Ayrıntılı gerekçe: apps/api/scripts/db-generate-guard.js başlığı.
`);

process.exit(1);
