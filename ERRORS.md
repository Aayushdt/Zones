# Code Audit Defect Report: `ERRORS.md`

> ℹ️ **Looking for frontend, mobile UX, & accessibility defects?** See the [# UI Audit](#ui-audit) section below.

## Summary Table

| ID | Status | Severity | File & Lines | Title |
| :--- | :--- | :--- | :--- | :--- |
| **[E-001]** | **FIXED @587fe2c** | High | [`package.json`](package.json) | Missing Deno Executable in Workspace Tooling Causes Script Failures |
| **[E-002]** | **FIXED @ca6eba8** | Medium | [`apps/web/src/pages/MatchPage.tsx`](apps/web/src/pages/MatchPage.tsx) | Impure `Date.now()` Invocations in Component Render Tree |
| **[E-003]** | **FIXED @8d6b1b3** | Medium | [`apps/web/src/components/GameMap.tsx`](apps/web/src/components/GameMap.tsx) | Incomplete React Hook Dependency Array in Map Center Hook |
| **[E-004]** | **PARTIALLY FIXED @e2c617c** | Medium | [`apps/web/src/components/LocationSharing.tsx`](apps/web/src/components/LocationSharing.tsx) | Background Tab Visibility Blocks Location Transmissions in Active Play |
| **[E-005]** | **FIXED @ca6eba8** | Low | [`apps/web/src/pages/MatchPage.tsx`](apps/web/src/pages/MatchPage.tsx) | Synchronous Cascading `setState` Calls Inside Lifecycle Effects |
| **[E-006]** | **FIXED @67dc862** | Low | [`apps/web/src/components/CameraScanner.tsx`](apps/web/src/components/CameraScanner.tsx) | MediaStream Cleanup and Error Handling Hardening |

### Defect Counts by Severity
- **Critical:** 0
- **High:** 1
- **Medium:** 3
- **Low:** 2
- **Total:** 6

---

## Detailed Defects

### [E-001] Missing Deno Executable in Workspace Tooling Causes Script Failures
- **Status:** **FIXED @587fe2c** (Merged with **[I-003]**)
- **Severity:** High
- **File & lines:** [`package.json`](package.json), [`scripts/run-deno.mjs`](scripts/run-deno.mjs), [`README.md`](README.md)
- **Category:** Config / Tooling
- **Problematic code:**
  ```json
  "scripts": {
    "test:edge": "corepack pnpm exec deno test ...",
    "verify:payloads": "corepack pnpm exec deno test scripts/verify-payloads.ts",
    "test:api": "corepack pnpm test:edge && corepack pnpm exec deno test --allow-env tests/audit/api_hostile_audit_test.ts",
    "test:sim": "corepack pnpm exec deno test tools/simulator"
  }
  ```
- **What is wrong:** The root `package.json` declared npm scripts that invoked `corepack pnpm exec deno test ...`. When executed on standard developer systems without Deno pre-installed on PATH, `corepack pnpm exec` aborted with cryptic errors (`Command "deno" not found`).
- **Impact:** Automated verification commands (`pnpm verify:payloads`, `pnpm test:api`, `pnpm test:edge`, `pnpm test:sim`) failed abruptly without clear diagnostic guidance.
- **How it was verified:** Executing `corepack pnpm verify:payloads` returned `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "deno" not found`.
- **Remediation:** Created a lightweight Node preflight runner `scripts/run-deno.mjs` (zero new dependencies) that inspects PATH, prints installation instructions if missing, and proxies arguments directly to `deno test`. Documented Deno >= 2.9 prerequisite in `README.md`.

---

### [E-002] Impure `Date.now()` Invocations in Component Render Tree
- **Status:** **FIXED @ca6eba8**
- **Severity:** Medium
- **File & lines:** [`apps/web/src/pages/MatchPage.tsx`](apps/web/src/pages/MatchPage.tsx), [`apps/web/src/hooks/use-now.ts`](apps/web/src/hooks/use-now.ts)
- **Category:** Runtime / React Purity
- **Problematic code:**
  ```tsx
  {camouflageExpiresAt !== null && (
    <span className="hud-metric-val">{Math.max(0, Math.ceil((camouflageExpiresAt - Date.now()) / 1000))}s</span>
  )}
  {alarmExpiresAt !== null && (
    <span className="hud-metric-val">{Math.max(0, Math.ceil((alarmExpiresAt - Date.now()) / 1000))}s</span>
  )}
  ```
- **What is wrong:** `Date.now()` was invoked directly within JSX render expressions. Under React 19 and React Compiler semantics, render functions must remain pure. Non-deterministic timing calls during render cause purity warnings and inconsistent UI renders.
- **Impact:** Tactical countdown pills failed to tick at smooth 1-second intervals unless external state changes forced re-renders. Oxlint reported React Compiler purity violations.
- **How it was verified:** `corepack pnpm lint` reported `eslint(react-compiler): Cannot call impure function during render (Date.now)`.
- **Remediation:** Created reusable `useNow(intervalMs, enabled)` hook and pure derivation `countdownSeconds(target, now)`. Derived `camoSeconds`, `alarmSeconds`, and `zoneSeconds` purely during render without impure calls or secondary effects. Added regression test in `tests/audit/client_logic_audit.test.ts`.

---

### [E-003] Incomplete React Hook Dependency Array in Map Center Hook
- **Status:** **FIXED @8d6b1b3**
- **Severity:** Medium
- **File & lines:** [`apps/web/src/components/GameMap.tsx`](apps/web/src/components/GameMap.tsx)
- **Category:** Runtime / React Lifecycle
- **Problematic code:**
  ```tsx
  useEffect(() => {
    const fix = data.own_position ?? data.own_team_positions[0]
    if (fix) setCenter((current) => current ?? [fix.lon, fix.lat])
  }, [data.own_position?.lat, data.own_position?.lon, data.own_team_positions])
  ```
- **What is wrong:** The effect accessed `data.own_position` while depending only on scalar properties and array reference, triggering `react-hooks/exhaustive-deps`. *(Note on audit report accuracy: The report's claim that coordinates fall back to `(0, 0)` was inaccurate; the code intentionally latched to the first fix via `current ?? [...]` to avoid overriding user map panning).*
- **Impact:** Oxlint reported missing dependency `data.own_position`. A naive dependency addition would have broken map panning by re-centering on every GPS update.
- **Remediation:** Adopted React's render-adjustment state pattern (`if (center === null && fix) setCenter([fix.lon, fix.lat])`) without setting state inside an effect. Also introduced `mapLoadedRef` to eliminate closure-stale map error listeners.

---

### [E-004] Background Tab Visibility Blocks Location Transmissions in Active Play
- **Status:** **PARTIALLY FIXED @e2c617c** (Native background service deferred)
- **Severity:** Medium
- **File & lines:** [`apps/web/src/components/LocationSharing.tsx`](apps/web/src/components/LocationSharing.tsx), [`packages/game-core/src/map-smoothing.ts`](packages/game-core/src/map-smoothing.ts), [`apps/web/src/pages/LobbyPage.tsx`](apps/web/src/pages/LobbyPage.tsx), [`apps/web/src/pages/MatchPage.tsx`](apps/web/src/pages/MatchPage.tsx)
- **Category:** Runtime / Browser Lifecycle
- **Problematic code:**
  ```tsx
  if (document.visibilityState !== 'visible' || !navigator.onLine) {
    setStatus('Background or offline; uploads paused. Your last fix becomes stale.')
    return
  }
  ```
- **What is wrong:** Mobile operating systems throttle or suspend timers and geolocation when a tab is backgrounded or screen locked. Web applications cannot reliably override OS power management without native wrappers. *(Note on audit report accuracy: The report's claim that "within 45 seconds the server eliminates the player" was false. Tracing database migrations `202610180009_live_location.sql` and `202610220022_zone_exit_enforcement.sql` proved staleness only sets `is_stale: true` and nullifies radar coordinates; elimination strictly requires physical zone boundary exit).*
- **Remediation:**
  1. Kept the visibility guard (removing it does not work in mobile browsers and drains battery).
  2. Added an immediate fix upload trigger when returning to visible foreground (`if (document.visibilityState === 'visible' && latestFix) void upload(latestFix)`).
  3. Confirmed screen wake lock re-acquisition upon visibility recovery in `device-lifecycle.ts`.
  4. Added explicit in-app screen lock warnings in `LobbyPage` and `MatchPage` HUD: *"Keep screen on during match; a locked screen pauses location sharing."*
  5. Implemented stationary GPS detector (I-004) to reduce radio drain. Native Capacitor background tracking logged in `DEFERRED.md`.

---

### [E-005] Synchronous Cascading `setState` Calls Inside Lifecycle Effects
- **Status:** **FIXED @ca6eba8**
- **Severity:** Low
- **File & lines:** [`apps/web/src/pages/MatchPage.tsx`](apps/web/src/pages/MatchPage.tsx)
- **Category:** Runtime / React State
- **Problematic code:**
  ```tsx
  useEffect(() => {
    if (!currentRole || currentOwnStatus === 'TAGGED') return
    setLiveStatus('Connected to private team channel.')
    // ...
  }, [currentRole, currentOwnStatus])
  ```
- **What is wrong:** Calling `setLiveStatus` and `setZoneSeconds` synchronously inside `useEffect` caused React to schedule secondary re-renders in the same frame, violating React Compiler rules and triggering `set-state-in-effect` lint warnings. Furthermore, `setLiveStatus` claimed connection before subscription confirmation.
- **Impact:** Cascading re-render cycles upon mounting `MatchPage`.
- **How it was verified:** `corepack pnpm lint` reported `eslint(react-compiler): Setting state in an effect`.
- **Remediation:** Removed the `zoneSeconds` effect and state entirely; derived `zoneSeconds` during render via `countdownSeconds(view?.zone?.nextShrinkAt, now)`. Derived `displayLiveStatus` during render for missing-role and tagged spectator states.

---

### [E-006] MediaStream Cleanup and Error Handling Hardening
- **Status:** **FIXED @67dc862**
- **Severity:** Low
- **File & lines:** [`apps/web/src/components/CameraScanner.tsx`](apps/web/src/components/CameraScanner.tsx)
- **Category:** Runtime / Resource Hardening
- **Problematic code:**
  ```tsx
  void navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    .then((camera) => {
      if (stopped) { camera.getTracks().forEach((track) => track.stop()); return }
      stream = camera
      if (video.current) { video.current.srcObject = camera; void video.current.play(); }
    })
  ```
- **What is wrong:** *(Note on audit report accuracy: The claim that tracks "leak indefinitely" was overstated since modern browser garbage collection releases tracks when streams stop).* However, hardening was needed: `stop()` failed to nullify `video.current.srcObject = null` or call `.pause()`, mutable ref was accessed directly in cleanup, animation frame could reschedule after stop, and error handling swallowed permissions errors into generic failures.
- **Remediation:** Captured `const videoElement = video.current` locally at effect mount; called `videoElement.pause()` and `videoElement.srcObject = null` in cleanup; guarded `scan()` with `if (!stopped)` and nullified `frame`; protected `videoElement.play()` against unhandled rejections; separated `NotAllowedError` permission denials from hardware/HTTPS unavailability.

---

# UI Audit

This section documents real frontend, mobile responsiveness, runtime performance, and accessibility defects identified during the comprehensive UI audit of `apps/web`.

## UI Defect Summary Table

| ID | Status | Severity | Area | File & Symbol | Title |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **[UI-E-001]** | FIXED @46ff095 | Critical | State handling | [`apps/web/src/services/supabase-api.ts`](apps/web/src/services/supabase-api.ts) (`syncMatch`) | Unhandled `TypeError: Cannot read properties of undefined (reading 'flatMap')` |
| **[UI-E-002]** | FIXED @01b02cc | High | Performance | [`apps/web/src/pages/MatchPage.tsx`](apps/web/src/pages/MatchPage.tsx) (`MatchPage`) | Full-Page Re-render Storm and Redundant Marker Sync on Clock Ticks |
| **[UI-E-003]** | FIXED @46ff095 | High | Responsive | [`apps/web/src/pages/MatchPage.css`](apps/web/src/pages/MatchPage.css) (`.hud-top-bar`, `.bottom-sheet`) | HUD Overlays and Bottom Actions Lack Safe-Area Insets for Notched Phones |
| **[UI-E-004]** | FIXED @46ff095 | Medium | Responsive | [`apps/web/src/App.css`](apps/web/src/App.css) (`.form-field__input`) | Form Inputs Below 16px Cause Automatic Viewport Zoom on iOS Safari |
| **[UI-E-005]** | FIXED @46ff095 | Medium | Accessibility | [`apps/web/src/pages/LobbyPage.css`](apps/web/src/pages/LobbyPage.css), [`CreatePage.css`](apps/web/src/pages/CreatePage.css) | Touch Targets Below 44x44px for Primary Navigation & Action Buttons |
| **[UI-E-006]** | FIXED @7c75260 | Medium | Accessibility | [`apps/web/src/pages/HomePage.tsx`](apps/web/src/pages/HomePage.tsx), [`GuidePage.tsx`](apps/web/src/pages/GuidePage.tsx) | Heading Hierarchy and Missing Level-One Landmark Violations |

### UI Defect Counts by Severity
- **Critical:** 1 (1 Fixed)
- **High:** 2 (2 Fixed)
- **Medium:** 3 (3 Fixed)
- **Low:** 0
- **Total:** 6 (6 Fixed)

---

## Detailed UI Defects

### [UI-E-001] Unhandled `TypeError: Cannot read properties of undefined (reading 'flatMap')` in Sync API
- **Status:** FIXED @46ff095
- **Severity:** Critical
- **Area:** State handling / Runtime Crash
- **File & symbol:** [`apps/web/src/services/supabase-api.ts`](apps/web/src/services/supabase-api.ts) (`syncMatch`)
- **Evidence:**
  ```ts
  own_team_positions: result.data.events.flatMap((event) => { ... })
  const snapshots = result.data.events.flatMap((event) => { ... })
  ```
  Recorded in Playwright baseline capture: 16 uncaught page errors `TypeError: Cannot read properties of undefined (reading 'flatMap')`.
- **What is wrong:** `syncMatch()` expects `result.data.events` to always be an array. When backend payloads, fixtures, or simulation mocks omit `events` or supply `undefined`/`null`, calling `.flatMap()` throws an unhandled `TypeError` that breaks component lifecycle and stalls the match polling loop.
- **Impact:** Entire match screen crashes or fails to synchronize positions for both Hunters and Runners.
- **Suggested fix:** Guard with `const events = Array.isArray(result.data.events) ? result.data.events : []` before invoking `.flatMap()`.

---

### [UI-E-002] Full-Page Re-render Storm and Redundant Marker Sync on Clock Ticks
- **Status:** FIXED @01b02cc
- **Severity:** High
- **Area:** Performance / Battery & CPU
- **File & symbol:** [`apps/web/src/pages/MatchPage.tsx`](apps/web/src/pages/MatchPage.tsx) (`MatchPage`), [`apps/web/src/components/GameMap.tsx`](apps/web/src/components/GameMap.tsx) (`GameMap`)
- **Evidence:**
  `MatchPage.tsx:193` sets a 250ms interval calling `setSeconds()`, and line 77 runs `useNow(1000)`. Every tick produces brand-new inline object literals `mapData` and `zone`, which are passed into `<GameMap data={mapData} zone={zone} />`. In `GameMap.tsx:123`, `useMemo([data])` re-evaluates and triggers the `useEffect([markerPoints])` effect up to 4 times per second, executing dynamic `import('maplibre-gl')`, DOM marker mutations, and coordinate projections even when no player has moved.
- **What is wrong:** HUD countdown timer state is coupled to the root `MatchPage` component instead of an isolated leaf component, churning the entire page tree and canvas overlay.
- **Impact:** High CPU usage, dropped frames on low/mid-tier mobile devices, and excessive battery drain during outdoor matches.
- **Suggested fix:** Extract the countdown clock into a dedicated memoized `<HudTimer />` leaf component so root `MatchPage` does not re-render on second ticks. Stabilize `mapData` reference identity using `useMemo` with coordinate-value dependencies.

---

### [UI-E-003] HUD Overlays and Bottom Actions Lack Safe-Area Insets for Notched Phones
- **Status:** FIXED @46ff095
- **Severity:** High
- **Area:** Responsive / Mobile Layout
- **File & symbol:** [`apps/web/src/pages/MatchPage.css`](apps/web/src/pages/MatchPage.css) (`.hud-top-bar`, `.bottom-sheet`)
- **Evidence:**
  ```css
  .hud-top-bar { padding: 0.75rem 1rem; }
  .bottom-sheet { padding: 0.75rem 1.25rem 1.5rem; }
  ```
  Neither element uses `env(safe-area-inset-top)` or `env(safe-area-inset-bottom)`.
- **What is wrong:** Fixed HUD header buttons (menu, role badge, clock, radio drawer, stealth) collide with camera notches and the iOS Dynamic Island. The bottom sheet (Hold to Confirm Tag button, items tray, footer actions) collides with the mobile home swipe gesture bar on modern iOS and Android devices.
- **Impact:** Mis-taps on primary game actions (tagging or closing drawers) or accidental task switching while running outdoors.
- **Suggested fix:** Apply `padding-top: max(0.75rem, env(safe-area-inset-top, 0px))` to `.hud-top-bar` and `padding-bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px))` to `.bottom-sheet`.

---

### [UI-E-004] Form Inputs Below 16px Cause Automatic Viewport Zoom on iOS Safari
- **Status:** FIXED @46ff095
- **Severity:** Medium
- **Area:** Responsive / iOS WebKit Quirks
- **File & symbol:** [`apps/web/src/App.css`](apps/web/src/App.css) (`.form-field__input`)
- **Evidence:**
  [`apps/web/src/App.css:484`](apps/web/src/App.css): `.form-field__input { font-size: 15px; }`.
- **What is wrong:** iOS Mobile Safari enforces an automatic viewport zoom whenever a text input with `font-size < 16px` receives focus. Because the app uses fixed HUD layouts, this auto-zoom scales the page unpredictably, clipping edge controls and forcing players to manually pinch-to-zoom out.
- **Impact:** Frustrating zoom jump when typing match codes, guest names, or chat messages outdoors.
- **Suggested fix:** Set `font-size: 16px;` on `.form-field__input` and ensure all form inputs meet the 16px threshold.

---

### [UI-E-005] Touch Targets Below 44x44px for Primary Navigation & Action Buttons
- **Status:** FIXED @46ff095
- **Severity:** Medium
- **Area:** Accessibility / One-Handed Mobile UX
- **File & symbol:** [`apps/web/src/pages/LobbyPage.css`](apps/web/src/pages/LobbyPage.css), [`CreatePage.css`](apps/web/src/pages/CreatePage.css), [`GuidePage.css`](apps/web/src/pages/GuidePage.css), [`App.css`](apps/web/src/App.css)
- **Evidence:**
  - `.lobby-back-btn` and `.lobby-settings-btn`: `width: 36px; height: 36px;`
  - `.create-back-btn` and `.game-mode-nav-btn`: `width: 36px; height: 36px;`
  - `.guide-back-btn`: `width: 36px; height: 36px;`
  - `.app-btn--sm`: `min-height: 36px;`
- **What is wrong:** Interactive buttons are smaller than the standard 44x44 CSS px touch target minimum required for one-handed mobile use in active outdoor conditions.
- **Impact:** Mis-taps, missed taps, and high interaction friction when players are running or wearing gloves.
- **Suggested fix:** Upgrade button dimensions to `min-width: 44px; min-height: 44px;` or attach touch pseudo-elements (`::before`) providing a 44x44px tap zone without breaking visual design rhythm.

---

### [UI-E-006] Heading Hierarchy and Missing Level-One Landmark Violations
- **Status:** FIXED @7c75260
- **Severity:** Medium
- **Area:** Accessibility / Screen Reader Landmarks
- **File & symbol:** [`apps/web/src/pages/HomePage.tsx`](apps/web/src/pages/HomePage.tsx), [`LobbyPage.tsx`](apps/web/src/pages/LobbyPage.tsx), [`MatchPage.tsx`](apps/web/src/pages/MatchPage.tsx), [`GuidePage.tsx`](apps/web/src/pages/GuidePage.tsx)
- **Evidence:**
  axe automated accessibility scan reported:
  - `page-has-heading-one` on `HomePage`, `LobbyPage`, and `MatchPage`.
  - `heading-order` on `GuidePage` (jumps from `<h1>How to play</h1>` directly into step card `<h3>`).
- **What is wrong:** Screen reader users cannot navigate to main page landmarks or comprehend document structure because `<h1>` tags are omitted in favor of styled presentation text, and heading levels skip degrees.
- **Impact:** Screen reader disorientation and accessibility test failures.
- **Suggested fix:** Introduce semantic or visually hidden `<h1>` elements on `HomePage` ("XZones Tactical Hide and Seek"), `LobbyPage` ("Match Staging Lobby"), and `MatchPage` ("Tactical Match HUD"). Correct `GuidePage` step cards from `<h3>` to `<h2>`.

