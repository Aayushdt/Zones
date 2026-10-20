# Implementation Decisions and Verification Log

## Audit decision — canonical active-match outcomes

- If both teams become empty in the same serialized resolution, Runner elimination takes precedence and Hunters win (`ALL_RUNNERS_TAGGED_OR_LEFT`), matching `game-core`.
- Active-match expiry uses the shared `TIME_LIMIT` reason. Tagging the final Runner uses the same `ALL_RUNNERS_TAGGED_OR_LEFT` reason as departures, so database and shared outcome results agree.

## Audit Step 9a — ephemeral Realtime broadcast transport

- Publish only after the database RPC has returned successfully, so the state change is committed before any event is sent. Use the Supabase Realtime REST single-message endpoint `/realtime/v1/api/broadcast/{topic}/events/{event}?private=true` with the server-only API key; never expose that key to a browser. Use player-specific topics (`match:<id>:hunter|runner:<player_id>`) and the shared role projection builders plus the Section 25 envelope (`event_id`, `match_id`, `revision`, `server_at`, `type`, `data`). Supabase caches subscription authorization during an established connection, so server fanout also queries the current ACTIVE recipients and never publishes later events to the topic of a tagged/left player. Publishing errors are best-effort and must not turn a successful game action into an API failure; polling remains the recovery path.
- Coordinate-bearing events use the REST Broadcast transport only. Supabase's official [Broadcast documentation](https://supabase.com/docs/guides/realtime/broadcast) says REST receives an HTTP request and forwards it to connected WebSocket clients, while database Broadcast inserts into `realtime.messages`; database-sent messages are retained for three days. Therefore do not use `realtime.send`, `broadcast_changes`, or a trigger for coordinates. This transport choice is documented from the current official docs; runtime delivery/storage behavior still requires the real Supabase integration suite in Step 9d.

## Audit Steps 9d and 10 — Realtime client and coverage gaps

- The match page applies only events accepted by the shared role projector, deduplicates IDs, ignores stale per-player location sequences, merges scheduled Hunter snapshots, stops GPS/unsubscribes when the current Runner is tagged, and navigates on terminal state. The 15-second role-safe sync remains the reconnect and missed-event fallback.
- Added a real-stack GitHub Actions job that starts Supabase, serves the single `api` Edge Function, and exercises a four-player match with a Runner host, Hunter, two additional Runners, and a second-match Hunter. It asserts authenticated/unauthenticated/wrong-role/cross-match topic admission, scheduled-vs-live position privacy, tag/leave event revocation, response privacy, sub-five-second delivery, and absence of coordinate persistence in `realtime.messages`. The script parses and workflow YAML parses, but the job has not run; local `supabase start` is blocked by denied Docker socket access.
- Step 10 database coverage now checks each scheduled snapshot slot 0–8 for both Runners and tag cleanup; API checks cover control/length name validation and join-code alphabet/case/whitespace normalization. F-10 returns `429` with a bounded `Retry-After`, which the location client treats as normal backoff.
- Local checks after these changes: hostile API tests 11/11, Edge tests 12/12, audit client/rules 25/25, all 14 SQL audit scenarios plus schema/lifecycle smoke passed on temporary native PostgreSQL, production typecheck/build passed, and Oxlint exited 0 with existing hook warnings. The Supabase integration, hosted project, deployment, and phone GPS/camera tests remain unverified.

## Audit Step 9d follow-up — Realtime recipient revocation

- Supabase documents that Realtime authorization is cached for an established connection. Shared team topics therefore could continue delivering to a tagged/left client even after RLS would deny a new subscription.
- Changed private topics to include both the role and exact player UUID. The Edge Function now lists ACTIVE players and fans out each role-projected event only to their topics. The subscription RLS predicate validates the UUID, match, authenticated owner, active status, and role. Once a player is tagged or leaves, subsequent server broadcasts omit that player's topic even if their WebSocket remains connected.
- Updated the API broadcast test, SQL RLS smoke/scenario, and real-stack integration fixture for exact-player topics. Local unit/API/DB checks are pending; actual Supabase delivery/revocation remains unverified until CI can run.

## Step 18: outcomes, departures, and retention

