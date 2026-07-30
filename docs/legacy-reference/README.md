# Legacy Referans — Fixrav Tracker

Eski sistemin (FastAPI + PostgreSQL + React) veri modeli ve iş kuralları buraya **referans** olarak çıkarılır. Kod taşınmaz; şema bilgisi ve alan kararları yeni Drizzle şeması yazılırken kaynak olur.

## Doldurulacaklar

- [x] `schema.sql` — eski veritabanı şeması (yerel Tracker dump, 2026-07-30):

```bash
# fixrav-tracker docker compose ayaktayken:
docker compose -f ~/Projects/fixrav-web/_projects/fixrav-tracker/docker-compose.yml \
  exec db pg_dump -U fixrav --schema-only --no-owner --no-acl tracker > schema.sql
# \restrict satırını commit öncesi sil
```

- [x] `ETL-ESLEME.md` — Tracker → Verimaya alan / enum / sözlük eşlemesi (Adım 26)
- [ ] `routes.md` — eski API rota listesi (FastAPI `/docs` OpenAPI çıktısından veya `backend/app/routers/` taramasından)
- [ ] `roller-erisim.md` — `docs/referans/KULLANICI_ROLLERI_VE_ERISIM.md` kopyası (RBAC matrisi)
- [ ] `notlar.md` — ilk sürümde pişman olunan modelleme kararları ve yeni şemada yapılacak düzeltmeler

## Kullanım kuralı

Yeni bir domain tablosu tasarlanırken önce buradaki karşılığına bakılır: hangi alanlar vardı, hangileri kullanılmadı, hangi kısıtlar eksikti. "Yeniden keşfetme, düzelterek taşı."

## Hazır notlar

- [x] `ETL-ESLEME.md` — Alan eşleme + sözlük + satır sayıları (Adım 26)
- [x] `case-expenses.md` — Case Expenses = hasta/proje finans özeti; legacy hataları ve Verimaya düzeltmeleri
- [x] `dosyalar.md` — Case/appointment dosya yükleme; Drive hataları ve Verimaya storage planı
- [x] `raporlar.md` — Reports summary/category; dönem + drill-down; istemci aggregate hataları
- [x] `ayarlar.md` — Settings hub kartları; ne taşınır / ne sadeleşir / faz eşlemesi
- [x] `dev-panel.md` — `/dev-users` platform org+user yönetimi; Verimaya `/dev` demosu
