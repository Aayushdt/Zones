# Game Logic Audit Fix Log

## Step 0 — baseline and regression tracking

- **Base:** `audit/game-logic` at `adb6035`; working branch: `fix/audit-findings`.
- **Install:** `corepack pnpm install --frozen-lockfile --store-dir /tmp/xzones-pnpm-store` passed with pnpm 12.14.0. The default configured store path is read-only in this environment, so the install used a temporary writable store.
- **Baseline checks:** `corepack pnpm test:unit` passed (15); `corepack pnpm test:edge` passed (11); `corepack pnpm verify:payloads` passed (2); `corepack pnpm test:sim` passed (1); `corepack pnpm typecheck` passed (including production build); `corepack pnpm lint` exited 0 with existing React hook warnings; `corepack pnpm test:all` passed (15 unit + 11 edge + 2 payload + 1 simulator + 4 Playwright).
- **Audit baseline:** `bash scripts/run-audit.sh` passed as a harness against native PostgreSQL 18.6 and reported F-05 and F-06 as defect-confirming scenarios. Existing audit Vitest passed (15 rules + 6 client); Deno hostile audit passed (8). These audit tests currently document several defects as passing observations rather than asserting the required behavior.
- **Database environment:** the audit runner successfully started its isolated native PostgreSQL test cluster after running with socket permission. This is not the real Supabase stack and does not verify Edge runtime/Auth/Realtime.
- **Findings known at baseline:** F-01 through F-13 remain open. F-01/SG-02 outcome reason parity, F-02 broadcasts, F-03 Ping Off, F-04 config cross-validation, F-05 QR advancement, F-06 end retry, F-07 team balance, F-08 captured-fix age, F-09 join-attempt rate limit, F-10 location rate limit, F-11 host removal, F-12 wake lock, and F-13 watcher lifecycle are not fixed. SG-01 ping count prose mismatch and SG-03 zone consequence remain decisions to apply as specified in the task.
- **Regression setup:** converted F-03, F-04, and F-07 to expected-correctness checks; added F-01 simultaneous-elimination SQL coverage, F-05 QR-after-head-start coverage, F-06 end retry coverage, and F-11 host-removal API coverage. `test:all` includes unit, audit, API, privacy, simulator, browser, and fresh-database checks. The DB script creates and removes an isolated temporary PostgreSQL cluster; local OS permissions may require elevated execution for PostgreSQL sockets.

## Step 0 verification

- Commands run: frozen install; baseline unit, edge, payload, simulator, typecheck, lint, full `test:all`, `scripts/run-audit.sh`, `pnpm test:api`, `pnpm test:db`, and `git diff --check`.
- Baseline result: all pre-existing project checks passed. New red tests reproduce F-01/F-05/F-06 in PostgreSQL; the other ten SQL scenarios pass. API tests reproduce F-03/F-04/F-11; the existing edge API suite passes 11/11. The F-07 expected-correctness regression is also red in `test:audit` (15 rule tests + 6 client tests, one targeted failure).
- The remaining audit tests for F-02, F-08–F-10, and F-12–F-13 will be added with their focused implementation steps where the required behavior and test harness can be exercised together. F-09/F-10 remain defect-observation checks at baseline, not claimed fixes.
- Step 0 regression baseline is ready to commit; its known red assertions are intentional and scoped to unresolved findings.

## Step 1 — outcome parity

- **Changed:** SQL resolution now checks Runner count first both during lazy resolution and player leave; simultaneous team emptying awards Hunters the match. Final-Runner tagging and timer expiry use the shared `ALL_RUNNERS_TAGGED_OR_LEFT` and `TIME_LIMIT` reasons. Recorded the simultaneous-resolution precedence in `docs/DECISIONS.md`.
- **Check:** `corepack pnpm test:db` confirms F-01 PASS and the other 10 scenarios PASS; only the still-open F-05/F-06 regression scenarios fail. The same run also passes migration and lifecycle smoke checks, including canonical timer reason. `corepack pnpm test:audit` still fails only the unrelated, intentionally pending F-07 check (20/21 pass). `corepack pnpm test:api` passes the existing Edge suite (11/11) and fails only expected open F-03/F-04/F-11 cases (6/9 hostile audit checks pass).
- **Commit:** `0739254` (`fix: align match outcome precedence and reasons`).

## Step 2 — shared configuration validation and Ping Off

