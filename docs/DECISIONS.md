# Implementation Decisions and Verification Log

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

## Step 5: GameApi and MOCK adapter

- Added a typed `GameApi` contract with result/error types and separate Runner/Hunter match-view unions. Runner view types contain no Hunter coordinates, distance, direction, or marker metadata fields.
- Added a development-only MOCK implementation and simulator route. It returns visibly prefixed fake IDs and `SIM-*` codes under a persistent `SIMULATION: NOT A REAL MATCH` banner; no network or GPS code is used. Mock types use a separate `source: SIMULATION` discriminator and cannot satisfy the real LobbyView type.
- Verified the production build and Oxlint pass, and searched built assets to confirm the simulator banner is excluded from production. Full simulator team/clock behavior is deferred to Step 9.
