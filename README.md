# XZones

XZones is a private outdoor Hunter vs Runner hide-and-seek game for 3–12 friends. Runners stay hidden while Hunters receive scheduled location snapshots; players tag in person with a short-lived QR code or the Runner confirmation.

**Phase A PWA is implemented; live Supabase and real-phone verification are still pending. Phase B Android/Capacitor work has not started.** The build plan is [xzones.md](xzones.md), with project decisions in [docs/DECISIONS.md](docs/DECISIONS.md) and unfinished checks in [docs/KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md).

![XZones Dusk and Paper UI board](docs/design/XZONES_Dusk_Contour_Game_UI_Board.png)

## Core rules

- Private six-character join code; 3–12 players split into Hunter and Runner teams.
- The server controls the head start, ping schedule, deadline, tags, and match outcome.
- Teammates can see same-team live positions. Hunters get Runner locations only in scheduled, age-labelled snapshots; Runners never get Hunter location data.
- GPS proximity never counts as a tag. Tags require the match-bound QR or the Runner's “I was tagged” confirmation.
- Keep the phone with you and play only in places where games are permitted. See the [safe-play guidance](docs/PHONE-TEST-CHECKLIST.md#safe-play).

## Stack and repository layout

React, TypeScript, Vite PWA, pnpm workspaces, Zustand, MapLibre, Supabase (Postgres, Edge Functions and private Realtime), Vitest, Deno tests, and Playwright. Oxlint is the configured linter; the project does not add ESLint or Prettier.

```text
apps/web/                  PWA and browser UI
backend/supabase/          Supabase config, migrations, and api Edge Function
packages/game-core/        Pure shared rules and role-safe payload projection
tests/                     Browser, privacy, and SQL smoke tests
tools/simulator/           Deterministic fake-player scenario
docs/                      Decisions, known issues, phone checklist, design board
xzones.md                  Authoritative implementation plan (sections 19–29)
```

## Prerequisites

- Node.js 24.19.x (version in `.nvmrc`) and Corepack with pnpm 12.14.0 (pinned in `package.json`).
- Docker only for the full local Supabase stack. The isolated SQL smoke harness needs PostgreSQL and `psql`.
- Chromium for Playwright: install it with `corepack pnpm exec playwright install chromium`.
- Supabase CLI 2.121.0 is pinned as a workspace dependency.

## Setup from a clean clone

```sh
git clone --branch feat/phase-a https://github.com/Aayushdt/Zones.git
cd Zones
corepack pnpm install --frozen-lockfile
```

The root [.env.example](.env.example) lists variable names only. For the browser, create `apps/web/.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; `VITE_MAP_STYLE_URL` is an optional map-style override. These `VITE_` values are public and bundled into the browser.

Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JOIN_CODE_HMAC_SECRET`, `QR_SIGNING_SECRET`, and `RATE_LIMIT_HASH_SECRET` as Supabase Edge Function secrets (or in the ignored local function env file described below). Never use the `VITE_` prefix for server secrets. Do not commit local env files.

## Run the web app

```sh
corepack pnpm --filter @xzones/web dev
```

The guest onboarding and settings screens work without a backend. Private create/join and real matches require the public Supabase browser values above. In development, the isolated fake-player simulator is at `http://localhost:5173/dev/sim`; it is visibly marked `SIMULATION: NOT A REAL MATCH` and cannot be used as a real match.

## Run Supabase locally

From the repository root, with Docker running:

```sh
corepack pnpm exec supabase start --workdir backend/supabase
corepack pnpm exec supabase db reset --workdir backend/supabase
corepack pnpm exec supabase status --workdir backend/supabase --output env
```

Use the printed local API URL and anon key in `apps/web/.env.local`. Create the ignored file `backend/supabase/functions/.env.local` with the server variable names from `.env.example` and local-only values, then serve the function:

```sh
corepack pnpm exec supabase functions serve --workdir backend/supabase --env-file backend/supabase/functions/.env.local
```

`supabase db reset` reapplies the migrations in `backend/supabase/migrations`. Never use a service-role key in browser env. Full local Supabase/Auth/Realtime checks require Docker; the SQL smoke harness below is not a substitute for that integration.

## Tests and checks

```sh
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test:unit
corepack pnpm test:audit
corepack pnpm verify:payloads
corepack pnpm test:edge
corepack pnpm test:api
corepack pnpm test:sim
corepack pnpm test:db
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
corepack pnpm build
```

`test:e2e` starts the web app on port 5175 when one is not already running. `test:db` starts a temporary PostgreSQL instance and applies a test-only Auth/Realtime shim, every migration, and every SQL smoke test. It needs local PostgreSQL server tools (`initdb`, `pg_ctl`, `createdb`, and `psql`) and permission to open a local socket.

The real Realtime integration runs in the `supabase-realtime` GitHub Actions job. It starts the complete local Supabase stack, serves the API Edge Function, then runs `corepack pnpm test:realtime-integration`. For manual use, start Supabase and the `api` function, then set `SUPABASE_API_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_DB_URL` from `supabase status -o env`; the test uses `psql` to check that coordinate-bearing REST broadcasts were not persisted. The test cannot pass against the native PostgreSQL shim alone.

To run the schema smoke harness against an explicitly managed, disposable PostgreSQL database instead:

```sh
DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/EMPTY_TEST_DATABASE' bash scripts/test-schema.sh
```

Never point the schema harness at a real or valuable database. GitHub Actions runs the unit, audit, API, privacy, simulator, browser, SQL, lint, build, and Supabase Realtime integration checks.

## Free deployment

Cloudflare Pages is the documented static-host option. Its Free plan currently has a 500-builds/month limit and 20,000 files per site; review the current [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/) before relying on them. For this repository's opt-in workflow, create a Direct Upload project and configure:

- Create a Cloudflare Pages project using [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) (a Direct Upload project cannot later switch to Git integration).
- Add the GitHub Actions secret and repository variables listed below, then dispatch **Deploy to Cloudflare Pages (manual)** from the Actions tab.
- The workflow runs `corepack pnpm install --frozen-lockfile && corepack pnpm --filter @xzones/web build` and deploys `apps/web/dist`.
- Public build variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; optionally `VITE_MAP_STYLE_URL`.

The optional manual workflow is `.github/workflows/deploy-cloudflare.yml`; configure the `CLOUDFLARE_API_TOKEN` Actions secret and `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PAGES_PROJECT`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optional `VITE_MAP_STYLE_URL` Actions variables before dispatching it. The token needs Cloudflare Pages edit permission. The workflow skips deployment when required settings are missing. Supabase database migrations and Edge Function deployment are separate and must be configured in Supabase. Do not deploy until you have reviewed the security policies and configured the required server secrets.

GitHub Pages is also free, but this Vite app's root-relative assets and client-side routes need a repository base path and SPA fallback configuration that are not currently set up. Use the documented Cloudflare path unless you intentionally add and verify that GitHub Pages configuration.

## Phase B Android APK (not available yet)

There is no APK build command or signing workflow in Phase A. Phase B starts with the Android location-service proof of concept and Capacitor/SDK/JDK setup described in [xzones.md](xzones.md); it must not be treated as already built or tested.

## Testing on a real phone (needs HTTPS)

Phone geolocation and camera access require HTTPS; `localhost` is the development exception and does not apply to a phone visiting a LAN IP. Use the checklist in [docs/PHONE-TEST-CHECKLIST.md](docs/PHONE-TEST-CHECKLIST.md). Real phone tests have not been run yet.

## Privacy

The server keeps one replaceable `latest_fix` row per active player, not route history. It deletes that row when a player is tagged or leaves and when a match ends. Hunter snapshots and match metadata are retained for no more than seven days. Role-filtered server responses prevent Runners from receiving Hunter locations and prevent Hunters from receiving live Runner locations between scheduled pings. The service-role key and signing secrets stay server-side.

## Project status and license

Phase A implementation is present on `feat/phase-a`; automated local checks pass, but hosted Supabase, CI execution, HTTPS deployment, and real-phone multiplayer remain unverified. Phase B is not started. No license is set yet; please choose MIT or all-rights-reserved before public reuse or redistribution.

The original UI board is also available at [docs/design/XZONES_Dusk_Contour_Game_UI_Board.png](docs/design/XZONES_Dusk_Contour_Game_UI_Board.png).