- **Changed:** Added shared match timing validation used by the API; omitted Ping Off normalizes to null. The create form now exposes an Off option. Added migration 010 to constrain active-round length and ping timing at the DB boundary, and updated the create RPC to accept Ping Off. SQL smoke covers valid Ping Off, insufficient active time, and ping-after-round rejection.
- **Check:** `pnpm test:unit` passed (16). `pnpm test:api` passed existing Edge tests (11) and hostile checks for F-03/F-04; only open F-11 is red (8/9 hostile tests pass). Fresh DB migrations and schema/lifecycle smoke passed; only outstanding F-05/F-06 audit cases are red (11/13 audit SQL scenarios pass).
- **Commit:** `0b3ef2d` (`fix: validate match timing and support ping off`).

## Step 3 — lazy state advancement and ping slots

- **Changed:** Added a service-role-only `xzones_advance_match_state` path that delegates to the server-time outcome resolver; QR issuance now invokes it before checking match state. This transitions an expired head start to ACTIVE and resolves expired/empty matches before an action proceeds.
- **Check:** Fresh migration chain, schema smoke, lifecycle smoke, ping no-sync-gap smoke, and audit SQL ran via `pnpm test:db`. F-01 and F-05 pass; 12/13 audit scenarios pass, with only the pending F-06 retry assertion red. Existing Edge API tests passed 11/11. (The API hostile suite was last run after Step 2 and retains only F-11 as a known red case.)
- **Commit:** `eb93ab8` (`fix: advance expired head starts before QR issuance`).

## Step 4 — idempotent terminal actions

- **Changed:** Added migration 012 so repeated host end/cancel requests first recheck controller permission, then return the existing stored terminal state/result/timestamp. Expanded the retry regression to compare all committed result fields.
- **Check:** `pnpm test:db` applied the full migration chain and passed all lifecycle/schema checks plus all 13/13 audit SQL scenarios. F-06 repeat returned the same state, winner, reason, and timestamp.
- **Commit:** `e5d60b9` (`fix: make host end requests idempotent`).

## Step 5 — exact team balance

- **Changed:** Shared `canStartLobby` and server `xzones_lobby_status` now require the exact target Hunter count for each active lobby size, and `xzones_start_match` uses that status as its gate. Updated the host-loss race fixture from an invalid 2-Hunter/4-player lobby to 2 Hunters in 11 players. Tests cover all team sizes 3–12 and server rejection of 5 Hunters in a 12-player lobby.
- **Check:** `pnpm test:unit` passed 17/17; `pnpm test:audit` passed 21/21; `pnpm typecheck` passed; `pnpm test:db` passed schema/lifecycle and all 14 audit scenarios.
- **Commit:** `652eca5` (`fix: enforce exact hunter team balance`).

## Step 6 — trusted location timestamps

- **Changed:** Server derives an effective capture timestamp clamped between receipt time and 60 seconds earlier. Fixes older than the 60-second window are not allowed to masquerade as fresh. Ping snapshot status/age and teammate position age/staleness now use captured time. Accepted location uploads are throttled if the previous accepted fix was less than two seconds ago.
- **Check:** `pnpm test:db` passed all migrations, schema/lifecycle tests, and 14/14 audit scenarios. The stale Runner fixture intentionally uses a fresh received_at with a 70-second-old captured_at and verifies STALE status, removed coordinates, and captured-time age. Location smoke verifies timestamp bounds and throttling.
- **Commit:** `3b11f92` (`fix: derive location age from clamped fix time`).

## Step 7 — join protection and host removal

- **Changed:** Join RPC now consumes per-session and HMAC-derived per-IP buckets before lobby-code lookup for every well-formed join attempt. Added pre-start controller-only player removal, a persistent removed marker that blocks rejoin, DELETE routing, and a host-only lobby Remove button. Removal rejects self and post-start requests.
- **Check:** `pnpm test:api` passed 11/11 Edge tests and 9/9 hostile API tests; `pnpm test:db` passed all schema/lifecycle checks and 14/14 audit SQL scenarios, including 5/10 minute IP bucket behavior and removal/rejoin/authorization cases; `pnpm typecheck` passed.
- **Commit:** `5645f6a` (`fix: rate limit joins and let hosts remove lobby players`).

## Step 8 — tagged-player and active-screen lifecycle

- **Changed:** Added migration 015 so tagged participants can sync only their own status and clock/control state; the API skips teammate-location reads for tagged players. The client stops GPS and clears its location on tagged status. ACTIVE match screens request a screen wake lock, release it while hidden or unmounted, and reacquire when visible. Added Edge, database, and device-lifecycle regressions.
- **Check:** `pnpm test:api` passed 11 Edge tests and 9 hostile tests after adding the tagged-sync assertion (including no teammate-location RPC). `pnpm test:audit` passed 23/23, production typecheck/build passed, and the fresh native PostgreSQL harness passed migration/schema/lifecycle checks and 14/14 audit scenarios including tagged Runner status/no notice. `git diff --check` passed.
- **Commit:** `a61c62a` (`fix: stop tagged runner location sharing`).

