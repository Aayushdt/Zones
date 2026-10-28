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
- [x] **Step 1:** Audit the audit (documentation only) (G1–G10)
- [x] **Step 2:** `docs/` inventory and cleanup (G1)
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

## Step 1: Audit the Audit (Findings on Hypotheses G1–G10)

| Gap ID | Hypothesis | Result | Concrete Evidence & Method |
| :--- | :--- | :--- | :--- |
| **G1** | `docs/` (240 files, 13.29 MB) was never analysed | **CONFIRMED** | Pass 1 only ran a regex link check on `README.md`. `docs/` contains 240 tracked files (13.29 MB, 2,696 lines). Full inventory deferred to Step 2. |
| **G2** | Dependency count (24 vs 17) & LOC discrepancies | **CONFIRMED** | Pass 1 reported "17 audited" dependencies; `apps/web/package.json` actually defines 14 dependencies + 10 devDependencies = 24. Exact text line count is 35,096 (not 67,455). Git object DB is 48.55 MiB (not dirty 446 MB). |
| **G3** | CSS (134 kB) verified without coverage or template checks | **CONFIRMED** | Pass 1 ran only bundle budget and 4 Playwright viewport smoke checks. No Chromium CSS coverage was gathered. Addressed in Steps 3 and 8. |
| **G4** | `RouteShell` 11 unused copy keys is dead code, not refactor | **CONFIRMED** | In `router.tsx:61`, `<RouteShell kind="not-found" />` is the sole consumer. The other 11 dictionary keys and conditional navigation blocks are provably unreachable. Addressed in Step 7. |
| **G5** | Circular KEEP evidence was accepted in Pass 1 | **CONFIRMED** | In Pass 1, `icons.svg` was kept because `sw.js` and `manifest.webmanifest` listed it without checking actual HTML/CSS consumers. `game-core/src/index.ts` was kept without symbol-by-symbol checks. Addressed in Steps 3 and 6. |
| **G6** | `scripts/`, `tools/`, `tests/` kept without proof of invocation | **CONFIRMED** | Files were listed without tracing callers. `diff -u` revealed `scripts/verify-payloads.ts` is a 2-line wrapper importing `tests/privacy/verify-payloads.ts`. Full matrix constructed in Step 4. |
| **G7** | Narrow detection scope in Pass 1 | **CONFIRMED** | Full scope re-runs: `madge` across all packages/backend/tools found only 1 app entry (`main.tsx`) and test entries. Full-repo grep `^\s*//\s*(const|let|var|if|for|return|import|export|await|function|class)\b` returned 0 commented-out code blocks. |
| **G8** | Baseline skipped suites silently | **CONFIRMED** | In Pass 2 Step 0, all 47 Playwright tests were executed and passed. `test:db` was executed and passed (14/14 scenarios). `test:realtime-integration` was explicitly proven NOT RUNNABLE without a live Supabase stack. |
| **G9** | Backend dead surface & config review omitted | **CONFIRMED** | Pass 1 did not audit Edge API routes or SQL RPCs. Addressed as report-only in Step 9. |
| **G10** | 11 React Compiler warnings remain in baseline | **CONFIRMED** | Oxlint output enumerated: 10 `react(set-state-in-effect)` notices across 8 files and 1 `eslint(no-extra-boolean-cast)`. Documented as out-of-scope for clean refactoring. |

### Knip Full-Scope Re-Run (`includeEntryExports: true`)
- Flags game-core exports (`DEFAULT_MATCH_CONFIG`, `isValidMatchConfig`, `UPLOAD_INTERVAL_*`).
- Concrete cross-runtime check reveals: `backend/supabase/functions/api/index.ts:16` directly imports `isValidMatchConfig` and `isValidZoneConfig` from `packages/game-core/src/config.ts`. Knip AST analysis failed to follow Deno relative imports, producing false positives.

---

## Step 2: `docs/` Inventory and Analysis (G1)

An exhaustive analysis of all 240 tracked files in `docs/` and root documentation was conducted:

### 1. Whole-Repository Blob Hash Duplication
- **Probe:** `git ls-files -s` blob SHA-1 cross-check across the entire repository.
- **Finding:** **0 duplicate blobs** across all directories. Every tracked file in `docs/` is a unique object.

### 2. Sizing by Subfolder

| Subfolder | File Count | Total Sizing | Purpose & Category |
| :--- | :--- | :--- | :--- |
| `docs/screenshots/` | 192 files | 10.16 MB | Generated multi-device Playwright screenshots from `tests/e2e/visual-a11y-audit.spec.ts` |
| `docs/design/` | 14 files | 2.75 MB | Visual design board (`XZONES_Dusk_Contour_Game_UI_Board.png`, 2.24 MB), UI specs, and `tools/capture-ui.mjs` outputs |
| `docs/review/` | 4 files | 0.18 MB | Phase 3 function registry and invariant audit records (`FUNCTION-REGISTRY.md`, etc.) |
| `docs/(root)` | 11 files | 0.15 MB | Core project specs (`DECISIONS.md`, `PROGRESS.md`, `FIX-LOG.md`, `TECH_DEBT.md`) |
| `docs/db-audit/` | 13 files | 0.02 MB | Historical SQL migration and RPC audit logs |
| `docs/verification/` | 6 files | 0.02 MB | Test matrix records and implementation confirmations |
| **Total `docs/`** | **240 files** | **13.29 MB** | - |

### 3. Markdown Link & Embed Resolution
- **Probe:** Scanned all 171 local markdown links and image embeds (`[text](path)` and `![alt](path)`) across the repository.
- **Result:** **0 broken links**. Every link targets an active, valid file.

### 4. Classification & Action
- Per Global Rules and Step 2 instructions, historical audit records and test-generated screenshots are strictly **KEEP** (propose Git LFS or lossless WebP compression under Out of Scope findings).
- **Deletions:** 0 files (no duplicate or orphan files found).

---

## Pass 2 Deletions Manifest Table

| Step | ID | Category | Path / Symbol | Confidence | Evidence Summary | Last-Touched Commit | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| - | - | - | - | - | Initializing Pass 2 | - | - |
