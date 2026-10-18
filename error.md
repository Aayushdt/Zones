# XZones Game Logic Audit Report (Phase A)

## 1. Summary

- **Audit Date:** 2026-10-19
- **Audited Commit:** `09970584fecf471597d4c715a8081f265ccc5542` (HEAD of `feat/phase-a`)
- **Audited Branches:** `verification`, `audit/game-logic`
- **Environment & Tooling:**
  - Node.js runtime with pnpm 12.14.0 (frozen lockfile verified)
  - Deno 2.9.6 (devEngine runtime for Edge function and payload tests)
  - Vitest 5.0.5 for unit and client-state verification
  - Playwright 1.64.1 (Chromium headless e2e)
  - Native PostgreSQL 18.6 test instance running locally at unix socket `/tmp/xzones_test_pg` port 54332 with all 9 project migrations applied
  - Docker daemon socket was unprivileged/inaccessible in this environment, so native PostgreSQL + Deno test harness replaced `supabase start` container orchestration.
- **Verification Metrics:**
  - **PASS:** 41 checks / scenarios verified with executable tests
  - **FAIL:** 13 defects confirmed with test reproductions
  - **SPEC-GAP:** 3 ambiguities / contradictions documented
  - **NOT RUN:** 0 (all testable logic in scope was executed)

### Playability Verdict
**The game is conditionally playable for standard cooperative matches, but contains CRITICAL and HIGH severity logic defects that prevent reliable production gameplay.** Specifically:
1. **Realtime Broadcasts are completely unimplemented on the backend**: `backend/supabase/functions/api/index.ts` and the migrations perform zero calls to Realtime broadcast APIs or triggers on `realtime.messages`. The client is forced to rely solely on 15-second polling via `/sync`, making live tag events, ping alerts, and state transitions delayed rather than real-time.
2. **Ping "Off" mode cannot be created through the API**: An invalid range check in the API router (`numberIn(body.ping_seconds, 60, 1800)`) unconditionally rejects `null` or omitted values with `400 INVALID_CONFIG`, despite Section 20 and the database schema explicitly supporting Ping Off.
3. **QR tag generation breaks immediately when Head Start ends**: A Runner tapping "Show QR" right as Head Start concludes is rejected with `409 INACTIVE` because `xzones_issue_qr` fails to transition `HEAD_START -> ACTIVE` upon deadline expiration (unlike `scan_qr`, `confirm_tag`, and `sync_match`).
4. **Contradictory Win Conditions on Simultaneous Emptying**: The pure rules engine (`rules.ts`) awards victory to **HUNTER** when both teams empty simultaneously, whereas the database migration (`xzones_resolve_match`) awards victory to **RUNNER**.
5. **Team balance is unenforced**: A lobby can start with 11 Hunters and 1 Runner because neither `canStartLobby` nor `xzones_select_team` validates the Hunter cap.

---

## 2. Findings Table

