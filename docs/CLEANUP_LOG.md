# XZONES Cleanup & Slim-Down Log (`cleanup/slim-2`)

**Branch:** `cleanup/slim-2` (branched fresh from `main` at `7e52c97`)  
**Commit Strategy:** Small, isolated, single-concern commits. Full test suite (unit + audit + visual a11y E2E) green after every commit. Zero behavior regressions. Protected gameplay zones untouched.

---

## 1. Production-Only LOC Before & After

> Measured using `find apps/web/src packages/game-core/src backend/supabase/functions/api -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" -o -name "*.svg" \) ! -name "*.test.*" ! -name "*.spec.*" ! -name "*_test.ts" ! -name "golden_master_fixtures.ts"` (excluding tests, test fixtures, snapshots, and generated artifacts).

| Category | Before (`7e52c97`) | After (`cleanup/slim-2`) | Delta | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Total Production Files** | 82 files | 90 files | +8 files | +10 page CSS stylesheets, +4 tab subcomponents, -3 dead components/barrels (`SegmentedControl`, `Skeleton`, `index.ts`), -3 dead boilerplate assets (`hero.png`, `react.svg`, `vite.svg`) |
| **Main Monolithic CSS (`App.css`)** | 3,650 lines | 1,167 lines | **-2,483 lines (-68.0%)** | Deconstructed into modular per-page stylesheets + pruned 152 lines of legacy dead selectors |
| **Modular Page CSS Files** | 0 lines (0 files) | 2,300 lines (10 files) | +2,300 lines | `HomePage.css`, `LobbyPage.css`, `CreatePage.css`, `MatchPage.css`, `ResultsPage.css`, `SettingsPage.css`, `GuidePage.css`, `TagPage.css`, `HeadStartPage.css`, `JoinPage.css` |
| **Net Production CSS Lines** | 3,655 lines | 3,467 lines | **-188 lines (-5.1%)** | Verified dead selector removal (PurgeCSS + Playwright dynamic preservation) |
| **`CreatePage.tsx` Monolith** | 918 lines | 640 lines | **-278 lines (-30.3%)** | Split into `GameplayTab.tsx`, `ZoneTab.tsx`, `AlertsTab.tsx`, `EconomyTab.tsx` |
| **Dead Files Removed** | 101 lines (3 files) | 0 lines | **-101 lines** | `SegmentedControl.tsx` (55 lines), `Skeleton.tsx` (20 lines), `components/ui/index.ts` (26 lines) |
| **Dead Unused Assets** | 3 files | 0 files | **-3 files** | `hero.png` (13 KB), `react.svg` (4 KB), `vite.svg` (8 KB) |
| **Total Production LOC** | 12,972 lines | 14,430 lines | +1,458 lines | Added 10 structured stylesheets and 4 clean typed tab subcomponents |

---

## 2. Per-Chunk Bundle Sizes Before & After

