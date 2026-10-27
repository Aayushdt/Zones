# Code Audit Improvements & Architecture Report: `IMPROVEMENTS.md`

> ℹ️ **Looking for frontend, mobile UX, & accessibility improvements?** See the [# UI Audit](#ui-audit) section below.

## Summary Table

| ID | Status | Priority | Effort | File(s) | Title |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **[I-001]** | **PARTIALLY CONFIRMED / DOCUMENTED @8d6b1b3** | High | Medium | [`apps/web/vite.config.ts`](apps/web/vite.config.ts) | MapLibre Chunk Splitting to Reduce Initial Bundle Size |
| **[I-002]** | **DEFERRED (Gated) @85f2d08** | High | Medium | [`apps/web/public/sw.js`](apps/web/public/sw.js), [`DEFERRED.md`](DEFERRED.md) | Offline Tactical Tile Pre-Caching in Lobby / Staging |
| **[I-003]** | **FIXED @587fe2c** | High | Small | [`package.json`](package.json), [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Portable CI Workflow & Deno Test Runner Harmonization |
| **[I-004]** | **FIXED @e2c617c** | Medium | Medium | [`packages/game-core/src/map-smoothing.ts`](packages/game-core/src/map-smoothing.ts), [`apps/web/src/components/LocationSharing.tsx`](apps/web/src/components/LocationSharing.tsx) | Adaptive Battery-Aware GPS Polling & Velocity Smoothing |
| **[I-005]** | **DEFERRED (Gated) @c2e9540** | Medium | Medium | [`apps/web/src/services/host-presets.ts`](apps/web/src/services/host-presets.ts), [`DEFERRED.md`](DEFERRED.md) | Cloud Sync for Host Game Presets via Supabase Profiles |
| **[I-006]** | **PARTIALLY FIXED @89c3ae8** | Low | Small | [`apps/web/src/utils/feedback.ts`](apps/web/src/utils/feedback.ts) | Capacitor Haptics Bridge & iOS Safari Vibration Fallback |
| **[I-007]** | **FIXED @67dc862** | Low | Small | [`apps/web/src/components/CameraScanner.tsx`](apps/web/src/components/CameraScanner.tsx) | Camera Scanner Flashlight / Torch Control for Dusk Matches |

---

## Detailed Improvements

### [I-001] MapLibre Chunk Splitting to Reduce Initial Bundle Size
- **Status:** **PARTIALLY CONFIRMED / DOCUMENTED @8d6b1b3**
- **Priority:** High
- **Effort:** Medium
- **File(s):** [`apps/web/vite.config.ts`](apps/web/vite.config.ts), [`apps/web/src/components/GameMap.tsx`](apps/web/src/components/GameMap.tsx)
- **Investigation & Measurement:**
  Build bundle analysis confirmed that `maplibre-gl` emits a 1,074 kB (289 kB gzip) chunk. However, inspecting `dist/index.html` and entry imports proved `maplibre-gl` is **already completely isolated** to dynamic chunks (`GameMap.tsx`, `ZonePicker.tsx`) and is **never** preloaded on the initial landing route.
  The audit report's suggestion to split `lucide-react` into a separate chunk would degrade performance without shrinking MapLibre (MapLibre alone cannot be shrunk below 500 kB minified).
- **Remediation:** Configured `chunkSizeWarningLimit: 1200` in `apps/web/vite.config.ts` accompanied by clear architectural documentation, eliminating spurious build alerts while maintaining route-isolated dynamic imports.

---

### [I-002] Offline Tactical Tile Pre-Caching in Lobby / Staging
- **Status:** **DEFERRED (Gated) @85f2d08**
- **Priority:** High
- **Effort:** Medium
- **File(s):** [`apps/web/public/sw.js`](apps/web/public/sw.js), [`apps/web/src/utils/map-tactical-style.ts`](apps/web/src/utils/map-tactical-style.ts), [`DEFERRED.md`](DEFERRED.md)
- **Gating Evaluation:**
  1. *ToS Restrictions:* The application's default tile provider is OpenFreeMap (`https://tiles.openfreemap.org`), a public community-funded service. Bulk automated prefetching across zoom levels 13–17 for bounding boxes risks IP throttling and violates public API usage terms.
  2. *Existing SW Caching:* Verified `apps/web/public/sw.js` already intercepts OpenFreeMap requests, caching viewed tiles with stale-while-revalidate and an LRU entry cap of 1,200 tiles (`HIDE_AND_SEEK_CONFIG.map.tileCacheEntries.default`).
  3. *Per-Player Scope:* `CacheStorage` is device-local; host downloads do not populate runners' or hunters' phones.
  4. *Offline Fallback:* `apps/web/src/utils/map-tactical-style.ts` provides `createTacticalFallbackStyle()`, which functions 100% offline without remote fonts or vector tiles.
- **Remediation:** Full architectural specification and future self-hosted PMTiles alternative documented in `DEFERRED.md`.

---

### [I-003] Portable CI Workflow & Deno Test Runner Harmonization
- **Status:** **FIXED @587fe2c** (Merged with **[E-001]**)
- **Priority:** High
- **Effort:** Small
- **File(s):** [`package.json`](package.json), [`.github/workflows/ci.yml`](.github/workflows/ci.yml), [`scripts/run-deno.mjs`](scripts/run-deno.mjs)
- **Investigation:**
  Identified that E-001 and I-003 describe the exact same underlying requirement: seamless, portable execution of Deno-backed edge and payload tests across local and CI environments.
- **Remediation:**
  1. Added zero-dependency Node preflight runner `scripts/run-deno.mjs` that verifies Deno is available on PATH and provides user-friendly installation instructions.
  2. Updated `package.json` test scripts to invoke the preflight runner.
  3. Confirmed `.github/workflows/ci.yml` configures `denoland/setup-deno@v2` with `deno-version: v2.9.6` and runs tests in discrete stages.
  4. Documented Deno >= 2.9 prerequisite in `README.md`.

---

### [I-004] Adaptive Battery-Aware GPS Polling & Velocity Smoothing
- **Status:** **FIXED @e2c617c**
- **Priority:** Medium
- **Effort:** Medium
- **File(s):** [`packages/game-core/src/map-smoothing.ts`](packages/game-core/src/map-smoothing.ts), [`packages/game-core/src/map-smoothing.test.ts`](packages/game-core/src/map-smoothing.test.ts), [`apps/web/src/components/LocationSharing.tsx`](apps/web/src/components/LocationSharing.tsx)
- **Investigation & Caveats:**
  A fixed 3m threshold falls below standard GPS jitter (3–15m), risking false movement triggers. Modifying `maximumAge` does not affect `watchPosition` radio duty cycles in mobile browsers. Accelerometer APIs require explicit iOS permission prompts.
- **Remediation:**
  1. Implemented a pure, unit-tested stationary movement detector `isStationaryFix` in `packages/game-core/src/map-smoothing.ts` with a dynamic threshold (`Math.max(3, accuracy_m)`).
  2. Added `computeAdaptiveUploadInterval`: lengthens upload interval to 6,000 ms while stationary (comfortably below the 30s server staleness threshold) and returns immediately to 2,000 ms upon movement.
  3. Integrated into `apps/web/src/components/LocationSharing.tsx` with immediate upload on visibility recovery.
  4. Added 6 unit tests in `packages/game-core/src/map-smoothing.test.ts`. *(Note: Battery savings were not measured on physical devices and represent theoretical radio pacing).*

---

### [I-005] Cloud Sync for Host Game Presets via Supabase Profiles
- **Status:** **DEFERRED (Gated) @c2e9540**
- **Priority:** Medium
- **Effort:** Medium
- **File(s):** [`apps/web/src/services/host-presets.ts`](apps/web/src/services/host-presets.ts), [`DEFERRED.md`](DEFERRED.md)
- **Gating Evaluation:**
  - *Persistent Authenticated Users:* **FAIL**. Verified via `apps/web/src/services/supabase-api.ts:61-103` that `xzones` relies entirely on anonymous guest sessions (`auth.signInAnonymously()`) persisted under `xzones.guest_session`. Users have no cross-device identity or accounts; a second device generates a distinct anonymous UID. Cross-device synchronization cannot function without user identity linking.
- **Remediation:**
  Preserved stable `localStorage` implementation in `apps/web/src/services/host-presets.ts`. Authored full architectural specification in `DEFERRED.md` including database migration with owner-only RLS, Edge Function API endpoints, payload validation, quota limits (16 KB max, 20 preset cap), last-write-wins conflict resolution by `updated_at`, and open product questions.

---

### [I-006] Capacitor Haptics Bridge & iOS Safari Vibration Fallback
- **Status:** **PARTIALLY FIXED @89c3ae8** (Native Capacitor bridge deferred)
- **Priority:** Low
- **Effort:** Small
- **File(s):** [`apps/web/src/utils/feedback.ts`](apps/web/src/utils/feedback.ts), [`tests/audit/client_logic_audit.test.ts`](tests/audit/client_logic_audit.test.ts)
- **Investigation:**
  Grep confirmed `@capacitor/*` is not installed in the workspace. Adding native Capacitor plugins to an SPA web app is out of scope and requires native shell wrappers.
- **Remediation:**
  1. Kept the synchronous fire-and-forget API signature `triggerHaptic(pattern: number | number[] = 25): void`.
  2. Added clean feature detection `isHapticsSupported()`.
  3. Enforced user preferences (`hapticsEnabled`, `reduceEffects`, `prefers-reduced-motion`).
  4. Implemented progressive enhancement: uses `navigator.vibrate(pattern)` when natively supported; falls back to subtle synthesized Web Audio click (`playSound('click')`) on iOS Safari only if sound is enabled; safely no-ops otherwise.
  5. Added unit tests in `tests/audit/client_logic_audit.test.ts`.

---

### [I-007] Camera Scanner Flashlight / Torch Control for Dusk Matches
- **Status:** **FIXED @67dc862**
- **Priority:** Low
- **Effort:** Small
- **File(s):** [`apps/web/src/components/CameraScanner.tsx`](apps/web/src/components/CameraScanner.tsx)
- **Remediation:**
  1. Query video track capabilities for `torch` via `track.getCapabilities()?.torch` without `any` casts (properly typed with `interface TorchCapabilities extends MediaTrackCapabilities`).
  2. Kept active track in a ref and managed torch state via `applyConstraints`.
  3. Added an accessible toggle button (`aria-label`, `aria-pressed`) styled with existing button classes and Lucide `Flashlight` / `FlashlightOff` icons.
  4. Automatically hides the torch control on unsupported devices or desktop browsers.
  5. Resets torch state upon component unmount or camera stop.

---

# UI Audit

This section documents verified frontend, UX, design token, and asset performance enhancements identified during the UI audit of `apps/web`.

## UI Enhancement Summary Table

| ID | Status | Priority | Effort | Area | File(s) | Title |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **[UI-I-001]** | OPEN | High | Small | Performance | [`apps/web/src/theme/fonts.css`](apps/web/src/theme/fonts.css) | Font Asset Subsetting to Eliminate Non-Latin Font Bloat |
| **[UI-I-002]** | OPEN | High | Medium | Performance | [`apps/web/src/pages/MatchPage.tsx`](apps/web/src/pages/MatchPage.tsx) | Component Extraction & Isolated HUD Timer to Prevent Map Re-rendering |
| **[UI-I-003]** | OPEN | Medium | Small | Visual | [`apps/web/index.html`](apps/web/index.html) | Align Theme-Color Meta Tag with OLED Tactical Background |
| **[UI-I-004]** | OPEN | Medium | Small | Performance | [`apps/web/src/components/GameMap.tsx`](apps/web/src/components/GameMap.tsx) | Deep-Value Coordinate Memoization in GameMap |
| **[UI-I-005]** | OPEN | Low | Small | Visual | [`apps/web/src/index.css`](apps/web/src/index.css), [`tokens.css`](apps/web/src/theme/tokens.css) | Jitter-Free Sunlight Typography and Tabular Numerals |

---

## Detailed UI Enhancements

### [UI-I-001] Font Asset Subsetting to Eliminate Non-Latin Font Bloat
- **Priority:** High
- **Effort:** Small
- **Area:** Performance / Load Time
- **File(s):** [`apps/web/src/theme/fonts.css`](apps/web/src/theme/fonts.css), [`apps/web/index.html`](apps/web/index.html)
- **Current situation:**
  `fonts.css` imports `@fontsource/inter/index.css`. This blanket import pulls in Cyrillic, Greek, Vietnamese, and all 9 numeric font weights, emitting 19 `.woff`/`.woff2` asset files totaling ~340 kB in `dist/assets/`.
- **Proposed change:**
  Switch import to `@fontsource/inter/latin.css` (or specific weights 400, 600, 700, 800) and preload the primary Latin regular/bold WOFF2 font in `index.html`.
- **Expected gain:**
  Reduces emitted build font assets by ~250 kB and eliminates flash of unstyled text (FOUT) on slow 4G mobile connections.
- **Risk / caveats:**
  Ensure standard Latin-ext coverage is preserved for international player display names.

---

### [UI-I-002] Component Extraction & Isolated HUD Timer to Prevent Map Re-rendering
- **Priority:** High
- **Effort:** Medium
- **Area:** Performance / Runtime Render
- **File(s):** [`apps/web/src/pages/MatchPage.tsx`](apps/web/src/pages/MatchPage.tsx)
- **Current situation:**
  Root `MatchPage` maintains the 1s/250ms countdown clock state. Every tick triggers a full re-render of `MatchPage` (854 lines), recreating the `mapData` prop and cascading through `<GameMap />`.
- **Proposed change:**
  Extract `<HudTopBar />`, `<HudTimer />`, and `<HudBottomSheet />` into focused subcomponents. Provide the countdown timer to `<HudTimer />` directly, keeping root `MatchPage` and `<GameMap />` from re-rendering on clock ticks.
- **Expected gain:**
  Reduces root `MatchPage` renders from 60+ per minute during quiet play down to 0 (only re-rendering on actual GPS/realtime game events).
- **Risk / caveats:**
  Props passed to `<GameMap />` must maintain strict reference stability.

---

### [UI-I-003] Align Theme-Color Meta Tag with OLED Tactical Background
- **Priority:** Medium
- **Effort:** Small
- **Area:** Visual / Mobile Shell Polish
- **File(s):** [`apps/web/index.html`](apps/web/index.html)
- **Current situation:**
  `index.html` inline script sets `meta[name="theme-color"]` to `#0d0d18` for dusk theme, whereas `--color-background` in `tokens.css` is `#000000`. On modern Android Chrome and iOS Safari, this causes a discolored top status bar bar.
- **Proposed change:**
  Update `index.html` inline script to set `theme-color` to `#000000` for dusk theme and `#F4F8F5` for paper theme, matching the exact `--color-background` CSS token.
- **Expected gain:**
  Flawless edge-to-edge pitch-black display on OLED mobile screens.
- **Risk / caveats:**
  None.

---

### [UI-I-004] Deep-Value Coordinate Memoization in GameMap
- **Priority:** Medium
- **Effort:** Small
- **Area:** Performance / Map Canvas
- **File(s):** [`apps/web/src/components/GameMap.tsx`](apps/web/src/components/GameMap.tsx)
- **Current situation:**
  `markerPoints` is computed inside `useMemo` with dependency `[data, localPosition]`. When `data` changes identity (even with identical lat/lon coordinates), `markerPoints` recalculates and triggers MapLibre DOM updates.
- **Proposed change:**
  Stabilize marker point identity by checking primitive values (lat, lon, accuracy, staleness) or stringifying keys, preventing effect execution when positions remain stationary.
- **Expected gain:**
  Zero MapLibre DOM marker updates when players are stationary in cover.
- **Risk / caveats:**
  Ensure moving updates (smooth coordinate interpolation) are not blocked.

---

### [UI-I-005] Jitter-Free Sunlight Typography and Tabular Numerals
- **Priority:** Low
- **Effort:** Small
- **Area:** Visual / Outdoor Sunlight Usability
- **File(s):** [`apps/web/src/index.css`](apps/web/src/index.css), [`apps/web/src/theme/tokens.css`](apps/web/src/theme/tokens.css)
- **Current situation:**
  While `font-variant-numeric: tabular-nums` is present on `body`, individual tactical metric chips in HUD drawers occasionally shift layout widths as distance numerals fluctuate between single and double digits.
- **Proposed change:**
  Ensure all metric chips, countdowns, and compass bearings declare fixed minimum widths or `tabular-nums` with monospaced digit formatting.
- **Expected gain:**
  Jitter-free, rock-solid numerical readouts when moving quickly in bright sunlight.
- **Risk / caveats:**
  None.

---

## Recommended Order of Work

1. **Quick Wins (Load & Visual Shell):**
   - Font subsetting and preload (`UI-I-001`, `UI-I-003`).
2. **Critical Defect Remediation:**
   - Fix `flatMap` undefined crash in sync API (`UI-E-001`).
   - Fix safe-area insets on HUD overlays (`UI-E-003`).
   - Fix 16px input font size to eliminate iOS auto-zoom (`UI-E-004`).
   - Fix 44x44px touch targets on primary navigation controls (`UI-E-005`).
   - Fix axe heading hierarchy and missing H1 landmarks (`UI-E-006`).
3. **Runtime Performance Optimization:**
   - Isolate HUD countdown timer and decouple from `<GameMap />` (`UI-E-002`, `UI-I-002`).
   - Deep-value memoization in `GameMap` (`UI-I-004`).