- Added server resolution for match deadline, empty Hunter team, empty Runner team, and unclaimed host loss. Timer results use the scheduled server deadline as `ended_at`, even when a later request performs the resolution; this keeps displayed duration tied to the match clock.
- Added explicit leave, current-controller end, host claim, minimal result lookup, and cleanup RPCs behind the single `api` Edge Function. Leaving deletes the player's mutable fix immediately; final outcomes delete all fixes and persist a no-route result. Explicit controller leave opens the five-minute claim window immediately; an active controller with no heartbeat for 60 seconds opens the same window on the next sync.
- Results expose winner/reason, duration, and accepted tag count only. Active players can claim host controls without gaining a different role or additional match information. Host end is a no-winner result; if no one claims after host loss, the server ends with no winner.
- Cleanup is invoked as a best-effort fallback on create, join, and match sync. It removes expired QR challenges/rate-limit buckets and snapshots older than seven days, and deletes terminal match metadata after its seven-day result retention. No scheduled `pg_cron` job is configured because availability has not been verified for the eventual project.
- Checks: lifecycle SQL smoke covers Hunter/Runner departure outcomes, host-claim and end permission flow, timer deadline result duration, no-winner host loss, fix deletion, and seven-day cleanup. Full migration + SQL smoke suite passed on temporary vanilla PostgreSQL 18.6; Edge tests passed 10/10; shared unit tests passed 13/13; typecheck/build and Oxlint passed (pre-existing effect warnings remain). Supabase-hosted Auth/RLS/Realtime integration remains untested.

## Step 19: settings and interaction polish

- Replaced the settings placeholder with editable guest name, persisted Dusk/Paper theme, an Auto/Dusk/Paper map-style selector, vibration preference and test, privacy behavior, safe-play guidance, and current app version. Added a settings link in the shared header. Map style is independent of theme unless Auto is selected.
- Vibration is opt-in and the Hunter/Runner scheduled-ping notice vibrates once per newly observed ping index when the browser supports `navigator.vibrate`; repeated syncs do not repeat the alert.
- Browser verification on local Vite: theme toggle switched to Paper and back; map style switched to Dusk and back to the original Paper value; vibration toggle and test status worked and were restored to the original disabled preference. Reload preserved the original theme/map/haptics values. Guest-name persistence, real-device vibration, and real map-style tile repaint were not separately verified.
- Checks: shared unit tests 13/13; Edge 10/10; simulator 1/1; payload privacy 2/2; typecheck/build and Oxlint passed (pre-existing React effect warnings remain). Production chunks: initial JS 106.64 KB gzip, settings 1.74 KB, map 289.61 KB. MapLibre still emits a >500 KB uncompressed-chunk warning.

## Step 1: scaffold and runtime

- Scaffolded with create-vite 9.2.1; dependency resolution installed Vite 8.3.4, React/React DOM 19.3.1, TypeScript 6.0.3, and @vitejs/plugin-react 6.1.2. Exact resolutions are in the root pnpm-lock.yaml.
- Corepack resolved pnpm 12.14.0. Node.js is v24.19.0 in this environment. The official Node release page lists the Node 24 line as LTS: https://nodejs.org/en/about/previous-releases.
- Vite's official guide states the runtime requirement is Node 20.19+ or 22.12+: https://vite.dev/guide/. Available Node 24 satisfies this.
- Initial TypeScript production build, Oxlint, and localhost HTTP smoke check passed in this environment. The dev server returned the XZones HTML shell.
- Not verified yet at initial scaffold: Supabase Free pause rules; PMTiles/MapTiler/Cloudflare free eligibility; library maintenance beyond resolved package versions; hosted Supabase project details. Recheck official sources as implementation reaches those dependencies.
- Supabase CLI was not installed at initial scaffold and is installed at Step 6. Docker 29.9.1 is present, but access to its socket is denied in this environment.
- No Supabase URL or keys were supplied; hosted calls/deployment are not configured. Names only are in root .env.example; no secret values are stored.
- Supabase official docs currently list 500,000 Edge Function invocations per month on Free, with no paid overage for Free; over-quota Free projects receive a notice/grace period. Preflight OPTIONS calls are not billed. Source: https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations (checked 2026-10-18). The plan's estimate is ~3,640 calls per 12-player match, so the quota covers ~137 such matches if no other function traffic uses it; ~100 matches would consume ~364,000. This is a planning estimate, not observed usage.

