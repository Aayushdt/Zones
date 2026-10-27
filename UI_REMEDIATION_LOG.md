# UI Remediation Log

This document tracks the step-by-step UI audit, accessibility remediation, performance tuning, and layout hardening of `apps/web` and shared game UI components.

---

## Step 0: Baseline Verification & Environment

- **Branch Created:** `ui/audit-improvements-20261028`
- **Branched From:** `fix/audit-remediation-20261028` (commit `07e6409`, as `fix/audit-remediation-20261028` is not yet merged into `origin/main`).
- **Target Context:** Outdoor real-time mobile tag game, bright sunlight, one-handed touch interactions, 320px–430px primary viewports, 4G / spotty cellular networks, updates every ~2 seconds.

### Code Baseline Table

| Command | Status | Errors / Warnings | Notes |
| :--- | :--- | :--- | :--- |
| `corepack pnpm install --frozen-lockfile` | PASS | 0 errors / 0 warnings | Clean dependency resolution |
| `corepack pnpm typecheck` | PASS | 0 errors / 0 warnings | `tsc -b` and `@xzones/game-core` + `@xzones/web` passed |
| `corepack pnpm lint` (oxlint) | PASS (warnings) | 0 errors / 11 warnings | 11 React Compiler `set-state-in-effect` notices on initial data fetching; 0 `exhaustive-deps` |
| `corepack pnpm test:unit` | PASS | 0 failures (42/42 passed) | Vitest `@xzones/game-core` unit tests |
| `corepack pnpm test:audit` | PASS | 0 failures (33/33 passed) | Rules and client logic audit tests |
| `corepack pnpm build` | PASS | 0 errors / 0 warnings | Clean production build (`chunkSizeWarningLimit: 1200`) |

### Production Bundle Baseline Chunk Sizes (`dist/`)

| Asset / Chunk | Size | Gzip Size | Reachable from Entry? |
| :--- | :--- | :--- | :--- |
| `dist/index.html` | 1.64 kB | 0.75 kB | Yes (HTML Entry) |
| `dist/assets/index-*.css` | 135.74 kB | 22.89 kB | Yes (Global Stylesheet) |
| `dist/assets/index-*.js` | 378.02 kB | 118.43 kB | Yes (Application Entry) |
| `dist/assets/chunk-OB3PAWPO-*.js` | 92.91 kB | 30.83 kB | Yes (Shared vendor chunk) |
| `dist/assets/module-*.js` | 56.36 kB | 16.35 kB | Yes (Shared runtime module) |
| `dist/assets/maplibre-gl-*.js` | 1,074.65 kB | 289.61 kB | No (Lazy-loaded on Map routes) |
| `dist/assets/maplibre-gl-worker-*.js` | 507.71 kB | - | No (Lazy WebGL worker) |
| `dist/assets/CameraScanner-*.js` | 133.46 kB | 49.39 kB | No (Lazy-loaded on Tag route) |
| `dist/assets/MatchPage-*.js` | 30.04 kB | 9.98 kB | No (Lazy route) |
| `dist/assets/SettingsPage-*.js` | 10.93 kB | 3.70 kB | No (Lazy route) |
| Font assets (Inter + JetBrains Mono) | ~340 kB | - | Loaded via CSS (Multiple unneeded language subsets) |

### UI & Performance Lab Baseline (Mobile 4G Throttled)

| Metric | Target | Baseline Measured | Status |
| :--- | :--- | :--- | :--- |
| **Lighthouse Performance Score** | >= 90 | **96 / 100** | PASS |
| **LCP (Largest Contentful Paint)** | <= 2.5 s | **2.3 s** | PASS |
| **CLS (Cumulative Layout Shift)** | <= 0.1 | **0.00** | PASS |
| **TBT (Total Blocking Time)** | <= 200 ms | **10 ms** | PASS |
| **FCP (First Contentful Paint)** | <= 2.5 s | **2.2 s** | PASS |
| **Speed Index** | <= 3.0 s | **2.1 s** | PASS |
| **Total Transferred JS (Initial Entry)** | Minimize | **152 KiB** (gzip) | PASS |
| **Horizontal Overflow (`scrollWidth > clientWidth`)** | 0 at all viewports (320px–1440px) | **0 violations** across 176 screen captures | PASS |
| **axe-core Serious/Critical Violations** | 0 violations | **0 critical/serious**; 4 moderate (`page-has-heading-one`, `heading-order`) | PASS (moderate fixes planned) |
| **Runtime Page Errors in Baseline Flow** | 0 errors | **1 runtime TypeError** (`flatMap` on undefined `result.data.events`) | FAIL (Identified for immediate fix) |