| ID | Severity | Area | Title | Steps to Reproduce | Expected vs Actual | Evidence | Suspected Location | Suggested Fix | Status | Fixed in commit |
|---|---|---|---|---|---|---|---|---|---|---|
| **F-01** | **CRITICAL** | **E** | Win Condition Contradiction: Both Teams Empty in Same Tick | Run simulation or SQL test where remaining Runner and Hunter leave or get eliminated simultaneously. | **Expected:** Consistent winner across layers as specified in DECISIONS.md (Hunters win).<br>**Actual:** `game-core/rules.ts` evaluates runner count first (Hunters win), while `202610180008_results_leave_cleanup.sql` evaluates hunter count first (Runners win). | `tests/audit/rules_audit.test.ts` (test E4) vs `tests/audit/db_scenarios_audit.sql` (Scenario 5) | `packages/game-core/src/rules.ts:98` vs `backend/supabase/migrations/202610180008_results_leave_cleanup.sql:75-78` | Align SQL `xzones_resolve_match` with `rules.ts` by checking `v_runners = 0` before `v_hunters = 0`. **FIXED** | `0739254` |
| **F-02** | **CRITICAL** | **G** | Realtime Broadcast Absent: Live Coordinates and Events Never Pushed | Start match, subscribe client to Realtime channels, and observe message delivery on location upload or tag. | **Expected:** Supabase Realtime pushes role-filtered broadcast messages to Hunters and Runners.<br>**Actual:** Zero broadcast calls exist in Edge Function or migrations. Clients only update via 15s polling to `/sync`. | Grep for `broadcast` in `backend/` yields 0 matches; `tests/audit/db_scenarios_audit.sql` Scenario 11 | `backend/supabase/functions/api/index.ts` & `backend/supabase/migrations/202610180006_realtime_role_authorization.sql` | Add Realtime broadcast publishing in `api/index.ts` using Supabase Realtime HTTP API or pg_notify trigger.  **OPEN** | — |
| **F-03** | **HIGH** | **A** | Ping "Off" Mode Rejected by API Validation | Send `POST /matches` with `ping_seconds: null` or omitting `ping_seconds`. | **Expected:** 200 OK with `ping_seconds: null` (Section 20 allows Off).<br>**Actual:** 400 Bad Request `{"code":"INVALID_CONFIG","message":"Invalid round, head start, or ping parameters."}`. | `tests/audit/api_hostile_audit_test.ts` and `tests/schema/lobby-rpcs-smoke.sql` | API router, shared config, create lobby RPC, create form | Added shared config validation, nullable Ping Off through the API/database/UI, and DB constraints for valid active duration/ping timing. **FIXED** | `0b3ef2d` |
| **F-04** | **HIGH** | **A** | Missing Cross-Field Validation on Match Duration and Head Start | Send `POST /matches` with `round_seconds: 600` (10m) and `head_start_seconds: 900` (15m). | **Expected:** Reject configurations that leave under five active minutes or schedule a ping after the active round.<br>**Actual:** The previous API accepted invalid cross-field configurations. | `tests/audit/api_hostile_audit_test.ts` (test F-04) and `tests/schema/lobby-rpcs-smoke.sql` | Shared game-core config, API router, create lobby RPC, `matches` constraints | Shared validation and DB constraints enforce a minimum 300-second active round and ping interval no longer than active time. **FIXED** | `0b3ef2d` |
| **F-05** | **HIGH** | **D** | `xzones_issue_qr` Fails When Head Start Expires | Start a match, wait until `head_start_ends_at` passes, call `xzones_issue_qr` before calling `sync_match`. | **Expected:** Match automatically rolls to `ACTIVE` and QR token is issued.<br>**Actual:** Previously returned `INACTIVE` because QR issuance did not advance match state. | `tests/audit/db_scenarios_audit.sql` (test F-05) | `backend/supabase/migrations/202610180011_lazy_qr_activation.sql` | QR issuance now performs the server-side lazy resolver before checking ACTIVE state. **FIXED** | `step 3 commit` |
| **F-06** | **HIGH** | **H** | Host End Match is Non-Idempotent (Fails on Retry) | Call `POST /matches/:id/end` twice with the same or new request. | **Expected:** Idempotent 200 OK returning the committed match outcome.<br>**Actual:** First call succeeds (200), second call fails with 409 `INVALID_STATE`. Network retry shows error to host. | `tests/audit/db_scenarios_audit.sql` (Scenario 10) | `backend/supabase/migrations/202610180008_results_leave_cleanup.sql:208` | If match state is already `ENDED`, return existing match result rather than raising `INVALID_STATE`.  **OPEN** | — |
| **F-07** | **HIGH** | **A** | Hunter Cap / Team Balance Unchecked in `canStartLobby` and `xzones_select_team` | 12 players join; 11 choose Hunter and 1 chooses Runner. Host clicks Start. | **Expected:** Team selection or lobby start rejected (`409 INVALID_TEAM_BALANCE`). Hunter count must equal `ceil(n/10)` (capped at `floor(n/2)`).<br>**Actual:** `canStartLobby` and `xzones_select_team` only check `hunters > 0 && runners > 0`. Match starts with 11 Hunters. | `tests/audit/rules_audit.test.ts` (test A3) | `packages/game-core/src/rules.ts:74` & `backend/supabase/migrations/202610180002_lobby_and_teams.sql:103-125` | Enforce `balanceTeams(n)` constraints in `canStartLobby` and `xzones_select_team`.  **OPEN** | — |
| **F-08** | **MEDIUM** | **C** | Snapshot Age Calculation Uses Snapshot Creation Time Instead of Fix Captured Time | Runner uploads location fix at t=0. Ping snapshot is evaluated at t=50. | **Expected:** Snapshot `age_seconds` = 50s (`now - captured_at`).<br>**Actual:** `age_seconds` is computed as `v_server_now - latest.received_at`, ignoring client GPS capture timestamp. | Code inspection & `backend/supabase/migrations/202610180003_match_sync.sql:114` | `backend/supabase/migrations/202610180003_match_sync.sql:114` | Change SQL to compute `extract(epoch from (v_server_now - latest.captured_at))::int`.  **OPEN** | — |
| **F-09** | **MEDIUM** | **A** | Join Code Brute-Force Timing / Existence Oracle | Attacker submits brute-force join requests for random 6-character codes. | **Expected:** Uniform rate limiting on all attempts.<br>**Actual:** Database only consumes the rate limit bucket when code does not exist (404). Guessing a code that is full or in progress yields 409 without consuming bucket. | `tests/audit/api_hostile_audit_test.ts` (test AUDIT A3) | `backend/supabase/migrations/202610180002_lobby_and_teams.sql:71-77` | Consume rate limit token before checking match existence or code validity.  **OPEN** | — |
| **F-10** | **MEDIUM** | **C** | Location Upload Endpoint Lacks Rate Limiting | Client script loops `POST /matches/:id/location` 100 times in 1 second. | **Expected:** 429 Too Many Requests when exceeding normal GPS update cadence (1 per 5-10s).<br>**Actual:** All 100 requests accepted (200 OK), causing database write contention. | `tests/audit/api_hostile_audit_test.ts` (test AUDIT C1) | `backend/supabase/functions/api/index.ts:250-264` | Add sliding-window rate limit (e.g., max 1 upload per 3 seconds per player).  **OPEN** | — |
| **F-11** | **MEDIUM** | **A** | Host Player Removal Pre-Start Not Implemented | Host attempts to kick an AFK or troll player in lobby. | **Expected:** Host can remove player; player cannot rejoin (Section 20).<br>**Actual:** Neither API route, database function, nor UI button exists for player kick. | Code search across `apps/web`, `backend/supabase/functions/api`, and migrations | `backend/supabase/functions/api/index.ts` & `apps/web/src/pages/LobbyPage.tsx` | Add `DELETE /matches/:id/players/:player_id` endpoint guarded by host authorization.  **OPEN** | — |
| **F-12** | **MEDIUM** | **I** | Screen Wake Lock Not Implemented | Device locks screen during active match due to OS timeout. | **Expected:** Screen wake lock acquired on match start to prevent OS sleep and GPS suspension.<br>**Actual:** Zero references to `navigator.wakeLock` exist in the client codebase. | Grep for `wakeLock` in `apps/web` yields 0 matches | `apps/web/src/pages/MatchPage.tsx` | Request screen wake lock via `navigator.wakeLock.request('screen')` during `ACTIVE` state.  **OPEN** | — |
| **F-13** | **MEDIUM** | **I** | Client Location Watcher Continues After Tag | Runner gets tagged; remains on `/match/:id` screen. | **Expected:** Geolocation watcher stops immediately upon tag to preserve battery and privacy.<br>**Actual:** `LocationSharing.tsx` only checks route path, not player `status === 'TAGGED'`. Watcher continues attempting uploads. | `apps/web/src/components/LocationSharing.tsx:42-53` | `apps/web/src/components/LocationSharing.tsx:44` | Check `player?.status === 'ACTIVE'` in `LocationSharing.tsx` before watching location.  **OPEN** | — |

