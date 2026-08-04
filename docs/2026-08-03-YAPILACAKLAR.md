# Verimaya — Yapılacaklar (2026-08-03 · Faz 0–7 sonrası)

> **Bu dosya tek kaynaktır.** Faz 0–7 (tüm kod fazları + Opus denetimi) tamamlandı.
> Kalan işlerin tamamı **Faz 8 — kod dışı** veya **bekleyen** kategorisinde.
>
> Durum anı: branch `main`, HEAD `5f91d80` (7.1 Faz 7 denetim bulguları F-01/F-03/F-05/F-06/F-07/F-09).

---

## Çalışma kuralları

1. **Sırayla ilerle.** Sıra numarası önceliği gösterir; `Bağımlı:` satırı kırmızı çizgidir.
2. **Adım başına tek commit.** Commit mesajı Türkçe, `feat:` / `fix:` / `ops:` / `docs:` önekiyle.
3. **Bitirince bu dosyayı güncelle:** `- [ ]` → `- [x]` ve **Görüş** satırını doldur.
4. **Soru sorma, en savunulabilir varsayımı seç**, Görüş'te yaz.
5. **Sır yazma.** Hiçbir token/parola/anahtar değeri koda, teste, commit mesajına girmez.

**Durum işaretleri:** `- [ ]` yapılmadı · `- [x]` yapıldı · `- [~]` kısmi

---

## Öncelik Sırası

### 1. WEBHOOK-01 — Tenant çözümünü imzalı / provider eşlemesinden yap

> **Durum:** Tasarım hazır (`tenant_provider_identities` tablosu, payload-imza-doğrulama-sonrası tenant_id çözümü).
> Atalay'dan **uygulama kararı** bekliyor. WAHA pilot/kendi firmamız tek tenant olduğu için bugünkü risk düşük,
> ama ikinci tenant eklenmeden **önce** yapılmalı.

- [ ] Uygulama kararı ver → migration + kod + test
- **Dosyalar:** `apps/api/drizzle/`, `apps/api/src/webhooks/`, `packages/shared/`
- **Bağımlı:** yok (tasarım hazır)
- **Kabul:** Geçerli body imzası + değiştirilmiş `X-Tenant-Id` ile hedef tenant'a yazılamıyor (negatif test).

---

### 2. SEC-01 (kalan) — OAuth secret rotasyonu + Obsidian temizliği

> **Durum:** SSH, PostgreSQL, Redis, Better Auth, credential encryption sırları döndürüldü.
> ✅ Google OAuth client secret rotate edildi.
> Kalan: Obsidian aktif/revision/yedek kopya temizliği.

- [x] Google OAuth client secret rotate edildi
- [ ] Obsidian `Untitled.md` içindeki sırları kalıcı temizle (aktif + revision + yedek)
- [ ] Repo, vault, terminal geçmişi, deploy notlarında kopya kalmadığını doğrula

---

### 3. LEG-02 — KVKK aydınlatma metni + açık rızanın hukukçu onayı

> **Durum:** Teknik kapı kapalı (LEG-01). Lead toplama flag'leri kapalı.
> Hukuk onayı gelmeden `KARNE_LEADS_ENABLED` + `PUBLIC_KARNE_LEADS_ENABLED` birlikte açılmaz.

- [ ] Hukukçu onayını al
- [ ] Onay sonrası iki flag'i birlikte aç

---

### 4. OPS-01 (kalan) — Otomatik sunucu dışı yedek/snapshot düzeni

> **Durum:** Dump/restore provası, Coolify deploy, canlı curl kabulü tamamlandı.
> Kalan: otomatik, sunucu dışı yedekleme (ör. Hetzner snapshot + pg_dump cron).

- [ ] Yedek düzenini kur (ör. günlük pg_dump → S3/R2 + Hetzner snapshot)
- [ ] Tarihli restore provası yap, kanıtla
- [ ] Runbook'u `docs/DEPLOY-COOLIFY.md`'ye ekle

---

### 5. PILOT-01 — ETL dry-run → apply → verify (kendi firmamız ilk tenant)

> **Bağımlı:** 1+2+3+4 (WEBHOOK-01 uygulaması + sırlar temiz + hukuk onayı + yedek).
> Runbook: `docs/ETL-KESIM.md`.

