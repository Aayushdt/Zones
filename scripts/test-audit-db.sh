#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d /tmp/xzones-audit-pg.XXXXXX)"
PG_DATA="$TMP_DIR/data"
PG_SOCKET="$TMP_DIR/socket"
PG_PORT="54332"
PG_DB="xzones_audit"
PG_URL="postgresql:///${PG_DB}?host=${PG_SOCKET}&port=${PG_PORT}"
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
DATABASE_URL="$PG_URL" bash scripts/test-schema.sh
psql "$PG_URL" -v ON_ERROR_STOP=1 -f tests/audit/db_scenarios_audit.sql
