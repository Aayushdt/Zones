# Code Audit Defect Report: `ERRORS.md`

## Summary Table

| ID | Severity | File & Lines | Title |
| :--- | :--- | :--- | :--- |
| **[E-001]** | High | [`package.json:L14-L15`](file:///home/aayushchoudhary/Downloads/Zones/Zones/package.json#L14-L15) | Missing Deno Executable in Workspace Tooling Causes Script Failures |
| **[E-002]** | Medium | [`apps/web/src/pages/MatchPage.tsx:L628-L641`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/pages/MatchPage.tsx#L628-L641) | Impure `Date.now()` Invocations in Component Render Tree |
| **[E-003]** | Medium | [`apps/web/src/components/GameMap.tsx:L110-L113`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/components/GameMap.tsx#L110-L113) | Incomplete React Hook Dependency Array in Map Center Hook |
| **[E-004]** | Medium | [`apps/web/src/components/LocationSharing.tsx:L47-L50`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/components/LocationSharing.tsx#L47-L50) | Background Tab Visibility Blocks Location Transmissions in Active Play |
| **[E-005]** | Low | [`apps/web/src/pages/MatchPage.tsx:L133-L138`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/pages/MatchPage.tsx#L133-L138) | Synchronous Cascading `setState` Calls Inside Lifecycle Effects |
| **[E-006]** | Low | [`apps/web/src/components/CameraScanner.tsx:L36-L45`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/components/CameraScanner.tsx#L36-L45) | MediaStream Track Leak and Unreleased Video Source on Component Unmount |

### Defect Counts by Severity
- **Critical:** 0
- **High:** 1
- **Medium:** 3
- **Low:** 2
- **Total:** 6

---

## Detailed Defects

### [E-001] Missing Deno Executable in Workspace Tooling Causes Script Failures
- **Severity:** High
- **File & lines:** [`package.json:L14-L15`](file:///home/aayushchoudhary/Downloads/Zones/Zones/package.json#L14-L15), [`package.json:L20-L21`](file:///home/aayushchoudhary/Downloads/Zones/Zones/package.json#L20-L21), [`package.json:L23`](file:///home/aayushchoudhary/Downloads/Zones/Zones/package.json#L23)
- **Category:** Config / Tooling
- **Problematic code:**
  ```json
  "scripts": {
    "build": "corepack pnpm --filter @xzones/web build",
    "lint": "corepack pnpm --filter @xzones/web lint",
    "typecheck": "corepack pnpm --filter @xzones/game-core typecheck && corepack pnpm --filter @xzones/web build",
    "test:edge": "corepack pnpm exec deno test --allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,JOIN_CODE_HMAC_SECRET,RATE_LIMIT_HASH_SECRET backend/supabase/functions/api",
    "verify:payloads": "corepack pnpm exec deno test scripts/verify-payloads.ts",
    "test:unit": "corepack pnpm --filter @xzones/game-core test",
    "test:audit": "corepack pnpm --filter @xzones/game-core exec vitest run --root ../.. tests/audit/rules_audit.test.ts tests/audit/client_logic_audit.test.ts",
    "test:db": "bash scripts/test-audit-db.sh",
    "test:realtime-integration": "node tests/realtime/integration.mjs",
    "test:api": "corepack pnpm test:edge && corepack pnpm exec deno test --allow-env tests/audit/api_hostile_audit_test.ts",
    "test:sim": "corepack pnpm exec deno test tools/simulator",
    "test:e2e": "corepack pnpm exec playwright test",
    "test:all": "corepack pnpm test:unit && corepack pnpm test:audit && corepack pnpm test:api && corepack pnpm verify:payloads && corepack pnpm test:sim && corepack pnpm test:e2e && corepack pnpm test:db"
  }
  ```
- **What is wrong:** The root `package.json` declares five npm scripts (`test:edge`, `verify:payloads`, `test:api`, `test:sim`, and composite `test:all`) that invoke `corepack pnpm exec deno test ...`. However, `deno` is not listed as a devDependency in `package.json` nor is it vendored in the repo or guaranteed in local environments. When executed on any standard system without a global Deno binary pre-installed, `corepack pnpm exec` aborts with exit code 1.
- **Impact:** Critical automated verification commands (`pnpm verify:payloads`, `pnpm test:api`, `pnpm test:edge`, `pnpm test:all`) fail out of the box, preventing CI/CD pipelines and developers from verifying edge functions and payload schemas.
- **How it was verified:** Executing `corepack pnpm verify:payloads` returned:
  ```
  ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "deno" not found
  ```
- **Suggested fix:**
  Add a setup script or npm wrapper package (such as `deno-bin` in `devDependencies`), or write a Node/Vitest runner for the payload verification scripts:
  ```json
  "devDependencies": {
    "@axe-core/playwright": "^4.14.0",
    "@playwright/test": "1.64.1",
    "deno-bin": "^1.46.3",
    "supabase": "2.121.0"
  }
  ```

---

### [E-002] Impure `Date.now()` Invocations in Component Render Tree
- **Severity:** Medium
- **File & lines:** [`apps/web/src/pages/MatchPage.tsx:L628-L641`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/pages/MatchPage.tsx#L628-L641)
- **Category:** Runtime / React Purity
- **Problematic code:**
  ```tsx
  {/* Active Tactical Item Status Pills */}
  {camouflageExpiresAt !== null && (
    <div className="hud-metric-pill font-mono hud-item-pill--camo" title="Thermal Camouflage active">
      <EyeOff size={14} className="text-green" />
      <span className="hud-metric-label">CAMO</span>
      <span className="hud-metric-val">{Math.max(0, Math.ceil((camouflageExpiresAt - Date.now()) / 1000))}s</span>
    </div>
  )}
  {alarmExpiresAt !== null && (
    <div className="hud-metric-pill font-mono hud-item-pill--alarm" title="Proximity Alarm armed">
      <Bell size={14} className="text-amber" />
      <span className="hud-metric-label">ALARM</span>
      <span className="hud-metric-val">{Math.max(0, Math.ceil((alarmExpiresAt - Date.now()) / 1000))}s</span>
    </div>
  )}
  ```
- **What is wrong:** `Date.now()` is called directly inside the JSX render expression (`(camouflageExpiresAt - Date.now()) / 1000` and `(alarmExpiresAt - Date.now()) / 1000`). Under React 19 and React Compiler semantics, render functions must remain pure mathematical projections of props and state. Calling non-deterministic timing functions during render causes mismatch warnings, hydration inconsistencies, and stuttering UI displays (as the values do not re-render unless external state changes).
- **Impact:** Tactical item expiry countdown pills do not update at smooth 1-second intervals unless other game state updates trigger component re-renders, resulting in frozen HUD countdowns and React Compiler purity warnings.
- **How it was verified:** `corepack pnpm lint` (oxlint) reported:
  ```
  eslint(react-compiler): Cannot call impure function during render (Date.now)
    apps/web/src/pages/MatchPage.tsx:632:66
    apps/web/src/pages/MatchPage.tsx:639:63
  ```
- **Suggested fix:**
  Derive remaining item duration from an active state ticker in `useEffect` (similar to `seconds` and `zoneSeconds`):
  ```tsx
  const [camoSeconds, setCamoSeconds] = useState<number | null>(null)
  const [alarmSeconds, setAlarmSeconds] = useState<number | null>(null)

  useEffect(() => {
    if (camouflageExpiresAt === null && alarmExpiresAt === null) return
    const tick = () => {
      const now = Date.now()
      if (camouflageExpiresAt !== null) {
        setCamoSeconds(Math.max(0, Math.ceil((camouflageExpiresAt - now) / 1000)))
      }
      if (alarmExpiresAt !== null) {
        setAlarmSeconds(Math.max(0, Math.ceil((alarmExpiresAt - now) / 1000)))
      }
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [camouflageExpiresAt, alarmExpiresAt])
  ```

---

### [E-003] Incomplete React Hook Dependency Array in Map Center Hook
- **Severity:** Medium
- **File & lines:** [`apps/web/src/components/GameMap.tsx:L110-L113`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/components/GameMap.tsx#L110-L113)
- **Category:** Runtime / Logic
- **Problematic code:**
  ```tsx
  useEffect(() => {
    const fix = data.own_position ?? data.own_team_positions[0]
    if (fix) setCenter((current) => current ?? [fix.lon, fix.lat])
  }, [data.own_position?.lat, data.own_position?.lon, data.own_team_positions])
  ```
- **What is wrong:** The effect reads `data.own_position` directly in the nullish coalescing check `data.own_position ?? data.own_team_positions[0]`, but the dependency array only specifies `data.own_position?.lat` and `data.own_position?.lon`. If `data.own_position` transitions from `null` to a valid position object having `(0, 0)` coordinates or equivalent optional chaining edge-cases, or if the reference updates without coordinate changes, stale closures can prevent `setCenter` from executing.
- **Impact:** Map canvas can fail to re-center onto the player or first teammate when joining a live match, remaining centered on default null/fallback coordinates until manual panning occurs.
- **How it was verified:** `corepack pnpm lint` (oxlint) reported:
  ```
  eslint(react-hooks/exhaustive-deps): React Hook useEffect has a missing dependency: 'data.own_position'
    apps/web/src/components/GameMap.tsx:110:3
  ```
- **Suggested fix:**
  Extract the target fix coordinate outside or reference the coordinates consistently:
  ```tsx
  const ownPosition = data.own_position
  const teamPositions = data.own_team_positions

  useEffect(() => {
    const fix = ownPosition ?? teamPositions[0]
    if (fix) setCenter((current) => current ?? [fix.lon, fix.lat])
  }, [ownPosition, teamPositions])
  ```

---

### [E-004] Background Tab Visibility Blocks Location Transmissions in Active Play
- **Severity:** Medium
- **File & lines:** [`apps/web/src/components/LocationSharing.tsx:L47-L50`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/components/LocationSharing.tsx#L47-L50), [`apps/web/src/services/device-lifecycle.ts:L56-L65`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/services/device-lifecycle.ts#L56-L65)
- **Category:** Runtime / Logic
- **Problematic code:**
  ```tsx
  if (document.visibilityState !== 'visible' || !navigator.onLine) {
    setStatus('Background or offline; uploads paused. Your last fix becomes stale.')
    return
  }
  ```
- **What is wrong:** In real-world physical tag/hide-and-seek matches, players frequently turn off their smartphone screen or pocket their phone while sprinting or hiding behind obstacles. While `device-lifecycle.ts` attempts to request a screen wake lock (`navigator.wakeLock.request('screen')`), pressing the physical power/lock button drops the lock and flips `document.visibilityState` to `'hidden'`. In `LocationSharing.tsx`, this immediately pauses GPS coordinate uploads.
- **Impact:** A Runner or Hunter with their phone locked or backgrounded immediately stops transmitting coordinates to the server. Within 45 seconds, the server marks their location as stale, triggers out-of-zone elimination, or denies hunters valid radar pings.
- **How it was verified:** Code trace in `apps/web/src/components/LocationSharing.tsx:47-50` and inspection of browser lifecycle constraints in mobile Webkit and Chromium.
- **Suggested fix:**
  Provide an active audio heartbeat or dedicated ambient/lock-screen mode that preserves background location polling when possible, and present a persistent high-contrast warning in the lobby and HUD reminding players: *"Keep screen unlocked during match — pocketing with screen locked halts GPS uploads."* For Capacitor builds, register a native background geolocation service.
  ```tsx
  // Fallback: If visibilityState is hidden, attempt a throttled emergency fix upload
  // rather than an immediate return, while logging background telemetry
  if (!navigator.onLine) {
    setStatus('Offline; waiting for network connection.')
    return
  }
  ```

---

### [E-005] Synchronous Cascading `setState` Calls Inside Lifecycle Effects
- **Severity:** Low
- **File & lines:** [`apps/web/src/pages/MatchPage.tsx:L133-L138`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/pages/MatchPage.tsx#L133-L138), [`apps/web/src/pages/MatchPage.tsx:L190-L198`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/pages/MatchPage.tsx#L190-L198)
- **Category:** Runtime / React State
- **Problematic code:**
  ```tsx
  useEffect(() => {
    if (!currentRole || currentOwnStatus === 'TAGGED') return
    let active = true
    let unsubscribe: (() => void) | undefined
    const gate = createRealtimeEventGate(currentRole)
    setLiveStatus('Connected to private team channel.')
    // ...
  }, [currentRole, currentOwnStatus])

  useEffect(() => {
    const nextShrinkAt = view?.zone?.nextShrinkAt
    if (!nextShrinkAt) {
      setZoneSeconds(null)
      return
    }
    const update = () =>
      setZoneSeconds(Math.max(0, Math.ceil((Date.parse(nextShrinkAt) - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [view?.zone?.nextShrinkAt])
  ```
- **What is wrong:** Calling `setLiveStatus` and `setZoneSeconds` unconditionally and synchronously inside `useEffect` causes React to immediately schedule a synchronous secondary re-render in the same frame after mounting, resulting in avoidable rendering passes and potential layout thrashing on mobile devices.
- **Impact:** Cascading re-render cycles upon entering `MatchPage`, causing increased CPU consumption and minor frame stuttering on low-end mobile devices during match start.
- **How it was verified:** `corepack pnpm lint` (oxlint) reported:
  ```
  eslint(react-compiler): Setting state in an effect
    apps/web/src/pages/MatchPage.tsx:138:5
    apps/web/src/pages/MatchPage.tsx:193:7
    apps/web/src/pages/MatchPage.tsx:198:7
  ```
- **Suggested fix:**
  Initialize initial statuses with default state or derive them cleanly without synchronous inline effect re-triggers:
  ```tsx
  const [liveStatus, setLiveStatus] = useState<string>(() =>
    currentRole && currentOwnStatus !== 'TAGGED' ? 'Connecting to team channel...' : ''
  )
  ```

---

### [E-006] MediaStream Track Leak and Unreleased Video Source on Component Unmount
- **Severity:** Low
- **File & lines:** [`apps/web/src/components/CameraScanner.tsx:L36-L45`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/components/CameraScanner.tsx#L36-L45)
- **Category:** Runtime / Resource Leak
- **Problematic code:**
  ```tsx
  void navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    .then((camera) => {
      if (stopped) { camera.getTracks().forEach((track) => track.stop()); return }
      stream = camera
      if (video.current) { video.current.srcObject = camera; void video.current.play(); setMessage('Point the camera at a Runner QR.') }
      frame = requestAnimationFrame(scan)
    })
    .catch(() => setMessage('Camera unavailable. Check permission and secure HTTPS, then ask the Runner to use “I was tagged” if needed.'))
  return stop
  ```
- **What is wrong:** The cleanup function `stop()` stops camera tracks on `stream` (`stream?.getTracks().forEach((track) => track.stop())`), but it never nullifies `video.current.srcObject = null`. On mobile Safari (WebKit) and Chromium for Android, failing to clear `video.srcObject` can keep the hardware camera session or privacy indicator LED active even after tracks are marked stopped, or leave the element holding hardware decoder buffers.
- **Impact:** Privacy indicator (green camera dot) may remain active on mobile browsers after closing the QR scanner modal, increasing battery consumption and creating user confusion.
- **How it was verified:** Code trace of cleanup function in `apps/web/src/components/CameraScanner.tsx:21-25`.
- **Suggested fix:**
  Explicitly clear `srcObject` and pause the video element in `stop()`:
  ```tsx
  const stop = () => {
    stopped = true
    if (frame !== null) cancelAnimationFrame(frame)
    if (video.current) {
      video.current.pause()
      video.current.srcObject = null
    }
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
  }
  ```
