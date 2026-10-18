# Game Logic Audit Fix Log

## Step 0 — baseline and regression tracking

- **Base:** `audit/game-logic` at `adb6035`; working branch: `fix/audit-findings`.
- **Install:** `corepack pnpm install --frozen-lockfile --store-dir /tmp/xzones-pnpm-store` passed with pnpm 12.14.0. The default configured store path is read-only in this environment, so the install used a temporary writable store.
- **Baseline checks:** `corepack pnpm test:unit` passed (15); `corepack pnpm test:edge` passed (11); `corepack pnpm verify:payloads` passed (2); `corepack pnpm test:sim` passed (1); `corepack pnpm typecheck` passed (including production build); `corepack pnpm lint` exited 0 with existing React hook warnings; `corepack pnpm test:all` passed (15 unit + 11 edge + 2 payload + 1 simulator + 4 Playwright).
- **Audit baseline:** `bash scripts/run-audit.sh` passed as a harness against native PostgreSQL 18.6 and reported F-05 and F-06 as defect-confirming scenarios. Existing audit Vitest passed (15 rules + 6 client); Deno hostile audit passed (8). These audit tests currently document several defects as passing observations rather than asserting the required behavior.
- **Database environment:** the audit runner successfully started its isolated native PostgreSQL test cluster after running with socket permission. This is not the real Supabase stack and does not verify Edge runtime/Auth/Realtime.
- **Findings known at baseline:** F-01 through F-13 remain open. F-01/SG-02 outcome reason parity, F-02 broadcasts, F-03 Ping Off, F-04 config cross-validation, F-05 QR advancement, F-06 end retry, F-07 team balance, F-08 captured-fix age, F-09 join-attempt rate limit, F-10 location rate limit, F-11 host removal, F-12 wake lock, and F-13 watcher lifecycle are not fixed. SG-01 ping count prose mismatch and SG-03 zone consequence remain decisions to apply as specified in the task.
- **Regression setup:** converted F-03, F-04, and F-07 to expected-correctness checks; added F-01 simultaneous-elimination SQL coverage, F-05 QR-after-head-start coverage, F-06 end retry coverage, and F-11 host-removal API coverage. `test:all` includes unit, audit, API, privacy, simulator, browser, and fresh-database checks. The DB script creates and removes an isolated temporary PostgreSQL cluster; local OS permissions may require elevated execution for PostgreSQL sockets.

## Step 0 verification

- Commands run: frozen install; baseline unit, edge, payload, simulator, typecheck, lint, full `test:all`, `scripts/run-audit.sh`, `pnpm test:api`, `pnpm test:db`, and `git diff --check`.
- Baseline result: all pre-existing project checks passed. New red tests reproduce F-01/F-05/F-06 in PostgreSQL; the other ten SQL scenarios pass. API tests reproduce F-03/F-04/F-11; the existing edge API suite passes 11/11. The F-07 expected-correctness regression is also red in `test:audit` (15 rule tests + 6 client tests, one targeted failure).
- The remaining audit tests for F-02, F-08–F-10, and F-12–F-13 will be added with their focused implementation steps where the required behavior and test harness can be exercised together. F-09/F-10 remain defect-observation checks at baseline, not claimed fixes.
- Step 0 regression baseline is ready to commit; its known red assertions are intentional and scoped to unresolved findings.

## Step 1 — outcome parity

- **Changed:** SQL resolution now checks Runner count first both during lazy resolution and player leave; simultaneous team emptying awards Hunters the match. Final-Runner tagging and timer expiry use the shared `ALL_RUNNERS_TAGGED_OR_LEFT` and `TIME_LIMIT` reasons. Recorded the simultaneous-resolution precedence in `docs/DECISIONS.md`.
- **Check:** `corepack pnpm test:db` confirms F-01 PASS and the other 10 scenarios PASS; only the still-open F-05/F-06 regression scenarios fail. The same run also passes migration and lifecycle smoke checks, including canonical timer reason. `corepack pnpm test:audit` still fails only the unrelated, intentionally pending F-07 check (20/21 pass). `corepack pnpm test:api` passes the existing Edge suite (11/11) and fails only expected open F-03/F-04/F-11 cases (6/9 hostile audit checks pass).
- **Commit:** `0739254` (`fix: align match outcome precedence and reasons`).

## Step 2 — shared configuration validation and Ping Off

- **Changed:** Added shared match timing validation used by the API; omitted Ping Off normalizes to null. The create form now exposes an Off option. Added migration 010 to constrain active-round length and ping timing at the DB boundary, and updated the create RPC to accept Ping Off. SQL smoke covers valid Ping Off, insufficient active time, and ping-after-round rejection.
- **Check:** `pnpm test:unit` passed (16). `pnpm test:api` passed existing Edge tests (11) and hostile checks for F-03/F-04; only open F-11 is red (8/9 hostile tests pass). Fresh DB migrations and schema/lifecycle smoke passed; only outstanding F-05/F-06 audit cases are red (11/13 audit SQL scenarios pass).
- **Commit:** pending.
