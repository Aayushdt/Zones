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
- [ ] **Step 1:** Build the KEEP LIST (documentation only)
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

## Deletions Manifest Table

| Step | ID | Category | Path / Symbol | Confidence | Evidence Summary | Last-Touched Commit | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| - | - | - | - | - | - | - | - |