---

## UI Remediation Checklist

- [x] **Step 0:** Setup and baseline (no UI code changes)
- [x] **Step 1:** UI inventory (documentation only)
- [x] **Step 2:** Deep UI analysis (read code + measure + record raw findings in the log)
- [ ] **Step 3:** Write findings into ERRORS.md and IMPROVEMENTS.md (docs only)
- [ ] **Step 4:** Plan the fix batches (docs only)
- [ ] **Step 5:** Responsive and layout foundation
- [ ] **Step 6:** Accessibility
- [ ] **Step 7:** Runtime render performance
- [ ] **Step 8:** Map and HUD performance
- [ ] **Step 9:** Load performance
- [ ] **Step 10:** Visual design and UX polish (within existing design language)
- [ ] **Step 11:** Guardrails so it stays good
- [ ] **Step 12:** Final verification and report update

---

## Step 1 Execution: Comprehensive UI Inventory

### 1. Route, Page, and Component Map

All routes are declared in [`apps/web/src/app/router.tsx`](apps/web/src/app/router.tsx). Route components are code-split using React Router `lazy: async () => import(...)` for secondary routes, while primary entry pages (`HomePage`, `CreatePage`, `JoinPage`, `LobbyPage`) are statically imported in the app bundle.

#### Component Sizing Breakdown (Flagging > ~400 Lines):
- ⚠️ **`apps/web/src/pages/MatchPage.tsx` (853 lines) [FLAGGED > 400 lines]**: Core in-match screen. Renders HUD overlays, clock countdown, compass, tactical item pills (camo/alarm), bottom bar actions, scanner modal, chat modal, controller claim banners, and embeds `<GameMap />`. Re-renders on every clock second and realtime message.
- ⚠️ **`apps/web/src/pages/CreatePage.tsx` (640 lines) [FLAGGED > 400 lines]**: Match configuration screen. Contains tab navigation (`Gameplay`, `Zone`, `Alerts`, `Economy`), presets loader/saver, dynamic shrink timeline generator, and `<ZonePicker />`.
- ⚠️ **`apps/web/src/pages/LobbyPage.tsx` (567 lines) [FLAGGED > 400 lines]**: Pre-match staging screen. Manages team selection (Hunter/Runner), player roster rows, readiness toggles, QR code modal, and keyboard shortcut listeners.
- ℹ️ **`apps/web/src/pages/SettingsPage.tsx` (392 lines)**: App preferences (dusk/paper theme, map styles, haptics, guest name, sound, vibration test, GPS permissions).
- ℹ️ **`apps/web/src/components/GameMap.tsx` (392 lines)**: Dynamic WebGL MapLibre map layer. Manages GeoJSON boundary layers, smooth coordinate interpolation, DOM markers, and offline tactical fallback style.
- Other notable components: `TagPage.tsx` (322 lines), `ZonePicker.tsx` (297 lines), `HomePage.tsx` (284 lines), `GuidePage.tsx` (237 lines), `GpsReadinessBadge.tsx` (235 lines), `CameraScanner.tsx` (171 lines), `LocationSharing.tsx` (135 lines).
- UI Primitives (`apps/web/src/components/ui/`): `HoldButton.tsx` (133 lines), `Slider.tsx` (129 lines), `TeamCard.tsx` (102 lines), `CountdownRing.tsx` (84 lines), `StatusChip.tsx` (74 lines), `PlayerRow.tsx` (71 lines), `Button.tsx` (62 lines), `Input.tsx` (67 lines), `BottomSheet.tsx` (58 lines).

### 2. Styling Approach & Design Tokens

