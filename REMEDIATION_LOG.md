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

## Remediation Checklist

- [x] **Step 0:** Setup and baseline (no code changes)
- [ ] **Step 1:** Triage all 13 findings (documentation only)
- [ ] **Step 2:** Deno tooling and CI (E-001 + I-003, merged)
- [ ] **Step 3:** MatchPage timers and status state (E-002 + E-005, solved together)
- [ ] **Step 4:** GameMap center (E-003) + bundle analysis (I-001)
- [ ] **Step 5:** Location uploads (E-004 + I-004)
- [ ] **Step 6:** CameraScanner (E-006 + I-007)
- [ ] **Step 7:** Haptics (I-006)
- [ ] **Step 8:** Host presets cloud sync (I-005), GATED
- [ ] **Step 9:** Offline map tiles (I-002), GATED
- [ ] **Step 10:** Gap audit of what the reports did not cover
- [ ] **Step 11:** Final verification and report update