## Step 2: workspace boundaries

- Added a pnpm workspace for `apps/*` and `packages/*`, with `@xzones/game-core` exported from a TypeScript-only module and imported by the web app. The shared package has no browser, network, or runtime dependency imports.
- Added the root TypeScript base config and root scripts. Root scripts call Corepack explicitly because this environment provides pnpm through Corepack but has no global `pnpm` executable.
- Verified the shared package typecheck, web production build, and Oxlint pass after workspace linking. The web bundle is 220.33 KB raw / 68.97 KB gzip JS; this includes only the current shell and is below the initial 250 KB compressed budget.

## Step 3: tokens, fonts, and install metadata

- Implemented the exact Dusk and Paper palette values from section 20 as CSS variables, plus persisted theme selection, the 4px spacing unit, control/sheet radii, and display/body/monospace font stacks.
- Added self-hosted variable Fontsource packages at exact registry versions: `@fontsource-variable/bricolage-grotesque`, `@fontsource-variable/manrope`, and `@fontsource-variable/jetbrains-mono` 5.3.0. Their latin font files are emitted into the production assets; no runtime font request is needed.
- Added an installable web manifest with standalone display and the scaffold icon. Step 3's production build and Oxlint passed. Theme switching is implemented; browser persistence interaction is not yet automated.

## Step 4: route and state shells

- Added the planned route table (home, create, join, lobby, head start, match, Hunter Pings, tag, results, settings, simulator, and not-found) with reusable accessible loading/empty/error/offline/success state panels.
- Added Zustand persisted preferences for Dusk/Paper theme and guest display name. The app header toggles and persists theme; routes show an explicit not-connected empty state and never fabricate a match.
- State preview links render all five status variants on the current route. Production build and Oxlint passed. Automated browser navigation and persistence checks are not added until the planned test step.

## Step 6: first database migration

- Installed the official Supabase CLI 2.121.0 as an exact root dev dependency and initialized config under `backend/supabase`; anonymous local auth is enabled.
- Added the core tables, checks, indexes, composite match/player references, hashed-code/capability columns, controller/claim fields, rate limits, and RLS enabled with no browser table grants. Zone storage is consistently `zone_radius_m` (200–1500), the database half of the 400–3000m UI/API diameter.
- Docker is installed but the Docker socket returned `permission denied` even when checked outside the sandbox. Supabase's full container stack therefore could not start. Instead, applied the migration successfully to a temporary local PostgreSQL 18.6 instance after adding only a minimal `auth.users` schema shim, then ran `tests/schema/core-smoke.sql`; duration/hash/radius/FK violation checks passed. This is a PostgreSQL DDL smoke check, not a Supabase integration test.

## Step 7: lobby APIs

- Added the single `api` Edge Function router for create/join/team/ready routes and server-side Auth user lookup. It validates bearer identity, uses the anon key only for Auth lookup and the service-role key only for server RPCs, and never logs request fields.
- Added transactional, service-role-only SQL RPCs for lobby creation/join, Random/manual team selection, readiness, and rate-limit counters. Codes use six random characters from a 32-symbol alphabet; only an HMAC-SHA-256 is stored and only the host receives the clear code. Failed joins are HMAC-bucketed (5/10 minutes) and joins are limited per Auth user (10/hour); raw addresses are not stored.
- The database stores integer `zone_radius_m`; API diameter is 400–3000m and odd integer diameters are rejected to prevent half-meter truncation. The create slider should therefore use even values (prefer 100m steps).
- Verified Deno 2.9.6 `check` and three handler tests, including no service-role use for Auth lookup and no raw lobby code sent in RPC arguments. Applied migration 2 and ran both schema/RPC smoke SQL files against temporary PostgreSQL 18.6; team balance 1/2 for three players, Ready startability, zone conversion, and 5-per-10-minute invalid-code limiting passed.
- Full local Supabase function invocation/integration remains unverified because Docker socket access is denied; tests use mocked Auth/RPC HTTP calls and local PostgreSQL, not Supabase containers.

## Step 8: privacy payload checks

