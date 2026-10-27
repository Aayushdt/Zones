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
- [ ] **Step 1:** UI inventory (documentation only)
- [ ] **Step 2:** Deep UI analysis (read code + measure + record raw findings in the log)
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
