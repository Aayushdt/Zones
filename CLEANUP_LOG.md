# Repository Cleanup Log

This document tracks the step-by-step repository cleanup of `Zones`. Every deletion is verified with concrete evidence, logged with reverse references, and reversible.

---

## Step 0: Setup and Baseline Verification

- **Cleanup Branch:** `chore/cleanup-20261028`
- **Base Branch / Commit:** `main` @ `953f324` (includes `fix/audit-remediation-20261028` and `ui/audit-improvements-20261028`).
- **Target Principles:**
  - Zero behavior change.
  - No deletions on suspicion. Every deletion requires SAFE classification (>= 2 independent pieces of evidence).
  - One category per commit.
  - Every pushed commit passes typecheck, lint, build, unit, audit, and e2e guardrails.

### Baseline Verification Table

| Command | Exit Code | Result / Warnings | Notes |
| :--- | :--- | :--- | :--- |
| `corepack pnpm install --frozen-lockfile` | 0 | PASS | Clean frozen lockfile resolution |
| `corepack pnpm typecheck` | 0 | PASS (0 errors) | `tsc -b` and all workspaces clean |
| `corepack pnpm lint` | 0 | PASS (0 errors, 11 warnings) | 11 React Compiler `set-state-in-effect` notices; 0 lint errors |
| `corepack pnpm test:unit` | 0 | PASS (42/42 tests) | `@xzones/game-core` test suite |
| `corepack pnpm test:audit` | 0 | PASS (34/34 tests) | Rules audit and client logic audit |
| `corepack pnpm verify:payloads` | 0 | PASS | Deno payload schema validation |
| `corepack pnpm test:edge` | 0 | PASS | Supabase edge functions test suite |
| `corepack pnpm test:api` | 0 | PASS | Supabase functions API tests |
| `corepack pnpm test:sim` | 0 | PASS | Simulator headless suite |
| `node scripts/check-bundle-budget.mjs` | 0 | PASS | Entry JS 114.61 kB gzip, CSS 22.02 kB gzip, MapLibre 280.26 kB gzip |
| `playwright test tests/e2e/ui-guardrails.spec.ts` | 0 | PASS (4/4 viewport suites) | Zero overflow, >=44px targets, 0 serious/critical axe violations |

### Baseline Production Build Chunks & Assets (`apps/web/dist`)

- **Total Dist Size:** 2.9 MB

| Asset / Chunk | Raw Size | Gzip Size | Reachable from Entry? |
| :--- | :--- | :--- | :--- |
| `dist/index.html` | 1.64 kB | 0.75 kB | Yes (Entry HTML) |
| `dist/assets/index-BF3a2NCi.css` | 134.81 kB | 22.83 kB | Yes (Global Stylesheet) |
| `dist/assets/index-D7NEdm4-.js` | 378.19 kB | 118.49 kB | Yes (Entry JavaScript) |
| `dist/assets/chunk-OB3PAWPO-BteO0Y7B.js` | 92.91 kB | 30.83 kB | Yes (Shared vendor chunk) |
| `dist/assets/module-D7bDk-HI.js` | 56.36 kB | 16.35 kB | Yes (Shared runtime module) |
| `dist/assets/maplibre-gl-CV15SaqY.js` | 1,074.65 kB | 289.61 kB | No (Lazy map chunk) |
| `dist/assets/maplibre-gl-worker-CV6NbyPW.js` | 507.71 kB | - | No (Lazy WebGL worker) |
| `dist/assets/CameraScanner-DStTQp6K.js` | 133.46 kB | 49.39 kB | No (Lazy camera chunk) |
| `dist/assets/MatchPage-DQj1tlxU.js` | 30.82 kB | 10.31 kB | No (Lazy match route) |
| `dist/assets/SettingsPage-CeUUNrx3.js` | 10.93 kB | 3.70 kB | No (Lazy settings route) |
| `dist/assets/GuidePage-C1Tqx6UD.js` | 7.89 kB | 2.61 kB | No (Lazy guide route) |
| `dist/assets/TagPage-BoV5csVk.js` | 7.02 kB | 2.69 kB | No (Lazy tag route) |
| `dist/assets/PingsPage-BFlpDOLL.js` | 5.52 kB | 2.05 kB | No (Lazy pings route) |
| `dist/assets/ResultsPage-xiKhuq2a.js` | 4.83 kB | 1.85 kB | No (Lazy results route) |
| `dist/assets/HostClaimPage-BbLWOOOd.js` | 1.66 kB | 0.83 kB | No (Lazy host claim route) |
| `dist/assets/BugReportPage-B56qqz9A.js` | 1.83 kB | 0.87 kB | No (Lazy bug report route) |

### Baseline Repository Statistics

- **Tracked Files Count:** 486 files
- **Tracked Directory Sizing:**
  - `apps/`: 96 files, 13,690 lines
  - `packages/`: 20 files, 2,464 lines
  - `backend/`: 46 files, 5,690 lines
  - `scripts/`: 8 files, 278 lines
  - `tools/`: 5 files, 254 lines
  - `tests/`: 49 files, 5,025 lines
  - `docs/`: 240 files, 45,075 lines (includes screenshots and audit records)
