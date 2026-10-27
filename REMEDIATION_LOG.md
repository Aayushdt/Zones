# Remediation Log

## Step 0: Baseline Verification Table

| Command | Status | Errors / Warnings | Notes |
| :--- | :--- | :--- | :--- |
| `corepack pnpm install --frozen-lockfile` | PASS | 0 errors / 0 warnings | Clean dependency resolution |
| `corepack pnpm typecheck` | PASS | 0 errors / 0 warnings | `tsc -b` and `@xzones/game-core` + `@xzones/web` passed |
| `corepack pnpm lint` | PASS (warnings) | 0 errors / 18 warnings | 18 oxlint warnings (17 React Compiler / setState-in-effect; 1 exhaustive-deps in `GameMap.tsx`) |
| `corepack pnpm build` | PASS | 0 errors / 1 chunk warning | `maplibre-gl` (1,074.65 kB), `index` (373.69 kB), `CameraScanner` (131.51 kB) |
| `corepack pnpm test:unit` | PASS | 0 failures (36/36 passed) | Vitest unit tests in `@xzones/game-core` |
| `corepack pnpm test:audit` | PASS | 0 failures (31/31 passed) | Vitest audit tests for rules and client logic |
| `corepack pnpm verify:payloads` | PASS | 0 failures | Deno payload schema validator (Deno installed in `~/.deno`) |
| `corepack pnpm test:edge` | PASS | 0 failures (3/3 passed) | Supabase Edge function tests via Deno |
| `corepack pnpm test:api` | PASS | 0 failures (4/4 passed) | Hostile API audit and Edge tests via Deno |
| `corepack pnpm test:sim` | PASS | 0 failures (1/1 passed) | Scenario simulation test via Deno |
| `corepack pnpm test:db` | PASS | 0 failures | Temporary local PostgreSQL runner; all 39 SQL migrations passed |
| `corepack pnpm test:e2e` | PARTIAL | 1 failure (42/43 passed) | `Lobby distinguishes permission denial` timed out on `/create` -> `/lobby` URL navigation without active mock |

---

## Step 1: Triage Table for All 13 Findings

| Finding ID | Classification | Evidence & Real Code Analysis |
| :--- | :--- | :--- |
| **E-001** | **CONFIRMED** | Package scripts (`test:edge`, `verify:payloads`, `test:api`, `test:sim`, `test:all`) invoke `deno` via `corepack pnpm exec deno test ...`, which fails with `Command "deno" not found` when Deno is not pre-installed on PATH. (Merged with I-003). |
| **E-002** | **CONFIRMED** | `apps/web/src/pages/MatchPage.tsx` lines 632 and 639 directly invoke `Date.now()` inside JSX rendering for tactical countdown pills, violating React Compiler purity and causing unstable render cycles. |
| **E-003** | **CONFIRMED** | `apps/web/src/components/GameMap.tsx` line 110 accesses `data.own_position ?? data.own_team_positions[0]` in an effect setting state with incomplete deps `[data.own_position?.lat, data.own_position?.lon, data.own_team_positions]`, triggering oxlint `react-hooks/exhaustive-deps`. |
| **E-004** | **PARTIALLY CONFIRMED** | `apps/web/src/components/LocationSharing.tsx` lines 47–50 halts GPS uploads when `document.visibilityState !== 'visible'`. The web restriction is genuine, but removing the guard or playing audio heartbeats is unviable on mobile web; need a visible-change immediate fix trigger, wake-lock reacquisition, and in-app UX warnings. Game balance changes deferred. |
| **E-005** | **CONFIRMED** | `apps/web/src/pages/MatchPage.tsx` lines 138 and 193/198 call `setLiveStatus` and `setZoneSeconds` synchronously inside `useEffect` bodies, triggering oxlint `set-state-in-effect`. Can be solved together with E-002 using a unified ticker hook and derived render values. |
| **E-006** | **PARTIALLY CONFIRMED** | `apps/web/src/components/CameraScanner.tsx` lines 36–45 stops tracks on unmount, but fails to nullify `video.current.srcObject`, accesses a mutable ref in cleanup, and has undifferentiated error handling. Needs clean resource release and error separation. |
| **I-001** | **PARTIALLY CONFIRMED** | `dist/assets/maplibre-gl-*.js` is ~1,075 kB (289 kB gzip) and already isolated to a separate vendor chunk. MapLibre GL cannot be shrunk below 500 kB minified without breaking GIS capabilities. Ensure `GameMap` routes are code-split and adjust chunk size warning threshold with clear documentation. |
| **I-002** | **DEFERRED** | Client-side `cache.put` without a custom service worker cache interception layer will not be consumed by MapLibre GL, and bulk prefetching violates third-party tile ToS. Requires a dedicated architectural decision (PMTiles or self-hosted vector tiles). |
| **I-003** | **CONFIRMED** | Merged with E-001. CI workflow and repo scripts lack explicit Deno setup and user-friendly preflight diagnostics for missing runtime binaries. |
| **I-004** | **CONFIRMED** | Mobile GPS polling at maximum frequency while stationary wastes battery. A pure, unit-tested stationary detector in `packages/game-core` can safely pace transmissions up to 6s without affecting active movement accuracy or rule thresholds. |
| **I-005** | **DEFERRED** | Host presets in `apps/web/src/services/host-presets.ts` are stored in `localStorage`. Cross-device cloud sync requires user authentication and profile linking, which does not exist in the anonymous guest session model. |
| **I-006** | **PARTIALLY CONFIRMED** | `@capacitor` is not installed in the repository. Web Vibration is disabled on iOS Safari. Progressive enhancement with clean feature detection and safe no-ops is appropriate without adding heavy native bridge packages. |
| **I-007** | **CONFIRMED** | `apps/web/src/components/CameraScanner.tsx` lacks video track torch capability detection and `applyConstraints` toggle, impeding tag QR code scanning in evening/dusk matches on supported Android/Chromium devices. |