## Step 9a — Realtime transport decision (F-02)

- **Changed:** Documented post-commit, role-filtered publishing through Supabase's private Realtime REST broadcast endpoint; failures are best-effort and polling remains fallback. Coordinate-bearing events will not use database Broadcast because it writes rows to `realtime.messages` with three-day retention according to current official docs.
- **Check:** Read the current official Supabase Broadcast documentation. It distinguishes REST Broadcast (HTTP to WebSocket delivery) from database Broadcast (stored in `realtime.messages`, retained three days). This is design-source verification, not runtime integration verification.
- **Commit:** `e7d412c` (`docs: choose ephemeral realtime broadcast transport`).

## Step 9b — low-frequency role-filtered events (F-02)

- **Changed:** Added a best-effort REST broadcaster using private player-specific `match:<id>:hunter|runner:<player_id>` topics, the shared `projectEventForRole` allow-list, and one `xzones.event` envelope. Sync publishes match state, Hunter-only scheduled pings, and Runner-only generic ping notices; lobby create/join/team/readiness/removal, match start, tag accepted/result, host migration, leave, and match end paths publish after their mutation RPC returns. REST publishing and read-after-write metadata failures do not change the successful action response. Team coordinates remain explicitly excluded for Step 9c.
- **Test first:** `deno test ... --filter 'low-frequency Realtime events'` failed with the publisher temporarily disabled (0 sent vs expected 3); passed after restoring the publisher.
- **Check:** `pnpm test:api` passed 12 Edge and 9 hostile tests; `pnpm verify:payloads` passed 2/2; `pnpm typecheck`/production build passed; `pnpm lint` exited successfully with existing React hook warnings; `git diff --check` passed. These are unit/mocked-transport checks. Real Supabase delivery is not verified because `supabase start` failed with Docker socket permission denied; GitHub integration job remains to be added in Step 9d.
- **Commit:** `a210075` (`feat(api): publish low-frequency realtime events (F-02)`).

## Step 9c — live team positions (F-02)

- **Changed:** On accepted location uploads, the API reads the current player's authoritative role and server-stored `latest_fix` snapshot, computes age from the returned server time, and publishes a sequenced `team.location_live` event only to active teammates' player-specific topics. Sync publication excludes teammate coordinate events; only upload writes trigger this path. Location acknowledgements still contain no coordinates, and message transport is REST Broadcast.
- **Test first:** The location endpoint regression failed before implementation because the accepted fix had no Realtime publication; it now asserts exact Runner topic, event time, server-clamped capture time and sequence.
- **Check:** `pnpm test:api` passed 12 Edge and 9 hostile tests; `pnpm verify:payloads` passed 2/2; `pnpm typecheck`/production build passed; `git diff --check` passed. Actual socket delivery and persistence remain unverified pending the Step 9d GitHub integration run.
- **Commit:** `1b4d30e` (`feat(api): broadcast live locations to team only (F-02)`).

## Step 9d — client Realtime events (F-02)

- **Changed:** The match screen now applies only role-projected private-channel events to the same role-safe view used by sync. It deduplicates event IDs, ignores older per-player location sequences, merges scheduled Hunter snapshots, stops Runner GPS immediately on its tag event, and navigates on terminal match state. The 15-second sync remains the reconnect and missed-event fallback; tagged players unsubscribe. Added a CI job that starts a real local Supabase stack, serves the API Edge Function, creates a four-player match, and checks authenticated player-topic delivery/rejection, location and ping privacy, tag/leave fanout revocation, API payloads, delivery latency, and absence of coordinate rows in `realtime.messages`.
- **Check:** `node --check tests/realtime/integration.mjs` passed; the new integration job was not run locally because `supabase start` cannot access the Docker socket in this environment. CI result is pending. `pnpm test:audit` passed (25/25), `pnpm test:api` passed (12 Edge + 9 hostile), `pnpm typecheck` passed including production build, and `git diff --check` passed. `pnpm lint` exited successfully with existing React hook warnings. Therefore Step 9d and F-02 remain unverified pending that real-stack job.
- **Commit:** `8ebe898` (client application) and `811f869` (CI integration gate).

## Step 10 — close location throttle response gap (F-10)

