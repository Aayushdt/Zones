# Cleanup Pass 2 Log: XZones

This document tracks **Cleanup Pass 2** on branch `chore/cleanup-pass2-20261029`.
The purpose of Pass 2 is to close all analytical and evidence gaps from Pass 1, rigorously investigate hypotheses G1–G10, eliminate provably dead branches, CSS, and assets with concrete proof, while strictly adhering to the **Zero Behavior Change** mandate.

---

## Step 0: Setup and Trustworthy Baseline

- **Branch Name:** `chore/cleanup-pass2-20261029`
- **Base Branch / Tip:** Branched from the tip of `chore/cleanup-20261028` @ `66b1bd4` (since `chore/cleanup-20261028` is not yet merged into `origin/main`).
- **Remote Tracking:** `origin/chore/cleanup-pass2-20261029`

### Baseline Verification Table

| Command | Exit Code | Result Summary | Notes |
| :--- | :--- | :--- | :--- |
| `corepack pnpm install --frozen-lockfile` | 0 | PASS | Clean frozen lockfile verification |
| `corepack pnpm typecheck` | 0 | PASS (0 errors) | `tsc -b` and all workspaces clean |
| `corepack pnpm lint` | 0 | PASS (0 errors, 11 warnings) | Exactly 11 warnings: 10 `react(set-state-in-effect)`, 1 `eslint(no-extra-boolean-cast)`. 0 errors. |
| `corepack pnpm build` | 0 | PASS | Production build succeeded (2.9 MB total dist) |
| `corepack pnpm test:unit` | 0 | PASS (42/42 tests) | `@xzones/game-core` test suite |
| `corepack pnpm test:audit` | 0 | PASS (34/34 tests) | Rules audit and client logic audit |
| `corepack pnpm verify:payloads` | 0 | PASS (2/2 tests) | Role payload privacy verification |
| `corepack pnpm test:edge` | 0 | PASS (19/19 tests) | Deno Edge API function unit suite |
| `corepack pnpm test:api` | 0 | PASS | Supabase functions API tests |
| `corepack pnpm test:sim` | 0 | PASS (1/1 test) | Headless simulator scenario |
| `node scripts/check-bundle-budget.mjs` | 0 | PASS | Entry JS 114.61 kB (gzip), CSS 22.02 kB (gzip), MapLibre 280.26 kB (gzip) |
| `corepack pnpm exec playwright test` | 0 | PASS (47/47 tests) | **All** E2E specs passed (`app`, `compliance-audit`, `gps-and-tactical-feedback`, `offline-map-resilience`, `smoke-flow`, `ui-guardrails`, `visual-a11y-audit`) |
| `bash scripts/test-audit-db.sh` | 0 | PASS (14/14 scenarios) | Database migration and race scenarios against local PostgreSQL |
| `node tests/realtime/integration.mjs` | 1 | NOT RUNNABLE | Requires live local Supabase stack (`SUPABASE_API_URL`, `SUPABASE_ANON_KEY`, ephemeral tokens from `supabase start`) |

### Corrected Repository Metrics (Git-Derived, No node_modules/dist)

- **Total Tracked Files (`git ls-tree -r -l HEAD`):** 488 files, 14,736,744 bytes
- **Tracked Text Lines (`git grep -I -c ''`):** 35,096 lines
- **Repository Object DB Size (`git count-objects -vH`):** 48.55 MiB (reconciles Pass 1's dirty 446 MB `du -sh` report)

#### Tracked Files, Bytes, and Lines by Directory

| Directory | Tracked Files | Tracked Bytes | Tracked Text Lines | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `(root)` | 20 | 305,801 | 4,935 | Configs, documentation, lockfile, logs |
| `.github/` | 3 | 6,145 | 183 | CI and deployment workflows |
| `android/` | 1 | 296 | 3 | Android metadata |
| `apps/` | 96 | 483,199 | 13,568 | `@xzones/web` application source |
| `backend/` | 46 | 287,870 | 5,690 | Supabase config, edge functions, migrations |
| `docs/` | 240 | 13,292,750 | 2,696 | Design assets, screenshots, audit documentation |
| `packages/` | 20 | 83,251 | 2,464 | `@xzones/game-core` source and vitest suites |
| `scripts/` | 8 | 12,108 | 278 | Shell and node verification scripts |
| `tests/` | 49 | 255,529 | 5,025 | Unit, audit, E2E, review, and schema tests |
| `tools/` | 5 | 9,795 | 254 | Simulator and capture tools |
| **TOTAL (Asserted)** | **488** | **14,736,744** | **35,096** | **Sums equal directory totals exactly** |

#### Dependency Inventory by Workspace

- **Root `package.json` (3 total):**
  - `dependencies` (0): None
  - `devDependencies` (3): `@axe-core/playwright`, `@playwright/test`, `supabase`
- **`apps/web/package.json` (24 total):**
  - `dependencies` (14): `@fontsource-variable/jetbrains-mono`, `@fontsource/inter`, `@formkit/auto-animate`, `@supabase/realtime-js`, `@xzones/game-core`, `canvas-confetti`, `jsqr`, `lucide-react`, `maplibre-gl`, `qrcode`, `react`, `react-dom`, `react-router-dom`, `zustand`
  - `devDependencies` (10): `@types/canvas-confetti`, `@types/geojson`, `@types/node`, `@types/qrcode`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `oxlint`, `typescript`, `vite`
- **`packages/game-core/package.json` (2 total):**
  - `dependencies` (0): None
  - `devDependencies` (2): `typescript`, `vitest`

#### Production Build Chunks & Sizing (`apps/web/dist`)

- **Total Dist Size:** 2.8 MB (uncompressed)
- **Global Stylesheet (`index-BF3a2NCi.css`):** 131.65 kB raw / 22.02 kB gzip (Budget: <= 30 kB)
- **Entry JS (`index-D7NEdm4-.js`):** 369.33 kB raw / 114.61 kB gzip (Budget: <= 130 kB)
- **MapLibre Chunk (`maplibre-gl-CV15SaqY.js`):** 1,049.47 kB raw / 280.26 kB gzip (Budget: <= 320 kB)

#### Visual Baseline Screenshots
Captured 28 full-page screenshots at 390x844 (mobile) and 1440x900 (desktop) across Dusk and Paper themes into `/tmp/cleanup2/screens-before/`.

---

## Cleanup Pass 2 Step Checklist

- [x] **Step 0:** Setup and a trustworthy baseline
- [ ] **Step 1:** Audit the audit (documentation only) (G1–G10)
- [ ] **Step 2:** `docs/` inventory and cleanup (G1)
- [ ] **Step 3:** Template leftovers, public assets, and the service worker (G3, G5)
- [ ] **Step 4:** Scripts, tools, and tests: prove invocation (G6)
- [ ] **Step 5:** Dependencies: account for ALL of them (G2)
- [ ] **Step 6:** `game-core` and shared exports, per symbol (G5, G7)
- [ ] **Step 7:** `RouteShell` dead branches (C-016, G4)
- [ ] **Step 8:** CSS with coverage evidence (G3)
- [ ] **Step 9:** Dead backend surface (REPORT-ONLY) (G9)
- [ ] **Step 10:** Repo hygiene (G7, G9)
- [ ] **Step 11:** Final verification and report

---

## Pass 2 Deletions Manifest Table

| Step | ID | Category | Path / Symbol | Confidence | Evidence Summary | Last-Touched Commit | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| - | - | - | - | - | Initializing Pass 2 | - | - |
