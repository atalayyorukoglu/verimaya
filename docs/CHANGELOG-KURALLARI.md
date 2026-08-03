# Changelog Kuralları

**Karar (2026-07-17):** Tek kaynak, iki yüz. Kayıtlar tipli veri olarak tutulur; hem repo `CHANGELOG.md` hem uygulamadaki `/changelog` sayfası bu kaynaktan beslenir. Elle iki yerde yazım yok.

**Güncelleme (2026-08-03, DOC-03):** Özellik durumu dört değere ayrıldı; `/features` ile `/changelog` aynı anlamı taşımak zorunda.

## Özellik durumu (`features.ts`)

| Kod | Kullanıcıya görünen | Anlam |
|---|---|---|
| `kod-hazir` | Kod hazır | Repoda çalışır; dahili/ücretli pilot veya dış müşteri kullanımı yok |
| `pilotta` | Pilotta | Dahili veya ücretli pilotta aktif |
| `yayinda` | Yayında | Hedef kullanıcıya açık; operasyonel kabul yapılmış |
| `harici-onay-bekliyor` | Harici onay bekliyor | Kod hazır veya kısmi; hukuk / sağlayıcı / hesap onayı bekliyor |

Kurallar:

1. Changelog maddesi **“eklendi + çalışır”** iddiası taşıyorsa `/features` durumu `yayinda` veya `pilotta` olmalı — `kod-hazir` / `harici-onay-bekliyor` özellik için “bağlayınca çalışır” yazılmaz.
2. GHL/Ads gibi entegrasyonlarda OAuth UI’nin kodda olması `kod-hazir`; gerçek hesap go-live kanıtı yoksa Ads metrik/bağlantı `harici-onay-bekliyor` (veya metin açıkça onay beklediğini söyler).
3. `featureId` ile changelog’a bağlanan özellik, durum yükseltildiğinde (`→ yayinda`) aynı commit’te güncellenir.
4. Rozet renkleri: `apps/web/src/lib/status-tone.ts` (`featureStatusTone`).

## Tek kaynak

`packages/shared/src/changelog.ts`:

```typescript
export type ChangeType = "eklendi" | "degisti" | "duzeltildi" | "kaldirildi" | "guvenlik";

export interface ChangelogEntry {
  version: string;        // "0.3.0"
  date: string;           // "2026-08-12" (ISO)
  title?: string;         // opsiyonel sürüm başlığı: "WhatsApp Inbox yayında"
  changes: {
    type: ChangeType;
    module: string;       // "Hastalar" | "Randevular" | "Finans" | "WhatsApp" | ...
    text: string;         // kullanıcı diliyle, tek cümle
    featureId?: string;   // features.ts ile bağ (durum yükseltiminde)
  }[];
}
```

Repo kökündeki `CHANGELOG.md`, Faz 2'ye kadar elle senkron tutulur; sonra küçük bir script ile bu dosyadan üretilir (`pnpm changelog:md`).

## Sürümleme

- Lansman öncesi `0.MINOR.PATCH`: **MINOR** = yeni özellik/faz bitişi, **PATCH** = düzeltme.
- **1.0.0** = dış satış lansmanı (Faz 8 sonrası ilk harici tenant).
- Her production deploy bir sürüme karşılık gelir; sürümsüz deploy yok.

## Yazım kuralları

1. **Kullanıcının diliyle yaz, geliştirici diliyle değil.** "Redis cache eklendi" değil → "Panel açılışı belirgin şekilde hızlandı."
2. Her madde **ne işe yaradığını** söyler; tek cümle, Türkçe, etken çatı ("Artık randevuları takvimden sürükleyerek taşıyabilirsiniz").
3. Yalnız kullanıcının görebildiği değişiklikler yazılır. İç refaktör, bağımlılık güncellemesi vb. yazılmaz; istisna: **guvenlik** tipi (kullanıcı görmese de her zaman yazılır, detay vermeden: "Oturum güvenliği güçlendirildi").
4. Kategori sırası sabit: eklendi → degisti → duzeltildi → kaldirildi → guvenlik.
5. Bir özellik `/features` sayfasında **Yayında**ya geçiyorsa, aynı commit'te changelog kaydı `featureId` ile eklenir (veya mevcut madde durumla uyumlu hale getirilir).
6. Kaldırılan/değişen davranış varsa kullanıcıya etkisi açıkça yazılır ("X artık Y menüsünün altında").
7. Kod hazır ama onay bekleyen özelliklerde changelog metni durumu açıkça söyler; “bağladığınızda çalışır” iddiası `harici-onay-bekliyor` / `kod-hazir` ile çelişmez şekilde yazılır.

## Yayınlama akışı

1. Özellik kodda biter → `features.ts`'te `kod-hazir` (veya gerekirse `harici-onay-bekliyor`).
2. Pilot başlar → `pilotta`. Operasyonel kabul + dış kullanıcı → `yayinda` + changelog (`featureId`).
3. Deploy → `/changelog` otomatik güncel; üst bardaki zilde brand renkli nokta (kullanıcının son gördüğü sürüm `localStorage`'da tutulur, karşılaştırma istemcide).
4. Obsidian `04-ilerleme-log`'a 1 satır not (geliştirici tarafı; kullanıcıya dönük olmayan detaylar oraya).

## Sorumluluk ayrımı

| Nerede | Ne var | Kim için |
|---|---|---|
| `/changelog` + `CHANGELOG.md` | Kullanıcının görebildiği değişiklikler | Müşteri |
| `/features` | Mevcut + gelecek özelliklerin durumu (dört rozet) | Müşteri + satış + geliştirici |
| Obsidian `04-ilerleme-log` | Teknik ilerleme, iç kararlar | Geliştirici |
| Obsidian `Özellikler/00-Özellikler` | Aynı taksonominin durum aynası | Geliştirici |