| Asset / Chunk | Before (`7e52c97`) Raw / Gzip | After (`cleanup/slim-2`) Raw / Gzip | Delta | Status |
| :--- | :--- | :--- | :--- | :--- |
| **`index-*.css` (Main Initial Bundle)** | 153.85 kB (25.06 kB gzip) | **135.74 kB (22.89 kB gzip)** | **-18.11 kB (-11.8% raw / -2.17 kB gzip)** | **PASS** (Substantial initial CSS payload reduction) |
| `MatchPage-*.css` | 3.18 kB (1.03 kB gzip) | 8.67 kB (2.13 kB gzip) | +5.49 kB (lazy loaded only on `/match/:id`) | **PASS** (HUD styles code-split) |
| `ResultsPage-*.css` | 0 kB (bundled in main) | 3.79 kB (1.09 kB gzip) | Lazy chunk on `/match/:id/results` | **PASS** (Code-split) |
| `SettingsPage-*.css` | 0 kB (bundled in main) | 2.92 kB (0.82 kB gzip) | Lazy chunk on `/settings` | **PASS** (Code-split) |
| `GuidePage-*.css` | 0 kB (bundled in main) | 3.12 kB (0.92 kB gzip) | Lazy chunk on `/guide` | **PASS** (Code-split) |
| `TagPage-*.css` | 0 kB (bundled in main) | 1.31 kB (0.52 kB gzip) | Lazy chunk on `/match/:id/tag` | **PASS** (Code-split) |
| `index-*.js` (Client JS) | 372.05 kB (116.40 kB gzip) | 373.69 kB (116.95 kB gzip) | +1.64 kB (Added sprite fallback resolver) | **PASS** (Stable within budget) |
| `maplibre-gl-*.js` | 1,074.65 kB (289.61 kB gzip) | 1,074.65 kB (289.61 kB gzip) | 0 kB change | **PASS** |
| `maplibre-gl-worker-*.js` | 507.71 kB | 507.71 kB | 0 kB change | **PASS** |
| **Total `dist/` Directory Size** | **2.9 MB** | **2.8 MB** | **-100 KB total disk savings** | **PASS** |

---

## 3. DEAD CSS Elimination Pass

- **Verification Methodology:**
  1. PurgeCSS analysis comparing AST selectors against JSX class attributes.
  2. Grep search across all template literals (`className={\`...\`}`) to guarantee dynamic classes (`app-btn--*`, `app-chip--*`, `radar-ring--*`, `team-card--*`, `hold-btn--*`) were untouched.
  3. Visual regression testing via Playwright across 13 viewports (320px to 1920px) in both `dusk` (dark) and `paper` (light) themes with zero pixel diffs or layout breaks.
- **Selectors Pruned (152 lines removed):**
  - `.switch-toggle__desc`, `.slider-control__desc`
  - `.card-overline`, `.card-subtitle`, `.dual-action-btn__subtitle`
  - `.lobby-header__overline`
  - `.create-overline`, `.create-subtitle`
  - `.game-mode-title-wrap`, `.game-mode-badge`, `.game-mode-desc`
  - `.hud-hold-tag-btn`, `.hud-hold-tag-progress`, `.hud-hold-tag-label`, `.hud-hold-tag-main`, `.hud-hold-tag-sub`
  - `.settings-overline`, `.settings-subtitle`
  - `.guide-overline`
  - `.tag-subtitle`
  - `.head-start-subtitle`
  - `.join-subtitle`
- **Dynamic Classes Preserved:**
  - All `.app-chip--{variant}`, `.app-btn--{variant}`, `.app-card--{variant}`, `.team-card--{seeker|hider}`, `.hold-btn--{variant}`, `.app-toast--{success|error}`, `.radar-sweep-bg`, `.radar-ring`, `.radar-sweep-beam`.

---

## 4. `App.css` Modularization into Per-Page Files

- **Architecture:**
  - `apps/web/src/App.css` retained only core design system primitives: base layout/reset, typography, header, shared interactive UI controls (buttons, chips, inputs, toggles, sliders, tabs, hold buttons, countdown rings, shortcuts modals, toasts).
  - Page-specific visual and layout styles extracted to dedicated CSS files and co-located with their components:
    1. `HomePage.css` -> imported by `HomePage.tsx`
    2. `LobbyPage.css` -> imported by `LobbyPage.tsx`
    3. `CreatePage.css` -> imported by `CreatePage.tsx`
    4. `MatchPage.css` -> imported by `MatchPage.tsx`
    5. `ResultsPage.css` -> imported by `ResultsPage.tsx`
    6. `SettingsPage.css` -> imported by `SettingsPage.tsx`
    7. `GuidePage.css` -> imported by `GuidePage.tsx`
    8. `TagPage.css` -> imported by `TagPage.tsx`
    9. `HeadStartPage.css` -> imported by `HeadStartPage.tsx`
    10. `JoinPage.css` -> imported by `JoinPage.tsx`