- **Changed:** The existing row-locked, two-second database throttle now maps to HTTP 429 with a bounded `Retry-After` header. The web client treats this response as retryable, waits the indicated time before sending another fix, and shows a non-error pacing status. Replaced the old defect-observation test with a correctness assertion and added client retry metadata coverage. Step 10 also rejects control characters in lobby names, tests join-code alphabet and normalization, expands SQL Scenario 3 to verify every scheduled slot 0–8 and tag cleanup, and extends the real-stack fixture to check that LEFT players stop receiving team events.
- **Check:** `pnpm test:api` passed (12 Edge + 11 hostile, including 429/Retry-After, invalid names, and code normalization); `pnpm test:audit` passed (25/25); elevated `pnpm test:db` passed all 14 audit scenarios plus schema and lifecycle smokes, including every ping slot in Scenario 3; `pnpm typecheck` passed; `pnpm lint` exited successfully with existing hook warnings; `node --check tests/realtime/integration.mjs` and YAML parse passed. Real Supabase integration remains pending CI.
- **Commit:** `b0c8415` (F-10); supplemental Step 10 coverage is in `535a29e`.

## Step 9d follow-up — revoke Realtime delivery on tag/leave (F-02)

- **Changed:** Replaced shared role topics with `match:<match_id>:<role>:<player_id>`. The server queries current ACTIVE players before fanout, and RLS authorizes only the exact authenticated player, role, and match. This handles Supabase's cached authorization on already-open channels: tagged/left players are omitted from future server fanout even if their old channel stays connected.
- **Tests:** Updated game-core topic validation, Edge broadcaster fanout coverage, SQL authorization smoke/scenario, and real Supabase integration topic subscriptions.
- **Check:** game-core Realtime topic tests 2/2; `pnpm test:api` passed (12 Edge + 11 hostile); `pnpm test:audit` passed (25/25); shared unit tests passed (17/17); payload verifier passed (2/2); elevated `pnpm test:db` passed all 14 audit scenarios plus schema/lifecycle smokes; `pnpm typecheck` passed including production build; `pnpm lint` exited 0 with existing hook warnings; integration script syntax and workflow YAML validation passed; `git diff --check` passed. Real Supabase Realtime delivery and cached-connection tag/leave fanout still await CI, so F-02 remains OPEN.

## Review finding R-01 — stale teammate event

- **Base:** `main` at `7ddb6ea` (includes the audit fixes merged by `148182f`). The requested `PROJECT-REVIEW.md` and `review/project-analysis` branch were not present in the checkout; GitHub DNS was unavailable, so this local branch is based on the available integrated `main`.
- **Reproduce:** Before the implementation change, `tests/review/stale-event-reproduction_test.ts` passed only by asserting that `/sync` exposed `is_stale: true` but emitted no `location.stale` event.
- **Changed:** `/sync` now adds a stable event keyed to teammate and fix capture time, containing only player ID and stale state. Stale events are published only to the syncing player's team role (and private per-player topics); the client reducer updates an existing teammate's stale indicator. Coordinates and accuracy are absent from the event.
- **Check:** Regression test passed (1/1), including sync response, private same-role topic, matching event ID, coordinate absence, and no opposing-role broadcast. `pnpm test:audit` passed (25/25); `pnpm verify:payloads` passed (2/2); `pnpm test:edge` passed (12/12). `pnpm build` passed with the existing generic >500 kB uncompressed chunk warning; the MapLibre chunk remains 289.61 kB gzip.
- **Full-suite check:** `corepack pnpm test:all` passed with local test-server/database permission: game-core unit 23, audit 25, Edge 12, hostile API 11, payload 2, simulator 1, Playwright 4, and 14/14 SQL audit scenarios. Playwright printed a Vite dependency-optimizer ENOENT warning for the Supabase package path, but all four browser cases passed.
- **Status:** R-01 is fixed and locally verified. The real Supabase integration job is still required to verify hosted Realtime delivery, as already recorded for F-02.
- **Commit:** `4a90745` (`fix(realtime): emit team-scoped stale events`); verification artifacts: `c26565c` (`test(review): preserve phase-three verification artifacts`).
# Hide & Seek implementation baseline — 2026-10-20

- Step 0.1 baseline gates pass. The frozen install required writable local process access for pnpm's operation lock; E2E required local Vite server access. No source fixes were needed. Full results: `docs/verification/baseline.md`.
# Hide & Seek implementation — audit triage

- Step 0.2 cross-checked all 13 `error.md` findings against current known issues and the passing baseline. F-01 and F-03–F-13 are documented fixed; F-02's Realtime implementation exists, but real Supabase delivery remains unverified because the integration stack is unavailable. No source change is made from this evidence. See `docs/verification/audit-triage.md`.
# Hide & Seek implementation — client lifecycle audit

- Step 0.3 verified persisted fields, GPS watcher lifecycle, and Wake Lock behavior. The active match identity is not persisted; guest auth is separately persisted. GPS watch is not reacquired after backgrounding or watcher errors. Existing Wake Lock lifecycle tests pass; Safari 16.4 introduced the API, with an installed Home Screen app fix noted in Safari 18.4. Device behavior remains unverified. See `docs/verification/client-lifecycle-audit.md`.
# Hide & Seek implementation — centralized configuration and design