- **Architecture:** Pure Vanilla CSS with centralized CSS custom properties. Zero Tailwind, zero runtime CSS-in-JS.
- **Design Tokens ([`apps/web/src/theme/tokens.css`](apps/web/src/theme/tokens.css)):**
  - **Colors (Dusk Theme - Default):** Tactical dark mode: `--color-background: #000000`, `--color-surface: #060606`, `--color-border: #1F1F1F`. Role colors: `--color-green: #00FF89` (Runner/Ready), `--color-red: #FF3B3C` (Hunter/Danger), `--color-amber: #FFB020` (Zone next shrink), `--color-blue: #38BDF8` (Active boundary).
  - **Colors (Paper Theme):** High-contrast outdoor sunlight mode: `--color-background: #F4F8F5`, `--color-surface: #FFFFFF`, `--color-text: #06130C`, `--color-green: #00834A`, `--color-red: #D91F26`, `--color-amber: #8A5200`, `--color-blue: #0B6FA8`.
  - **Radii:** `--radius-card: 14px`, `--radius-sheet: 20px`, `--radius-control: 12px`, `--radius-chip: 999px`.
  - **Layout & Spacing:** `--space-unit: 4px`, `--page-gutter: 16px` (mobile), `24px` (>=768px), `32px` (>=1024px); `--header-height: 56px`, `--bottom-bar-height: 72px`.
  - **Safe-area Insets:** Applied on `body` (`env(safe-area-inset-top)` / left / right), but fixed bottom bars and floating HUDs in `MatchPage` and `CreatePage` need rigorous safe-area verification for notched displays.
  - **Theming Mechanism:** `data-theme="dusk"|"paper"` attribute on `<html>`. Synchronously initialized in `<head>` inline script in `index.html` to prevent flash of unstyled content (FOUC). Dynamically updates `<meta name="theme-color">`.

### 3. HTML Shell & Head Audit ([`apps/web/index.html`](apps/web/index.html))

- **Viewport Meta:** `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />`.
  - Compliant: Does **not** restrict scaling with `user-scalable=no` or `maximum-scale=1` (conforms to accessibility standards).
  - Includes `viewport-fit=cover` for edge-to-edge mobile rendering.
- **Document Language:** `<html lang="en">` is present.
- **PWA Manifest:** Linked via `/manifest.webmanifest`. Declares icons (192px, 512px) and `display: standalone`.
- **Preload Strategy:** Zero `<link rel="preload">` tags exist in HTML for critical fonts or stylesheets.

### 4. Assets & Icons

- **Fonts:** Loaded via `@import` in [`apps/web/src/theme/fonts.css`](apps/web/src/theme/fonts.css):
  - `@fontsource/inter/index.css`: Imports all language subsets (Vietnamese, Greek, Cyrillic, Latin-ext) and both `.woff` and `.woff2`, resulting in over 18 redundant font files emitted into `dist/assets/` (~340 kB).
  - `@fontsource-variable/jetbrains-mono`: High-contrast variable monospaced font used for HUD timers and metrics.
- **SVGs / Images:** `/contour-grid.svg` (tactical background grid pattern, 1.1 kB), `/favicon.svg` (9.5 kB), PWA icons (192px/512px PNGs).
- **Icons:** `lucide-react`. Imported cleanly as named exports; tree-shaken by Rollup into a shared `createLucideIcon` helper chunk (~3.08 kB).

### 5. Data Flow & Runtime Update Paths

- **Realtime Ingress:** `supabaseGameApi.subscribe(matchId, role, { onEvent })` in `MatchPage` and `PingsPage`. Events gated through `createRealtimeEventGate(role)` and folded via `applyMatchRealtimeEvent(current, payload)`.
- **Update Frequency:**
  - Game server realtime events: every ~2–5 seconds per peer movement fix or scheduled ping.
  - Location sharing watcher: `watchDeviceLocation` emits GPS fixes every 2–6 seconds (using our Step 5 stationary pacing).
  - Clock countdown: `useNow(1000)` / `window.setInterval` updates local ticker every 1,000 ms.
- **Re-render Propagation:**
  - In `MatchPage.tsx`, every 1s clock tick triggers a full re-render of `MatchPage`.
  - In each render, `mapData` and `zone` are instantiated as new object literals, causing `<GameMap />` and its internal `markerPoints` calculation to execute even when coordinates have not moved.

### 6. Map Architecture ([`apps/web/src/components/GameMap.tsx`](apps/web/src/components/GameMap.tsx))

- **Library:** `maplibre-gl` dynamically imported on component mount with dedicated worker `maplibre-gl-worker.mjs`.
- **Map Initialization:** Lazy `Map` instance attached to a container `ref`. Cleaned up on unmount (`map.remove()`).
- **Layers vs Markers:**
  - Zone boundary: GeoJSON polygon source with line and fill layers (`syncZoneLayer`). Efficient vector rendering.
  - Player positions: DOM `Marker` elements with CSS positioning. Coordinates smoothed via `requestAnimationFrame` interpolation.
- **Offline Fallback:** `createTacticalFallbackStyle('dusk'|'paper')` allows the map canvas to render with zero network requests if vector tile servers fail.

### 7. React Compiler & Tooling Evaluation

