# XZONES Technical Debt Register & Roadmap

**Status:** Updated on branch `cleanup/slim-2` (October 2026)

---

## 1. Resolved Tech Debt in Current Sprint (`cleanup/slim-2`)

| ID | Issue | Root Cause | Resolution | Commit | Status |
| :---: | :--- | :--- | :--- | :---: | :---: |
| **TD-001** | **Monolithic `App.css` (3,650 lines)** | Global stylesheet accumulating styles from every screen | Split into 10 modular per-page stylesheets (`HomePage.css`, `LobbyPage.css`, `CreatePage.css`, `MatchPage.css`, etc.) + 152 dead selectors pruned. `App.css` dropped to 1,167 lines (-68%). Initial CSS payload reduced by 18.1 kB raw (2.17 kB gzip). | `dbaf53c` | **RESOLVED** |
| **TD-002** | **Monolithic `CreatePage.tsx` (918 lines)** | Tab panel logic, presets, and zone config co-located in single component | Extracted 4 focused subcomponents: `GameplayTab`, `ZoneTab`, `AlertsTab`, `EconomyTab`. `CreatePage.tsx` reduced to 640 lines (-30.3%). | `d365782` | **RESOLVED** |
| **TD-003** | **Realtime Loop Stale Closures & Reconnect Warnings** | `MatchPage.tsx` subscription recreating channel listeners on reactive state changes | Implemented ref-based handler pattern (`stateRef`, `syncRef`, `clockRef`, `executeTagRef`) keeping subscription open continuously. Added test `I10` verifying reconnects and clean disposal. | `540ca48` | **RESOLVED** |
| **TD-004** | **MapLibre Missing Sprite Resolver** | OpenFreeMap style definitions requesting highway/road shield icons not in default sprite | Added `map.on('styleimagemissing')` and `map.setMissingStyleImageResolver()` in `GameMap.tsx` and `ZonePicker.tsx` providing a 1x1 transparent fallback image. | `a86981f` + `5aba964` | **RESOLVED** |
| **TD-005** | **`devEngines` Breaking `npx` in npm v11** | Root `package.json` had `"devEngines": { "deno": "2.9.6" }` which failed with `EBADDEVENGINES` under npm v11 | Scoped Deno to `devDependencies` and backend `deno.json`. Removed root `devEngines`. | `1e70fdc` + `44bd8c7` | **RESOLVED** |
| **TD-006** | **`startMatch` Revision Conflict** | Calling `startMatch(matchId)` without passing current `lobby.revision` caused server rejection | Isolated commit passing `lobby.revision` with test `I9` that asserts the revision is supplied. | `05f63a1` | **RESOLVED** |
| **TD-007** | **Dead UI Components, Barrels, & Assets** | Leftover components (`SegmentedControl`, `Skeleton`, `index.ts`), `hero.png`, `react.svg`, `vite.svg`, `QR_SIGNING_SECRET`, unused fonts | Deleted unused files; uninstalled `@fontsource-variable/bricolage-grotesque` and `@fontsource-variable/manrope`. | `b1852a6` + `41b93a3` | **RESOLVED** |

---

## 2. Active Technical Debt & Top-10 Roadmap

The following items are documented for upcoming iterations without breaking existing behavior:

### TD-008: MapLibre Bundle Size Budget
- **Current State:** `maplibre-gl-*.js` is 1,074 kB unminified (289 kB gzip) and worker is 507 kB. Vite emits a chunk size warning.
- **Risk:** High initial download on 3G cellular connections in outdoor environments.
- **Plan:** Keep lazy-loading `MatchPage` and `ZonePicker`; evaluate dynamic chunk streaming or preloading service worker cache on lobby entry.

### TD-009: Offline Tile Pre-Caching UI
- **Current State:** Service worker caches tiles opportunistically as the player pans the map.
- **Risk:** If a player enters a park area without cellular signal before viewing the tiles, map rendering falls back to offline grid pattern.
- **Plan:** Add an explicit "Download Offline Area" button in the Lobby / Setup screen that fetches a 2km bounding box tile package into CacheStorage.

### TD-010: Docker Socket Constraint in Dev Environment
- **Current State:** `supabase start` requires Docker daemon access, which is restricted in certain sandboxed agent containers.
- **Risk:** Full local Supabase stack cannot be launched directly via CLI without external Docker socket permissions.
- **Plan:** Maintain the lightweight temporary PostgreSQL test harness (`scripts/test-audit-db.sh`) and mock realtime harness for CI and isolated container development.

### TD-011: Automated Lighthouse CI Performance Gate
- **Current State:** Lighthouse mobile was executed locally against production preview (Performance 95, Accessibility 100, Best Practices 100, SEO 91).
- **Risk:** Future UI PRs might regress mobile performance metrics or touch target sizing.
- **Plan:** Integrate `@lhci/cli` into GitHub Actions workflow asserting minimum thresholds (>= 90).

### TD-012: Phase B Capacitor Native Android Packaging
- **Current State:** Web PWA relying on screen wake lock (`navigator.wakeLock`) and `watchPosition`.
- **Risk:** Mobile browsers throttle or suspend geolocation when the device screen turns off or the phone is placed in a pocket.
- **Plan:** Wrap with Capacitor.js and add an Android Foreground Service with continuous notification (`START_STICKY`) for reliable background GPS reporting.

### TD-013: Battery-Aware GPS Throttling
- **Current State:** Constant 1-5s high accuracy GPS polling during active gameplay.
- **Risk:** High battery drain on 1-hour outdoor matches.
- **Plan:** Implement speed-based polling: if accelerometer / GPS detects player is stationary inside safe zone, throttle polling to 10s intervals.

### TD-014: Camera Scanner Flashlight / Torch Toggle
- **Current State:** `CameraScanner.tsx` uses WebRTC `getUserMedia` with default video constraints.
- **Risk:** Scanning QR tokens at dusk or night games in dimly lit parks can fail.
- **Plan:** Query `track.getCapabilities().torch` and expose a tactile torch button on the scanner HUD.

### TD-015: End-to-End Realtime Stress Simulator
- **Current State:** 36 unit tests and 43 Playwright visual/smoke tests run with mocked/shimmed realtime broadcasts.
- **Risk:** Race conditions with 12 simultaneous players pushing pings at sub-second intervals under high latency.
- **Plan:** Extend `tools/simulator` to execute headless multi-client ping-pong streams against a staging Supabase instance.

### TD-016: Cloud Host Presets Sync
- **Current State:** Host presets are stored in browser `localStorage`.
- **Risk:** If a host switches devices or clears browser data, customized zone configurations are lost.
- **Plan:** Provide optional sync to user profile table if host authenticates with email/Google Auth.

### TD-017: Haptic Feedback Granularity on iOS Safari
- **Current State:** `navigator.vibrate` is called for tactical alerts, but iOS Safari does not support the standard Web Vibration API.
- **Risk:** iPhone users miss physical vibration cues for proximity alarms and tags.
- **Plan:** In Phase B Capacitor native build, bridge `Haptics.vibrate()` for uniform cross-platform tactile feedback.