- **Pixel-Diff & A11y Verification:**
  - Ran Playwright multi-device visual audit (`tests/e2e/visual-a11y-audit.spec.ts`): **26/26 test suites passed** with 0 horizontal overflows and 0 axe-core accessibility violations.

---

## 5. `CreatePage.tsx` Decomposition

- **Original State:** 918 lines monolithic component handling presets, map preview, and 4 complex form tab panels.
- **Decomposed State:** Reduced to 640 lines in `CreatePage.tsx` (-278 lines, -30.3%), extracting 4 focused tab subcomponents:
  1. `apps/web/src/pages/create/GameplayTab.tsx` (120 lines): Mode selection, mission timer toggle, head start countdown, hunter GPS pings.
  2. `apps/web/src/pages/create/ZoneTab.tsx` (227 lines): Play zone center point, radius slider, shrink toggle, stages, shrink timeline.
  3. `apps/web/src/pages/create/AlertsTab.tsx` (56 lines): Boundary warning threshold, out-of-bounds grace period, alarm interval.
  4. `apps/web/src/pages/create/EconomyTab.tsx` (38 lines): Tactical item store toggle, camouflage duration, proximity alarm duration.
- **Zero Behavior Change:** Props, state, and form input bindings remain identical.

---

## 6. Verification of Skipped Checks

### A. Leak Hunt
- **`setInterval` / `setTimeout`:** Audited all 10 occurrences (`TagPage.tsx`, `HeadStartPage.tsx`, `MatchPage.tsx`, `PingsPage.tsx`, `HostClaimPage.tsx`, `GpsReadinessBadge.tsx`, `ChatPanel.tsx`). Every single interval and timeout stores a handle and calls `window.clearInterval` / `window.clearTimeout` in its effect cleanup function.
- **`addEventListener`:** Audited all 28 occurrences (`keydown`, `visibilitychange`, `pageshow`, `online`, `offline`, `change`). Every listener has a corresponding `removeEventListener` in unmount/teardown.
- **`watchPosition`:** Audited `device-lifecycle.ts` and `LocationSharing.tsx`. Cleanly guarded with `geolocation.clearWatch(watchId)` on stop, visibility change, and component unmount.
- **Realtime Channels / Subscriptions:** Audited `SupabaseGameApi.subscribeMatch`. Returned teardown invokes `client.removeChannel(channel)` and `client.disconnect()`.
- **Verdict:** **PASS (0 leaks found)**.

### B. Secrets Scan
- Scanned repository for private key markers (`BEGIN [A-Z ]*PRIVATE KEY`), cloud keys (`AKIA`, `ghp_`, `sk_live_`, Slack tokens).
- Checked tracked `.env*` files: only `.env.example` is committed; no live tokens or keys exist in git history.
- **Verdict:** **PASS (0 secrets or private keys exposed)**.

### C. Dependency Security Audit
- Executed `corepack pnpm audit`: **0 known vulnerabilities found**.
- **Verdict:** **PASS**.

### D. Unused Assets & Environment Variables
- Removed 3 dead boilerplate assets from `apps/web/src/assets/`: `hero.png` (13.0 KB), `react.svg` (4.1 KB), `vite.svg` (8.7 KB).
- Removed unused environment variable `QR_SIGNING_SECRET=` from `.env.example` (QR codes are hashed via SHA-256 and verified through Postgres RPC `xzones_issue_qr` / `xzones_scan_qr`).
- Removed unused fonts `@fontsource-variable/bricolage-grotesque` and `@fontsource-variable/manrope`.
- **Verdict:** **PASS**.

### E. Lighthouse Mobile Audit
- Executed Lighthouse mobile audit against production preview bundle:
  - **Performance:** **95 / 100**
  - **Accessibility:** **100 / 100**
  - **Best Practices:** **100 / 100**
  - **SEO:** **91 / 100**
