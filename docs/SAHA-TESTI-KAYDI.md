# Saha Testi Kaydı — şablon

Kaynak: Ölçek Profili şartnamesi v3 §8. Ürün içi karne (Adım 37) saha testi için
**aynı sırayla** doldurulur; format sapması karşılaştırılabilirliği bozar.

> **Kritik kısıt:** En az bir test **gözetimsiz** ve test edenin olmadığı ortamda
> doldurulmalı. Kendi firmada doldurmak yalnız aritmetiği doğrular, anlaşılırlığı
> doğrulamaz.

```markdown
## Saha Testi Kaydı — [işletme adı/kod]

**Tarih:** [gg.aa.yyyy]
**Doldurma ortamı:** [ ] Gözetimli (test eden odada/hatta)  [ ] Gözetimsiz (katılımcı tek başına)
> Protokolün kuralı bu ayrımı gerektiriyor — kayıtta görünmezse hangi testin
> gerçekten anlaşılırlık verisi saydığı karışır. Yalnızca gözetimsiz testler
> eksen 2 (anlaşılırlık) için geçerli kabul edilir.

### Kurum bilgisi
- **İşletme tipi / sektör:**
- **Kişi sayısı:**
- **Düşen bant:** [ ] 1–4  [ ] 5–15  [ ] 16+
- **Kurulum cevapları:** S1 (orta kademe) — [E/H] · S2 (ayrı fonksiyon) — [E/H] · S3 (yazılı süreç) — [E/H]

### Eksen 1 — Süre
- Başlangıç saati: · Bitiş saati: · Toplam:
- Ara verildi mi: [E/H] — verildiyse kaçıncı kriterde:
- Tamamlandı mı: [E/H] — tamamlanmadıysa terk edilen kriter no:

### Eksen 2 — Anlaşılırlık
- "Anlamadım" denen kriter numaraları: [ör. 3.4, 6.2, ...]
- Toplam sayı: (hedef: 0 · >3 ise dil elden geçirilir)

### Eksen 3 — Kurulum sorularının ayırt ediciliği
- Bu kurum aynı bant + aynı kurulum profiline düşen başka bir test var mı: [E/H]
- Varsa, gerçekte yapıları farklı mı (profil onları yanlışlıkla eşitledi mi): [E/H/N/A]

### Eksen 4 — İnandırıcılık (en önemli)
- Soru: *"Bu tablo senin durumunu doğru anlatıyor mu?"*
- Cevap: [ ] Evet  [ ] Kısmen  [ ] Hayır
- Kısmen/Hayır ise, yanlış hissettiren boyut(lar):

### Skor
- Ham yüzde: · Bant yorumu: [Başlangıç/Parçalı/Tutarlı/Olgun]

### Serbest not
> Katılımcının kriter dışında söyledikleri. "Bunu zaten yapıyoruz ama hiç böyle
> düşünmemiştim" ya da "bu soruyu patronuma soramam" gibi cümleler dört eksenin
> hiçbirine girmez ama ürün için en değerli veri bunlar olabilir. Kelimesi
> kelimesine, yorumlamadan yaz.
-
-
```

## Test sırası (şartname §8)

1. Kendi üzerinde bir kez — yalnız aritmetik hatası (anlaşılırlık sayılmaz)
2. Tanıdık kurumda **gözetimsiz** doldurt
3. Mümkünse farklı sektörden ikinci kurum (kurulum sorularının ayırt ediciliği)
