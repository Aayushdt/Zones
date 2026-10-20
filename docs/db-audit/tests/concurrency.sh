#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to a disposable local database}"
: "${AUDIT_CONCURRENCY_SQL:?Set to a reviewed, synthetic-fixture SQL file}"
for worker in $(seq 1 10); do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v audit_worker="$worker" -f "$AUDIT_CONCURRENCY_SQL" >"/tmp/zones-audit-concurrency-${worker}.log" 2>&1 &
done
wait
printf 'completed 10 concurrent synthetic sessions\n'