- **Vite Config ([`apps/web/vite.config.ts`](apps/web/vite.config.ts)):** Configured with `@vitejs/plugin-react` (standard Babel transform). The experimental React Compiler Babel plugin is **NOT** enabled in the build pipeline.
- **Oxlint Rules:** Oxlint runs `react-compiler` checks in linting mode, reporting `set-state-in-effect` notices.
- **Memoization Strategy:** Because the compiler is not auto-memoizing components, component boundaries that receive frequent clock updates (like `GameMap`) must be carefully decoupled from HUD countdown state to prevent unnecessary re-rendering. Blanket `useMemo`/`useCallback` is avoided; targeted component decoupling is preferred.

---

## Step 2 Execution: Deep UI Analysis

Seven deep analysis passes were conducted across the frontend codebase, styles, assets, and runtime profiles:

### Pass A: Responsiveness & Layout
1. **Viewport & Safe Areas:**
   - `apps/web/index.html` correctly uses `width=device-width, initial-scale=1, viewport-fit=cover` without user zoom restrictions.
   - `100dvh` is used consistently across containers (`App.css`, `index.css`, `HomePage.css`, `CreatePage.css`, `LobbyPage.css`).
   - ⚠️ **Defect (UI-E-003):** [`apps/web/src/pages/MatchPage.css`](apps/web/src/pages/MatchPage.css) lacks safe-area insets on fixed HUD overlays:
     - `.hud-top-bar`: `padding: 0.75rem 1rem;` lacks `env(safe-area-inset-top)`. Causes top controls (back, role badge, clock, radio, stealth) to collide with camera notches and the iOS Dynamic Island.
     - `.bottom-sheet`: `padding: 0.75rem 1.25rem 1.5rem;` lacks `env(safe-area-inset-bottom)`. Causes the Hold to Tag button and items tray to collide with the home swipe indicator.
2. **Input Font-Size & iOS Auto-Zoom:**
   - ⚠️ **Defect (UI-E-004):** [`apps/web/src/App.css:484`](apps/web/src/App.css) defines `.form-field__input { font-size: 15px; }`. On iOS Mobile Safari, any input with font size below 16px triggers an automatic viewport zoom when focused, displacing the tactical layout and requiring manual pinch-zoom outdoors. Must be `16px`.
3. **Touch Target Dimensions:**
   - ⚠️ **Defect (UI-E-005):** Several interactive controls fall below the 44x44px mobile touch target standard:
     - [`apps/web/src/pages/LobbyPage.css:42,93`](apps/web/src/pages/LobbyPage.css): `.lobby-back-btn` and `.lobby-settings-btn` are `36x36px`.
     - [`apps/web/src/pages/CreatePage.css:54,128`](apps/web/src/pages/CreatePage.css): `.create-back-btn` and `.game-mode-nav-btn` are `36x36px`.
     - [`apps/web/src/pages/GuidePage.css:28`](apps/web/src/pages/GuidePage.css): `.guide-back-btn` is `36x36px`.
     - [`apps/web/src/App.css:171`](apps/web/src/App.css): `.app-btn--sm` has `min-height: 36px`.

### Pass B: Load Performance
1. **Font Asset Bloat:**
   - ⚠️ **Improvement (UI-I-001):** [`apps/web/src/theme/fonts.css`](apps/web/src/theme/fonts.css) imports `@fontsource/inter/index.css`. This bundles 19 font files (Greek, Cyrillic, Vietnamese, all weights from 100 to 900) totalling ~340 kB in `dist/assets/`. Subsetting to `@fontsource/inter/latin.css` (or specific weights 400, 600, 700, 800) eliminates ~250 kB of unused assets.
2. **Missing Font Preload & Theme-Color Mismatch:**
   - ⚠️ **Improvement (UI-I-003):** [`apps/web/index.html`](apps/web/index.html) lacks `<link rel="preload">` for the primary UI font, risking layout shifts on initial paint. Additionally, the inline script sets `meta[name="theme-color"]` to `#0d0d18` for dusk theme, while `--color-background` is `#000000`, causing a visible split-tone status bar on OLED phones.

### Pass C: Runtime & Render Performance
1. **Realtime Re-render Storm in MatchPage:**
   - ⚠️ **Defect (UI-E-002):** In [`apps/web/src/pages/MatchPage.tsx:193-195`](apps/web/src/pages/MatchPage.tsx), an interval updates `seconds` state every 250 ms, in addition to `useNow(1000)` running on line 77.
   - On every tick, `MatchPage` re-renders and re-instantiates inline object literals:
     - `mapData = view.role === 'RUNNER' ? { ... } : { ... }`
     - `zone = view.zone ? { ... } : undefined`
   - Passing new object references into `<GameMap data={mapData} zone={zone} />` invalidates `useMemo` in `GameMap.tsx:123`, which causes the marker synchronization `useEffect` (line 261) to execute up to 4 times per second. This triggers dynamic `import('maplibre-gl')`, DOM marker updates, and zoom coordinate projections even when no player has moved.
