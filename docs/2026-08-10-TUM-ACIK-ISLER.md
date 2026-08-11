# Verimaya — Yönelim notu (açık işler nerede?)

> **Bu dosya kalem listesi DEĞİL.** Açık işlerin tek kaynağı
> **`docs/2026-08-09-YAPILACAKLAR.md`** — öncelik sırası, kabul kriterleri,
> Görüş'ler ve "Son kapananlar" orada.
>
> **Bu dosya kalem kalem güncellenmez.** 2026-08-10'da tam envanter olarak yazıldı;
> her kalemi iki yerde işaretlemek sapma ürettiği için (2026-08-11'de üç tutarsızlık
> çıktı) özet hâline indirildi. Burada yalnız **listeye bakınca cevaplanmayan**
> sorular durur.

---

## 1. "Faz 8" ne demek? (en sık karışan şey)

Aynı ad üç farklı şeyi anlatıyor:

| Anlam | Durum |
|-------|--------|
| **Kod fazları 0–7** (panel, API, RLS, WhatsApp, Ads iskeleti, raporlar, denetim…) | **Bitmiş.** Kanıt: `docs/Arşiv/2026-08-03-YAPILACAKLAR.md` |
| **Eski yol haritasındaki "Faz 8"** = ETL apply + dahili pilot + go-live ops + ürün karne | Büyük kısmı yapıldı ya da **PILOT-\*** / **OPS-02** / **MARKET-\*** olarak yeniden adlandırıldı |
| **Panelde görünen "Faz 8'de"** (`/settings/import-export`) | **Özellik yok** — bilinçli yer tutucu. Kapsam kilitli (**GAP-08**), uygulama yapılmadı |

**"Hepsi bitmişti" ≠ "import/export bitti".** Ürün çekirdeği ve gap'lerin çoğu kapandı;
içe/dışa aktarım bilerek ertelendi ve panelde hâlâ yer tutucu metin duruyor.

---

## 2. Panelde/kodda göze çarpan eksikler — gerçek mi, bilinçli mi?

"Şurada bir şey eksik görünüyor, unutuldu mu?" sorusunun cevabı:

| Yüzey | Durum |
|-------|--------|
| `/settings/import-export` → "Faz 8'de" | **Gerçekten yok.** Bilinçli; kapsam kilitli (GAP-08), ikinci müşteriden önce zorunlu |
| Ads Meta/Google | Kod + runbook hazır; **canlı hesap go-live** açık (OPS-02) |
| GHL ad/soyad çift yönlü senkron | **Test edilmedi** — DOMAIN-02 E4, insan doğrulaması bekliyor |
| Dev panel (`/dev`) gerçek arka ucu | **Bilinçli yok.** Nest modülü yazılmadı; ekran üretimde gizli (GAP-28) |
| Randevu checklist şablonları | **Muhtemelen hiç yapılmayacak** — Tracker'da 0 satır (GAP-F09-20 skip adayı) |
| Hub'da `/tr/` `/en/` SEO ağacı | Bilinçli yok; UI dil değiştirici kısmi i18n (DOC-03e) |

Kapanmış yüzeylerin kanıtı YAPILACAKLAR "Son kapananlar"da — buraya kopyalanmaz.

---

## 3. Nereye bakmalı

| Soru | Kaynak |
|------|--------|
| Ne yapacağım, hangi sırayla? | `docs/2026-08-09-YAPILACAKLAR.md` — **tek kaynak** |
| Bu kalem neden böyle kapandı? | Aynı dosya, "Son kapananlar" + Görüş satırları |
| Hangi ürün kararları bekliyor? | Aynı dosya, "Açık sorular" |
| Neyi bilerek yapmıyoruz? | Aynı dosya, "Bilinçli olarak yapılmayacaklar" |
| Kişiler birleşmesi ayrıntısı | `docs/2026-08-10-KISILER-BIRLESME-PLANI.md` |
| Prod'a nasıl çıkılır | `docs/2026-08-10-DOMAIN-02-DEPLOY-RUNBOOK.md`, `docs/DEPLOY-COOLIFY.md` |
| Canlı tıklama turu | `docs/2026-08-09-PROD-SMOKE-REHBERI.md` |
| Denetim bulgularının aslı | `AUDIT-REPORT.md` (her bulgunun altında Resolution notu) |
| Tracker → Verimaya gap'leri | `docs/tracker-verimaya-ozellik-gap.md` |
| Mimari kararlar | `docs/MIMARI.md`, `AGENTS.md` |

---

## 4. Kabaca ne kapanmış sayılır?

Faz 0–7 kodu · DOMAIN-01 · GAP P0/P1 (GAP-08 kapsam kilidi dahil, **uygulaması hariç**) ·
DOMAIN-02 (E4 hariç) · Faz 9 denetim/gap kalemlerinin çoğu — OpenAPI generator, i18n
süpürmesi, MIME sniff, dosya önizleme ve silme, audit filtreleri, corrections-report,
bulk-type, auto-link, DLQ, duplicate scan, guard coverage, API key scope haritası,
tenant soft-delete + FK restrict, KVKK `/v1/me` endpoint'leri, deploy CI kapısı,
bağımlılık denetimi.

Kanıt: YAPILACAKLAR "Son kapananlar" + `docs/Arşiv/2026-08-03-YAPILACAKLAR.md`.

---

## 5. Bu dosya ne zaman güncellenir?

Kalem kapandığında **değil**. Yalnız:

- YAPILACAKLAR yeni tarihli dosyaya taşındığında (kural 8 re-base),
- §1'deki "Faz 8" karışıklığı gibi yeni bir kavram karışıklığı çıktığında,
- §2'deki bir yüzey gerçekten değiştiğinde (ör. import/export yazıldığında).

Kalem durumu için tek kaynağa bak; burayı senkron tutmaya çalışma.