- **Repo Disk Size:** 446 MB (includes `.git` history, `node_modules`, and test caches)
- **Dependencies Count:**
  - `root`: 0 dependencies, 3 devDependencies
  - `apps/web`: 14 dependencies, 10 devDependencies
  - `packages/game-core`: 0 dependencies, 2 devDependencies

---

## Cleanup Step Checklist

- [x] **Step 0:** Setup and baseline (no deletions)
- [x] **Step 1:** Build the KEEP LIST (documentation only)
- [ ] **Step 2:** Automated detection (raw hints, saved outside repo)
- [ ] **Step 3:** Verify and classify every candidate, then write CLEANUP_REPORT.md
- [ ] **Step 4:** Junk and stray files (repo hygiene)
- [ ] **Step 5:** Unused assets
- [ ] **Step 6:** Dead code in the web app (`apps/web`)
- [ ] **Step 7:** Dead code in packages, backend, scripts and tools
- [ ] **Step 8:** Comments, unreachable code, unused imports/variables/params, debug leftovers
- [ ] **Step 9:** Unused CSS
- [ ] **Step 10:** Dependencies, scripts and tooling config
- [ ] **Step 11:** Stale docs and tests
- [ ] **Step 12:** Final verification and report

---

## Step 1: Reachability Keep List (Protected Entry Points and Invariants)

Every candidate considered for deletion must be checked against this Keep List. Items connected to these entry points, cross-runtime bridges, dynamic selectors, or protected files must NEVER be deleted.

### 1. Web Application Entry Points (`apps/web`)
- **HTML & Boot:** `apps/web/index.html` mounts `apps/web/src/main.tsx` -> `apps/web/src/App.tsx` -> `apps/web/src/app/router.tsx`.
- **Primary Routes (Static):**
  - `/`: `apps/web/src/pages/HomePage.tsx`
  - `/create`: `apps/web/src/pages/CreatePage.tsx` (includes subcomponents in `apps/web/src/pages/create/`)
  - `/join`: `apps/web/src/pages/JoinPage.tsx`
  - `/lobby/:matchId`: `apps/web/src/pages/LobbyPage.tsx`
  - `/match/:matchId/head-start`: `apps/web/src/pages/HeadStartPage.tsx`
- **Lazy-Loaded Route Chunks:**
  - `/match/:matchId`: `apps/web/src/pages/MatchPage.tsx`
  - `/match/:matchId/pings`: `apps/web/src/pages/PingsPage.tsx`
  - `/match/:matchId/tag`: `apps/web/src/pages/TagPage.tsx`
  - `/match/:matchId/results`: `apps/web/src/pages/ResultsPage.tsx`
  - `/match/:matchId/host-claim`: `apps/web/src/pages/HostClaimPage.tsx`
  - `/settings`: `apps/web/src/pages/SettingsPage.tsx`
  - `/guide`: `apps/web/src/pages/GuidePage.tsx`
  - `/bug-report`: `apps/web/src/pages/BugReportPage.tsx`
  - `/dev/sim` (DEV only): `apps/web/src/pages/SimulatorPage.tsx`
  - Catch-all fallback (`*`): `apps/web/src/pages/RouteShell.tsx` (`kind="not-found"`)

### 2. Shared Packages & Cross-Runtime Consumers
- **`@xzones/game-core` (`packages/game-core`):**
  - Package entry point: `packages/game-core/src/index.ts` (configured in `package.json` exports map).
  - Web consumers: `apps/web/src/` imports rules, configs, smoothing, and ping models.
  - Deno Backend Edge Function consumers (`backend/supabase/functions/api/index.ts`):
    - Imports `packages/game-core/src/config.ts` (`isValidMatchConfig`, `isValidZoneConfig`).
    - Imports `packages/game-core/src/hideAndSeekConfig.ts` (`HIDE_AND_SEEK_CONFIG`).
  - Deno Simulator consumers (`tools/simulator/scenario.ts`):
    - Imports `packages/game-core/src/rules.ts` (`balanceTeams`).
  - Deno Test consumers (`tests/review/privacy-leak-check_test.ts`):
    - Imports `packages/game-core/src/payloads.ts` (`projectEventForRole`).
  - Audit Test consumers (`tests/audit/client_logic_audit.test.ts`):
    - Imports `packages/game-core/src/index.ts` (`mergeLatestPings`).

### 3. Backend Edge Functions & Database
- **Supabase Configuration:** `backend/supabase/config.toml` declares `[functions.api]` entrypoint `./functions/api/index.ts`.
- **API Function Entry Points & Handlers:**
  - `backend/supabase/functions/api/index.ts` (Request router and action handlers: create, join, ready, start, pings, tag, heartbeat, location, items).
  - `backend/supabase/functions/api/broadcast.ts` (Realtime event publishing).
  - `backend/supabase/functions/api/payloads.ts` (Role-safe payload projection).
  - `backend/supabase/functions/api/index_test.ts` (Edge unit test suite).
  - `backend/supabase/functions/api/deno.json` (Deno task configuration).