- Added an explicit server-side event projection allow-list covering every event declared in section 25. Events cross roles only where the contract permits; Hunter-team live positions and scheduled Runner snapshots have separate event types and target roles.
- Added capture tests that project every declared event for both roles and recursively check emitted keys against hidden coordinates, opponent distance/direction, marker metadata, auth IDs, capabilities, code/token fields, and raw-fix fields. Runner `hunter.runner_ping` and Hunter `runner.location_revealed` events are dropped; Hunter never receives live Runner `team.location_live` events. `NO_FIX` and `STALE` snapshots always drop coordinates.
- `corepack pnpm verify:payloads` passed (2 tests); Deno type checks passed. Realtime topics/RLS are still not integration-tested; those are implemented in Step 15.

## Step 9: simulator clock and shared rules

- Split pure domain types and rule functions into `packages/game-core/src/types.ts` and `rules.ts`; added Vitest 5.0.5 pinned for Node 24 and a 10-case deterministic suite.
- Added balance/readiness rules, Random-team assignment, strict server-deadline tag tie (`accepted_at < ends_at` only), ACTIVE outcomes for all Runners tagged/left, all Hunters left, and timer expiry, plus lazy ping scheduling that returns only the newest newly-due slot.
- Outcome ordering when both teams empty in the same serialized transition is not specified by the plan: Runner elimination is checked first, yielding a Hunter win. This follows the explicit all-Runners-eliminated rule.
- Added a fixed-seed three-fake-player simulator scenario (1 Hunter / 2 Runners), a fixed epoch clock, and a dev-only clock-advance control. Production build still omits the simulator route.
- Vitest passed 10/10 cases; deterministic simulator check passed 1/1; game-core typecheck, web production build, and Oxlint passed.

## Step 10: fake-player scheduled ping sync

- Added migration `202610180003_match_sync.sql`: snapshots now carry `OK | NO_FIX | STALE`, nullable fix columns for absent/stale states, server receive age, and the revision that created them.
- Added the transactional `xzones_sync_match` RPC. It uses `clock_timestamp()`, advances HEAD_START at its server deadline, coalesces missed slots to one newest due snapshot per active Runner, treats fixes older than 60 seconds as STALE without coordinates, and records NO_FIX when no row exists. It stores one snapshot per Runner/slot and returns a stable revision cursor for idempotent retry.
- Added `/matches/:id/sync` to the single API router. It resolves role from the database, projects `match.state` with aggregate active counts, sends Hunter snapshots through the role allow-list, and returns Runner generic ping notice only. No client-provided role is trusted.
- Applied migrations 0001–0003 in order to temporary PostgreSQL 18.6 with an auth schema shim, then ran `tests/schema/match-sync-smoke.sql`: one fresh fix, one stale fix, and one no-fix Runner produced the expected snapshots; missed indexes coalesced to the latest; duplicate retry kept database snapshot count stable; acknowledged revision returned no duplicate; Runner response contained no coordinates or Hunter ping event.
- Deno handler tests and type checks pass. GPS, Docker-backed Supabase integration, and Realtime transport remain untested; this step uses inserted fake `latest_fix` fixtures and server RPC calls only.

## Step 11: guest home, create, and join

- Replaced the home placeholder with guest-name entry, 18+ confirmation, safe-play acknowledgement, and no-location disclosure. No account/sign-in UI is present.
- Added create form controls for 30/45/60-minute rounds, head-start, ping interval, zone Off/fixed, diameter, and optional manually entered center coordinates. Diameter uses 100m increments in the required 400–3000m range.
- Added private six-character join form with normalized code validation and specific server errors. Both forms call a real `GameApi` adapter; they never fall back to MOCK or report success without an API result.
- Added anonymous Auth session creation/refresh using the public anon key, persisted locally in a dedicated guest-session key; service-role secrets are never included in the web adapter. When web env values are absent, the form explains exactly which public names belong in `apps/web/.env.local`.
- The Supabase endpoint has not been integration-tested against a project because no project URL/anon key were supplied and Docker access remains unavailable. Production build and Oxlint pass; route/browser interaction awaits the Playwright verification step.

## Step 12: interactive private lobby and validated start