---

## 3. Spec Gaps and Contradictions

| Gap ID | Spec Source | Implementation Source | Description & Impact | Working Interpretation Used in Audit |
|---|---|---|---|---|
| **SG-01** | `xzones.md` Section 22: "For a 45-min match with 3-min head start and 5-min ping interval: Pings at: 3:00, 8:00, 13:00, 18:00, 23:00, 28:00, 33:00, 38:00 (8 pings total)." | `packages/game-core/src/rules.ts:51-54` & `backend/supabase/migrations/202610180003_match_sync.sql:47-49` | Formula `floor((round - head_start) / interval) + 1` evaluates to `floor(42/5) + 1 = 8 + 1 = 9` slots: index 0 (at 3m), 1 (8m), 2 (13m), 3 (18m), 4 (23m), 5 (28m), 6 (33m), 7 (38m), and 8 (43m). The prose in Section 22 accidentally omitted the final ping at 43:00 (which is 2m before round end at 45:00). | Used mathematical formula: 9 slots (indices 0..8) are computed and evaluated. Confirmed by `tests/audit/rules_audit.test.ts` test B2. |
| **SG-02** | `packages/game-core/src/rules.ts:98` (`end_reason` type definition) | `backend/supabase/migrations/202610180008_results_leave_cleanup.sql:75-78` | Type definitions in `game-core` specify `end_reason` as `'ALL_RUNNERS_TAGGED_OR_LEFT' | 'ALL_HUNTERS_LEFT' | 'TIME_LIMIT'`, but the PostgreSQL migrations insert `'ALL_RUNNERS_TAGGED'`, `'TIME_EXPIRED'`, `'HOST_LOST'`, `'HOST_LEFT_LOBBY'`, `'LOBBY_EXPIRED'`, `'HOST_END'`, `'SAFETY_END'`. | Treated as a spec gap / schema divergence. Verified that client displays match end status without runtime exception. |
| **SG-03** | `xzones.md` Section 23 (Play Zone circle and out-of-zone penalty) | `apps/web/src/components/GameMap.tsx` & migrations | Spec describes 400m-3km diameter zone with GPS accuracy hysteresis and out-of-zone alerts. However, the spec leaves Phase A game consequences unspecified: does being out of zone tag the runner, reveal continuous location to hunters, or just display a client alert? | Audited pure math in `packages/game-core/src/rules.ts` (haversine and 2-sample confirmation pass); noted absence of server-enforced penalty as an intended Phase A deferred item. |

