#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d /tmp/xzones-load.XXXXXX)"
PG_DATA="$TMP_DIR/data"
PG_SOCKET="$TMP_DIR/socket"
PG_PORT="$(shuf -i 54340-54999 -n 1)"
PG_DB="xzones_load"
PG_URL="postgresql:///${PG_DB}?host=${PG_SOCKET}&port=${PG_PORT}"
DURATION_SECONDS="${DURATION_SECONDS:-600}"
AGGREGATE_INTERVAL="$DURATION_SECONDS"
if (( AGGREGATE_INTERVAL > 60 )); then AGGREGATE_INTERVAL=60; fi
mkdir -p "$PG_SOCKET"

cleanup() {
  pg_ctl -D "$PG_DATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

initdb -D "$PG_DATA" -A trust -U "${USER:-postgres}" >/dev/null
pg_ctl -D "$PG_DATA" -l "$TMP_DIR/postgres.log" \
  -o "-k $PG_SOCKET -p $PG_PORT -c listen_addresses=''" start >/dev/null
createdb -h "$PG_SOCKET" -p "$PG_PORT" "$PG_DB"

cd "$ROOT_DIR"
DATABASE_URL="$PG_URL" bash scripts/test-schema.sh >/dev/null
psql "$PG_URL" -v ON_ERROR_STOP=1 -f tools/simulator/load-test-setup.sql >/dev/null

pgbench -n -h "$PG_SOCKET" -p "$PG_PORT" -U "${USER:-postgres}" -d "$PG_DB" \
  -c 100 -j 8 -T "$DURATION_SECONDS" -R 15.33 --progress="$AGGREGATE_INTERVAL" --aggregate-interval="$AGGREGATE_INTERVAL" \
  --log --log-prefix="$TMP_DIR/pgbench" -f tools/simulator/load-test.sql

psql "$PG_URL" -v ON_ERROR_STOP=1 -P pager=off -c "
  select 'duration_seconds=' || ${DURATION_SECONDS}
    || '; simulated_players=' || count(distinct slot)
    || '; api_requests=' || (select count(*) from public.xzones_load_requests)
    || '; request_errors=' || (select count(*) from public.xzones_load_requests where has_error)
    || '; error_rate_percent=' || round(100.0 * (select count(*) from public.xzones_load_requests where has_error)
         / greatest(1, (select count(*) from public.xzones_load_requests)), 4)
    || '; rpc_calls=' || (select count(*) from public.xzones_load_rpc_samples)
    || '; rpc_errors=' || (select count(*) from public.xzones_load_rpc_samples where has_error)
    || '; rpc_p95_ms=' || round((select percentile_cont(0.95) within group(order by latency_ms)
         from public.xzones_load_rpc_samples)::numeric, 3)
    || '; rpc_max_ms=' || round((select max(latency_ms)::numeric from public.xzones_load_rpc_samples), 3)
    as load_test_summary
  from public.xzones_load_players;
"
