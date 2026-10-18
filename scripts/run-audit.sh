#!/usr/bin/env bash
set -euo pipefail

echo "========================================================"
echo "          XZONES GAME LOGIC AUDIT RUNNER               "
echo "========================================================"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PG_SOCKET="/tmp/xzones_test_pg"
PG_PORT="54332"
PG_DB="xzones_test"
PG_URL="postgresql:///${PG_DB}?host=${PG_SOCKET}&port=${PG_PORT}"

# 1. Check or start PostgreSQL
echo "--> [1/5] Checking PostgreSQL local test cluster..."
if ! pg_isready -h "$PG_SOCKET" -p "$PG_PORT" >/dev/null 2>&1; then
  echo "    Starting local test PostgreSQL on ${PG_SOCKET}:${PG_PORT}..."
  if [ ! -d "$PG_SOCKET" ]; then
    mkdir -p "$PG_SOCKET"
    initdb -D "$PG_SOCKET" -A trust -U "$USER" >/dev/null 2>&1
  fi
  pg_ctl -D "$PG_SOCKET" -l /tmp/xzones_test_pg.log -o "-k ${PG_SOCKET} -p ${PG_PORT} -c listen_addresses=''" start
  createdb -h "$PG_SOCKET" -p "$PG_PORT" "$PG_DB" || true
fi

echo "    Applying test shim and all 9 migrations to fresh test database..."
dropdb -h "$PG_SOCKET" -p "$PG_PORT" --if-exists "$PG_DB" >/dev/null 2>&1 || true
createdb -h "$PG_SOCKET" -p "$PG_PORT" "$PG_DB"
psql "$PG_URL" -v ON_ERROR_STOP=1 -f tests/schema/vanilla-supabase-shim.sql >/dev/null
for f in $(ls -1 backend/supabase/migrations/*.sql | sort); do
  psql "$PG_URL" -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done
echo "    PostgreSQL migrations applied successfully."

# 2. Run baseline unit, typecheck and lint
echo "--> [2/5] Running static analysis & baseline suites..."
corepack pnpm test:unit
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test:edge
corepack pnpm verify:payloads
corepack pnpm test:sim

# 3. Run audit test suites
echo "--> [3/5] Running audit test suites in tests/audit/..."
echo "    Running pure game-core rules audit..."
corepack pnpm --filter @xzones/game-core exec vitest run --root ../.. tests/audit/rules_audit.test.ts

echo "    Running client game logic audit..."
corepack pnpm --filter @xzones/game-core exec vitest run --root ../.. tests/audit/client_logic_audit.test.ts

echo "    Running hostile API & privacy audit (Deno)..."
corepack pnpm exec deno test --allow-env tests/audit/api_hostile_audit_test.ts

# 4. Run database lifecycle and scenarios audit
echo "--> [4/5] Running 12 full-match SQL scenarios against PostgreSQL..."
psql "$PG_URL" -v ON_ERROR_STOP=1 -f tests/audit/db_scenarios_audit.sql

echo "========================================================"
echo "          AUDIT SUITE EXECUTION COMPLETE                "
echo "========================================================"
echo "All audit harnesses executed with verifiable output."
echo "See error.md for full findings, spec gaps, and verification matrix."