- **Database Migrations (STRICT KEEP):**
  - `backend/supabase/migrations/202610180001_core.sql` through `202610200039_runner_camouflage.sql` (39 files).

### 4. Scripts, Simulator & Test Suites
- **Executable Scripts:**
  - `scripts/check-bundle-budget.mjs` (CI asset budget enforcement).
  - `scripts/run-deno.mjs` (Cross-platform Deno runner).
  - `scripts/verify-payloads.ts` (Target for role payload privacy verification).
  - `scripts/run-audit.sh`, `scripts/run-load-test.sh`, `scripts/test-audit-db.sh`, `scripts/test-schema.sh`, `scripts/test-tag-races.sh`.
- **Tools:**
  - `tools/capture-ui.mjs` (UI screenshot visual baseline generator).
  - `tools/simulator/headless_sim.ts`, `tools/simulator/scenario.ts`, `tools/simulator/scenario_test.ts`, `tools/simulator/sim_test.ts`.
- **Test Suites:**
  - Unit: `packages/game-core/src/*.test.ts`
  - Audits: `tests/audit/rules_audit.test.ts`, `tests/audit/client_logic_audit.test.ts`, `tests/audit/api_hostile_audit_test.ts`
  - Realtime: `tests/realtime/integration.mjs`
  - Privacy: `tests/privacy/verify-payloads.ts`, `tests/review/privacy-leak-check_test.ts`
  - E2E: `tests/e2e/app.spec.ts`, `tests/e2e/ui-guardrails.spec.ts`

### 5. Public Assets & PWA Infrastructure
- `apps/web/public/favicon.svg` (Linked in `index.html`, precached by `sw.js`).
- `apps/web/public/manifest.webmanifest` (Linked in `index.html`, precached by `sw.js`, validated by E2E).
- `apps/web/public/icons-192.png` (Referenced by PWA manifest, precached by `sw.js`).
- `apps/web/public/icons-512.png` (Referenced by PWA manifest, precached by `sw.js`).
- `apps/web/public/icons.svg` (Referenced by PWA manifest, precached by `sw.js`).
- `apps/web/public/contour-grid.svg` (Referenced in `apps/web/src/index.css`).
- `apps/web/public/sw.js` (Registered in `apps/web/src/main.tsx` for offline map tile caching).

### 6. Environment Variables
- Client: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MAP_STYLE_URL`.
- Backend/Deno: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JOIN_CODE_HMAC_SECRET`, `RATE_LIMIT_HASH_SECRET`.
- CI/Automation: `CI`, `PW_USE_SYSTEM_CHROME`, `DATABASE_URL`, `API_URL`, `DB_URL`, `ANON_KEY`, `SUPABASE_API_URL`, `SUPABASE_DB_URL`, `XZONES_UI_URL`.

### 7. Dynamic Class Patterns & UI Invariants
- Dynamic CSS BEM modifiers:
  - Buttons: `app-btn--${variant}`, `app-btn--${size}`, `app-btn--full`
  - Cards & Chips: `app-card--${variant}`, `app-card--interactive`, `app-chip--${variant}`, `app-chip--${size}`, `app-chip--pulse`
  - Hold Button: `hold-btn--${variant}`, `is-holding`
  - Icon Buttons: `icon-btn--${size}`, `icon-btn--${variant}`
  - Tabs: `app-tabs-wrap--${orientation}`, `app-tabs--${orientation}`
  - Teams & Badges: `team-card--${variant}`, `gps-badge--${state}`
  - HUD & Banners: `hud-screen--stealth`, `results-hero-banner--${winnerVariant}`, `ping-card--${status}`
- State Modifiers:
  - `is-open`, `is-closed`, `is-active`, `is-selected`, `is-ready`, `is-not-ready`, `is-self`, `is-disabled`, `has-error`, `is-on`, `is-off`, `is-seeker`, `is-hider`, `is-critical-pulse`, `game-map-canvas--tactical`.

### 8. Protected Files (NEVER DELETE OR MODIFY)
- All migration files: `backend/supabase/migrations/*.sql`
- Supabase configuration: `backend/supabase/config.toml`
- License & env template: `LICENSE`, `.env.example`
- Core audit & log docs: `ERRORS.md`, `IMPROVEMENTS.md`, `REMEDIATION_LOG.md`, `UI_REMEDIATION_LOG.md`, `DEFERRED.md`, `CLEANUP_REPORT.md`, `CLEANUP_LOG.md`
- Lockfile (`pnpm-lock.yaml`) except when regenerating after dependency removals.

---

## Deletions Manifest Table

| Step | ID | Category | Path / Symbol | Confidence | Evidence Summary | Last-Touched Commit | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| - | - | - | - | - | - | - | - |
