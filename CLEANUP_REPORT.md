# Repository Cleanup Report: XZones

This report documents the evidence-based analysis of candidate files, exports, dependencies, assets, and styling in the `XZones` repository on branch `chore/cleanup-20261028`.

Every candidate was evaluated against the **Reference Search** criteria (static imports, full-text grep, dynamic patterns, configs, cross-runtime Deno bridges, tests, and git context) under the **Zero Behavior Change** and **Evidence Rule** mandates.

---

## 1. Candidate Summary Table

| ID | Category | Path / Symbol | Confidence | Evidence Summary | Planned Action | Planned Step |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **C-001** | Dependencies | `apps/web/package.json`: `@fontsource-variable/jetbrains-mono` | **KEEP** | Imported directly in `apps/web/src/theme/fonts.css:4` (`@import '@fontsource-variable/jetbrains-mono';`). Knip/depcheck false positive (tools did not parse CSS imports). | KEEP | Step 10 |
| **C-002** | Dependencies | `apps/web/package.json`: `@fontsource/inter` | **KEEP** | Targeted Latin weights imported in `apps/web/src/theme/fonts.css:1-3`. Knip/depcheck false positive. | KEEP | Step 10 |
| **C-003** | Dependencies | `package.json` (root): `supabase` | **KEEP** | Invoked via `pnpm exec supabase` in `.github/workflows/ci.yml:83,84,99` and local dev scripts. Depcheck false positive (CLI devDependency). | KEEP | Step 10 |
| **C-004** | Dead Code (Web) | `apps/web/src/components/GpsReadinessBadge.tsx`: `GPS_READY_THRESHOLD_METERS` | **KEEP** | Imported & asserted in `tests/audit/client_logic_audit.test.ts:3,26,30`. Knip false positive (external test root). | KEEP | Step 6 |
| **C-005** | Dead Code (Web) | `apps/web/src/components/GpsReadinessBadge.tsx`: `GPS_STALE_AGE_MS` | **KEEP** | Imported & asserted in `tests/audit/client_logic_audit.test.ts:3,27,31`. Knip false positive. | KEEP | Step 6 |
| **C-006** | Dead Code (Web) | `apps/web/src/services/device-lifecycle.ts`: `watchDeviceLocation` | **KEEP** | Imported & tested in `tests/audit/client_logic_audit.test.ts:4,50,56` and called by `maintainDeviceLocation`. | KEEP | Step 6 |
| **C-007** | Dead Code (Web) | `apps/web/src/services/fallback-sync.ts`: `fallbackSyncDelay` | **KEEP** | Called internally in `fallback-sync.ts` and asserted in `tests/audit/client_logic_audit.test.ts:5,76,77`. | KEEP | Step 6 |
| **C-008** | Dead Code (Web) | `apps/web/src/services/supabase-api.ts`: `parseApiError` | **KEEP** | Called internally in `supabase-api.ts:384` and asserted in `tests/audit/client_logic_audit.test.ts:6,96,98`. | KEEP | Step 6 |
| **C-009** | Types (Web) | `apps/web/src/components/ui/Button.tsx`: `ButtonVariant`, `ButtonSize` | **KEEP** | Used internally for prop type checking in `ButtonProps`. Exported for component consumers. | KEEP | Step 8 |
| **C-010** | Types (Web) | `apps/web/src/components/ui/Chip.tsx`: `ChipVariant`, `ChipSize` | **KEEP** | Used internally for prop type checking in `ChipProps`. | KEEP | Step 8 |
| **C-011** | Types (Web) | `apps/web/src/components/ui/Tabs.tsx`: `TabItem` | **KEEP** | Used internally in `TabsProps` signature (`items: TabItem[]`). | KEEP | Step 8 |
| **C-012** | Types (Web) | `apps/web/src/components/ui/Toast.tsx`: `ToastType` | **KEEP** | Used internally in `ToastMessage` interface. | KEEP | Step 8 |
| **C-013** | Types (Web) | `apps/web/src/services/device-lifecycle.ts`: `DevicePositionOptions`, `ScreenWakeLockSentinel` | **KEEP** | Used internally for Web API typing and cross-browser safety. | KEEP | Step 8 |
| **C-014** | Types (Web) | `apps/web/src/services/game-api.ts`: `MatchState`, `RunnerMatchView`, `ZoneView` | **KEEP** | Core domain contracts in GameApi interface. | KEEP | Step 8 |
| **C-015** | Types (Web) | `apps/web/src/stores/location-store.ts`: `CurrentFix` | **KEEP** | Used in `LocationState` store interface. | KEEP | Step 8 |
| **C-016** | Dead Code (Web) | `apps/web/src/pages/RouteShell.tsx`: historical `screenCopy` variants | **UNCERTAIN** | `RouteShell` is only invoked with `kind="not-found"` by `router.tsx:61`. The other 11 dictionary keys and conditional navigation blocks are never reached at runtime. Refactoring would alter component signature and structure. | REPORT-ONLY | Step 6 |
| **C-017** | Assets / History | `docs/design/XZONES_Dusk_Contour_Game_UI_Board.png` (2.2 MB) | **KEEP** | Primary visual reference board embedded in `README.md` and `xzones.md`. Git history rewrite is forbidden. | KEEP | Step 5 |
| **C-018** | Packages | `packages/game-core/src/index.ts`: package domain exports | **KEEP** | Public package entry point declared in `package.json` exports map; tested in Vitest suites; available for cross-package and Deno consumers. | KEEP | Step 7 |

