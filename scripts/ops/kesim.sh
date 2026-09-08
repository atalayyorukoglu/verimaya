#!/usr/bin/env bash
# Fixrav Tracker → Verimaya kesim (cutover). Adım 1–9, tek komut.
#
# Kullanım:
#   TENANT_ID=<uuid> TENANT_SLUG=<slug> TRACKER_TENANT_ID=<uuid> \
#   TRACKER_DATABASE_URL=postgres://... \
#   ./scripts/ops/kesim.sh
#
# Her yıkıcı adımda onay sorar. İstediğin adımdan devam etmek için:
#   BASLA=5 ./scripts/ops/kesim.sh
#
# Zorunlu env:
#   TENANT_ID             Verimaya tenant uuid
#   TENANT_SLUG           tenants.slug (reset onayı için)
#   TRACKER_TENANT_ID     Eski sistemdeki tenant uuid
#   TRACKER_DATABASE_URL  Eski Tracker Postgres (salt-okunur kullanıcı)
# İsteğe bağlı:
#   TRACKER_ADMIN_URL     REVOKE için yetkili bağlantı (yoksa adım 1 elle yapılır)
#   TRACKER_DB_ROLE       REVOKE edilecek rol (varsayılan: fixrav)
#   BASLA                 başlanacak adım (varsayılan 1)
#   BITIR                 bitirilecek adım (varsayılan 9)

set -euo pipefail

TENANT_ID="${TENANT_ID:?TENANT_ID gerekli}"
TENANT_SLUG="${TENANT_SLUG:?TENANT_SLUG gerekli}"
TRACKER_TENANT_ID="${TRACKER_TENANT_ID:?TRACKER_TENANT_ID gerekli}"
TRACKER_DATABASE_URL="${TRACKER_DATABASE_URL:?TRACKER_DATABASE_URL gerekli}"
export TRACKER_DATABASE_URL
TRACKER_DB_ROLE="${TRACKER_DB_ROLE:-fixrav}"
BASLA="${BASLA:-1}"
BITIR="${BITIR:-9}"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="${REPO}/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="${REPO}/backups/kesim-${STAMP}"
mkdir -p "${BACKUP_DIR}" "${LOG_DIR}"

ETL=(pnpm --filter @verimaya/api)

# DATABASE_URL_APP dışarıdan verilmediyse apps/api/.env'den al (adım 9 psql için).
if [ -z "${DATABASE_URL_APP:-}" ] && [ -f "${REPO}/apps/api/.env" ]; then
  DATABASE_URL_APP="$(grep -m1 '^DATABASE_URL_APP=' "${REPO}/apps/api/.env" | cut -d= -f2- | tr -d '"'"'"'"'"'")"
  export DATABASE_URL_APP
fi

adim()  { [ "$1" -ge "$BASLA" ] && [ "$1" -le "$BITIR" ]; }
baslik(){ printf '\n\033[1m=== Adım %s — %s ===\033[0m\n' "$1" "$2"; }
dur()   { printf '\033[31mDUR: %s\033[0m\n' "$1" >&2; exit 1; }
onay()  {
  printf '\033[33m%s\033[0m [evet/hayir] ' "$1"
  read -r c </dev/tty
  [ "$c" = "evet" ] || dur "onaylanmadı"
}

# ── 1. Eski sistemi dondur ────────────────────────────────────────────────
# Railway'de uygulama `postgres` SUPERUSER ile bağlanıyor; REVOKE superuser'ı
# bağlamaz. Gerçek dondurma = Railway'de backend servisini durdurmak.
# DB tarafı ikinci emniyet kemeri: default_transaction_read_only.
if adim 1; then
  baslik 1 "eski sistemi dondur"
  cat <<'NOT'