- Step 0.4 added the isolated `HIDE_AND_SEEK` mode config, explicit bounds for numeric settings, tests for defaults/bounds, and the mode rules spec. Existing round/head-start/ping defaults and validation now source the central config. Values absent from the reference are marked `UNSPECIFIED-IN-REFERENCE`; their initial assumptions are recorded in `docs/DECISIONS.md`.
# Hide & Seek implementation — existence inventory

- Step 0.5 inspected reachable rules, UI, API, SQL RPCs/migrations, projections, service worker, simulator, tests, and local branch history for all 40 planned implementation steps. Initial classification: 24 PARTIAL, 16 ABSENT, 0 PRESENT, 0 PRESENT-BUT-DIFFERENT. Recheck each step immediately before implementation; `docs/verification/already-implemented.md` is only the starting inventory.

# Hide & Seek implementation — Step 1.1 player limits

- Changed the shared rules, readiness/start checks, lobby/join UI, and API lobby-full message to enforce and display 2–100 players. Added idempotent migration `202610200017_player_limits.sql`, including a serialized database trigger to prevent cap bypass via direct player inserts, plus min-player and hunter defaults in the lobby status RPC.
- Updated rules/audit/API/E2E tests and added `tests/schema/player-limits-smoke.sql` for two-player start, 100-player limit, rejected 101st join, and direct-insert bypass. Preserved existing migrations.
- Gates: typecheck, lint, production build, `test:all` and focused Playwright passed. The existing Vite optimizer emitted a Supabase dependency ENOENT warning, but all 4 browser tests passed. Lint emitted existing React-effect warnings.

# Hide & Seek implementation — Step 1.2 flexible team balance

- Added a host-only Hunter-count assignment RPC and lobby control; Random still uses the centralized `ceil(N/10)` default. Start validation now accepts any split with 1..floor(N/2) Hunters and at least one Runner; the database rejects over-limit Hunter counts.
- Initial gate runs exposed stale exact-default expectations in the exhaustive unit and F-07 database tests. After updating both, isolated PostgreSQL audit passed 14/14 and the complete suite, typecheck, lint, and production build passed. The Vite optimizer still prints its known Supabase dependency ENOENT warning; all four Playwright cases pass. Step 1.2 is verified DONE.

# Hide & Seek implementation — Step 1.3 throttled cleanup

- No `pg_cron` extension or scheduling configuration exists in the migration chain. Added private singleton cleanup state plus an advisory transaction lock. `xzones_cleanup` returns immediately when locked or called within 60 seconds; actual cleanup records its timestamp and performs the existing delete set at most once per minute.
- Kept the existing opportunistic cleanup RPC call sites, but bounded database sweep work. Added a SQL boundary smoke test for first run, 59-second throttle, and exact 60-second eligibility. Temporary PostgreSQL migration/schema/lifecycle/audit harness passed, including all 14 audit scenarios.

# Hide & Seek implementation — Step 1.4 Realtime-first fallback

- Added a reusable visibility-aware fallback scheduler with random intervals in [30,000, 45,000) ms, no polling while hidden, immediate sync on resume, and no overlapping sync requests. Applied it to match and Hunter Pings views; Pings now also subscribes to role-safe Realtime events.
- Added deterministic delay and visibility pause/resume coverage. Full suite passed: unit 25, audit 26, Edge 12, hostile API 11, payload 2, simulator 1, Playwright 4, DB audit 14; typecheck/build/lint passed with existing warnings.

# Hide & Seek implementation — Step 1.5 request budget

- Documented per-player and 100-player-hour Edge request and database RPC estimates from current polling and GPS upload behavior, with stationary, moving, and Pings-view scenarios. Called out startup/reconnect/manual traffic exclusions, the duplicate `/sync` calls on the map, and the need for the separate Step 1.8 empirical load test.
- Cross-checked the arithmetic against `startFallbackSync`, `LocationSharing`, `MatchPage.sync`, `/sync` RPC fan-out, and `/location` resolve/update calls. `git diff --check` passed.

# Hide & Seek implementation — Step 1.6 in-place map updates

- Kept the MapLibre instance stable across zone and theme changes. Zone edits update the GeoJSON source; marker reconciliation is keyed by self/team/Runner ID and updates positions and presentation in place, removing only departed markers. Style changes call `setStyle` and restore the zone layer after style load; centering continues through `easeTo`.
- Full suite passed: unit 25, audit 26, Edge 12, hostile API 11, payload 2, simulator 1, Playwright 4, DB 14; typecheck/build/lint passed. Existing MapLibre bundle-size and unrelated React-effect warnings remain.

