# Progress Tracker — Hide & Seek Web Implementation

| Step | Title | Classification (from P0) | Status | Evidence | Gate result | Closes | Notes |
|---|---|---|---|---|---|---|---|
| 0.1 | Baseline verification (install, typecheck, lint, test) | ABSENT | DONE | `docs/verification/baseline.md` | PASS — install, typecheck/build, lint, all 4 E2E tests, and 14 DB scenarios | - | Supabase-hosted Realtime and real-device GPS are not locally verifiable |
| 0.2 | Triage error.md defects & fix open Critical/High | PARTIAL | DONE | `docs/verification/audit-triage.md`; `error.md`; `docs/KNOWN-ISSUES.md` | Baseline suite PASS; F-02 real Supabase integration remains unverified | - | Referenced `full_audit_report.md` is absent; F-02 implementation exists and must retain Realtime-first behavior |
| 0.3 | Verify unverified audit claims (session, watchPosition, Wake Lock) | PARTIAL | DONE | `docs/verification/client-lifecycle-audit.md`; `apps/web/src/stores/app-store.ts:7-30`; `apps/web/src/components/LocationSharing.tsx:37-96`; `apps/web/src/services/device-lifecycle.ts:35-67` | `corepack pnpm test:audit`: PASS, 25/25 | - | GPS watcher resume and iOS installed-PWA behavior need Step 4.1/device verification; Safari support corrected from official notes |
| 0.4 | Create hideAndSeekConfig.ts & hide-and-seek-spec.md | ABSENT | TODO | - | - | - | Centralized config & design spec |
| 0.5 | Existence inventory (1.1–6.8 P0 checks) | ABSENT | TODO | - | - | - | docs/verification/already-implemented.md |
| 1.1 | Player limits: MIN 2, MAX 100 in rules, RPCs, lobby, UI | TBD (0.5) | TODO | - | - | D01, A1, A2 | Foundation & scale |
| 1.2 | Team balance: hunter count 1..floor(N/2), remove equality block | TBD (0.5) | TODO | - | - | - | Flexible team setup |
| 1.3 | Throttled/scheduled xzones_cleanup (out of per-request path) | TBD (0.5) | TODO | - | - | - | Cleanup throttling |
| 1.4 | Realtime-first sync & 30-45s jittered fallback | TBD (0.5) | TODO | - | - | - | Sync optimization |
| 1.5 | Request budget documentation | TBD (0.5) | TODO | - | - | - | docs/design/request-budget.md |
| 1.6 | GameMap: update markers/zone in place, easeTo/flyTo | TBD (0.5) | TODO | - | - | D15, D19 | Map rendering fix |
| 1.7 | Fix module-level mutable state in LocationSharing | TBD (0.5) | TODO | - | - | D20 | Concurrency fix |
| 1.8 | 100-player 10-minute load test & verification | TBD (0.5) | TODO | - | - | - | Simulator test |
| 2.1 | Pure function zoneAt in game-core with unit tests | TBD (0.5) | TODO | - | - | - | Deterministic zone calculation |
| 2.2 | Migration + lobby validation for shrink config | TBD (0.5) | TODO | - | - | - | Shrink parameters |
| 2.3 | Host zone picker on map (drag/radius/use my location) | TBD (0.5) | TODO | - | - | D14 | Zone picker UI |
| 2.4 | Server uses zoneAt for location uploads & resolution | TBD (0.5) | TODO | - | - | - | Server zone enforcement |
| 2.5 | Client zone visualization (current, next preview, timer) | TBD (0.5) | TODO | - | - | - | Zone UI |
| 2.6 | Accuracy-aware zone exit (2 samples -> reveal, 120s -> eliminate) | TBD (0.5) | TODO | - | - | - | Zone enforcement |
| 2.7 | Timer-off option (roundSeconds = null) | TBD (0.5) | TODO | - | - | D07 | Unlimited match length |
| 3.1 | Location plausibility checks & suspicious_events log | TBD (0.5) | TODO | - | - | - | Anti-cheat / GPS spoof deterrent |
| 3.2 | Server GPS tag RPC with allowance & drift | TBD (0.5) | TODO | - | - | - | Core tag mechanic |
| 3.3 | QR fallback max distance check (100m) & runner surrender | TBD (0.5) | TODO | - | - | - | QR anti-relay |
| 3.4 | Concurrency & race tests for tags, surrender, timer | TBD (0.5) | TODO | - | - | - | Atomic tag tests |
| 3.5 | Stationary hider detection (<15m for 300s -> reveal) | TBD (0.5) | TODO | - | - | - | Anti-camping rule |
| 3.6 | Hunter Tag button UI with feedback & 3-phone test script | TBD (0.5) | TODO | - | - | - | Hunter UI + planned pause |
| 4.1 | watchPosition re-acquisition on visibility/pageshow/error | TBD (0.5) | TODO | - | - | - | Web resilience |
| 4.2 | Stealth screen with Wake Lock & long-press exit | TBD (0.5) | TODO | - | - | - | Stealth mode |
| 4.3 | Host inactivity threshold (180s, ignore hidden tab) | TBD (0.5) | TODO | - | - | - | Host drop tolerance |
| 4.4 | Session-based rejoin for active players | TBD (0.5) | TODO | - | - | - | Rejoin flow |
| 4.5 | Delete ping_snapshots on match finish & privacy tests | TBD (0.5) | TODO | - | - | D10 | Privacy enforcement |
| 4.6 | Display-only GPS smoothing for own marker | TBD (0.5) | TODO | - | - | - | Client GPS smoothing |
| 4.7 | Service worker caching & PWA icons/manifest | TBD (0.5) | TODO | - | - | D16, D17 | PWA assets & caching |
| 5.1 | Chat (lobby all, match team-only, 280 chars) | TBD (0.5) | TODO | - | - | - | In-game chat |
| 5.2 | Presets: save/load/delete host settings in localStorage | TBD (0.5) | TODO | - | - | - | Host presets |
| 5.3 | Rules/guide screen for Hide & Seek | TBD (0.5) | TODO | - | - | - | Guide UI |
| 5.4 | Bug report entry table & edge function route | TBD (0.5) | TODO | - | - | - | Feedback mechanism |
| 6.1 | Items framework: schema, toggle, activation skeleton | TBD (0.5) | TODO | - | - | - | Items engine |
| 6.2 | Hunter Scan item | TBD (0.5) | TODO | - | - | - | Item: Scan |
| 6.3 | Hunter Proximity Alarm item | TBD (0.5) | TODO | - | - | - | Item: Alarm |
| 6.4 | Hunter Zone Mover item | TBD (0.5) | TODO | - | - | - | Item: Zone Mover |
| 6.5 | Runner Decoy item | TBD (0.5) | TODO | - | - | - | Item: Decoy |
| 6.6 | Runner Zone Shield item | TBD (0.5) | TODO | - | - | - | Item: Shield |
| 6.7 | Runner Camouflage item | TBD (0.5) | TODO | - | - | - | Item: Camouflage |
| 6.8 | Ghost Mode deferred documentation | TBD (0.5) | TODO | - | - | - | docs/design/ghost-mode-deferred.md |
| F.1 | Final report (parity, closed D-IDs, tuning table, script) | TBD (0.5) | TODO | - | - | - | docs/FINAL-REPORT.md |