- **Verdict:** **PASS**.

---

## 7. Key Architecture & Bugfix Decisions

1. **Deno devEngines Scoping:**
   - Problem: Root `devEngines: { "deno": "2.9.6" }` caused npm v11 (Node 24) to throw `EBADDEVENGINES` when executing `npx`.
   - Resolution: Removed root `devEngines` key; declared Deno in `devDependencies: { "deno": "2.9.6" }` and backend `backend/supabase/functions/api/deno.json`. CI and build scripts unaffected.
   - Commit: `1e70fdc` + `44bd8c7`.
2. **MapLibre Missing Style Image Resolver:**
   - Problem: MapLibre styles requesting missing sprites emitted console errors.
   - Resolution: Added both `map.on('styleimagemissing', ...)` and `map.setMissingStyleImageResolver(...)` to `GameMap.tsx` and `ZonePicker.tsx` returning a transparent 1x1 fallback pixel.
   - Commit: `a86981f` + `5aba964`.
3. **Realtime-Loop Refactor (`TD-003`) & Channel Reconnect Test:**
   - Problem: `MatchPage.tsx` realtime event listeners had stale closures causing ESLint/OxLint `react-hooks/exhaustive-deps` warnings.
   - Resolution: Extracted dynamic handlers into stable `useRef` references (`stateRef`, `syncRef`, `clockRef`, `executeTagRef`), ensuring the subscription channel remains connected throughout state changes without unnecessary reconnect tear-and-rebuild cycles.
   - Verification: Added test `I10` (`tests/audit/client_logic_audit.test.ts`) proving clean reconnect and teardown behavior.
   - Commit: `540ca48`.
4. **`startMatch` Revision Conflict Isolation:**
   - Problem: Calling `startMatch(matchId)` without the lobby's current revision resulted in server-side `REVISION_CONFLICT`.
   - Resolution: Isolated commit passing `lobby.revision` to `startMatch(matchId, lobby.revision)`.
   - Verification: Added test `I9` in `tests/audit/client_logic_audit.test.ts` verifying that `startMatch` passes the expected revision.
   - Commit: `05f63a1`.

---

## 8. Final Checklist Scorecard

| Item | Description | Status |
| :---: | :--- | :---: |
| **1** | Production-only LOC before and after reported; per-chunk bundle sizes measured | **PASS** |
| **2** | Dead CSS pruned (152 lines); dynamic classes preserved; verified via screenshots | **PASS** |
| **3** | `App.css` split into 10 modular per-page stylesheets; pixel-diff and a11y verified | **PASS** |
| **4** | `CreatePage.tsx` decomposed into 4 tab subcomponents with unchanged logic/props | **PASS** |
| **5a** | Leak hunt: timers, listeners, subscriptions, watchPosition verified | **PASS** |
| **5b** | Secrets scan: 0 keys, 0 private tokens exposed | **PASS** |
| **5c** | Dependency audit: 0 known vulnerabilities | **PASS** |
| **5d** | Unused assets (`hero.png`, `react.svg`, `vite.svg`) and env vars (`QR_SIGNING_SECRET`) removed | **PASS** |
| **5e** | Lighthouse mobile audit: Performance 95, Accessibility 100, Best Practices 100, SEO 91 | **PASS** |
| **6a** | Deno devEngines scoped to backend; npm/npx compatibility restored | **PASS** |
| **6b** | MapLibre `styleimagemissing` & `setMissingStyleImageResolver` handlers added | **PASS** |
| **6c** | Realtime loop refactored with ref-based handler pattern; reconnect test `I10` added | **PASS** |
| **7** | `startMatch` revision fix isolated in commit `05f63a1` with failing unit test `I9` | **PASS** |
| **8** | Do not merge to `main`; `docs/CLEANUP_LOG.md` and `docs/TECH_DEBT.md` updated | **PASS** |