# Hide & Seek implementation — Step 1.7 location send state

- Removed module-level sequence, last-send timestamp, and last-fix state from `LocationSharing`. Each watcher effect creates its own `LocationSendState`, so remounts/matches cannot share upload throttle or sequence state. Added an isolation test that mutating one watcher state leaves another pristine.
- Full suite passed: unit 25, audit 27, Edge 12, hostile API 11, payload 2, simulator 1, Playwright 4, DB 14; typecheck/build/lint passed with the existing warning set.

# Hide & Seek implementation — Step 1.8 100-player load test

- Added a repeatable temporary-PostgreSQL load harness with 100 concurrent pgbench clients, one simulated player per client, 10-second moving-location cadence, jittered 30–45-second sync cycles, and measured API/RPC fan-out. A short random endpoint prototype was discarded because it ignored client-side GPS pacing; the final benchmark models that throttle.
- The 600-second run processed 9,055 simulated API requests and 27,380 RPC calls with zero errors. RPC p95 was 1.063 ms, max 7.414 ms; pgbench average transaction latency was 1.503 ms. Typecheck/build/lint and the full suite passed. Results and local-only caveats are in `docs/verification/load-test.md`.

# Hide & Seek implementation — Step 2.1 deterministic zone schedule

- Added `zoneAt` to game-core as a pure timestamp-derived circle schedule. It reports current radius/stage and the next shrink timestamp/radius without timers or scheduler state.
- Stage 1 begins after head start plus the first interval. Stage radii are evenly interpolated; this algorithm is provisional because the reference specifies timing but not intermediate radii.
- Validation: game-core tests 28/28 PASS, typecheck PASS, and `git diff --check` PASS.

# Hide & Seek implementation — Step 2.2 persisted shrink configuration

- Added an additive migration for circle-zone stages, interval, and final radius; extended the service-role lobby-create RPC with matching bounds and persisted values. Existing RPC callers retain defaults.
- The create route validates the same centralized limits; the lobby form exposes optional shrink controls when a circle is enabled. Configuration remains zero stages by default.
- Validation: database audit 14/14 PASS, Edge and hostile API tests 23/23 PASS, game-core 29/29 PASS, typecheck/build PASS, `git diff --check` PASS.

# Hide & Seek implementation — Step 2.3 host zone picker

- Added a dedicated MapLibre picker to avoid coupling lobby setup to the live-match map. The host can click/drag the center, see the circle radius preview, use current location, or enter exact coordinates.
- Validation: web build PASS; lint PASS with existing warnings in unrelated map/page effects; `git diff --check` PASS.

# Hide & Seek implementation — Step 2.4 server zone schedule

- Added the service-role-only `xzones_zone_at` SQL projection using match start, head start, interval, and stage count. Match sync and location handling now retrieve the server schedule; boundary smoke covers pre-stage, exact stage, and final radius. The same helper is available to resolution.
- This step provides one server-side source of truth; outside-sample classification and elimination wiring remain for Step 2.6.
- Validation: DB audit 14/14 plus zone schedule smoke PASS; Edge and hostile API 23/23 PASS; typecheck/build PASS.

# Hide & Seek implementation — Step 2.5 zone preview and countdown

- Typed and parsed the server-projected zone in the role-safe match response. The map updates current and next-stage circle overlays in place; the HUD reports stage, current radius, and countdown to the next shrink.
- Validation: game-core 29/29 PASS, web build PASS, lint PASS with existing effect warnings, and `git diff --check` PASS.

# Hide & Seek implementation — Step 2.6 accuracy-aware zone exit

- Added per-Runner outside streak/timing state and a database trigger that calls the authoritative zone schedule for each accepted fix. Only fixes whose uncertainty bound is wholly outside count; inside or ambiguous fixes reset the streak.
- Two consecutive confirmed-outside fixes mark a Runner revealed; scheduled Hunter pings remain the only opposing-team location path. At 30 continuous seconds the API reports a warning; at 120 seconds the server marks the Runner `TAGGED`, removes the fix, and resolves match outcome.
- Validation: DB audit and exact zone schedule/exit smoke tests PASS; Edge and hostile API tests 23/23 PASS; typecheck/build PASS.

# Hide & Seek implementation — Step 2.7 timer off

- Made round duration nullable through shared validation, lobby setup, database schema, start/sync/QR RPC behavior, and match clock display. Timer-off matches retain scheduled pings and do not resolve to a Runner time-limit win; elimination and host outcomes remain authoritative.
- Added a disposable SQL scenario proving timer-off creation, no `ends_at`, no time-based resolution after elapsed time, and continuing pings.
- Validation: full `pnpm test:all` PASS; typecheck/build/lint PASS; `git diff --check` PASS.