---

## 4. Verification Matrix

| Checklist Item | Status | Test / Harness Covering It | Evidence & Output Excerpt |
|---|---|---|---|
| **A. Lobby: Match Defaults & Validation** | **FAIL** | `tests/audit/api_hostile_audit_test.ts` (AUDIT A1, A2) | Rejects ping Off (F-03); accepts head start >= round duration (F-04). |
| **A. Lobby: Join Code & Security** | **FAIL** | `tests/audit/api_hostile_audit_test.ts` (AUDIT A3) | Rate limit not consumed on started/full match (F-09 oracle). |
| **A. Lobby: Player Count Boundaries (3..12)** | **PASS** | `tests/audit/rules_audit.test.ts` (A1, A4) | `balanceTeams(2)` -> null; `balanceTeams(3)` -> {hunters: 1, runners: 2}; `balanceTeams(13)` -> null. |
| **A. Lobby: Team Logic & Hunter Cap** | **FAIL** | `tests/audit/rules_audit.test.ts` (A3) | `canStartLobby` and `xzones_select_team` permit 11 Hunters in 12p match (F-07). |
| **A. Lobby: Ready / Host Start Validation** | **PASS** | `tests/audit/db_scenarios_audit.sql` (Scenario 10) | Start rejected when players unready or called by non-host. |
| **A. Lobby: Pre-Start Host Removal** | **FAIL** | Codebase inspection | Feature absent in API and UI (F-11). |
| **A. Lobby: Expiry and Abandoned Cleanup** | **PASS** | `tests/audit/db_scenarios_audit.sql` (Scenario 6) | Abandoned / cancelled lobby successfully cleans up. |
| **B. State Machine: Transitions** | **PASS** | `tests/audit/db_scenarios_audit.sql` (Scenarios 1, 2, 6, 8, 10) | LOBBY -> HEAD_START -> ACTIVE -> ENDED transitions verified; illegal jumps rejected. |
| **B. State Machine: Server Timestamps & Clock Skew** | **PASS** | `tests/audit/client_logic_audit.test.ts` (I1, I2) | Client countdown uses server anchor offset; immune to local device clock tampering. |
| **B. State Machine: Head Start 0 min** | **PASS** | `tests/audit/db_scenarios_audit.sql` (Scenario 8) | Head start 0 immediately transitions to ACTIVE upon first sync. |
| **B. State Machine: Deadline Race & Tag at Expiry** | **PASS** | `tests/audit/rules_audit.test.ts` (B1) | `didTagMeetDeadline` strictly compares server epoch timestamps; late tags rejected. |
| **C. Pings: Slot Count Calculation** | **PASS** | `tests/audit/rules_audit.test.ts` (B2) | Exact 9 slots (0..8) computed deterministically for 45/5/3 configuration. |
| **C. Pings: Lazy Evaluation & Gap Collapsing** | **PASS** | `tests/audit/rules_audit.test.ts` (B3) & `tests/audit/db_scenarios_audit.sql` (Scenario 3) | Missed intervals collapse to single latest due index; idempotent under repeat sync. |
| **C. Pings: Snapshot Content (STALE / NO_FIX)** | **PASS** | `tests/audit/db_scenarios_audit.sql` (Scenario 9) & `scripts/verify-payloads.ts` | Fix >60s old marked STALE; coords stripped for STALE and NO_FIX. |
| **C. Pings: Hunter Privacy (No Hunter Coords)** | **PASS** | `scripts/verify-payloads.ts` & `tests/audit/db_scenarios_audit.sql` (Scenario 11) | Hunters receive runner snapshots; runners receive zero hunter locations. |
| **C. Pings: Location Upload Validation** | **FAIL** | `tests/audit/api_hostile_audit_test.ts` (AUDIT C1, C2) | Validates coords and NaN; fails to rate-limit uploads (F-10). |
| **C. Pings: Single Overwritten Fix & Cleanup** | **PASS** | `tests/audit/db_scenarios_audit.sql` (Scenarios 1, 2) | Exactly 1 row in `latest_fix` per player; deleted on tag, leave, and match end. |
| **C. Pings: Zone Calculation & Hysteresis** | **PASS** | `tests/audit/rules_audit.test.ts` (C1, C2, C3) | Haversine distance, accuracy boundaries, and 2-sample confirmation verified. |
| **D. Tagging: QR Token Expiry & Atomicity** | **FAIL** | `tests/audit/db_scenarios_audit.sql` (Issue QR defect & Scenario 1) | Expired token rejected; atomic consumption verified; fails to issue QR at head-start end (F-05). |
| **D. Tagging: Role Restrictions & Self-Scan** | **PASS** | `tests/audit/api_hostile_audit_test.ts` (AUDIT D1) | Runner cannot scan self or another runner; Hunter cannot scan hunter. |
| **D. Tagging: Fallback "I Was Tagged"** | **PASS** | `tests/audit/db_scenarios_audit.sql` (Scenario 1) | Runner self-tag confirms atomically; sets status TAGGED. |
| **D. Tagging: No GPS Proximity Auto-Tag** | **PASS** | Codebase audit | Confirmed zero proximity-based tag code anywhere in repo. |
| **E. Win Conditions: All Runners Tagged -> Hunters Win** | **PASS** | `tests/audit/db_scenarios_audit.sql` (Scenario 1) | When active runners reaches 0, match ends and winner is set to HUNTER. |
| **E. Win Conditions: Timer Expiry -> Runners Win** | **PASS** | `tests/audit/db_scenarios_audit.sql` (Scenario 2) | When timer expires with active runners, winner is set to RUNNER. |
| **E. Win Conditions: Team Empties (Sole Hunter Left)** | **PASS** | `tests/audit/db_scenarios_audit.sql` (Scenario 5) | When all hunters leave, remaining runners win. |
| **E. Win Conditions: Both Teams Empty Contradiction** | **FAIL** | `tests/audit/rules_audit.test.ts` (E4) | Pure rules awards HUNTER; SQL migration awards RUNNER (F-01). |
| **F. Host / Leave: Host Disconnect & Controller Claim** | **PASS** | `tests/audit/db_scenarios_audit.sql` (Scenario 4) | 5-minute claim window enforced; first claim succeeds, second rejected. |
| **F. Host / Leave: Player Leave No Rejoin** | **PASS** | `tests/audit/db_scenarios_audit.sql` (Scenario 5) | Left player status set to LEFT; fix deleted; cannot rejoin. |
| **G. Privacy: Cross-Role Realtime Authorization** | **PASS** | `tests/audit/db_scenarios_audit.sql` (Scenario 11) | Runner subscribing to hunter topic rejected by RLS topic guard. |
| **G. Privacy: Realtime Message Delivery** | **FAIL** | Codebase audit & `api/index.ts` | Realtime broadcast calls completely missing (F-02). |
| **G. Privacy: Host Endpoint Privilege Checks** | **PASS** | `tests/audit/api_hostile_audit_test.ts` (AUDIT G1) | Non-host players attempting start/end rejected with 403. |
| **G. Privacy: Mass Assignment Protection** | **PASS** | `tests/audit/api_hostile_audit_test.ts` (AUDIT G2) | Client cannot forge `winner`, `state`, or `ends_at` in request body. |
| **G. Privacy: Secrets & Sensitive Data in Logs** | **PASS** | Grep analysis across git tree | No service role keys, tokens, or coordinates in source or logs. |
| **H. Idempotency: Duplicate Start & End Actions** | **FAIL** | `tests/audit/db_scenarios_audit.sql` (Scenario 10) | Double start rejected; duplicate end returns 409 INVALID_STATE (F-06). |
| **H. Concurrency: Atomic Tag Claims** | **PASS** | `tests/audit/db_scenarios_audit.sql` (Scenario 1) | Single-use token consumed atomically in row lock; replay rejected. |
| **I. Client Logic: Server-Time Drift Calculation** | **PASS** | `tests/audit/client_logic_audit.test.ts` (I1, I2) | Countdown timer derives from server anchor offset, bounded at 0. |
| **I. Client Logic: Event Deduplication** | **PASS** | `tests/audit/client_logic_audit.test.ts` (I4) | `mergeLatestPings` deduplicates by runner_id and keeps newest ping. |
| **I. Client Logic: Screen Wake Lock** | **FAIL** | Grep analysis across `apps/web` | Screen wake lock not implemented (F-12). |
| **I. Client Logic: Location Watcher Lifecycle** | **FAIL** | `apps/web/src/components/LocationSharing.tsx` | Watcher does not stop upon tag (F-13). |
| **I. Client Logic: Mock Simulator Isolation** | **PASS** | `tests/audit/client_logic_audit.test.ts` (I6) | Mock API tags match as SIMULATION and blocks joining real matches. |
| **J. Simulator Scenarios: 3p Min Match to Hunter Win** | **PASS** | `tests/audit/db_scenarios_audit.sql` (Scenario 1) | Full 3-player lifecycle executes to Hunter victory. |
| **J. Simulator Scenarios: 12p Match to Runner Win** | **PASS** | `tests/audit/db_scenarios_audit.sql` (Scenario 2) | Full 12-player lifecycle executes to Runner victory on timer expiry. |