---

## 2. Classification Sections

### SAFE Candidates (Concrete Evidence of Zero Use)
- **None.** Following rigorous reference search across code, tests, CI, scripts, documentation, and cross-runtime Deno modules, no files, dependencies, assets, or symbols met the SAFE standard (>= 2 independent pieces of proof of non-use and zero keep signals). The repository is already lean and strictly bounded.

### LIKELY Candidates (Upgraded or Downgraded)
- All initial tool hints from Knip and depcheck were investigated. In every instance, independent evidence revealed active usage (e.g., CSS font imports, test suite assertions, or CLI execution in CI). All were upgraded to **KEEP** or classified as **UNCERTAIN**.

### UNCERTAIN Candidates (Not Deleted — Maintainer Input Needed)

#### C-016: Historical `screenCopy` variants in `apps/web/src/pages/RouteShell.tsx`
- **Path:** `apps/web/src/pages/RouteShell.tsx:4-17, 51-60`
- **Context:** During Phase A prototyping, `RouteShell` served as a placeholder screen for all routes (`home`, `create`, `join`, `lobby`, `head-start`, `match`, `pings`, `tag`, `results`, `settings`, `simulator`). Fully interactive dedicated page components have since replaced each of those routes in `apps/web/src/app/router.tsx`.
- **Current Usage:** In `router.tsx:61`, `RouteShell` is only ever mounted for catch-all unmatched paths:
  ```tsx
  { path: '*', element: <RouteShell kind="not-found" /> }
  ```
- **Why Not Deleted Now:** Removing the 11 unused copy entries and their conditional links (`kind === 'home'`, `kind === 'settings'`) constitutes a component refactor rather than a purely safe deletion, changing the `Screen` union type.
- **Maintainer Question:** Should `RouteShell.tsx` be refactored into a focused `NotFoundPage.tsx` with dedicated 404 messaging, allowing `screenCopy` and `StatePanel` preview navigation to be cleanly retired in a follow-up feature task?

---

## 3. KEEP Items: Analysis Tool Pitfalls & False Positives

Documented for engineering reference and CI tooling maintenance:

1. **Knip & Depcheck CSS Dependency Blindness (`@fontsource/*`):**
   - Knip and Depcheck parse JavaScript and TypeScript ASTs. Neither tool traverses CSS `@import` statements by default.
   - `@fontsource/inter` and `@fontsource-variable/jetbrains-mono` are imported directly in `apps/web/src/theme/fonts.css`. If deleted based on tool suspicion, production builds would fail or fallback to system fonts.
2. **Root CLI Tooling (`supabase`):**
   - Depcheck flags root `devDependencies` that have no JavaScript `import` statements in root scripts.
   - Root `supabase` is invoked as a CLI binary via `pnpm exec supabase` in CI workflows (`.github/workflows/ci.yml:83`) to spin up local Postgres/Realtime/Functions for end-to-end integration testing.