2. **Unhandled TypeError in Sync API:**
   - ⚠️ **Defect (UI-E-001):** In [`apps/web/src/services/supabase-api.ts:388,406`](apps/web/src/services/supabase-api.ts), `result.data.events.flatMap(...)` throws `TypeError: Cannot read properties of undefined (reading 'flatMap')` if the backend or simulator omits `events` or returns `events: undefined`. This caused 16 unhandled page errors during the Playwright baseline capture.

### Pass D: Map & HUD Performance
1. **Map Marker Overhead vs GeoJSON Layers:**
   - `GameMap.tsx` currently renders DOM markers (`pointElement`) for players and snapshots, with RAF coordinate interpolation. For 2–10 players, DOM markers perform adequately; however, marker synchronization must be decoupled from the clock ticker.
2. **Pointer-Events Layering:**
   - `.hud-screen` properly isolates pointer events: `.hud-top-bar` and `.hud-bottom-overlay` have `pointer-events: none` on container wrappers and `pointer-events: auto` on interactive buttons, allowing map gestures (pinch, pan, rotate) to pass through to the MapLibre canvas without obstruction.

### Pass E: Visual Design & UX Consistency
1. **Contrast & Outdoor Readability:**
   - Dusk theme tokens use high-contrast foregrounds (`#FFFFFF`, `#00FF89`, `#FF3B3C`) against pure black (`#000000`), exceeding 7:1 contrast.
   - Paper theme tokens use `#06130C` against `#FFFFFF`/`#F4F8F5` (exceeding 12:1 contrast).
   - `font-variant-numeric: tabular-nums` is globally declared on `body` in `index.css:30`, preventing countdown and distance value jitter.
2. **State Completeness:**
   - Loading skeletons and spinners exist on routes (`MatchPage` radar spinner, `HomePage` radar background).
   - Empty rosters and error states have explicit retry actions (`Retry Link`, `Retry sync`).

### Pass F: Accessibility (axe Scan Findings)
1. **Missing Level-One Headings (axe: `page-has-heading-one`):**
   - ⚠️ **Defect (UI-E-006a):** `HomePage.tsx` lacks an `<h1>` (uses `<Logo />` lockup with `<span>` and jumps directly to `<h2 className="card-title">Enter the Zone</h2>`).
   - ⚠️ **Defect (UI-E-006b):** `LobbyPage.tsx` lacks an `<h1>` (match header has no accessible H1 for screen readers).
   - ⚠️ **Defect (UI-E-006c):** `MatchPage.tsx` HUD lacks an accessible visually hidden `<h1>` identifying the active match screen.
2. **Heading Hierarchy Order (axe: `heading-order`):**
   - ⚠️ **Defect (UI-E-006d):** In [`apps/web/src/pages/GuidePage.tsx:108`](apps/web/src/pages/GuidePage.tsx), step cards use `<h3>` directly beneath the page `<h1>How to play</h1>`, skipping `<h2>`.
3. **Role-Data Security Audit:**
   - Confirmed: No hidden runner coordinates or role-leaking titles exist in DOM attributes, tooltips, or aria-labels. Hunter snapshots correctly preserve staleness and obfuscation without exposing live coordinates of camouflaged players.

### Pass G: UI Code Quality
1. **Component Line Count Flags:**
   - `MatchPage.tsx` (854 lines): High complexity combining HUD overlays, map rendering, radar modals, audio cues, item triggers, and polling sync.
   - `CreatePage.tsx` (640 lines): Multi-tab form with dynamic shrink calculations.
   - `LobbyPage.tsx` (567 lines): Team staging and readiness management.
2. **Timer Redundancy:**
   - In `MatchPage.tsx`, both `useNow(1000)` and a 250ms `setInterval` for `setSeconds` run concurrently. They can be unified and encapsulated in a dedicated `<HudTimer />` component.

---

### Needs Verification & Risk Watchlist
- **Map GeoJSON Transition:** Migrating player markers entirely from DOM elements to a GeoJSON symbol layer would reduce DOM nodes, but may impact smooth 60fps CSS/RAF coordinate interpolation. Verify if prop stabilization alone resolves all map re-render overhead before altering marker architecture.
- **Font Subsetting:** Verify that removing non-Latin Inter subsets does not break rendering for player display names containing international Unicode characters. (Standard Latin + Latin-ext covers all typical game names).