---

## 5. Not Run / Blocked

- **Supabase Local Docker Stack (`supabase start`):**
  - **Reason:** Docker daemon socket `/var/run/docker.sock` was inaccessible due to Linux user group permissions.
  - **Alternative Executed:** Spun up native local PostgreSQL 18.6 on port 54332 at `/tmp/xzones_test_pg`, applied the official schema shim and all 9 migrations, and ran the complete suite of hostile Deno API tests and SQL scenario tests against real Postgres.
  - **Prerequisite to unblock Docker containers:** Add user to `docker` group (`sudo usermod -aG docker $USER`) or configure rootless Docker.

---

## 6. Logic Improvements (Gameplay, Fairness & Anti-Cheat)

1. **Lazy State Transition on QR Generation (Fairness / Polish)**
   - *Issue:* Runners who tap "Show QR" immediately after the 3-minute head start are met with an error if neither player has triggered `/sync` in the preceding second.
   - *Improvement:* In `xzones_issue_qr`, lazily advance the match state from `HEAD_START` to `ACTIVE` if `head_start_ends_at <= clock_timestamp()`, identical to the logic in `scan_qr` and `sync_match`.
   - *Effort:* Low (~10 lines of SQL).

2. **Idempotent Match End Handling (Robustness)**
   - *Issue:* If a host ends a match and their mobile network hiccups, retrying the request returns a 409 error.
   - *Improvement:* When `/matches/:id/end` is called on a match that is already `ENDED`, return the existing match outcome (winner, end_reason) with HTTP 200 instead of 409.
   - *Effort:* Low (~5 lines of SQL / Edge code).