3. **Internal Component Type Exports:**
   - Component prop type aliases (e.g. `ButtonVariant`, `ChipVariant`, `TabItem`) are exported so consumers can strongly type their props when wrapping or composing these primitives. Flagging them as "unused exports" is technically true when no external file imports the type, but removing the export keyword provides zero runtime or bundle benefit.
4. **Test-Only Export Consumers (`client_logic_audit.test.ts`):**
   - Several pure functions and calibration constants (`GPS_READY_THRESHOLD_METERS`, `GPS_STALE_AGE_MS`, `watchDeviceLocation`, `fallbackSyncDelay`, `parseApiError`) are exported so that client audit unit tests can verify critical timeout, accuracy, and error handling thresholds without brittle full-app integration harnesses.

---

## 4. Out of Scope Findings

The following items were identified during repository analysis. In accordance with the Zero Behavior Change rule, they are reported here for future maintenance tasks:

1. **Large Tracked Asset in History:**
   - `docs/design/XZONES_Dusk_Contour_Game_UI_Board.png` is 2.2 MB. It is actively linked in `README.md` and `xzones.md`. Rewriting git history via BFG or filter-branch is strictly forbidden. If repository size optimization is desired in the future, the image could be losslessly compressed via WebP/AVIF or hosted on an external CDN.
2. **Minor CSS Clones (`jscpd` Report):**
   - JSCPD detected 18 small clones (1.30% duplication), primarily identical design token definitions between dusk and paper themes in `apps/web/src/theme/tokens.css` and repeated layout padding in `CreatePage.css` and `LobbyPage.css`. Consolidating these requires CSS refactoring and is out of scope.
3. **Deno Lint Async Notices in Test Mocks:**
   - `deno lint` flagged 20 `require-await` instances in `backend/supabase/functions/api/index_test.ts` where mock fetch handlers were declared `async (input, init) => { ... }` without an internal `await`. These are test mocks and do not affect runtime behavior.
4. **Historical Reproduction Test (`tests/review/stale-event-reproduction_test.ts`):**
   - This test was created during Phase 3 to reproduce a historical bug where `/sync` did not emit a `location.stale` event. Running it standalone requires mock HTTP setup. It is retained as a regression record.

---

## 5. Estimated Cleanup Impact

| Category | Candidates Evaluated | SAFE Deleted | Retained (KEEP / UNCERTAIN) | Impact on Bundle Size |
| :--- | :--- | :--- | :--- | :--- |
| **Junk & Stray Files** | 0 | 0 | 0 | 0 KB |
| **Static Assets** | 7 | 0 | 7 | 0 KB |
| **Web App Dead Code** | 8 | 0 | 8 | 0 KB |
| **Package / Backend Code** | 19 | 0 | 19 | 0 KB |
| **Comments / Imports / Locals** | 0 | 0 | 0 | 0 KB |
| **CSS Rules & Tokens** | 16 files | 0 | 16 | 0 KB |
| **Dependencies** | 17 (web) + 3 (root) | 0 | 20 | 0 KB |
| **Documentation & Tests** | 49 tests + docs | 0 | 49 | 0 KB |
| **Total** | **116+** | **0** | **116+** | **Zero Regressions** |

---

# Pass 2: Evidence-Based Audit & Remediation (Branch `chore/cleanup-pass2-20261029`)

Cleanup Pass 2 resolved all evidence gaps identified in Pass 1 (G1–G10), tested hypotheses with automated tools, and executed reversible, zero-behavior-change pruning of provably dead code and styling.

## 1. Updated Candidates Status Table

