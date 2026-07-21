#!/bin/bash
set -euo pipefail
# Runs once on empty Postgres data volume (docker-entrypoint-initdb.d).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'verimaya_app') THEN
      CREATE ROLE verimaya_app LOGIN PASSWORD 'verimaya' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    END IF;
  END
  \$\$;
  GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO verimaya_app;
EOSQL