Railway panelinde ŞUNLARI yap:
  1. Tracker projesi → backend servisi → Settings → Remove/Stop deployment
  2. Aynı yerde frontend servisi → Stop  (kullanıcı UI'ı hiç görmesin)
  3. WAHA / WhatsApp webhook servisi → Stop
NOT
  onay "Railway'de backend + frontend + WAHA durduruldu mu?"

  if [ -n "${TRACKER_ADMIN_URL:-}" ]; then
    onay "Veritabanını salt-okunur işaretleyeyim mi? (yeni oturumlar yazamaz)"
    DBNAME="$(psql "${TRACKER_ADMIN_URL}" -Atc 'select current_database()')"
    psql "${TRACKER_ADMIN_URL}" -v ON_ERROR_STOP=1 \
      -c "ALTER DATABASE \"${DBNAME}\" SET default_transaction_read_only = on;"
    echo "salt-okunur açıldı (geri alma: ALTER DATABASE \"${DBNAME}\" RESET default_transaction_read_only;)"
    echo "NOT: bu ayar sadece YENİ oturumlarda geçerli; açık bağlantılar için servisleri durdurmak şart."
  fi

  echo "-- son satır sayıları (kesim öncesi kayıt) --"
  psql "${TRACKER_DATABASE_URL}" -v ON_ERROR_STOP=1 -v t="${TRACKER_TENANT_ID}" <<'SQL' | tee "${LOG_DIR}/01-son-sayilar.txt"
\pset format unaligned
\pset footer off
SELECT 'contacts' k, count(*) n FROM contacts WHERE tenant_id = :'t'::uuid
UNION ALL SELECT 'cases', count(*) FROM cases WHERE tenant_id = :'t'::uuid
UNION ALL SELECT 'appointments', count(*) FROM appointments WHERE tenant_id = :'t'::uuid
UNION ALL SELECT 'transactions', count(*) FROM transactions WHERE tenant_id = :'t'::uuid;
SQL
fi

# ── 2. Yedek ──────────────────────────────────────────────────────────────
DUMP="${BACKUP_DIR}/tracker-production-${STAMP}.dump"
if adim 2; then
  baslik 2 "yedek al"
  pg_dump "${TRACKER_DATABASE_URL}" -Fc -f "${DUMP}"
  shasum -a 256 "${DUMP}" > "${DUMP}.sha256"
  ls -lh "${DUMP}"; cat "${DUMP}.sha256"
fi

# ── 3. Yeni tenant'ı temizle ──────────────────────────────────────────────
if adim 3; then
  baslik 3 "yeni tenant'ı temizle"
  "${ETL[@]}" etl:reset -- --tenant-id "${TENANT_ID}" | tee "${LOG_DIR}/03-reset-kuru.log"
  onay "Yukarıdaki satırlar SİLİNECEK. Devam?"
  "${ETL[@]}" etl:reset -- --apply --confirm "${TENANT_SLUG}" --tenant-id "${TENANT_ID}" \
    | tee "${LOG_DIR}/03-reset-apply.log"
fi

# ── 4. Kuru prova ─────────────────────────────────────────────────────────
if adim 4; then
  baslik 4 "kuru prova"
  "${ETL[@]}" etl -- --tenant-id "${TENANT_ID}" --tracker-tenant-id "${TRACKER_TENANT_ID}" \
    --no-fx-backfill | tee "${LOG_DIR}/04-dry-run.log"
  onay "Hata sayısı 0 mı? Devam?"
fi

# ── 5. Aktar ──────────────────────────────────────────────────────────────
if adim 5; then
  baslik 5 "aktar"
  "${ETL[@]}" etl -- --apply --tenant-id "${TENANT_ID}" --tracker-tenant-id "${TRACKER_TENANT_ID}" \
    --no-fx-backfill | tee "${LOG_DIR}/05-apply.log"
fi

# ── 6. Idempotans: tekrar çalıştır, 0 insert bekle ────────────────────────
if adim 6; then
  baslik 6 "tekrar çalıştır (0 insert bekleniyor)"
  "${ETL[@]}" etl -- --apply --tenant-id "${TENANT_ID}" --tracker-tenant-id "${TRACKER_TENANT_ID}" \
    --no-fx-backfill | tee "${LOG_DIR}/06-apply-tekrar.log"
  onay "Bu koşuda yeni satır EKLENMEDİ mi? Devam?"
fi

# ── 7. Doğrula ────────────────────────────────────────────────────────────
if adim 7; then
  baslik 7 "doğrula"
  if "${ETL[@]}" etl:verify -- --tenant-id "${TENANT_ID}" --tracker-tenant-id "${TRACKER_TENANT_ID}" \
       | tee "${LOG_DIR}/07-verify.log"; then
    echo "verify TEMİZ."
  else
    dur "verify başarısız. Elle düzeltme YOK — logu oku, sorunu çöz, 'BASLA=3' ile baştan al."
  fi
fi

# ── 8. Kur çevrimini doldur ───────────────────────────────────────────────
if adim 8; then
  baslik 8 "ECB kur çevrimini doldur"
  "${ETL[@]}" etl -- --apply --tenant-id "${TENANT_ID}" --tracker-tenant-id "${TRACKER_TENANT_ID}" \
    | tee "${LOG_DIR}/08-fx-backfill.log"
fi

# ── 9. Mutabakat tablosu (iki DB, elle karşılaştır) ───────────────────────
if adim 9; then
  baslik 9 "mutabakat"
  psql -q "${TRACKER_DATABASE_URL}" -v ON_ERROR_STOP=1 -v t="${TRACKER_TENANT_ID}" \
    -f "${REPO}/scripts/ops/kesim-mutabakat-eski.sql" > "${LOG_DIR}/09-eski.txt"
  psql -q "${DATABASE_URL_APP:?adım 9 için DATABASE_URL_APP gerekli}" -v ON_ERROR_STOP=1 -v t="${TENANT_ID}" \
    -f "${REPO}/scripts/ops/kesim-mutabakat-yeni.sql" > "${LOG_DIR}/09-yeni.txt"
  echo
  if diff -u "${LOG_DIR}/09-eski.txt" "${LOG_DIR}/09-yeni.txt"; then
    echo "MUTABAKAT TEMİZ — satır sayıları, toplamlar ve hash'ler birebir aynı."
  else
    echo "Fark yukarıda. hash sütunu farklıysa satır içeriği bozulmuş demektir."
  fi

  echo; echo "-- kaçak taraması (hepsi 0 olmalı) --"
  psql -q "${DATABASE_URL_APP}" -v ON_ERROR_STOP=1 -v t="${TENANT_ID}" \
    -f "${REPO}/scripts/ops/kesim-kacaklar.sql" | tee "${LOG_DIR}/09-kacaklar.txt"
fi

printf '\n\033[1mBitti.\033[0m Loglar: %s\n' "${LOG_DIR}"
echo "Eski sistemi 2–4 hafta salt-okunur ayakta tut. Silme yok."