| ID | Category | Path / Symbol | Pass 1 Status | Pass 2 Status | Evidence & Resolution |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **C-001** | Dependencies | `apps/web/package.json`: `@fontsource-variable/jetbrains-mono` | KEEP | **KEPT** | Re-verified: directly imported in `apps/web/src/theme/fonts.css:4`. Active in production typography. |
| **C-002** | Dependencies | `apps/web/package.json`: `@fontsource/inter` | KEEP | **KEPT** | Re-verified: Latin weights imported in `apps/web/src/theme/fonts.css:1-3`. Active in production UI. |
| **C-003** | Dependencies | `package.json` (root): `supabase` | KEEP | **KEPT** | Re-verified: executed via `pnpm exec supabase` in `.github/workflows/ci.yml:83,99` and `test-audit-db.sh`. |
| **C-004** | Dead Code (Web) | `GpsReadinessBadge.tsx`: `GPS_READY_THRESHOLD_METERS` | KEEP | **KEPT** | Re-verified: imported in `tests/audit/client_logic_audit.test.ts:3` and used internally in badge logic. |
| **C-005** | Dead Code (Web) | `GpsReadinessBadge.tsx`: `GPS_STALE_AGE_MS` | KEEP | **KEPT** | Re-verified: imported in `tests/audit/client_logic_audit.test.ts:3` and used internally in badge state. |
| **C-006** | Dead Code (Web) | `device-lifecycle.ts`: `watchDeviceLocation` | KEEP | **KEPT** | Re-verified: imported in `tests/audit/client_logic_audit.test.ts:4` and called by `maintainDeviceLocation`. |
| **C-007** | Dead Code (Web) | `fallback-sync.ts`: `fallbackSyncDelay` | KEEP | **KEPT** | Re-verified: imported in `tests/audit/client_logic_audit.test.ts:5` and called internally in fallback jitter sync. |
| **C-008** | Dead Code (Web) | `supabase-api.ts`: `parseApiError` | KEEP | **KEPT** | Re-verified: imported in `tests/audit/client_logic_audit.test.ts:6` and called in API response handlers. |
| **C-009** | Types (Web) | `Button.tsx`: `ButtonVariant`, `ButtonSize` | KEEP | **KEPT** | Re-verified: explicit decision to preserve component prop type exports (zero bundle impact). |
| **C-010** | Types (Web) | `Chip.tsx`: `ChipVariant`, `ChipSize` | KEEP | **KEPT** | Re-verified: explicit decision to preserve component prop type exports. |
| **C-011** | Types (Web) | `Tabs.tsx`: `TabItem` | KEEP | **KEPT** | Re-verified: explicit decision to preserve prop type exports. |
| **C-012** | Types (Web) | `Toast.tsx`: `ToastType` | KEEP | **KEPT** | Re-verified: explicit decision to preserve notification typing. |
| **C-013** | Types (Web) | `device-lifecycle.ts`: `DevicePositionOptions` | KEEP | **KEPT** | Re-verified: explicit decision to preserve internal cross-platform Web API typing. |
| **C-014** | Types (Web) | `game-api.ts`: `MatchState`, `RunnerMatchView` | KEEP | **KEPT** | Re-verified: core domain contracts for client and mock implementations. |
| **C-015** | Types (Web) | `location-store.ts`: `CurrentFix` | KEEP | **KEPT** | Re-verified: store state contract. |
| **C-016** | Dead Code (Web) | `apps/web/src/pages/RouteShell.tsx`: unreachable `screenCopy` | UNCERTAIN | **DELETED @ `a822ec0`** | 11 dead prototype keys and unreachable navigation blocks pruned. `Screen` narrowed to `'not-found'`. 404 route pixel-identical. |
| **C-017** | Assets / History | `docs/design/XZONES_Dusk_Contour_Game_UI_Board.png` | KEEP | **KEPT** | Reference board embedded in `README.md` and `xzones.md`. Git history rewrite forbidden. |
| **C-018** | Packages | `packages/game-core/src/index.ts`: package domain exports | KEEP | **KEPT** | Public package entry point declared in `package.json` exports map; cross-runtime consumers verified. |
| **C-019** | CSS | `apps/web/src/App.css`: `.route-shell__nav`, `.segmented-control__item` | (New) | **DELETED @ `6b21d66`** | Zero coverage; zero consumers; pruned alias & dead prototype class. |
| **C-020** | CSS | `apps/web/src/pages/CreatePage.css`: `.create-title-wrap`, `.collapsible-card__subtitle`, etc. | (New) | **DELETED @ `6b21d66`** | Zero coverage; zero consumers; superseded Phase A layout classes. |
| **C-021** | CSS | `apps/web/src/pages/MatchPage.css`: `.hud-actions-drawer` | (New) | **DELETED @ `6b21d66`** | Zero coverage; unused duplicate selector block. |
| **C-022** | CSS | `apps/web/src/pages/SettingsPage.css`: `.settings-haptics-row` | (New) | **DELETED @ `6b21d66`** | Zero coverage; unused prototype row rule. |