# Hide & Seek implementation — Step 3.1 location plausibility

- Rejected fixes outside the existing timestamp clamps, movement above 15 m/s, and locations over 10 km from the configured zone center. These checks run in the database before storing a fix.
- Added a private suspicious-event log with no raw coordinate payload and a host-authorized result projection. The results UI displays event reason, player name, and time only to the host; other participants receive an empty event list.
- The project documentation states plainly that browser GPS cannot be attested and these checks are deterrence, not proof of physical location.
- Validation: DB plausibility smoke and audit PASS; Edge/hostile API 23/23 PASS; typecheck/build PASS; `git diff --check` PASS.

# Hide & Seek implementation — Step 3.2 GPS Tag

- Added a Hunter GPS Tag action backed by a service-role RPC. The server validates a fresh ≤5-second/≤50-meter Hunter fix, selects the nearest fresh Runner in the formula-derived range, serializes and records the tag, and rate-limits attempts to one per two seconds per Hunter.
- Misses return only `NOTHING_IN_RANGE`; no runner identifier or distance is present. QR remains available as an independent fallback.
- Validation: DB GPS tag smoke PASS; Edge/hostile API 24/24 PASS; typecheck/build PASS; `git diff --check` PASS.

# Hide & Seek implementation — Step 3.3 QR anti-relay fallback

- Wrapped the existing atomic QR scan RPC with a server-side distance guard. If both Hunter and Runner fixes are ≤30 seconds old and are over 100 m apart, the server returns a generic conflict and leaves the one-time challenge unused; missing/stale fixes preserve the QR fallback.
- Validation: DB relay and nearby-fallback smoke PASS; Edge/hostile API 25/25 PASS; typecheck/build PASS; `git diff --check` PASS.

# Hide & Seek implementation — Step 3.4 cross-action race

- Added a disposable-database harness that launches GPS Tag, QR scan, Runner surrender, and host-end operations from four concurrent PostgreSQL sessions against the same Runner/match.
- Assertions require a terminal match result and at most one accepted tag; the unique runner-tag constraint and match-row locks serialize outcomes.
- Validation: race harness PASS (`state=ENDED`, `tags=0` in the host-end-winning run, exactly one result); full database audit PASS; `git diff --check` PASS.

# Hide & Seek implementation — Step 3.5 stationary Runner reveal

- Added server-side stationary anchors for active Runners. Movement of at least 15 m resets the timer; at 240 seconds the API warns the Runner, and at 300 seconds the server records a reveal for the next scheduled Hunter ping. It does not alter player status or eliminate.
- Validation: DB smoke covers both thresholds, no-elimination behavior, and movement reset; DB audit PASS; Edge/hostile API 25/25 PASS; typecheck/build PASS.

# Hide & Seek implementation — Step 4.1 GPS lifecycle recovery

- Replaced the one-shot location watch with lifecycle-aware watch maintenance: pause while hidden, reacquire on visibility return and `pageshow`, and retry after transient geolocation errors. The match syncs immediately on return and the location status clearly reports when GPS is paused.
- Validation: `deno test tests/audit/device_lifecycle_test.ts` PASS (2/2); typecheck/build PASS; lint PASS with existing hook warnings; `git diff --check` PASS.

# Hide & Seek implementation — Step 4.2 stealth screen

- Added a near-black active-match overlay that keeps the existing Wake Lock running, explains battery cost, and exits only after a configurable 1.5-second press-and-hold.
- Validation: typecheck/build PASS; lint PASS with existing hook warnings; `git diff --check` PASS.

# Hide & Seek implementation — Step 4.3 host inactivity

- Added an authenticated visibility heartbeat restricted to the current active controller. Match resolution now ignores hidden controller time, resumes the baseline on visibility return, and opens the claim window after 180 seconds of visible inactivity.
- Validation: Edge API tests PASS (15/15); host visibility DB smoke PASS; complete disposable DB audit/race suite PASS; typecheck/build PASS; lint PASS with existing hook warnings; `git diff --check` PASS.

# Hide & Seek implementation — Step 4.4 session rejoin

- Added server-side discovery of active memberships for the current authenticated guest session and a Home screen rejoin entry. Creation/join stores only a local match hint; SQL still authorizes solely by `auth_user_id`. Explicitly left or ended matches are excluded, and a missing saved guest session explains that the host can remove the stale player entry.
- Validation: Edge API tests PASS (16/16); rejoin DB smoke and full disposable DB suite PASS; typecheck/build PASS; lint PASS with existing hook warnings; `git diff --check` PASS.

# Hide & Seek implementation — Step 4.5 finish-time privacy

