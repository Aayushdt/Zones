# Code Audit Defect Report: `ERRORS.md`

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