- [ ] ETL dry-run (Fixrav Tracker → Verimaya)
- [ ] Apply + verify
- [ ] Pilot boyunca **ikinci organizasyon yaratma** (demo/test org'u dahil)

---

### 6. MARKET-01 — Üç stratejik karar (17 Ağustos review öncesi)

- [ ] **(a)** Birincil segment: acente mi klinik mi? (ilk 20 görüşme tek segmente odaklansın)
- [ ] **(b)** OrbisMed çıkar çatışması: veri ayrımı, tüzel ayrım, erişim/audit, referans anlatısı
- [ ] **(c)** Kapasite: Verimaya'ya haftalık sabit gün/saat + pilot boyunca feature freeze

---

### 7. OPS-02 — Meta + Google Ads gerçek hesapla go-live kabulü

> Runbook: `docs/ADS-META-GOLIVE.md`, `docs/ADS-GOOGLE-GOLIVE.md`.

- [ ] Meta: 7 gün veri, idempotent sync, log denetimi
- [ ] Google: aynı
- [ ] Hata yüzeyleme + sync penceresi doğrulaması

---

### 8. PILOT-02 — 2–4 haftalık feature-freeze dahili pilot

> **Bağımlı:** PILOT-01.
> Ölçülecek KPI'lar: aktif kullanıcı/gün, Tracker'a dönüş oranı ve nedeni, AI taslak kabul/düzeltme/red,
> finans mutabakat farkı, randevu kaçırma, webhook/job başarısızlık, ortalama destek süresi,
> haftalık yedek + restore kanıtı.

- [ ] Pilot planını yaz, KPI'ları tanımla
- [ ] Feature freeze ilan et
- [ ] 2–4 hafta çalıştır + raporla

---

### 9. MARKET-02 — 30 günlük pazar kapısı

> **Bağımlı:** PILOT-02 verileri.
> Kabul: 20 müşteri görüşmesi, 4–5 rakip demo/fiyat teklifi, en az 3 ücretli ön-sipariş/yazılı pilot niyeti,
> bir fiyat kartı + iptal/taahhüt modeli.

- [ ] Görüşmeleri tamamla
- [ ] Fiyat kartını sabitle
- [ ] Kapı kararını ver

---

## Bekleyen (öncelik sırası yok; 9. madde sonrası değerlendirilir)

- **Marka tescili:** `verimaya.com` / `.com.tr` + Türk Patent 9/35/42/44
- **IOS-01:** iOS smoke'u dondur veya resmen kapat (öneri: pilot bitene kadar dondur)
- **PRODUCT-01:** Komisyon takibi discovery (acente segmenti seçilirse)
- **CSP/HSTS başlık denetimi:** canlıda kanıtlı kontrol
- **pnpm audit / Dependabot:** CI'da düzenli güvenlik taraması
- **Hasta verisi export + silme endpoint'i + hesap kapatma runbook'u**
- **Veri işleme envanteri (tamamı):** WhatsApp→LLM dışındaki işlemler
- **AB veri lokasyonu envanteri + DPA şablonları (tenant onboarding)**

---

## Bilinçli olarak yapılmayacaklar (MARKET-02 kapısına kadar)

| Konu | Gerekçe |
|------|---------|
| iOS App Store hazırlığı | Pazar doğrulaması yokken yatırım yapılmaz |
| Tam i18n/locale ağacı (`/tr/` `/en/`) | Pre-requisite karşılandı; pazar kapısı sonrası |
| TikTok / Instagram entegrasyonları | MARKET-02 öncesi yatırım yok |
| Klinik entegrasyonları (e-Nabız, e-Fatura) | Acente segmenti seçilmezse gereksiz |
| Ürün içi karnenin genişletilmesi | Pilotla birlikte gelir |

---

## Kaynaklar

- `docs/2026-08-02-PROJE-DEGERLENDIRMESI.md` — kanıtlı bulgular
- `docs/2026-08-03-KONTROL-RAPORU.md` — Faz 7 denetim çıktısı
- `docs/MIMARI.md` — mimari kararlar
- `docs/TASARIM.md` — tasarım sistemi
- `docs/DEPLOY-COOLIFY.md`, `docs/ETL-KESIM.md`
- `SecondBrain-Remote/03-Areas/VeriMaya/` — 01-kararlar, 02-yol-haritasi, 04-ilerleme-log, 05-guvenlik-kvkk
- `AGENTS.md` — AI geliştirme rehberi (always-apply)