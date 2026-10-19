# XZones game verification report

## Verdict

**Can a group of friends play a complete match today? NO — this pass did not prove that a group can complete one.** Local and CI checks verify implementation pieces, but no end-to-end real match was run with the required UI, database, per-role Realtime and negative-case evidence.

## Summary and status counts

- Verified base: `88b59d79bd704b2c654d5eb7631582c44dc57449` (`fix/review-findings`); verification branch: `verify/gameplay`.
- Environment: clean local clone for install/typecheck/lint/unit/build; production Vite preview for mobile Chromium smoke. Local Docker socket was inaccessible. PR [#11](https://github.com/Aayushdt/Zones/pull/11) is open and not merged. Its first `verify` and `supabase-realtime` jobs succeeded; another run for the latest push is in progress.
- Requested gameplay matrix: 68 G steps and 10 full-match journeys.
- Status totals: **PASS 0; PASS-WITH-WORKAROUND 0; FAIL 0; BLOCKED 78; PHONE-ONLY 1 checklist**. G1.1 has UI-only observations but remains BLOCKED under the all-channel pass rule. The separate verification harness passed 3/3 and existing Playwright smoke passed 4/4; neither counts as a complete gameplay step.
- No `V-xx` app finding was confirmed. No application failure was reproduced under real-backend gameplay conditions. Environment blockers are not misreported as product failures.
- No product source, migrations or existing product config were changed. Verification code is under `tests/e2e-verify/`; evidence/report is under `docs/verification/` and this file.

## Step-by-step results

A gameplay step is PASS only when the observed UI, before/after database state, role-specific received traffic and negative case all match. **BLOCKED** means that evidence was not obtained, not that the product necessarily failed.

| ID | Expected behavior | How run | Roles checked | Actual result | Status | Evidence |
|---|---|---|---|---|---|---|
| G1.1 | Clean profile loads Home without console/page errors or a location prompt. | dedicated Playwright test `launch.spec.ts` | one unauthenticated mobile guest context only | One mobile Home context rendered; 0 geolocation API calls; 0 console errors and 0 page errors. No match request/DB row or per-role traffic was exercised. | **BLOCKED** | [Home screenshot](docs/verification/screens/G1.1/home-mobile.png); [redacted request/response log](docs/verification/screens/G1.1/home-mobile.traffic.json) |
| G1.2 | Home has the XZones wordmark, tagline, guest and code-join entry points; excludes accounts/sign-in, other modes and public games. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G1.3 | Guest name rejects empty/overlong/unsafe input; 18+ is required; safe-play/privacy dialogs open and close by keyboard. | existing `tests/e2e/app.spec.ts` | one browser context; not every applicable role | Existing 4-test Playwright suite covered selected UI portions (guest validation, malformed code, theme persistence, offline notice); no DB/role traffic or full negative matrix. | **BLOCKED** | CI `verify` job; no per-step capture |
| G1.4 | Reload preserves the guest session; clearing storage creates a new guest identity. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G2.1 | Create defaults are 45-minute round, 3-minute head start, 5-minute ping and zone Off. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G2.2 | Round/head-start/ping/zone controls operate within specified bounds; helper text is correct. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G2.3 | Invalid and cross-field configurations are blocked both in UI and server API. | existing `tests/e2e/app.spec.ts` | one browser context; not every applicable role | Existing 4-test Playwright suite covered selected UI portions (guest validation, malformed code, theme persistence, offline notice); no DB/role traffic or full negative matrix. | **BLOCKED** | CI `verify` job; no per-step capture |
| G2.4 | Create succeeds; code is six characters; copy/share work; host enters lobby; persisted config and units match. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G3.1 | Valid code joins 2–11 additional players; lowercase and surrounding whitespace normalize. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G3.2 | Invalid, expired, full, started and cancelled codes return their specified errors. | existing `tests/e2e/app.spec.ts` | one browser context; not every applicable role | Existing 4-test Playwright suite covered selected UI portions (guest validation, malformed code, theme persistence, offline notice); no DB/role traffic or full negative matrix. | **BLOCKED** | CI `verify` job; no per-step capture |
| G3.3 | Repeated bad joins rate-limit and later recover. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G3.4 | Same session cannot duplicate membership; duplicate display names are handled. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G3.5 | Every existing client receives roster changes within two seconds. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G4.1 | Hunter/Runner/Random preferences and target team counts are correct for lobby sizes 3–12. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G4.2 | Every player can ready and unready; roster state synchronizes. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G4.3 | Host can configure/remove/start; removed player cannot rejoin. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G4.4 | Start denies too few players, empty team, unready roster and non-host with a clear reason. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G4.5 | Leave/join updates counts and reasons live. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G4.6 | Host lobby leave follows the documented ownership/claim behavior. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G4.7 | Lobby cancel/expiry cleanup removes the intended state and location data. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G4.8 | Lobby does not disclose opponent information. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G5.1 | Host start puts all clients into the same state with identical finalized roles and DB state. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G5.2 | Double-tap Start is idempotent. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G5.3 | Start behavior with a disconnected player is correct. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G5.4 | Role reveal shows the correct role, rules reminder and next action. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G6.1 | Server-clock countdown agrees across clients within one second and ignores device clock skew. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G6.2 | Location explanation precedes permission; grant, deny/recovery and mid-match revoke work. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G6.3 | Runner can move/share during head start; Hunter receives no Runner data. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G6.4 | Wake lock or clear unsupported warning; hide/background state is communicated. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G6.5 | Zero head start skips directly to ACTIVE. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G6.6 | All clients transition at server head_start_ends_at. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G7.1 | HUD timer/counts/mode and own marker/accuracy circle are correct; map controls and sheet snap work. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G7.2 | Only same-team live teammates appear/move; latency and labels are checked. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G7.3 | Stale and low-accuracy own-fix indicators are clear. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G7.4 | Zone ring and advisory warning work only when enabled; Off shows none. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G7.5 | Players sheet exposes only allowed fields; no opponent distance/eye controls. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G7.6 | Text status mirrors key map events for assistive technology. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G8.1 | Ping schedule is correct (45/5/3 gives 9 slots at 3..43 min); Off produces no pings and is explained. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G8.2 | Hunters receive one age-labelled snapshot per active Runner with OK/NO_FIX/STALE; tagged/left excluded. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G8.3 | Runner receives location-shared notice but no Hunter data. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G8.4 | Next-ping timer/history are correct; duplicate sync events do not duplicate snapshots/animation; reload retains history. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G8.5 | Offline missed slots collapse according to the lazy-sync rule. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G9.1 | Runner QR clearly explains one-use 60-second expiry and regeneration. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G9.2 | Hunter scan covers permission, success, wrong match, expiry, replay and manual fallback. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G9.3 | Tag atomically consumes one token, removes Runner fix/sharing, updates counts/notices and shows role-correct state. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G9.4 | Runner self-report works only for that Runner in ACTIVE; Hunter cannot use it. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G9.5 | Head-start/end/self/other-team/tagged-left/two-Hunter race negatives are enforced; exactly one QR race winner. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G9.6 | Exact GPS proximity alone never tags. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G10.1 | Confirmed leave updates counts/outcomes and deletes fix; player cannot rejoin. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G10.2 | Offline/online banner and recovery work without duplicate actions. | existing `tests/e2e/app.spec.ts` | one browser context; not every applicable role | Existing 4-test Playwright suite covered selected UI portions (guest validation, malformed code, theme persistence, offline notice); no DB/role traffic or full negative matrix. | **BLOCKED** | CI `verify` job; no per-step capture |
| G10.3 | Reload restores role, timers, map and ping history. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G10.4 | Host disconnect supports five-minute claim, first claimant, limited powers and no-claim auto-end; explicit leave handled. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G10.5 | Back/deep-link/member/non-member/second-tab behavior is correct. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G10.6 | Background/visibility stops and restarts geolocation watcher correctly. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G11.1 | All Runners tagged/left -> Hunters win. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G11.2 | Round deadline with an active Runner -> Runners win. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G11.3 | All Hunters leave -> Runners win; simultaneous empties follow server decision rule. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G11.4 | Host/safety end and lobby/mid-match cancel work. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G11.5 | Deadline/tag race follows server time. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G11.6 | Results show winner/duration/tag count without routes; Home/New lobby work. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G11.7 | After end sharing/subscriptions stop, fixes delete, non-member is denied, metadata/snapshots expire by seven days. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G12.1 | Display name/theme/map style/haptics persist; privacy/safe-play/version and confirmed leave/end work. | existing `tests/e2e/app.spec.ts` | one browser context; not every applicable role | Existing 4-test Playwright suite covered selected UI portions (guest validation, malformed code, theme persistence, offline notice); no DB/role traffic or full negative matrix. | **BLOCKED** | CI `verify` job; no per-step capture |
| G12.2 | No broken Low Battery or Satellite options are exposed. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G13.1 | Manifest/install/update/offline work; service worker does not cache authenticated data or secrets. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G13.2 | Keyboard path, focus, names, reduced motion, contrast, touch targets, 320px layout and safe areas meet requirements. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G13.3 | Every visible control performs the advertised action; dead controls are listed. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G13.4 | Dusk and Paper journeys match the design board subject to section 21 corrections. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |
| G13.5 | No unexpected console errors, unhandled rejections or failed requests across journeys. | not run | not checked | Not executed; no match was connected to the new harness. Required DB, role-specific traffic and negative-case evidence are absent. | **BLOCKED** | — |

## Full-match journeys

| ID | Required journey | Run | Status | Result / invariants |
|---|---|---|---|---|
| J1 | 3 players; real-time minimum config; Hunters tag both Runners. | Not run; real Supabase integration was not attached to this gameplay harness. | **BLOCKED** | No final result or invariant evidence. |
| J2 | 12 players; accelerated round; Runners win at timer; verify nine pings and volume. | Not run; real Supabase integration was not attached to this gameplay harness. | **BLOCKED** | No final result or invariant evidence. |
| J3 | Mixed tags/leaves/removal/late join/offline missed slots/STALE/NO_FIX snapshots. | Not run; real Supabase integration was not attached to this gameplay harness. | **BLOCKED** | No final result or invariant evidence. |
| J4 | Ping Off and zone Off match to completion. | Not run; real Supabase integration was not attached to this gameplay harness. | **BLOCKED** | No final result or invariant evidence. |
| J5 | Host disconnect then claim/end; separate no-claim auto-end. | Not run; real Supabase integration was not attached to this gameplay harness. | **BLOCKED** | No final result or invariant evidence. |
| J6 | Lobby cancel, mid-match cancel and lobby expiry. | Not run; real Supabase integration was not attached to this gameplay harness. | **BLOCKED** | No final result or invariant evidence. |
| J7 | Head start 0 and 15 minutes with 30-minute round. | Not run; real Supabase integration was not attached to this gameplay harness. | **BLOCKED** | No final result or invariant evidence. |
| J8 | All players reload, disconnect 30 seconds, return; no state loss/duplicates. | Not run; real Supabase integration was not attached to this gameplay harness. | **BLOCKED** | No final result or invariant evidence. |
| J9 | Second hands-off six-player real-time run. | Not run; real Supabase integration was not attached to this gameplay harness. | **BLOCKED** | No final result or invariant evidence. |
| J10 | Hostile forged/wrong-role/replay/topic-subscription script alongside normal match. | Not run; real Supabase integration was not attached to this gameplay harness. | **BLOCKED** | No final result or invariant evidence. |

## Latency

| Event | Target | Median / worst | Status |
|---|---|---|---|
| Lobby/roster change | <= 2 s | Not measured | BLOCKED |
| Match state change | <= 2 s | Not measured | BLOCKED |
| Tag result | <= 2 s | Not measured | BLOCKED |
| Live teammate position | <= 3 s | Not measured | BLOCKED |
| Scheduled ping | <= 3 s after slot | Not measured | BLOCKED |

## Privacy proof

- **Canary:** PASS. The harness injected a fake `{type: "match.state", hunter_lat, hunter_lon}` payload into a Runner receive record; the guard threw the expected error.
- **Gameplay-harness role capture:** BLOCKED. No match was connected to the new player harness, so the full per-step/per-role matrix remains unproven.
- **Existing CI real-stack integration:** PASS for its limited fixture. GitHub Actions run [39220318924, `supabase-realtime`](https://github.com/Aayushdt/Zones/actions/runs/39220318924) started the Supabase stack and API Edge Function; its integration script exercised four anonymous players, private role topics and denied subscriptions, Runner/Hunter payload filtering, scheduled Hunter ping delivery, tag and leave revocation, and checked that a coordinate was not persisted in `realtime.messages`. This is API/Realtime fixture evidence, not UI-driven full-match proof.
- **`realtime.messages`:** CI queried the table for the fixture coordinate and asserted it was absent. The repeat job for the latest commit was still in progress when recorded.
- Host information limits, Hunter ping-only Runner positions, non-member denial, and tagged/left unsubscribe remain unproven here.
- Committed traffic logs redact values and sensitive URL parameters. Full HAR/trace output stays in `/tmp/xzones-gameplay-artifacts/` and is not committed.

## Findings, controls and visual comparison

- **V-xx findings:** none confirmed. The initial sandboxed Chromium launch was blocked by the environment; the same tests passed when Chromium could launch. This is not a product finding.
- **Dead controls:** Not exhaustively swept. Existing smoke tests exercised selected guest confirmation, theme/map-style persistence, incomplete join-code validation, and offline status behavior. They do not prove every visible control is functional.
- **Accessibility:** No complete keyboard, screen-reader, contrast, reduced-motion or touch-target audit. Only a 412x915 Home view was captured; 320/360/tablet and Paper-theme journeys are unverified.
- **UI board mismatches:** No complete cross-screen comparison was performed, so no mismatch is asserted from the Home-only screenshot.

## Environment and commands

See [Stage 0 environment record](docs/verification/STAGE-0-ENVIRONMENT.md). Actual results:

- Frozen-lockfile clean install: pass, 126 packages.
- `corepack pnpm typecheck`: pass; production build completed.
- `corepack pnpm lint`: exit 0 with React hook/dependency warnings.
- `corepack pnpm test:unit`: 4 files, 23 tests pass.
- `corepack pnpm --filter @xzones/web build`: pass; generic large-chunk warning.
- `corepack pnpm test:e2e` in clean clone: 4/4 pass. React Router emitted a `HydrateFallback` console warning; no complete journey assertions were made.
- `playwright test --config=tests/e2e-verify/playwright.config.ts`: 3/3 pass (mobile Home/no-geolocation smoke, privacy canary, harness module load).
- `SUPABASE_TELEMETRY_DISABLED=1 corepack pnpm exec supabase start`: locally blocked, Docker socket permission denied.
- PR #11 first GitHub Actions run: `verify` succeeded in 1m55s and `supabase-realtime` succeeded in 3m41s. The latter started Supabase, served the Edge Function and ran `pnpm test:realtime-integration` successfully. The repeat run for the latest commit was in progress when recorded. Existing workflow does not invoke `tests/e2e-verify/` or upload gameplay artifacts.

## Not run / what is needed next

1. Check the latest PR #11 `supabase-realtime` result. The prior run succeeded for the current integration fixture, not the G/J matrix.
2. For full gameplay verification, enable Docker socket access for this user and run local Supabase, or provide a CI workflow/job that runs the gameplay harness against ephemeral Supabase and uploads compact artifacts. This pass did not modify workflow configuration because configuration changes were prohibited.
3. Run each G group and J journey with separate actors, DB inspection and per-role traffic capture. Commit each group/journey only after its checks pass or record its actual failure.
4. Run the [real-phone checklist](docs/verification/PHONE-ONLY.md) over HTTPS. Real GPS, camera, background, battery, haptics and mobile network tests cannot be inferred from emulation.
