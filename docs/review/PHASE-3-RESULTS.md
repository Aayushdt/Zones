# Phase 3 Functional Verification Results

## Executed checks

| Check | Actual result | What it establishes |
|---|---|---|
| `corepack pnpm test:unit` after adding `packages/game-core/src/review.test.ts` | **PASS: 4 files, 23 tests** | Exhaustive 797,148 role assignments; readiness; all bounded active team-count outcome combinations and deadline ties; >30,000 schedule combinations; 20,000 seeded geometry samples; seeded ping merge and deny-by-default role projection.
| `corepack pnpm test:audit` | **PASS: 2 files, 25 tests** | Existing focused rules and client-logic audit cases.
| `corepack pnpm test:api` | **PASS: 12 Edge tests + 11 hostile tests** | Edge router behavior against mocked database/auth/Realtime dependencies, including malformed requests, role checks and selected errors. Not a live deployed endpoint.
| `corepack pnpm verify:payloads` | **PASS: 2 tests** | Captured declared events for both roles; Runner receives no Hunter pings/live Hunter positions; hidden fields stripped; stale/no-fix pings strip coordinates.
| `corepack pnpm exec deno test tests/review/privacy-leak-check_test.ts` | **PASS: 1 test** | Deliberately injected `hunter_lat` fixture is caught by the review checker; normal projected role-safe state passes. Product code untouched. The existing payload verifier denylist was expanded with additional Hunter/opponent fields and rerun.
| R-01 regression (`tests/review/stale-event-reproduction_test.ts`) | **PASS: 1 test** | Initially reproduced the missing event before the fix. Afterward confirms one same-team private `location.stale` event appears in sync and Realtime, shares a deduplicable event ID, and contains no coordinates. Client reducer audit test confirms it marks the existing teammate stale. |
| `corepack pnpm test:sim` | **PASS: 1 test** | Existing deterministic three-player simulator lobby fixture only. Does not verify a full match simulation.
| `corepack pnpm build` | **PASS** | TypeScript production build and Vite bundle completed. Vite emitted its generic >500 kB uncompressed chunk warning. The MapLibre chunk is ~1.07 MB uncompressed / 289.61 kB gzip, within the plan's 350 kB gzip map/scanner budget; the initial app bundle was ~109 kB gzip, within the 250 kB budget.
| `corepack pnpm lint` | **EXIT 0 with warnings** | Oxlint reported React effect/dependency warnings in MatchPage, HeadStartPage, TagPage, PingsPage, GameMap, LobbyPage.
| `corepack pnpm test:db` | **PASS** | Temporary native PostgreSQL instance ran the migration chain, schema/lifecycle smoke suite, and all 14 audit SQL scenarios (F-01/F-05/F-06/F-07, Realtime-topic authorization, lifecycle, tag/ping and cleanup scenarios). This is native PG with a Supabase shim, not the hosted Supabase Realtime/Auth/Edge service.
| `corepack pnpm test:e2e` | **PASS: 4 tests** | Onboarding guest flow and confirmations, theme/map-style persistence across reload, malformed join-code validation, and offline banner recovery. This does not exercise every control or the full multiplayer flow.
| `corepack pnpm test:all` aggregate (rerun with local-server/database permission) | **PASS** | Unit 23, audit 25, API 12 Edge + 11 hostile, payload 2, simulator 1, Playwright 4, and all 14 SQL audit scenarios passed. Vite printed an optimizer ENOENT warning for the Supabase package path, but all browser tests completed successfully.
| Coverage (`vitest --coverage.provider=v8`) | **NOT RUN** | `@vitest/coverage-v8` is not installed. No lockfile/root dependency was changed.
| Mutation testing (`stryker`) | **NOT RUN** | Stryker is not installed; package manager/network access is unavailable for isolated download.
| Real Supabase Realtime/Auth/RLS/Edge and live Vercel | **UNVERIFIED in this pass** | No fresh real-stack integration result was executed here. Mocked Edge tests and the native PG Supabase shim do not establish hosted Realtime/Auth/Edge behavior.

## Explicit gaps / conflicts

- `docs/review/FUNCTION-REGISTRY.md` inventories 217 rows from source declarations, SQL declarations, route matchers, event projector cases, store actions, and JSX control patterns. Static scanning can miss multi-line JSX controls and non-DOM gestures; these remain unverified until the remaining controls/keyboard paths are swept; four focused Playwright tests did run and pass.
- `docs/review/STATE-MATRIX.csv` emits 490 state × action × actor expectations. It is a contract matrix only; full state/action/actor matrix is unverified; selected SQL scenarios did execute successfully against native PostgreSQL with the Supabase shim. Some entries are conditional because section 22 requires validation of membership, revision, timing, and capability.
- The task asks for snapshot count equal to every elapsed ping slot, while XZones section 22 explicitly coalesces several missed ping slots into one latest snapshot per Runner. This review follows the product rule: one snapshot per Runner for each processed sync index, no duplicates or early snapshots; missed, unprocessed slots do not each create historical snapshots. The DB assertion helper is designed accordingly.
- The task asks for no location columns outside latest_fix and snapshots, while schema section 24 intentionally stores the fixed zone center as `matches.zone_lat/zone_lon`. The checker treats zone center configuration separately from player-location rows.
- The existing simulator only creates a deterministic 3-player lobby fixture. It is not a stateful match engine, so the requested 500 randomized end-to-end matches and 45-minute 12-bot run would be a fabricated model rather than product verification; left **UNVERIFIED**.
- Full SQL parity, permissions/grants, concurrency races, every API error/schema, UI loading/error/offline states per role, all controls/keyboard paths, QR decode/camera, host loss, and retention were not comprehensively exercised. See each `UNVERIFIED` row in the registry.
- **R-01 (LOW): FIXED and verified locally.** Stale fixes now emit one stable-ID, coordinate-free `location.stale` event only to the syncing player's role topic; the client reducer applies the stale flag to an existing teammate marker. Mocked router and client tests pass. Live Supabase delivery remains covered by the separate open F-02 integration limitation.
- Existing report `error.md` labels Realtime F-02 as open/pending; no new F-02 claim is made here. Refer to it as **KNOWN F-02** until a current real-stack run is recorded.

## Files added for this review

- `docs/review/FUNCTION-REGISTRY.md` — source-derived registry and per-unit status.
- `docs/review/STATE-MATRIX.csv` — expected 490-case authorization/transition matrix, not yet executed.
- `docs/review/PHONE-ONLY-CHECKS.md` — real Android HTTPS checks and report template.
- `tests/review/assert-invariants.ts` — read-only SQL invariant probe; type-checked but not executed against a fixture DB.
- `tests/review/privacy-leak-check_test.ts` — leak-checker negative fixture.
- `tests/review/stale-event-reproduction_test.ts` — R-01 regression test (the test name retained its historical filename).
- `packages/game-core/src/review.test.ts` — exhaustive/seeded rule tests.
