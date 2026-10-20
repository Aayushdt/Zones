#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a disposable migrated PostgreSQL database}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d /tmp/xzones-tag-race.XXXXXX)"
MATCH_ID='20000000-0000-4000-8000-000000000001'
HUNTER_ID='10000000-0000-4000-8000-000000000001'
RUNNER_ID='10000000-0000-4000-8000-000000000002'
cleanup() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/tests/schema/tag-race-teardown.sql" >/dev/null
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/tests/schema/tag-race-setup.sql" >/dev/null
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "select public.xzones_gps_tag('$HUNTER_ID', '$MATCH_ID', decode(repeat('b',64),'hex'), 0, 0, 5, clock_timestamp())" >"$TMP_DIR/gps" 2>&1 & gps_pid=$!
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "select public.xzones_scan_qr('$HUNTER_ID', '$MATCH_ID', decode(repeat('a',64),'hex'))" >"$TMP_DIR/qr" 2>&1 & qr_pid=$!
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "select public.xzones_confirm_tag('$RUNNER_ID', '$MATCH_ID')" >"$TMP_DIR/surrender" 2>&1 & surrender_pid=$!
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "select public.xzones_end_match('$HUNTER_ID', '$MATCH_ID', 'HOST_END')" >"$TMP_DIR/end" 2>&1 & end_pid=$!
wait "$gps_pid"
wait "$qr_pid"
wait "$surrender_pid"
wait "$end_pid"

state="$(psql "$DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "select state from public.matches where id='$MATCH_ID'")"
tags="$(psql "$DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "select count(*) from public.tags where match_id='$MATCH_ID'")"
result_count="$(psql "$DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "select count(*) from public.match_results where match_id='$MATCH_ID'")"
if [[ "$state" != 'ENDED' || "$tags" -gt 1 || "$result_count" != '1' ]]; then
  cat "$TMP_DIR"/*
  echo "tag race failed: state=$state tags=$tags results=$result_count" >&2
  exit 1
fi
echo "GPS/QR/surrender/end race PASS (state=$state, tags=$tags, result=$result_count)"