---

## Remediation Checklist

- [x] **Step 0:** Setup and baseline (no code changes)
- [x] **Step 1:** Triage all 13 findings (documentation only)
- [x] **Step 2:** Deno tooling and CI (E-001 + I-003, merged)
- [x] **Step 3:** MatchPage timers and status state (E-002 + E-005, solved together)
- [x] **Step 4:** GameMap center (E-003) + bundle analysis (I-001)
- [x] **Step 5:** Location uploads (E-004 + I-004)
- [ ] **Step 6:** CameraScanner (E-006 + I-007)
- [ ] **Step 7:** Haptics (I-006)
- [ ] **Step 8:** Host presets cloud sync (I-005), GATED
- [ ] **Step 9:** Offline map tiles (I-002), GATED
- [ ] **Step 10:** Gap audit of what the reports did not cover
- [ ] **Step 11:** Final verification and report update

---

## Step 5 Execution: Location Uploads (E-004 + I-004)

- **Findings:** E-004, I-004
- **Verdict:**
  - E-004: PARTIALLY CONFIRMED.
    - Code Trace of Staleness/Elimination: SQL migrations (`202610180009_live_location.sql:85`, `202610200023_timer_off.sql:96`, `202610220022_zone_exit_enforcement.sql:70`) confirm that stale fixes (>30s on live fix, >60s on scheduled snapshots) mark `is_stale: true` and nullify opposing radar coordinates, but NEVER trigger player elimination. Elimination strictly requires physical boundary exit (`zone_outside_since IS NOT NULL`).
    - Visibility handling: Kept the visibility guard. Added an immediate fix upload trigger when returning to visible foreground (`if (document.visibilityState === 'visible' && latestFix) void upload(latestFix)`). Confirmed `maintainScreenWakeLock` re-acquires screen lock upon visibility recovery.
    - UX Warnings: Added explicit in-app reminders in `LobbyPage` and `MatchPage` status bar: *"Keep screen on during match; a locked screen pauses location sharing."*
  - I-004: CONFIRMED.
    - Implemented pure, unit-tested stationary movement detector in `packages/game-core/src/map-smoothing.ts` (`isStationaryFix` with dynamic threshold `Math.max(3, accuracy_m)` to handle GPS jitter).
    - Wired adaptive upload interval in `LocationSharing.tsx`: 2,000 ms during active movement, lengthening to 6,000 ms while stationary (comfortably below the 30s server staleness threshold). Uploads trigger immediately once displacement exceeds threshold.
    - Note: Battery savings were not measured in a physical device lab and represent theoretical radio duty-cycle reduction.
- **Files Changed:**
  - `packages/game-core/src/map-smoothing.ts`: Added `isStationaryFix`, `computeAdaptiveUploadInterval`, constants.
  - `packages/game-core/src/map-smoothing.test.ts`: Added 6 unit tests covering stationary, moving, jitter/low-accuracy, boundary, and interval calculations.
  - `packages/game-core/src/index.ts`: Exported stationary functions and types.
  - `apps/web/src/services/location-send-state.ts`: Added optional `accuracy_m` to `sentFix`.
  - `apps/web/src/components/LocationSharing.tsx`: Integrated adaptive stationary upload interval and visibility-resume immediate upload.
  - `apps/web/src/pages/LobbyPage.tsx`: Added screen-wake guidance under GPS readiness badge.
  - `apps/web/src/pages/MatchPage.tsx`: Added screen-on indicator in HUD live status bar.
