# Schema inventory

**Scope:** migration chain `202610180001_core.sql` through `202610200039_runner_camouflage.sql` at source revision `a46b47f`.

## Verified from the disposable PostgreSQL harness

- All 39 migrations apply in order using the repository's Supabase compatibility shim.
- The existing schema smoke suite and 14 scenario checks pass, including role-topic rejection, lifecycle races, GPS/QR behavior, zones, chat, and all item migrations.
- The application schema contains the core gameplay tables (`matches`, `players`, locations, pings, tags, QR challenges, rate limits, results), supporting moderation/chat tables, and item state/alert tables.
- Core tables are RLS-enabled and browser roles are explicitly revoked in `backend/supabase/migrations/202610180001_core.sql:161` and `backend/supabase/migrations/202610180001_core.sql:170`.
- The migration chain contains 34 policy declarations and 13 RLS-enablement statements. Exact deployed catalog counts are UNVERIFIED.

## Access design observed statically

- Database RPCs are `SECURITY DEFINER`, pin `search_path`, revoke browser-role execution, and grant `service_role` execution in the migrations.
- The edge API validates the user token before forwarding the authenticated user id to privileged RPCs at `backend/supabase/functions/api/index.ts:73` and `backend/supabase/functions/api/index.ts:87`.
- Realtime publishes per-player private topics (`private=true`) at `backend/supabase/functions/api/broadcast.ts:28`; the client subscribes with `private: true` at `apps/web/src/services/supabase-api.ts:484`.

## Unverified deployment catalog

The local Supabase stack could not start because Docker socket access was denied. Therefore `supabase db dump --local`, `supabase db diff --local`, the real role/policy catalog, Realtime Settings, hosted extensions, and hosted Auth settings are UNVERIFIED. `queries/inventory.sql` and `queries/advisors.sql` are ready to collect only catalog metadata when a disposable stack is available.
