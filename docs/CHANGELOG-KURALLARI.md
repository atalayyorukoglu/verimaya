# Changelog Kuralları

**Karar (2026-07-17):** Tek kaynak, iki yüz. Kayıtlar tipli veri olarak tutulur; hem repo `CHANGELOG.md` hem uygulamadaki `/yenilikler` sayfası bu kaynaktan beslenir. Elle iki yerde yazım yok.

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
    featureId?: string;   // features.ts ile bağ (Yayında'ya geçen özellik)
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
5. Bir özellik `/ozellikler` sayfasında "Yayında"ya geçiyorsa, aynı commit'te changelog kaydı `featureId` ile eklenir.
6. Kaldırılan/değişen davranış varsa kullanıcıya etkisi açıkça yazılır ("X artık Y menüsünün altında").

## Yayınlama akışı

1. Özellik biter → `features.ts`'te durum "Yayında" + `changelog.ts`'e sürüm kaydı (aynı PR/commit).
2. Deploy → `/yenilikler` otomatik güncel; üst bardaki zilde brand renkli nokta (kullanıcının son gördüğü sürüm `localStorage`'da tutulur, karşılaştırma istemcide).
3. Obsidian `04-ilerleme-log`'a 1 satır not (geliştirici tarafı; kullanıcıya dönük olmayan detaylar oraya).

## Sorumluluk ayrımı

| Nerede | Ne var | Kim için |
|---|---|---|
| `/yenilikler` + `CHANGELOG.md` | Kullanıcının görebildiği değişiklikler | Müşteri |
| `/ozellikler` | Mevcut + gelecek özelliklerin durumu | Müşteri + satış + geliştirici |
| Obsidian `04-ilerleme-log` | Teknik ilerleme, iç kararlar | Geliştirici |
