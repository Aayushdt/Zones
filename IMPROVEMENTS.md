# Code Audit Improvements & Architecture Report: `IMPROVEMENTS.md`

## Summary Table

| ID | Priority | Effort | File(s) | Title |
| :--- | :--- | :--- | :--- | :--- |
| **[I-001]** | High | Medium | [`apps/web/vite.config.ts`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/vite.config.ts), [`apps/web/src/components/GameMap.tsx`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/components/GameMap.tsx) | MapLibre Chunk Splitting to Reduce Initial Bundle Size |
| **[I-002]** | High | Medium | [`apps/web/src/pages/LobbyPage.tsx`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/pages/LobbyPage.tsx), [`apps/web/src/utils/map-tactical-style.ts`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/utils/map-tactical-style.ts) | Offline Tactical Tile Pre-Caching in Lobby / Staging |
| **[I-003]** | High | Small | [`package.json`](file:///home/aayushchoudhary/Downloads/Zones/Zones/package.json), [`.github/workflows/ci.yml`](file:///home/aayushchoudhary/Downloads/Zones/Zones/.github/workflows/ci.yml) | Portable CI Workflow & Deno Test Runner Harmonization |
| **[I-004]** | Medium | Medium | [`apps/web/src/components/LocationSharing.tsx`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/components/LocationSharing.tsx), [`packages/game-core/src/map-smoothing.ts`](file:///home/aayushchoudhary/Downloads/Zones/Zones/packages/game-core/src/map-smoothing.ts) | Adaptive Battery-Aware GPS Polling & Velocity Smoothing |
| **[I-005]** | Medium | Medium | [`apps/web/src/services/host-presets.ts`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/services/host-presets.ts), [`apps/web/src/pages/create/GameplayTab.tsx`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/pages/create/GameplayTab.tsx) | Cloud Sync for Host Game Presets via Supabase Profiles |
| **[I-006]** | Low | Small | [`apps/web/src/utils/feedback.ts`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/utils/feedback.ts) | Capacitor Haptics Bridge & iOS Safari Vibration Fallback |
| **[I-007]** | Low | Small | [`apps/web/src/components/CameraScanner.tsx`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/components/CameraScanner.tsx) | Camera Scanner Flashlight / Torch Control for Dusk Matches |

---

## Detailed Improvements

### [I-001] MapLibre Chunk Splitting to Reduce Initial Bundle Size
- **Priority:** High
- **Effort:** Medium
- **File(s):** [`apps/web/vite.config.ts`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/vite.config.ts), [`apps/web/src/components/GameMap.tsx`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/components/GameMap.tsx)
- **Current situation:**
  During production build, Vite emits a single large JavaScript chunk for MapLibre GL:
  ```
  dist/assets/maplibre-gl-Dq1yKjKz.js  1,074.88 kB │ gzip: 289.42 kB
  ```
  Vite warns: *"Some chunks are larger than 500 kB after minification. Consider using dynamic import() to code-split the application."* While route-level code splitting is implemented via `React.lazy` on pages, loading the map bundle on initial navigation to `MatchPage` or `ZonePicker` causes noticeable latency on mobile 4G/3G connections.
- **Proposed change:**
  Configure manual chunk splitting in `vite.config.ts` under `build.rollupOptions.output.manualChunks` and ensure `maplibre-gl` is loaded asynchronously with an interactive tactical radar skeleton placeholder while the WebGL canvas initializes.
- **Example:**
  ```ts
  // apps/web/vite.config.ts
  export default defineConfig({
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/maplibre-gl')) {
              return 'maplibre-vendor'
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'icons-vendor'
            }
          },
        },
      },
    },
  })
  ```

---

### [I-002] Offline Tactical Tile Pre-Caching in Lobby / Staging
- **Priority:** High
- **Effort:** Medium
- **File(s):** [`apps/web/src/pages/LobbyPage.tsx`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/pages/LobbyPage.tsx), [`apps/web/src/utils/map-tactical-style.ts`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/utils/map-tactical-style.ts)
- **Current situation:**
  Outdoor matches frequently take place in urban parks or rural campuses where cellular data connectivity can be intermittent or spotty. Currently, MapLibre fetches vector tiles from Stadia Maps / OpenMapTiles on demand as the user pans or zooms. If a player loses data connectivity mid-match, the radar map background renders blank grey tiles.
- **Proposed change:**
  Add a *"Pre-download Map Area"* action in `LobbyPage` or the zone configuration screen. Once the host establishes the game boundary circle, compute the bounding box (zooms 13–17) and pre-populate the browser's `CacheStorage` via the service worker before the match starts.
- **Example:**
  ```ts
  export async function precacheZoneTiles(center: [number, number], radiusMeters: number): Promise<number> {
    const cache = await caches.open('tactical-tiles-v1')
    const tileUrls = computeTilesInBoundingBox(center, radiusMeters, [14, 15, 16])
    let cachedCount = 0
    await Promise.all(tileUrls.map(async (url) => {
      try {
        const res = await fetch(url, { mode: 'cors' })
        if (res.ok) { await cache.put(url, res); cachedCount++ }
      } catch { /* Continue best-effort tile caching */ }
    }))
    return cachedCount
  }
  ```

---

### [I-003] Portable CI Workflow & Deno Test Runner Harmonization
- **Priority:** High
- **Effort:** Small
- **File(s):** [`package.json`](file:///home/aayushchoudhary/Downloads/Zones/Zones/package.json), [`.github/workflows/ci.yml`](file:///home/aayushchoudhary/Downloads/Zones/Zones/.github/workflows/ci.yml)
- **Current situation:**
  The project utilizes Deno for Edge Functions and payload validation (`test:edge`, `verify:payloads`, `test:api`, `test:sim`), while `apps/web` and `packages/game-core` use pnpm and Vitest. If Deno is missing in developer environments, commands like `pnpm verify:payloads` fail abruptly.
- **Proposed change:**
  Add a clear step in `.github/workflows/ci.yml` using `denoland/setup-deno@v1`, and provide a fallback script or install instruction in `README.md` and `package.json` so that all test suites can run seamlessly across local and CI environments.
- **Example:**
  ```yaml
  # .github/workflows/ci.yml
  - name: Setup Deno
    uses: denoland/setup-deno@v1
    with:
      deno-version: v1.x

  - name: Run Payload Verification & Simulator Tests
    run: pnpm test:all
  ```

---

### [I-004] Adaptive Battery-Aware GPS Polling & Velocity Smoothing
- **Priority:** Medium
- **Effort:** Medium
- **File(s):** [`apps/web/src/components/LocationSharing.tsx`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/components/LocationSharing.tsx), [`packages/game-core/src/map-smoothing.ts`](file:///home/aayushchoudhary/Downloads/Zones/Zones/packages/game-core/src/map-smoothing.ts)
- **Current situation:**
  `LocationSharing.tsx` queries the HTML5 Geolocation API with continuous high accuracy. While stationary (e.g. hiding behind a wall for 5 minutes), the GPS radio continuously draws peak power, causing phone heating and rapid battery drain during hour-long matches.
- **Proposed change:**
  Implement adaptive GPS pacing: when consecutive fixes indicate the player has moved less than 3 meters over a 30-second window, dynamically relax `maximumAge` or reduce transmission frequency from 2s to 6s, immediately ramping back to real-time high frequency when accelerometer / device orientation detects rapid movement.
- **Example:**
  ```ts
  const isStationary = consecutiveDisplacements.every((d) => d < 3.0)
  const uploadPacingInterval = isStationary ? 6_000 : 2_000
  ```

---

### [I-005] Cloud Sync for Host Game Presets via Supabase Profiles
- **Priority:** Medium
- **Effort:** Medium
- **File(s):** [`apps/web/src/services/host-presets.ts`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/services/host-presets.ts), [`apps/web/src/pages/create/GameplayTab.tsx`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/pages/create/GameplayTab.tsx)
- **Current situation:**
  `host-presets.ts` serializes custom game configurations (speed zones, radar intervals, camouflage rules, player counts) solely to browser `localStorage` (`xzones_host_presets_v1`). If a host configures complex game boundaries or rules on a desktop/laptop before switching to a phone in the field, presets are inaccessible.
- **Proposed change:**
  Store host presets in Supabase under a `host_presets` table scoped to `auth_user_id`, syncing bidirectionally with `localStorage` so presets seamlessly transfer across organizer devices.

---

### [I-006] Capacitor Haptics Bridge & iOS Safari Vibration Fallback
- **Priority:** Low
- **Effort:** Small
- **File(s):** [`apps/web/src/utils/feedback.ts`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/utils/feedback.ts)
- **Current situation:**
  `feedback.ts` invokes `navigator.vibrate?.(ms)`. On iOS Safari and WKWebView, the Web Vibration API is disabled by Apple for privacy reasons, meaning iPhone players receive no tactile feedback on pings, tags, or proximity alarms.
- **Proposed change:**
  Check for `@capacitor/haptics` or audio synthesis click fallbacks when running on WebKit/iOS, providing equivalent tactile/audio response for tag and radar events.
- **Example:**
  ```ts
  export async function triggerHaptic(pattern: number | number[]) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern)
      return
    }
    // Capacitor native bridge check
    if ((window as any).Capacitor?.isPluginAvailable('Haptics')) {
      const { Haptics, ImpactStyle } = (window as any).Capacitor.Plugins
      await Haptics.impact({ style: ImpactStyle.Medium })
    }
  }
  ```

---

### [I-007] Camera Scanner Flashlight / Torch Control for Dusk Matches
- **Priority:** Low
- **Effort:** Small
- **File(s):** [`apps/web/src/components/CameraScanner.tsx`](file:///home/aayushchoudhary/Downloads/Zones/Zones/apps/web/src/components/CameraScanner.tsx)
- **Current situation:**
  `CameraScanner.tsx` opens the back-facing camera to scan runner QR codes during tags. In evening matches or indoor/shadowed environments, low-light makes QR detection sluggish or impossible.
- **Proposed change:**
  Query track capabilities for `torch: true` and display a flashlight toggle icon button in the camera modal.
- **Example:**
  ```tsx
  const track = stream?.getVideoTracks()[0]
  const capabilities = track?.getCapabilities?.() as { torch?: boolean } | undefined
  const supportsTorch = Boolean(capabilities?.torch)

  const toggleTorch = async () => {
    if (!track) return
    const next = !torchOn
    await track.applyConstraints({ advanced: [{ torch: next } as any] })
    setTorchOn(next)
  }
  ```

---

## Recommended Order of Work

### Phase 1: Quick Wins (Immediate Value & Stability)
1. **[I-003] Harmonize CI & Deno setup:** Add `denoland/setup-deno` in CI workflow so allEdge Function tests run automatically.
2. **[I-007] Camera torch control:** Add torch toggle in `CameraScanner.tsx` for reliable low-light tagging.
3. **[I-006] iOS haptics bridge:** Add Capacitor/Audio fallback in `feedback.ts` for iOS vibration support.

### Phase 2: Core Performance & UX (Match Day Readiness)
4. **[I-001] MapLibre vendor chunk splitting:** Configure Rollup manual chunks in `vite.config.ts` to drop initial chunk size under 500 kB.
5. **[I-002] Tactical tile pre-caching:** Allow downloading game area vector tiles in lobby to prevent blank map tiles during cellular dead-zones.

### Phase 3: Architectural Maturation
6. **[I-004] Adaptive GPS power pacing:** Reduce battery consumption during stationary hiding periods.
7. **[I-005] Supabase host presets cloud sync:** Enable cross-device preset portability between host desktop planning and mobile match execution.