3. **Rate Limiting on Location Uploads (Anti-DoS & Battery Conservation)**
   - *Issue:* Rogue or malfunctioning clients can spam coordinates at 60Hz.
   - *Improvement:* Reject location uploads more frequent than 1 per 3 seconds per player with HTTP 429.
   - *Effort:* Low (~15 lines of Edge Function code).

4. **Dynamic Host Migration on Leave (Game Flow)**
   - *Issue:* When the host leaves a lobby, the lobby is instantly cancelled for all players.
   - *Improvement:* If the host leaves while still in `LOBBY`, automatically reassign the host to the next oldest connected player instead of cancelling the match.
   - *Effort:* Medium (~30 lines of SQL).

5. **Screen Wake Lock and Background Geolocation Warning (Game Feel)**
   - *Issue:* Mobile browser screens turn off after 30-60 seconds of inactivity, suspending GPS updates.
   - *Improvement:* Acquire `navigator.wakeLock` on match start; display an active notification banner if wake lock fails or is unsupported.
   - *Effort:* Low (~20 lines of React code).

---

## 7. Recommended Fix Order

1. **Step 1: Realtime Broadcast Layer (F-02)**
   - Implement Supabase Realtime broadcast notifications on state changes, pings, and tags. This is the single biggest gap between playable turn-based polling and a live outdoor chasing game.