- Added a real lobby view with a safe roster, team counts, Host/Ready chips, Hunter/Runner/Random selection, readiness, creator-only code sharing, manual refresh, and host-only Start. The client refreshes after mutations; Realtime arrives in Step 15.
- Added migration `202610180004_lobby_view_start.sql` with role-safe lobby sync, shared team/readiness validation, controller-only start, revision conflict checks, and server timestamps. The API validates and projects lobby roster fields instead of returning raw RPC data.
- Start is disabled until 3–12 active players are assigned within the balance constraints and all are ready. The API passes the last observed revision; the database serializes and verifies it before setting `HEAD_START`.
- Typecheck, production build, Oxlint (one known React lint warning on initial async load), 5 Edge handler tests, 10 unit tests, simulator and privacy projection tests passed. Applied migrations 0001–0004 to temporary PostgreSQL and all four `tests/schema/*-smoke.sql` scripts passed, including safe lobby roster, controller-only start, stale revision rejection, and server clock values.
- The warning is from the deliberate initial data-fetch effect in `LobbyPage`; it does not fail the lint command. Supabase Auth/Edge/RLS integration remains untested without a project and the Docker-backed local stack.

## Step 13: server-authoritative head-start clock

- Added the live head-start page. It anchors display countdowns to `server_now` and a monotonic browser clock, resynchronizes every 10 seconds, and reloads by requesting the match clock from the server. It navigates to gameplay only after sync reports `ACTIVE`.
- Added `xzones_match_clock`, a membership-checked clock projection, and included `start_at`, `head_start_ends_at`, and `ends_at` in sync responses. A client never decides that the head start has finished.
- Edge handler tests passed (6/6), typecheck and production build passed (initial JS gzip 106.97 KB), and Oxlint passed with only the two documented initial-load effect warnings in Lobby and HeadStart pages. The clock RPC and SQL migrations were parsed/applied on the temporary PostgreSQL harness; live Supabase/Auth timing and browser reload behavior remain untested pending project credentials and Playwright setup.

## Step 14: role-safe interactive map