- Extended the additive finish RPC so match completion deletes `latest_fix`, all `ping_snapshots`, and stationary coordinate anchors; end results and non-coordinate audit reasons remain available.
- Validation: `pnpm test:db` PASS, including the new finish-privacy smoke, tag-race harness, and 14-row DB audit; `git diff --check` PASS.

# Hide & Seek implementation — Step 4.6 own-marker smoothing

- Added eased interpolation for the local marker only. The marker is initialized at the current fix, then animated between display points; server location upload and other-player markers remain untouched.
- Validation: game-core tests PASS (31/31); typecheck/build PASS; lint PASS with existing warnings; `git diff --check` PASS.

# Hide & Seek implementation — Step 4.7 map tile cache and PWA icons

- Added bounded stale-while-revalidate caching for OpenFreeMap tile responses, with a mode-configured entry cap and FIFO eviction. Added 192px and 512px PNG install icons to the manifest and app-shell cache.
- Validation: full `pnpm test:all` PASS (31 unit tests, 27 audit tests, 27 API/hostile tests, payload/simulator tests, Playwright 5/5, and disposable PostgreSQL suite); service worker syntax, typecheck/build, lint, and `git diff --check` PASS.

# Hide & Seek implementation — Step 5.1 team-scoped chat

- Added server-validated chat with 280-character and per-player rate limits, lobby-wide access, same-role-only match reads, and a polling UI. Lobby messages are cleared when the round starts; all remaining chat is deleted when the match ends.
- Validation: Edge API tests PASS (17/17); DB scope/rate/purge smoke PASS; full disposable DB suite PASS; typecheck/build PASS; lint PASS with existing hook warnings; `git diff --check` PASS.

# Hide & Seek implementation — Step 5.2 host presets

- Added safe local preset CRUD for host match settings from the create-game form. Storage reads/writes are wrapped in try/catch, and parsed preset data is range/type validated before loading.
- Validation: Playwright preset CRUD workflow PASS (6/6 e2e suite); typecheck/build PASS; lint PASS with existing hook warnings; `git diff --check` PASS.

# Hide & Seek implementation — Step 5.3 rules guide

- Added a dedicated Hide & Seek rules and safe-play page linked from both the active lobby and settings. It explains server tag decisions, scheduled-only Hunter snapshots, zone and stationary behavior, timers, and outdoor safety.
- Validation: guide route Playwright PASS; typecheck/build PASS; lint PASS with existing warnings; `git diff --check` PASS.
# Hide & Seek implementation — Step 5.4 bug reports

- Added a minimal report form, authenticated Edge route, HMAC-keyed throttling, and insert-only database access. No identity, coordinates, device metadata, or diagnostic bundle is stored.
- Validation: `pnpm test:all` PASS (31 unit, 27 audit, 29 API/hostile, payload and simulator, Playwright, database suite); typecheck/build and lint PASS with existing warnings; `git diff --check` PASS.
# Hide & Seek implementation — Step 6.1 item framework

- Added the Hide & Seek mode marker, disabled-by-default item toggle, private item-state tables, controller-only setting, and server-side role/phase/one-use activation skeleton. UI state reloads from the server.
- Validation: full `pnpm test:all` PASS (31 unit, 27 audit, API 19, hostile API, payload/simulator, Playwright, DB suite); typecheck/build PASS; `git diff --check` PASS.

# Hide & Seek implementation — Step 6.2 Hunter Scan

- Added a one-use server-authorized Hunter Scan returning only active Runners' fresh stored fixes to the activating Hunter. The client removes the temporary map markers after the configured Scan duration; no Realtime broadcast or client-supplied coordinates are involved.
- Validation: DB scan smoke verifies fresh-fix selection, Hunter-only access, one-use consumption and expiry; full `pnpm test:all`, typecheck/build, lint, and `git diff --check` PASS.

# Hide & Seek implementation — Step 6.3 Hunter Proximity Alarm

- Added server placement at the Hunter's fresh stored fix, location-upload-triggered distance evaluation, single-use alert storage, and placer-only polling. Client polling ends at the configured alarm expiry.
- Validation: DB smoke verifies outside/inside transitions, one-time alert, and that another Hunter cannot read it; full `pnpm test:all`, typecheck/build, lint, and `git diff --check` PASS.

# Hide & Seek implementation — Step 6.4 Hunter Zone Mover

- Added a one-use server-generated zone-center shift, bounded by the 200m maximum and 50% overlap requirement. Both teams receive only the new public zone geometry and re-sync their maps.
- Validation: SQL smoke checks displacement, radius preservation, and one-use guard; full `pnpm test:all`, typecheck/build, lint, and `git diff --check` PASS.
