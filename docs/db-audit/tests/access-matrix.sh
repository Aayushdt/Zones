#!/usr/bin/env bash
set -euo pipefail
: "${SUPABASE_URL:?Set SUPABASE_URL for a disposable local stack}"
: "${ANON_JWT:?Set an anon or authenticated test JWT}"
for endpoint in rest/v1/matches rest/v1/players rest/v1/player_locations; do
  status=$(curl --silent --output /dev/null --write-out '%{http_code}' -H "apikey: ${ANON_JWT}" -H "Authorization: Bearer ${ANON_JWT}" "${SUPABASE_URL}/${endpoint}?limit=1")
  printf '%s %s\n' "$endpoint" "$status"
done