- Added lazy-loaded MapLibre gameplay map with OpenFreeMap `dark` and `bright` vector styles for Dusk/Paper, attribution, zoom and recenter controls, optional game boundary, own-location accuracy circle, and distinct teammate versus scheduled ping markers. The map requests GPS only when the player activates Center on me; it does not upload that local fix in this step.
- The map input is a discriminated union: Runner fields have no Hunter snapshot member; Hunter snapshots are separately typed and only render `OK` coordinates, with age applied to opacity. No distances/directions are calculated. The dev simulator toggles role-specific fake payloads and labels the view as simulation.
- Verified `maplibre-gl@6.14.0` against the official MapLibre example; OpenFreeMap’s official quickstart supplies dark/bright style URLs, requires map attribution, and the provider currently states no keys/request limits in its official project page. Its public service terms say it is provided as-is and may change or stop, so map availability is not guaranteed. These are the selected $0/no-account map tiles for Phase A; `VITE_MAP_STYLE_URL` can override the URL if needed. Sources: [MapLibre example](https://maplibre.org/maplibre-gl-js/docs/examples/display-a-map/), [OpenFreeMap quickstart](https://openfreemap.org/quick_start/), [OpenFreeMap project](https://github.com/hyperknot/openfreemap), [OpenFreeMap terms](https://openfreemap.org/tos/).
- Existing payload capture tests still pass. Typecheck, production build and Oxlint pass. Bundle report: initial JS 107.48 KB gzip; MapLibre dynamic chunk 289.61 KB gzip, within the plan’s 250 KB initial and 350 KB additional budgets. Vite warns that the map engine’s uncompressed chunk exceeds 500 KB, but its compressed size is within the stated limit. Real-device map rendering, GPS permission, tile availability, and actual Supabase role position feeds are not yet tested.
- Browser visual check on the local dev server loaded OpenFreeMap dark/bright tiles and attribution; changing the simulator role showed one Hunter scheduled Runner snapshot marker versus Runner self/team markers. The simulator only uses fake coordinates; it does not request GPS.

## Step 15: private role-scoped Realtime authorization

- Added a database predicate that parses only `match:<uuid>:hunter|runner`, resolves the current Auth user through `auth.uid()`, and requires an ACTIVE player whose database role matches the topic. Host/controller status does not change the result. Added an allow policy plus a restrictive guard on `realtime.messages`, scoped to Broadcast SELECT; clients receive no publish or Presence privileges from these policies.
- The frontend verifies its role through the server sync API before joining the exact lowercase private topic. It uses Supabase’s Realtime-only JS package, `private: true`, shares the access token, refreshes it through Realtime’s token callback, drops every message through the shared game-core allow-list, and syncs after reconnect before accepting channel events. Channel and token refresh cleanup are attached to match-page unmount.
- Verified official Supabase Realtime authorization docs: policies on `realtime.messages` authorize private Broadcast/Presence, RLS is checked on channel joins and cached for the connection; public channel access must be disabled in project Realtime settings. Added a manual project setup requirement because no API exists for this setting in the local Supabase config. Official Realtime package pinned to 2.118.0, the latest stable release shown by the project release page on 2026-10-18. Sources: [authorization](https://supabase.com/docs/guides/realtime/authorization), [settings](https://supabase.com/docs/guides/realtime/settings), [client releases](https://github.com/supabase/supabase-js/releases).
- `corepack pnpm test:unit` passed 12/12, payload privacy tests passed 2/2, Edge handler tests passed 6/6, typecheck/build passed, and all six migrations plus five PostgreSQL smoke scripts passed on a vanilla PostgreSQL harness with test-only Auth/Realtime shims. Initial JS gzip is 109.04 KB, Realtime client chunk 16.35 KB, MapLibre chunk 289.61 KB; together the planned map/realtime share is 305.96 KB gzip.
- The Supabase Docker stack was unavailable in this environment, and no cloud project exists yet. Therefore actual private-channel admission/rejection and reconnect behavior against Supabase Realtime remain untested. The database predicate tests verify role/member/topic decisions; the SQL shim does not simulate Realtime’s join authorization engine.

## Step 16: Hunter Pings and Runner-safe ping notice

- Added `/match/:matchId/pings` as a lazy-loaded role-aware screen. Hunters see one latest card per Runner with status (`OK`, `NO_FIX`, `STALE`), ping index, scheduled time, age, and server-derived next-ping timer. It only displays snapshots returned by sync; it does not request live Runner locations.
- Runner view displays only the generic server ping notice (`ping_index`, `ping_at`) and states that Hunter data is unavailable. Runner's `RoleSafeMatchView` contains no snapshot field. Match-screen Pings navigation is Hunter-only.
- Added shared pure `mergeLatestPings`: it keeps the newest ping per Runner and ignores duplicate/equal or older sync retry results. Added deterministic unit test for repeated delivery and multiple skipped indices.
- Checks: unit tests passed 13/13; Edge 6/6; payload leak 2/2; typecheck/build and Oxlint passed. Pings lazy chunk is 1.82 KB gzip, initial bundle 109.15 KB, map chunk 289.61 KB, Realtime chunk 16.35 KB. Live scheduled location feed awaits actual Supabase server publication; API sync fallback currently provides snapshots on the 15-second schedule.

## Step 5: GameApi and MOCK adapter

- Added a typed `GameApi` contract with result/error types and separate Runner/Hunter match-view unions. Runner view types contain no Hunter coordinates, distance, direction, or marker metadata fields.
- Added a development-only MOCK implementation and simulator route. It returns visibly prefixed fake IDs and `SIM-*` codes under a persistent `SIMULATION: NOT A REAL MATCH` banner; no network or GPS code is used. Mock types use a separate `source: SIMULATION` discriminator and cannot satisfy the real LobbyView type.
- Verified the production build and Oxlint pass, and searched built assets to confirm the simulator banner is excluded from production. Full simulator team/clock behavior is deferred to Step 9.
# Step 17 — QR tags and Runner confirmation

- Added QR generation with `qrcode@1.5.4` and lazy-loaded camera decoding with `jsqr@1.4.0`; both versions and lockfile integrity are pinned. The package metadata identifies MIT for `qrcode` and Apache-2.0 for `jsqr`; `jsqr` ships its own TypeScript declarations.
- QR challenges use 32 cryptographically random bytes, shown only to the issuing Runner and held in component memory. The `api` Edge Function hashes the bytes with SHA-256 before calling SQL; only the hash is persisted. Challenges expire after 60 server seconds and SQL serializes one-time consumption.
- Runner self-confirmation uses the same server-side tag transaction, invalidates that Runner's outstanding QR, deletes their latest fix, and ends the match for Hunters when no active Runners remain. GPS proximity is not consulted.
- Camera access starts only after a Hunter presses the scan button and the scanner stops on exit or successful decode. Real-device camera validation remains untested; browsers require HTTPS or localhost for camera access.
- Verified the database migration and all schema smoke files on temporary vanilla PostgreSQL 18.6 using the test-only Supabase shim. This does not verify Supabase Auth, RLS, or Realtime integration.

## Step 20: PWA shell and live location

- Added a production service worker that caches only the app shell and same-origin hashed static assets. Auth, REST, Edge Function, and cross-origin requests bypass the cache; match state, tokens, and coordinates are never cached.
- Added an explicit Ready-time GPS permission check and sharing disclosure. Location is held in a memory-only Zustand store, watched only for a consented match, and uploaded when visible/online at roughly 10-second or 10-meter movement intervals. Fixes over 100m accuracy are not uploaded; uploads pause in the background/offline, and teammates’ fixes become visibly stale after 30 seconds. Permission denial clears consent and cancels Ready.
- Added the `xzones_update_location` and role-filtered `xzones_team_positions` RPCs. The API sync projects same-team live locations only; it independently rejects role mismatch, excludes the caller’s own server row, and never places opposing-team live positions in either role’s sync response. A location acknowledgement contains no coordinate echo.
- The UI and SQL migration are implemented and local checks passed: Vitest 14/14, production typecheck/build, Deno API 11/11, payload privacy 2/2, simulator 1/1, `git diff --check`, and Step 20 migration plus `live-location-smoke.sql` on temporary vanilla PostgreSQL 18.6. Docker-backed Supabase was not available, and no hosted project or HTTPS deployment is configured, so real-phone GPS/background/HTTPS and end-to-end Edge/RLS behavior remain untested. Vite reports MapLibre’s 1.07MB uncompressed chunk; it is 289.61KB gzip, within the plan’s 350KB compressed map budget.

## Step 21: definition review and CI

- Added Playwright Test 1.64.1, pinned in the workspace lockfile after checking the official release page. Four Chromium UI tests cover guest safety gates, persisted theme/map style, private join-code normalization/validation without a backend, and offline status with no private-data caching. They passed locally (4/4) against the existing Vite app using the downloaded Playwright Chromium.
- Added a disposable PostgreSQL harness script and GitHub Actions workflow. The workflow pins pnpm 12.14.0 and Deno 2.9.6, uses PostgreSQL 17, installs the matching Playwright Chromium, and runs unit/API/privacy/simulator/browser/schema smoke tests plus lint and build. The full local schema harness applied all migrations and passed all eight SQL smoke files on temporary PostgreSQL 18.6.
- Added pure fixed-zone sample classification with accuracy bounds and two consecutive confident samples to start/clear a reveal; uncertainty or no fix never counts. Unit tests cover the edge and transitions. This is a shared rule only; no GPS proximity tagging was added.
- Verified locally: 15 unit tests, 11 Edge handler tests, 2 payload leak tests, 1 simulator test, 4 Playwright tests, 8 SQL smoke tests, Oxlint exit 0 (existing React-effect warnings), and web production typecheck/build. Production build retains the known 1.07MB uncompressed MapLibre chunk (289.61KB gzip). Hosted Supabase/RLS/Realtime, CI execution on GitHub, actual phone GPS/camera/background behavior, deployment, and real two-phone multiplayer remain untested.
# Hide & Seek implementation — baseline verification

- Record the baseline against the frozen lockfile using a temporary pnpm store under `/tmp`; the repository's configured store could not open its operation lock in the sandbox. Run the Vite-backed E2E and temporary PostgreSQL gates with local process/socket access when sandbox isolation blocks startup. This changes no application behavior.
# Hide & Seek implementation — audit triage

- Keep F-02 open until the real Supabase Realtime integration job passes. Mock publisher, role projection, RLS, and SQL tests do not establish actual socket delivery or cached-subscription revocation; preserve the Realtime path while adjusting fallback polling.
# Hide & Seek implementation — client lifecycle audit

- Treat stored guest auth credentials and active match identity as separate state: localStorage retains the former, while route/session-based active-match rejoin is not implemented. For Safari, report Screen Wake Lock as API-supported from 16.4 while explicitly requiring installed-PWA/device verification for older iOS releases.