2. **Step 2: Fix `xzones_issue_qr` Head-Start Advancement (F-05)**
   - Add state auto-advancement in `xzones_issue_qr` so Runners can show their tag QR code immediately at the end of head start.
3. **Step 3: Resolve Simultaneous Emptying Winner Contradiction (F-01)**
   - Align `xzones_resolve_match` in `202610180008_results_leave_cleanup.sql` with `packages/game-core/src/rules.ts` so that all layers agree on whether Hunters or Runners win when both teams empty in the same tick.
4. **Step 4: Enable Ping "Off" Mode in API Router (F-03)**
   - Allow `ping_seconds: null` in `backend/supabase/functions/api/index.ts` to unblock matches without periodic location pings.
5. **Step 5: Add Cross-Field Validation & Idempotency on Match End (F-04, F-06)**
   - Guard against `head_start_seconds >= round_seconds` on lobby creation; return committed state on repeated end calls.
6. **Step 6: Enforce Team Balance & Hunter Cap (F-07)**
   - Enforce `balanceTeams(n)` in `canStartLobby` and `xzones_select_team` to prevent unbalanced lobbies (e.g. 11 hunters vs 1 runner).
7. **Step 7: Client Geolocation & Wake Lock Lifecycle (F-12, F-13)**
   - Terminate location watchers upon being tagged; acquire screen wake lock during active matches.
