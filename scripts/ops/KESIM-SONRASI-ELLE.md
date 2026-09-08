# Kesimden sonra elle eklenecekler

ETL bunları taşıyamıyor (kaynakta `case_id` boş). Aktarım bittikten **sonra**
web arayüzünden ekle. Önce ekleme — `etl:reset` siler.

## 1. Üç vaka + randevu + fotoğraf

Kişiler zaten taşınmış olacak, sadece vaka açıp randevuyu gireceksin.

| Kişi | Randevu tarihi | Fotoğraf |
| --- | --- | --- |
| Aynur Taşman | 19.04.2026 | `2026-04-19 - Aynur Taşman - WhatsApp Image 2026-04-28 at 17.18.15.jpeg` |
| Tracy Jane Alford | 07.04.2026 | `2026-04-07 - Tracy Jane Alford - WhatsApp Image 2026-04-28 at 17.17.08.jpeg` |
| Matthew Baker | 13.06.2026 | `2026-06-13 - Matthew Baker - WhatsApp Image 2026-04-28 at 17.24.00.jpeg` |

## 2. Bir işlemin GBP karşılığı

Kaynakta GBP karşılığı girilmemiş tek işlem:

- Tarih: 11.06.2026
- Başlık: Expense · Operasyon Giderleri · Tedavi Ücreti
- Tutar: 100.000,00 TRY
- **Girilecek GBP karşılığı: 1.621,00**  (ECB/Frankfurter TRY→GBP 0,01621 @ 11.06.2026)

Eski sistem de bu satırı toplamdan hariç tutuyordu ("1 işlem GBP karşılığı
olmadığı için toplamdan hariç tutuldu"). Girince yeni sistemde toplama dahil olur.
