#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-}" = "true" ]; then
	echo "Running database migrations..."
	pnpm db:migrate
fi

exec "$@"