---

## 2. UNCERTAIN Candidates & Maintainer Questions

Per the **Evidence Quality Rules**, symbols encoding game-rule logic that currently have no direct client consumers are classified as **UNCERTAIN** (game-rule exception) rather than deleted, as they represent validated domain algorithms or forthcoming rules:

1. **`packages/game-core/src/rules.ts` Domain Helpers:**
   - **Symbols:** `zoneAt`, `classifyZoneSample`, `advanceZoneConfirmation`, `balanceTeams`, `didTagMeetDeadline`, `resolveActiveOutcome`, `latestDuePingIndex`.
   - **Current Usage:** Fully covered and tested in `packages/game-core/src/rules.test.ts` and `golden_master.test.ts`. Client application currently delegates these evaluations to server-side Edge API/PLpgSQL functions (`xzones_sync_match`, `xzones_resolve_match`, `xzones_track_zone_sample`).
   - **Maintainer Question:** Are these pure TypeScript implementations intended for offline client-side prediction / zero-latency HUD simulation in a future release, or should client-side rule evaluation be formally deprecated in favor of server-only evaluation?
   - **Action Taken:** Retained (Zero Behavior Change).

---

## 3. Out of Scope Findings (Pass 2)

The following items were identified and thoroughly audited during Pass 2. They represent architectural or administrative improvements that require feature work or repo admin permissions:

1. **Unwired Test Files in CI:**
   - `tests/review/stale-event-reproduction_test.ts`: Standalone Deno reproduction script for historical bug.
   - `tests/review/device_lifecycle_test.ts` & `privacy-leak-check_test.ts`: Legacy Deno test scripts in `tests/review/` that test early prototype behavior.
   - *Recommendation:* Wire these into a secondary integration CI job or consolidate under a `tests/legacy/` directory.
2. **Top 10 Largest Blobs in Git History:**
   - 1. `docs/design/XZONES_Dusk_Contour_Game_UI_Board.png` (2.24 MB)
   - 2. `docs/verification/screens/G1.1/home-mobile.traffic.json` (385 kB)
   - 3–10. Historical revisions of `docs/screenshots/*.png` (145 kB – 184 kB each)
   - *Recommendation:* Avoid committing large binary screenshot diffs in future PRs. Git history rewrite is strictly prohibited.
3. **Stale Merged Branches:**
   - 17 local branches and 14 remote branches have already been fully merged into `origin/main`.
   - *Recommendation:* Repository administrators should run `git push origin --delete <branch>` and `git branch -d <branch>` to declutter branch listings.
4. **React Compiler Static Analysis Warnings (11 items):**
   - 10 instances of `react(set-state-in-effect)` in `LobbyPage.tsx`, `MatchPage.tsx`, `HeadStartPage.tsx`, `SettingsPage.tsx`, `JoinPage.tsx`, `TagPage.tsx`, `GpsReadinessBadge.tsx`, `LocationSharing.tsx`.
   - 1 instance of `eslint(no-extra-boolean-cast)` in `Button.tsx:35`.
   - *Recommendation:* Address in a dedicated React 19 performance refactoring pass to enable automatic memoization by the React Compiler.
5. **Backend Dead Surface (Report-Only):**
   - All 25 Edge API route actions and all 45 database stored procedures/triggers are actively wired and tested.
   - *Maintenance Questions:*
     - formalize hourly pg_cron execution for `xzones_cleanup`.
     - add Supabase webhook alerting for `bug_reports`.
     - clarify host dashboard visibility for `suspicious_events`.
6. **Repository Root Process Documents Consolidation:**
   - 9 process logs and specifications currently reside at the repository root (`CLEANUP_LOG.md`, `CLEANUP_REPORT.md`, `CLEANUP_PASS2_LOG.md`, etc.).
   - *Recommendation:* In a future maintenance PR, move these into a structured `docs/audit-history/` directory.