- **Verification Commands & Results:**
  - `oxlint`: PASS (11 warnings, 0 in touched files, no regressions)
  - `typecheck`: PASS (0 errors)
  - `test:unit`: PASS (42/42 passed)
  - `test:audit`: PASS (32/32 passed)
  - `build`: PASS (0 warnings)

---

## Step 4 Execution: GameMap Center (E-003) + Bundle Analysis (I-001)

- **Findings:** E-003, I-001
- **Verdict:**
  - E-003: CONFIRMED. Fixed by adopting React's render-adjustment state pattern (`if (center === null && fix) setCenter(...)`), removing the effect that set state and resolving the missing dependency lint warning. Also introduced `mapLoadedRef` to eliminate closure-stale reference in map error listeners.
  - I-001: PARTIALLY CONFIRMED. Measured chunk graph: `dist/index.html` does NOT preload `maplibre-gl`; it is dynamically imported on demand exclusively in `GameMap.tsx` and `ZonePicker.tsx`. Added `chunkSizeWarningLimit: 1200` with documentation in `vite.config.ts` to silence spurious build alerts without splitting synthetic vendor chunks.
- **Files Changed:**
  - `apps/web/src/components/GameMap.tsx`: Latched center state during render without effect; used ref for `mapLoaded`.
  - `apps/web/vite.config.ts`: Configured `chunkSizeWarningLimit: 1200`.
- **Verification Commands & Results:**
  - `oxlint`: PASS (warnings dropped from 14 to 11; all GameMap exhaustive-deps and setState-in-effect warnings resolved)
  - `typecheck`: PASS (0 errors)
  - `test:unit`: PASS (36/36 passed)
  - `test:audit`: PASS (32/32 passed)
  - `build`: PASS (0 warnings; `maplibre-gl` chunk remains isolated at 1,074 kB and excluded from entry bundle)

---

## Step 3 Execution: MatchPage Timers and Status State (E-002 + E-005)

- **Findings:** E-002, E-005 (Solved together)
- **Verdict:** CONFIRMED
- **Files Changed:**
  - `apps/web/src/hooks/use-now.ts`: Created new hook `useNow` (updates timestamp exclusively inside interval callback) and pure helper `countdownSeconds`.
  - `apps/web/src/pages/MatchPage.tsx`:
    - Replaced `Date.now()` calls in render with pure derivations `camoSeconds` and `alarmSeconds`.
    - Removed `zoneSeconds` state and its synchronous `useEffect` setter; derived `zoneSeconds` during render via `countdownSeconds(view?.zone?.nextShrinkAt, now)`.
    - Removed synchronous `setLiveStatus('Connected to private team channel.')` inside the subscription effect; derived `displayLiveStatus` during render for missing-role and tagged states.
  - `tests/audit/client_logic_audit.test.ts`: Added unit test covering `countdownSeconds` calculation, ceiling behavior, positive decrement, boundary values, and zero floor upon expiry.
- **Verification Commands & Results:**
  - `oxlint`: PASS (warnings dropped from 18 to 14; all 4 MatchPage warnings for `Date.now` and synchronous effect setState were eliminated)
  - `typecheck`: PASS (0 errors)
  - `test:unit`: PASS (36/36 passed)
  - `test:audit`: PASS (32/32 passed, including new countdown regression test)
  - `build`: PASS (0 errors)

---

## Step 2 Execution: Deno Tooling and CI (E-001 + I-003)

- **Findings:** E-001, I-003 (Merged)
- **Verdict:** CONFIRMED
- **Files Changed:**
  - `scripts/run-deno.mjs`: Added native Node preflight script that verifies Deno is available on PATH and provides user-friendly install instructions before invoking tests.
  - `package.json`: Updated Deno test scripts (`test:edge`, `verify:payloads`, `test:api`, `test:sim`) to invoke `node scripts/run-deno.mjs test ...`.
  - `README.md`: Documented Deno >= 2.9.x prerequisite in setup guide.
  - `.github/workflows/ci.yml`: Inspected and confirmed CI already specifies `denoland/setup-deno@v2` with `deno-version: v2.9.6` and executes tests as dedicated steps.
- **Verification Commands & Results:**
  - `verify:payloads`: PASS (19/19 schema checks passed)
  - `test:edge`: PASS (19/19 tests passed)
  - `test:api`: PASS (19 edge + 11 hostile audit tests passed)
  - `test:sim`: PASS (1/1 scenario tests passed)
  - Simulated missing Deno (`PATH="/usr/bin"`): PASS (exited with code 1 and printed helpful install guide)
  - Workflow YAML validation: PASS (parsed cleanly)
  - `typecheck`, `lint`, `test:unit`, `test:audit`, `build`: All PASS (0 errors, 0 regressions)
