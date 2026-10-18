#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to an empty disposable PostgreSQL database}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/schema/vanilla-supabase-shim.sql
for migration in backend/supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
for smoke in tests/schema/*-smoke.sql; do
  [[ "$smoke" == tests/schema/vanilla-supabase-shim.sql ]] && continue
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$smoke"
done
