#!/usr/bin/env bash
# Daily Postgres dump → Cloudflare R2 (OPS-01).
# Run on the Coolify/Hetzner host (cron or Coolify scheduled job).
#
# Required env:
#   PG_CONTAINER          docker name/id of Postgres (e.g. from `docker ps`)
#   PG_USER               default: verimaya  (or postgres)
#   PG_DATABASE           default: verimaya
#   R2_ENDPOINT           https://<ACCOUNT_ID>.r2.cloudflarestorage.com
#   R2_BUCKET             verimaya-pg-backups
#   AWS_ACCESS_KEY_ID     R2 API token access key id
#   AWS_SECRET_ACCESS_KEY R2 API token secret
#
# Optional:
#   BACKUP_DIR            local staging dir (default /var/backups/verimaya)
#   KEEP_LOCAL_DAYS       default 7
#   R2_PREFIX             object prefix (default pg)

set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:?set PG_CONTAINER to the postgres container name/id}"
PG_USER="${PG_USER:-verimaya}"
PG_DATABASE="${PG_DATABASE:-verimaya}"
R2_ENDPOINT="${R2_ENDPOINT:?set R2_ENDPOINT}"
R2_BUCKET="${R2_BUCKET:-verimaya-pg-backups}"
R2_PREFIX="${R2_PREFIX:-pg}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/verimaya}"
KEEP_LOCAL_DAYS="${KEEP_LOCAL_DAYS:-7}"

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:?set AWS_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:?set AWS_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/pg-${STAMP}.sql.gz"
REMOTE_KEY="${R2_PREFIX}/pg-${STAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[backup] dumping ${PG_DATABASE} from ${PG_CONTAINER} → ${OUT}"
docker exec -i "${PG_CONTAINER}" \
	pg_dump -U "${PG_USER}" -d "${PG_DATABASE}" --format=plain \
	| gzip -9 > "${OUT}"

BYTES="$(wc -c < "${OUT}" | tr -d ' ')"
if [[ "${BYTES}" -lt 1000 ]]; then
	echo "[backup] ERROR: dump too small (${BYTES} bytes)" >&2
	exit 1
fi

echo "[backup] uploading s3://${R2_BUCKET}/${REMOTE_KEY} (${BYTES} bytes)"
aws s3 cp "${OUT}" "s3://${R2_BUCKET}/${REMOTE_KEY}" \
	--endpoint-url "${R2_ENDPOINT}"

echo "[backup] pruning local dumps older than ${KEEP_LOCAL_DAYS}d"
find "${BACKUP_DIR}" -name 'pg-*.sql.gz' -mtime "+${KEEP_LOCAL_DAYS}" -delete || true

echo "[backup] OK ${REMOTE_KEY}"
