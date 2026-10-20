# Supabase backend audit report

**Mode:** FAST  
**Audited source:** `a46b47f`  
**Audit branch:** `audit/supabase-db`  
**Scope:** `backend/supabase`, associated Edge API, and migration-driven database design. No application, migration, or remote-project changes were made.

## Executive summary

No Critical or High finding was confirmed. The migration chain applies and its existing disposable PostgreSQL smoke/race scenarios pass. Four follow-ups remain: anonymous-auth abuse controls, hosted Realtime private-channel enforcement, local redirect consistency, and independently scheduled retention cleanup. The real Supabase stack could not be started because Docker socket access was denied; hosted configuration, Advisors, and load behavior are therefore explicitly UNVERIFIED.

## Evidence and confidence

| Check | Result | Status |
| --- | --- | --- |
| Pinned Supabase CLI | 2.121.0 available | VERIFIED |
| Local Supabase stack/status/reset/dump/diff | Docker socket permission denied | UNVERIFIED |
| Full migration chain and existing schema scenarios | `bash scripts/test-audit-db.sh` passed | VERIFIED (compatibility shim, not hosted Supabase) |
| Edge API unit tests | `corepack pnpm test:edge`: 19 passed | VERIFIED (mocked integration boundaries) |
| Table/RLS/RPC design | Static migration inspection | VERIFIED for source, UNVERIFIED for deployed catalog |
| Two-user access matrix and IDOR attempts | Scripts prepared; no real stack | UNVERIFIED |
| Realtime private-topic behavior | Static client/server/migration inspection | LIKELY; hosted switch UNVERIFIED |
| 30-match / 100-player seed, ten-session concurrency, explain plans | No stack | UNVERIFIED |

## Findings

See `FINDINGS.md` for evidence, impact, and validation steps.

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 1 |
| Unverified configuration risk | 1 |

## Security review

- Source tables are RLS-enabled and browser roles revoked at `backend/supabase/migrations/202610180001_core.sql:161` and `backend/supabase/migrations/202610180001_core.sql:170`.
- Privileged RPCs use `SECURITY DEFINER`, a pinned `search_path`, and service-role execution grants. The Edge handler separately resolves the caller from `/auth/v1/user` before forwarding its user id (`backend/supabase/functions/api/index.ts:73`).
- CORS allows any origin at `backend/supabase/functions/api/index.ts:7`. Given bearer-token authentication, this is not by itself an IDOR finding, but browser deployment origins and CSRF assumptions should be reviewed before introducing cookie auth.
- Realtime sends per-player, private role topics and client subscriptions request `private: true`; hosted Realtime must also have public channels disabled (DB-002).
- Anonymous sign-in controls are a deployment priority (DB-001). Current official Supabase guidance recommends CAPTCHA/Turnstile for anonymous sign-ins and warns that automatic cleanup is not provided. [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)

## Integrity, concurrency, and game logic

- Core constraints, composite foreign keys, unique keys, transactional RPCs, advisory cleanup locking, and item-use uniqueness provide strong source-level integrity coverage.
- Existing smoke scenarios pass lifecycle/end races, role-topic rejection, GPS/QR flows, zones, chat, and item behavior in the disposable harness.
- The dedicated ten-session concurrency harness is present but cannot run without a disposable database URL and reviewed synthetic fixture. No claim is made about production lock waits, deadlocks, or p95 latency.
- The camouflage trigger deletes a just-created ping snapshot when active (`backend/supabase/migrations/202610200039_runner_camouflage.sql:28`); existing smoke tests pass, but a real Realtime delivery test remains UNVERIFIED.

## Performance and capacity

- Indexes exist for common lifecycle/lookup paths (for example matches deadlines, player membership, latest fixes, pings, QR expiry, and cleanup queues).
- Query plans, table sizes, connection saturation, Realtime authorization latency, publication membership, and hosting/pricing limits were not measurable without a stack or project access.
- Supabase documents that private-channel authorization checks occur on join and are cached per connection; policy complexity can affect join latency. [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)

## Operations and privacy

- DB-004 is the primary operational issue: cleanup is request-driven, not scheduled.
- There is no migration version drift evidence in source; applied migration history is UNVERIFIED.
- No raw locations, user data, tokens, URLs, project references, or secrets were collected.
- Backup/PITR, compute, quota, Auth dashboard, function secrets, custom domains, and log retention are hosted settings and were not accessible.

## Proposed next actions

1. Configure CAPTCHA and anonymous-user retention (proposal: `proposed-code/auth-abuse-hardening.md`).
2. Disable public Realtime channels in the hosted project and execute the two-user access matrix.
3. Add managed, monitored cleanup scheduling (proposal: `proposed-code/cleanup-scheduling.md`).
4. Restore Docker access or provide a disposable Supabase project, then run catalog scripts, schema dump/diff, 30-match/100-player seed, ten-session concurrency, and query-plan capture.

## Reproducible artifacts

- `raw/environment.txt` — non-sensitive environment result.
- `queries/inventory.sql` and `queries/advisors.sql` — catalog-only scripts.
- `tests/access-matrix.sh` and `tests/concurrency.sh` — scripts requiring synthetic credentials/fixtures supplied only at runtime.
- `INVENTORY.md`, `FINDINGS.md`, and `DECISIONS.md` — audit evidence and scope decisions.
