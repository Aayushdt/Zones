# XZones: Build-Ready Implementation Plan

## Changelog
- Reframed for a part-time hobbyist, 3–12 friends, and a $0-first playable slice.
- Added build-ready architecture, schema/RLS, API, UI, simulator, and implementation order.
- Resolved latest-fix contradiction with one overwritten row per player, deleted at tag/leave/end.
- Tightened role visibility: Hunters get scheduled Runner snapshots only; Runners never receive Hunter data.
- Added Dusk/Paper design and UI-board crosswalk; corrected account/public/clue/safe-zone/satellite concepts.
- Fixed zone-off default to Off and documented total-match-fraction shrink timing.
- Added host migration, ping idempotency, cleanup, and explicit match-state transitions.
- Added leave-driven win rules, ping status/coalescing, host controller fields, rate limits, and active team counts.
- Standardized zone diameter at UI/API boundaries; added HTTPS, single-router, function-quota, and board-copy plan notes.
- Removed the obsolete two-weekends checklist; sections 19–29 are authoritative; renamed the plan XZones.

## Decisions I made for you
- Supabase Free + Edge Functions; latest_fix is one overwritten row, never a trail.
- Hunter sync polls every 15 seconds; every API call also evaluates due pings.
- Anonymous Auth session, no user-facing account; hashed match capability revoked on leave/end.
- Zustand for preferences and role-safe match state; local React state for transient UI.
- 60-second, single-use opaque QR; Runner confirmation is camera-denied fallback.
- Dusk/Paper only; PMTiles preferred if free terms fit; no satellite or Low Battery Mode.
- First valid host migration claim within five minutes gets end/cancel only; else auto-end with no winner.
- UI board supplied by the user is the design reference; Part 21 crosswalk applies its corrections.

## Assumptions and evidence labels
- One part-time developer; personal hobby for groups of 3–12 in parks/campus; prioritize playable quickly and $0 recurring cost.
- Responsive PWA first; Android APK via GitHub Releases in Phase B. No Play track; iOS out of scope.
- **Documented in SCRAM** means a developer-published claim in the research report, not verified runtime behavior. **Our own design decision** means a proposed rule/default. HideZone does not fill SCRAM gaps.
- XZones is the project name; use original assets/copy and check name availability before public use.
- Plan only: no code, UI mockups, installation steps, or project changes.
- Free-tier limits, prices, personal-use eligibility, and plugin maintenance can change; confirm items marked **verify before relying**.

## 1. Product vision and success criteria
**Vision:** safe outdoor hide-and-seek with scheduled, age-labelled clues and clear role visibility. Friends play in permitted public areas, each on their own phone. Host plays without extra information.

### Success criteria
- Create/join by code and balanced teams for 3–12 players.
- Head start and age-labelled scheduled Runner snapshots.
- Server owns timer, pings, zone checks, tag outcomes.
- Hidden coordinates never reach unauthorized clients.
- GPS proximity never counts as tag; primary tag is in-person QR.
- Delete live coordinates at match end; retain no routes.
- Phase A works with phone in hand/screen awake; Phase B tests lock-screen tracking.

### Product stages
| Stage | Scope |
|---|---|
| **Phase A playable slice** | PWA lobby/code, teams, ready/start, head start, scheduled pings, role-filtered live teammate positions while active, QR/fallback tag, timer, win/lose, cleanup. |
| **Phase B** | Capacitor Android and foreground location service only after slice is fun; signed APK via Actions/Releases. |
| **Deferred until the slice is fun** | Shrinking zone, Radio, spectating, reconnect polish, report/block/moderation, accessibility pass, presets, Google Play. |
| **Out of scope** | Other modes, powers, replay sharing, monetization, public launch, iOS, route history. |

## 2. Complete rules specification
Defaults are **Our own design decisions** unless marked. SCRAM claims are not runtime verification.

### Lobby and teams
- Minimum three separate phones — **Documented in SCRAM**. Hobby maximum 12 — **Our own design decision**.
- Six-character code — length **Documented in SCRAM**; confusing-character alphabet and 24-hour expiry are **Our own design decisions**. Private code only; rate-limit invalid attempts.
- Hunter/Runner/Random — **Documented in SCRAM**. Random fills the team needing players.
- At least one Hunter per ten players and Hunters never outnumber Runners — **Documented in SCRAM**, exact formula unknown.
- Slice formula: Hunters = ceil(players/10), at least one, capped at floor(players/2); others are Runners. Three players yield 1/2; twelve yield 2/10. Thus minimum works. **Our own design decision.** Manual choices allowed only if both sides nonempty and constraints hold.
- Before start, leaving causes rebalance. Empty side means “needs teams” and blocks start; fewer than three also blocks start. **Our own design decision.**
- All ready; host starts with at least three and both teams. Host may configure/start/remove pre-start/end for safety, with no location privilege. Rules lock at start. Mostly **Our own design decision**; SCRAM documents pre-start removal and host end.

### Match settings
| Setting | Range / behavior | Default | Evidence |
|---|---|---|---|
| Round | 10 min–3 h | 45 min | Range/sample **Documented in SCRAM**; default own decision. |
| Head start | 0–15 min | 3 min | Range/sample **Documented in SCRAM**; default own decision. |
| Ping | 1–30 min or Off | 5 min | Range/sample **Documented in SCRAM**; Off documented by Play listing; default own decision. |
| Zone | Off or 400 m–3 km circle | Off | Range **Documented in SCRAM**; default own decision. |
| Shrink | Optional, 60-sec warning | Deferred | High-level behavior **Documented in SCRAM**. |
| Later shrink schedule | Fixed at 50% and 75% elapsed; each diameter becomes 70% of prior, same center | Not in slice | **Our own design decision.** For 60 min: warn 29/shrink 30, warn 44/shrink 45; fixed to total duration, not remaining time. |
| Zone off | Anywhere, no out-of-zone rule | Off | Behavior **Documented in SCRAM**; default own decision. |

### Head start and pings
- Runners get head start; no Hunter Runner snapshots during it — **Documented in SCRAM**.
- First ping at head-start end, then intervals — **Our own design decision**. Schedule is deterministic from start time.
- Whenever a client syncs/relevant event arrives, server computes due pings and emits each once; no cron needed. Snapshot latest valid Runner fix and label age — **Documented in SCRAM** in substance.
- Over-60-second fix is stale, not fresh — **Our own design decision**. Notify Runner when ping is sent — **Documented in SCRAM**.

### Zone and out-of-zone
- Zone off/fixed/shrink — **Documented in SCRAM** generally; shrink deferred. Warn 60 seconds before shrink — **Documented in SCRAM**.
- Outside more than 30 seconds makes Runner live-visible to Hunters until re-entry — **Documented in SCRAM**; no elimination.
- **Our own design decision:** use haversine circle distance. Reveal only when beyond boundary by more than reported accuracy for two valid samples; poor accuracy/overlapping uncertainty does not start timer. Warn Runner first; two inside samples end reveal. No PostGIS.

### Tagging, outcomes, leave
- Primary tag: in-person Hunter scans Runner’s short-lived, match-bound QR; server validates active roles/match and tags. **Our own design decision.** A GPS proximity match never counts.
- Runner “I was tagged” confirmation is fallback. No Hunter proximity claim or host dispute flow in slice. Server enforces freshness/idempotency.
- Tagged Runner is out and stops sharing — **Documented in SCRAM**; spectating deferred.
- Hunters win when all Runners are tagged or have explicitly left; Runners win when all Hunters have explicitly left, or when the timer expires with an active Runner — **Our own design decision** extending the documented all-tagged/timer outcomes. On a leave, evaluate zero active Hunters first (Runners win), then zero active Runners (Hunters win). The accepted server timestamp resolves deadline races.
- Host may end early; explicit leave means out/no rejoin — **Documented in SCRAM**.
- Host disconnect: server clock continues five minutes; any remaining player may claim limited end/cancel controls, no hidden info. If nobody claims, auto-end with no winner. **Our own design decision.**
- Network loss marks stale; basic same-session sync only, reconnect polish deferred.
- Metadata/pings deleted within seven days; live fixes deleted at match end. Seven-day window follows SCRAM policy but is our choice.

## 3. User roles and information visibility
Server-side filtering is mandatory; do not send hidden coordinates and hide them only in UI.

| Data | Host | Hunter | Runner |
|---|---|---|---|
| Lobby/config | Controls, roster | Shared settings/roster | Shared settings/roster |
| Own/team live positions | Own team only if playing | Hunter team | Runner team |
| Opponent positions | No host privilege | Runner snapshots only at scheduled pings with age; optional future zone reveal | Never Hunters |
| Tag | Same as role | Scan Runner QR | Display own QR |
| Host control | Control only, no omniscience | None | None |

No spectator role in slice.

## 4. Prioritized feature list
| Priority | Feature | Dependencies | Complexity | Acceptance |
|---|---|---|---|---|
| P0 | Lobby/code/teams | Session, lobby | Medium | 3–12 join; 3 yields 1/2; invalid team states block start. |
| P0 | Authoritative timer/state | Backend state | Medium-high | All clients agree; client clock cannot decide outcome. |
| P0 | Head start/lazy pings | Start time, fixes, role delivery | Medium-high | Sync emits due snapshots once, age-labelled to Hunters only. |
| P0 | Role-filtered locations | Location, private Broadcast | High | No Hunter coords to Runner; no live Runner coords to Hunters between pings. |
| P0 | QR/fallback tag | Match-bound QR, validation | Medium | Fresh active QR or Runner fallback; proximity never tags; duplicates idempotent. |
| P0 | Outcome/cleanup | Timer/tag state | Medium | Correct win/lose; live positions deleted; no route history. |
| P0 | Simulation | Fake players, browser override | Medium | Test flow without walking. |
| Deferred | Shrink, Radio, spectating, reconnect polish, moderation, accessibility, presets, Play | Fun/stable slice | Later | Consider after enjoyable friend tests. |

## 5. Screen inventory and flows
Text only; no mockups.
1. Onboarding: intro, 18+ gate, location disclosure, safe-play, guest identity.
2. Permissions: explain, request while-in-use after joining; no repeated prompts.
3. Home: create/join, rules/privacy; no location collection.
4. Create: duration/ping/head start/zone off or fixed; no shrink setting.
5. Join: six-character code and malformed/missing/expired/full/started/network errors.
6. Lobby: roster, teams/Random, readiness, host controls; “needs teams” state.
7. Head start: role-safe countdown; Phase A screen awake.
8. Hunter map: own/team live, age-labelled scheduled Runner snapshots, next ping.
9. Runner map: own/team live, next ping, location-shared notice; no Hunter hints.
10. Runner QR and fallback button.
11. Hunter scan and server-confirmed result.
12. Results: winner/duration/tag count, no routes; rematch creates new lobby.
13. Settings/privacy: name, haptics, retention, version.
14. Safe-play instructions and accessible leave/end.
15. Offline/stale banner; stale is never fresh ping; tag needs server validation.

## 6. Tech stack options and recommendation
### Phased Android
| Phase | Delivery | Behavior/trade-off |
|---|---|---|
| A: PWA | Cloudflare Pages/GitHub Pages; no APK | Browser location while active. Optional screen wake lock keeps display awake and drains battery. **No locked-screen tracking.** |
| B: Capacitor | Same UI in Android shell; APK from Actions/Releases | User-started foreground location service with notification. Start with 3–5 day POC. Try @capacitor-community/background-geolocation before custom Kotlin; maintenance/API/Android support **verify before relying** via official repo and device tests. |

### Stack
| Layer | Choice and caveat |
|---|---|
| Frontend | React/TypeScript/Vite PWA; Capacitor in Phase B. |
| Maps | MapLibre with Protomaps PMTiles hosted on Cloudflare R2/Pages, or MapTiler Free for personal use. Terms/quotas **verify before relying**. OSM public tiles tolerate a few friends with attribution, but best-effort/no SLA, caching required, bulk/offline prefetch prohibited: [policy](https://operations.osmfoundation.org/policies/tiles/). |
| Backend | Supabase Free: Postgres, Edge Functions, Realtime Broadcast; haversine in Edge Function/SQL. Current 500 MB DB, 200 peak Realtime connections, pauses after a week inactive — **verify before relying**: [pricing](https://supabase.com/pricing), [Realtime limits](https://supabase.com/docs/guides/realtime/limits), [Realtime pricing](https://supabase.com/docs/guides/realtime/pricing). |
| Alternative | Cloudflare Workers + one Durable Object per match room; quotas **verify before relying**: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/). Do not build both. |
| Location | Private role-appropriate Broadcast plus one overwritten latest_fix row per active player; only PingSnapshots and match metadata are retained after play. latest_fix is deleted at tag/leave/end. |
| Hosting | Free *.pages.dev or *.github.io, no custom domain. Terms **verify before relying**: [Pages](https://pages.cloudflare.com/), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages). |
| APK | GitHub Actions + Releases. Check Android developer verification hobbyist route before relying: [official page](https://developer.android.com/developer-verification). |
| Alerts | Skip FCM; in-app banners, haptics, local notifications. FCM optional later: [pricing](https://firebase.google.com/pricing). |
| Monitoring | Sentry free tier or none; quota **verify before relying**: [pricing](https://sentry.io/pricing/). No coordinates/codes/QR/tokens/chat in logs. |

Supabase avoids server operations but may pause after inactivity; open/test before a match. Free terms **verify before relying**.

## 7. System architecture
PWA/Capacitor → guest session → Edge Function or SQL RPC → authoritative Postgres state; clients ⇄ private Realtime Broadcast; map uses free tile source.
- Durable: lobby, roles/status, match lifecycle, tags, PingSnapshots, minimal results.
- Same-team live positions go over private Broadcast. Upsert one mutable latest_fix row per player so stateless Edge Functions can snapshot at ping time; delete it at tag/leave/end. It is never a trail.
- Server constructs role-specific payloads. Haversine/accuracy for zones, no PostGIS.
- Hunter sync polls every 15 seconds; any relevant event also checks the deterministic ping schedule. If multiple slots are due, coalesce to one latest snapshot per Runner, advance past missed slots, and record one delivery. Unique keys and a locked match row make retries idempotent. No cron required; pg_cron optional exact-timing alternative, availability/free support **verify before relying**: [Supabase Cron](https://supabase.com/docs/guides/cron).
- Only Hunter vs Runner mode.
### Core sequence
1. Create lobby/code; players join/select teams/get credentials.
2. Server validates 3–12, teams, ready; start stores timestamps.
3. Clients submit fixes; server validates and broadcasts same-team only.
4. On each 15-second Hunter sync poll or any relevant API request, server checks due pings, snapshots latest valid Runner latest_fix rows, sends Hunters age labels and Runner notice, idempotently.
5. Optional zone uses accuracy-aware haversine.
6. QR scan or Runner fallback; server checks role/freshness/state. Proximity ignored.
7. Resolve timer/all-tagged/host end; stop updates, delete live fixes, later delete snapshots/metadata.

## 8. Data model and retention
| Entity | Retention |
|---|---|
| Lobby/Player/Match | Minimal metadata; delete within seven days of lobby creation. |
| latest_fix | One overwritten row per player; delete at tag/leave/end. Never a trail. |
| PingSnapshot | Persist for match; Hunters only; delete within seven days. |
| Zone | Only if enabled; delete with match. |
| Tag | Method/status/time only, no coordinates; delete with match. |
| QR challenge | Short-lived nonce/expiry/use; delete on use/end. |
| Radio/Report/Push token | Not in slice. |

Precise location only during match. The single latest_fix row is deleted at tag/leave/end; no route history. Logs exclude coordinates, QR, codes, tokens, messages.

## 9. Realtime events and API contract
Names/purposes:
- Lobby/match: lobby.create/join/leave/ready/team_select/remove_player; match.start/sync/end/state_snapshot/host_migrate.
- Location: location.update; team.location_live (Broadcast only); hunter.runner_ping; runner.location_revealed; location.stale.
- Deferred zone: zone.warning/changed; runner.out_of_zone_warning; hunter.runner_live_reveal.
- Tag/result: tag.qr_issue; tag.qr_scan; tag.runner_confirm; tag.accepted; match.result; match.cleanup.
State changes carry event ID, match/session, server timestamp, sequence/revision. Client time informational. Location schema separate; deliver server-authored role-safe messages only.

## 10. Location strategy
### Permission/tracking
1. One-screen disclosure: team sharing, scheduled Runner snapshots, match-only tracking, delete at end, keep phone in hand for PWA because lock stops reliable tracking.
2. Request precise while-in-use only at join/start; no background permission in Phase A.
3. Phase A active-page browser geolocation; optional wake lock, which drains battery and does not enable locked-screen tracking; mark stale when backgrounded.
4. Phase B visible user-started Android foreground service with persistent notification; plugin support **verify before relying**.
5. Initial sampling targets: 5–10 sec moving, upload ~10 sec or 10 m, 20–30 sec stationary; **Our own design decisions**.
6. Do not request ACCESS_BACKGROUND_LOCATION. If Play later considered, check current [FGS guidance](https://developer.android.com/develop/background-work/services/fgs/service-types), [start restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start), [Play policy](https://support.google.com/googleplay/android-developer/answer/9799150).
### Accuracy and math
- Keep capture/server receipt time, accuracy, sequence. Server time controls outcome.
- Own defaults: >100 m accuracy poor; >30 sec stale live; >60 sec ineligible ping.
- Haversine; confidently outside only beyond radius+accuracy for two samples; overlapping uncertainty means uncertain.
- GPS/lag/spoofing mean proximity never proves contact.
- Phase A lock/background, permission/network loss marks stale; force-stop may stop Phase B.

## 11. Notification strategy
- Phase A in-app banners/haptics; local countdown notifications optional; server authoritative.
- Runner gets ping-shared/tag result; Hunter gets ping available/tag accepted.
- Never send hidden coordinates in notification or lock-screen text.
- Foreground play works without notifications. FCM optional if later needed.

## 12. Android packaging plan
Phase A has no APK; use provider hostname. Phase B only after slice is fun:
1. Run 3–5 day POC at Phase B start.
2. Capacitor; try @capacitor-community/background-geolocation; status/compatibility **verify before relying** at [repository](https://github.com/capacitor-community/background-geolocation). Custom Kotlin only if needed.
3. Start service visibly with notification; stop end/leave/tag; wake lock is not substitute.
4. Build signed APK via Actions; protect key; publish version/checksum/notes on GitHub Releases.
5. Updates need same ID/key and user approval; never execute unsigned code.
6. Check Android developer verification hobbyist path before wider direct distribution: [official page](https://developer.android.com/developer-verification), **verify before relying**.
7. Play fee/listing/data-safety/testing deferred until public-release decision.
**One-time cost:** target $0, existing phones, no domain/Play fee.
### iOS later
Out of scope; Android background behavior does not transfer.

## 13. Safety, privacy and legal
- Safe-play briefing: permitted public areas, obey traffic laws; no private property/roads/construction/water/rooftops/unsafe locations; stop at any time.
- 18+ gate; do not invite children.
- One-screen location disclosure; consent before start; leaving stops collection; no location outside match.
- Seek proper legal/privacy review only if public, minors, or commercial. This is not a legal assessment.
- No moderation workflow for private friends slice. Never log or notify hidden coordinates.

## 14. Anti-cheat and fairness
| Risk | Slice mitigation | Trade-off |
|---|---|---|
| Hidden-coordinate leak | Server role filtering/private channels/payload checks | New events need same discipline. |
| Background reliability | PWA phone-in-hand; Phase B POC | No Phase A lock tracking. |
| GPS drift | Accuracy-aware samples; zone off; no proximity tag | Boundary may be uncertain. |
| Scope creep | One slice/deferred list/simulation first | Features wait. |
| Dishonest tag/QR replay | Short-lived match-bound single-use QR; Runner fallback; idempotency | Cannot prove physical contact remotely. |
| Host disconnect | Five-minute limited migration then no-winner end | Match may end. |
| GPS spoofing | Never use GPS as tag; flag implausible movement only | Location cannot be proven by phone alone. |

## 15. Testing plan
### Simulation/dev tooling
- Script fake Hunter/Runner clients, deterministic paths, stale/delayed fixes, pings, QR/fallback; test without walking.
- Chrome DevTools location overrides test coordinate/accuracy/movement, not real GPS.
- Fixed seed/time for reproducibility; keep fake data separate.
### Minimum checks
Team balance 3–12; lazy pings/duplicate sync/deadline tie; haversine accuracy; QR expiry/wrong match/duplicate/fallback; role payloads; cleanup.
### Friend playtest
3–6 known friends in permitted park/campus: lobby, balance, head start, two pings, QR, fallback, result, cleanup. Screen awake/phone in hand. Record confusion/battery/fun; no broad device matrix.
### Phase B location POC
3–5 days at Phase B start, two available Android phones:
1. Verify plugin maintenance/versions/permissions.
2. Start while visible; test service/notification.
3. Lock screen 30 minutes, switch apps, battery saver; record cadence/battery.
4. Test swipe-away, force-stop, permission revoke/network loss.
5. Proceed only if lock tracking is acceptable; otherwise keep PWA. POC does not block fun slice.

## 16. Project plan
Part-time calendar estimates:
| Milestone | Deliverable | Estimate |
|---|---|---:|
| 0 | Rules and simulation | 1 weekend |
| 1 | PWA lobby/code/teams | 1–2 weekends |
| 2 | Server timer/head start/lazy pings | 1–2 weekends |
| 3 | Role-filtered location/Broadcast | 1–2 weekends |
| 4 | QR/fallback/outcomes/cleanup | 1 weekend |
| 5 | Friends test and blocking fixes | 1 weekend |
| Phase B | POC then Capacitor/service if justified | 2–4+ weekends after POC |

Phase A about 6–9 weekends; playable friends match by weekend 8 or 9. Cut polish before privacy/authority. No contractor cost or labor valuation. One frontend/backend; no custom accounts, dashboards, or device matrix. Simulation early.

## 17. Hobby running cost estimate
### Workload
For 12 players, 45 min, 5-min pings, 10-sec uploads:
- 270 updates/player = **3,240 client updates**.
- Average fan-out to six teammates = **~19,440 delivered live messages**.
- A 45-minute match with first ping at minute 3 then every 5 minutes has 9 due slots (minutes 3, 8, 13, 18, 23, 28, 33, 38, 43). Ten Runners × 9 = 90 snapshots × 2 Hunters = **~180 snapshot deliveries** if every slot is processed. Coalescing missed slots can reduce this.
- Add ~1,000 state/sync/tag messages: **~20,620 Realtime message deliveries/match**, rough; accounting differs by provider.
- 200 connection limit covers 12 by connection count, not a 200-player target. Quota/accounting **verify before relying**: [Realtime pricing](https://supabase.com/docs/guides/realtime/pricing/).

| Item | Hobby estimate |
|---|---|
| Web | $0 Pages/GitHub Pages provider address |
| Backend | $0 Supabase Free subject to limits/pause |
| Maps | $0 eligible PMTiles/R2 or MapTiler personal use; OSM for few friends under policy |
| APK | $0 Actions/Releases within limits |
| Edge Functions | About 3,640 invocations per 12-player match: 3,240 location updates + 360 Hunter sync polls + ~40 lobby/team/ready/tag/end calls. **Verify before relying** on current Supabase Free invocation quota and whether retries count. |
| Push | $0 skip FCM |
| Monitoring | $0 none or eligible Sentry |
| **Recurring total** | **$0/month** while free terms/limits fit |

Supabase currently lists 500 MB DB, 200 peak connections, pause after one inactive week; **verify before relying**: [pricing](https://supabase.com/pricing), [limits](https://supabase.com/docs/guides/realtime/limits). Map/free terms and Sentry quotas **verify before relying**; see section 6. No custom domain.
### One-time costs
Target $0 using existing phones/provider hostnames; no Play registration, domain, paid tiles, or contractor labor. Verify Android hobbyist path before APK distribution.

## 18. Ranked risks and open decisions
### Risks
| Rank | Risk | Mitigation |
|---:|---|---|
| 1 | Hidden coordinates leak | Server filtering, private channels, payload checks. |
| 2 | Background location fails | PWA phone-in-hand; Phase B POC. |
| 3 | GPS drift | Accuracy checks; zone off; proximity never tags. |
| 4 | Scope creep | One slice, deferred list, simulate/test early. |
| 5 | Free tier pauses/changes | Verify terms; open/test before play; Workers/DO alternative later. |
| 6 | QR replay/duplicate | Single-use short expiry, idempotency. |
| 7 | Host disconnect | Five-minute limited migration, then no winner. |
| 8 | APK rules change | Verify hobbyist distribution path. |
### Open decisions/defaults
Project name XZones; 12 max; host plays without privilege; 45/5/3 defaults; zone off; QR plus Runner fallback; host migration then no winner; Supabase Free first; Phase A screen awake; delete live at end and metadata/pings in seven days; 18+; no public release planned.

## Authority note
Sections 19–29 are authoritative where they refine or replace earlier summaries.

## 19. Deferred
Do not expand these in the slice: shrinking zone, Radio/chat, spectating, reconnect polish, report/block/moderation, accessibility audit beyond basics, presets, other modes, accounts, public lobbies, photo clues, Google Play, iOS, FCM, satellite maps, Low Battery Mode.

## 20. UI design system and screen specification

### Visual system
Dusk Contour is a map-first topographic night-ops identity: contour lines, crosshair X marks, radar rings, ink-and-bone console. Avoid forest-green/lime tactical styling, generic SaaS, heavy glassmorphism, fake 3D.

| Token | Dusk | Paper |
|---|---|---|
| Background | #100E1B | #EFE9DB |
| Surface / raised | #19162A / #231F38 | #F7F2E6 / #FFFFFF |
| Border | #342F52 | #D8CFB9 |
| Text / muted | #F3EEE2 / #A9A3BD | #1B1830 / #5E5877 |
| Hunter | #FF6A2B Ember | #D9480F |
| Runner | #3FE0C5 Ion | #0B8F7D |
| Accent | #8F7CFF | #5B45E0 |
| Warning/danger/success | #FFB020 / #FF3D6E / #7BE495 | Semantic colors subject to contrast measurement |

Paper is functional for outdoor glare. Map styles are Dusk topographic and Paper only, auto/manual. No satellite. Target WCAG AA; measure text/control combinations before claiming ratios. No ratios are claimed as checked yet.
- Primary button Bone in Dusk/ink in Paper, not accent-filled; 56px tall. Secondary outlined, hairline borders, subtle contour texture, no heavy shadows.
- Sheet radius 24px, controls 14px, 4px spacing grid.
- Self-host Fontsource: Bricolage Grotesque display/wordmark, Manrope body/UI, JetBrains Mono tabular numerals for timers/ages/HUD. Package versions **verify before relying**. Scale 12/14/16/20/28/40px.
- Wordmark: simple SVG stylized X and compass-star O. Tagline “Real places. Real games.” is acceptable; avoid safe-zone/photo-clue promises.
- Minimum touch target 44px; primary 56px; 320px+ phones, tablet and desktop dev; safe-area insets. Edge-to-edge map, bottom sheet at peek/half/full; right-edge controls.
- Semantic HTML, accessible names, visible focus, screen-reader status announcements, text status in addition to markers, leave/end confirmation.
- Hunter marker: Ember pointed badge. Runner: Ion round badge/ring. Live teammate solid with name. Snapshot dashed hollow ring fades by age but always has text age. Own white dot + accuracy circle; optional heading cone only if reliable.
- Radar ring expands once per ping; countdown amber below 60s; transform/opacity motion only; reduced-motion disables; no marker pulsing or layout shifts.

### Screens, states and actions
All screens specify loading, empty, error, offline, success behavior. Controls must perform an action.
| Screen | Content and action |
|---|---|
| Home/onboarding | Guest name, 18+ confirmation, safe-play, one-screen location disclosure; no location collection. Play as guest creates session; Join with code opens join. |
| Create | 45-min default, duration selector, ping, head-start slider, zone Off/fixed; center on my position or pick on map; create private lobby. |
| Join | Six-character private code; specific invalid/expired/full/started/rate-limit/network errors; submit join. |
| Lobby | Code copy/share, connection status, Hunter/Runner sections, team/Random, ready, counts, min/max, host badge, host-only pre-start remove, blocked-start reason. No public tag; generated initials/icons, not photos. |
| Head-start | Server-clock countdown and role-safe team status; permission/stale warning. |
| Gameplay | Top HUD mode, server-derived time, team counts; map controls navigate/layers/locate/zoom; textual status and Players/Pings sheet. Runner sees teammates only; Hunter sees own team and scheduled age-labelled snapshots. |
| Ping event | Non-modal once-only banner/haptic; Hunter can open Pings. |
| Hunter Pings | Scheduled snapshots/ages/next ping; Scan Runner QR and View pings actions. |
| Runner panel | Teammates only; Show tag QR. No clues. |
| Runner QR / Hunter scanner | Token countdown; permission/scanning/validating/success/expired/wrong-match/camera-denied states. Camera requested only on scan; denial explains settings; fallback is Runner button. |
| Results | Winner, duration, tag count, cancellation reason; no routes. |
| Settings | Name, theme, Dusk/Paper map style, haptics, privacy, safe-play, version, leave/end. |

## 21. UI board reference
Board image was unavailable locally; this table maps the detailed prompt description and corrections.

| Board element | XZones route | Copy | Change |
|---|---|---|---|
| Splash/wordmark/city lights | / | Wordmark, contours/glow | CSS/SVG only; guest and code join |
| Mode picker | / | Hunter vs Runner card | No Murder; optional disabled More modes later |
| Account screens | / | Play as guest | No sign-in/account |
| Create form | /create | Slider, segmented duration | Private only; Off or 400m–3km; center on position/pick map |
| Public/approval/city fields | /create | None | Remove |
| Lobby | /lobby/:id | Host badge, Ready chips, cards | Add team sections/Random; host-only pre-start remove |
| Map/HUD | /match/:id | Timer/counts, bottom sheet, right controls, violet ring if zone enabled | Server time; role-safe markers |
| Players/eye icons | Players sheet | Teammates and counts | No opponent distances; eye toggle may show/hide labels only |
| Clues/photo cards | Hunter Pings / Runner QR | Age-labelled snapshots / Show tag QR | No photo clues |
| Legend | Map legend | You, teammates, Snapshot, boundary | Remove safe/danger/POI/clue |
| Safe-zone/tagline copy | Status | “Stay hidden until the timer ends” | No capture mechanic implied |
| Satellite tile | Settings | Dusk/Paper only | Satellite deferred |
| Forest/city card art | Home/lobby | Contours | Lightweight SVG/CSS only |
| You marker cone | Gameplay | White dot/accuracy | Heading cone optional only if reliable |

## 22. Working flow and state machine

| State | Trigger and allowed transition | Reject |
|---|---|---|
| LOBBY | Create → HEAD_START on validated host start; expiry/host cancel → CANCELLED | Start with <3, empty team, unready, expired lobby; late join after start |
| HEAD_START | Server start timestamp; timer → ACTIVE; host end or migration timeout → terminal | Rule/team changes, Runner snapshots before head-start end |
| ACTIVE | Timer/all Runners tagged-or-left/host end → ENDED; all Hunters leave → ENDED with Runner win; host-loss timeout → ENDED no winner | Late join, duplicate transition, invalid tag, unauthorized location |
| ENDED | Terminal result | Join/start/tag/location |
| CANCELLED | Expiry or host cancel | Join/start/tag/location |

Transitions are transactions against expected state/revision; idempotent retries return committed state. Server time determines all deadlines.

| Step | Host | Hunter | Runner | Server validation/write/event |
|---|---|---|---|---|
| Open | Guest name/18+ | Same | Same | Anonymous session; no location |
| Lobby | Create/share code | Join code | Join code | Hash code; rate-limit; player row; lobby event to members |
| Teams | Select/ready | Select/ready | Select/ready | Balance/ready validation; safe roster event |
| Start | Host taps | Sees clock | Sees clock | Commit start/deadline/state; match.started to all |
| Location | Permission/start | Same | Same | Upsert own latest_fix; live same-team Broadcast |
| Head-start end | Role-safe view | No Runner fix until due ping | Own team only | Server transitions ACTIVE |
| Ping | If Hunter | Snapshot + age | Generic shared notice | Transactional PingSnapshot; role-filtered events |
| Tag | Own-role action | Scan QR | Display QR or confirm | Consume token/insert tag; status event without coordinates |
| Result | Results | Results | Results | Winner/end reason; delete all latest_fix; metadata cleanup deadline |

Edge cases: invalid/expired/full/rate-limited code has explicit safe error; no late join; network loss marks stale and retries idempotently; fixes >60s ineligible; duplicate QR returns used/already-tagged; expired/wrong-match token rejected; accepted server timestamp resolves deadline race; denied location blocks ready/start and explains permission.

### Example timeline: 12 players, 45/5/3
Start 18:00, two Hunters/ten Runners. Head start ends 18:03; active pings due 18:03, 18:08, 18:13, 18:18, 18:23, 18:28, 18:33, 18:38, 18:43. Last ping is capped at the 45-minute match end. R4 scanned at 18:16; R7 confirms fallback at 18:27. Host disconnects 18:30; H2 claims limited control at 18:32. At 18:45 active Runner means Runner win; if all tagged earlier Hunters win. This assumes ping schedule capped before/at match end.

### Join and balance
~~~mermaid
flowchart TD
 A[Enter code] --> B{Valid, private, active, capacity?}
 B -- no --> E[Specific safe error]
 B -- yes --> C[Join as guest]
 C --> D[Select team or Random]
 D --> F{At least 3 and valid sides?}
 F -- no --> G[Needs teams; block start]
 F -- yes --> H[Ready]
 H --> I{All ready?}
 I -- yes --> J[Host may start]
 I -- no --> G
~~~

### Lazy ping
~~~mermaid
sequenceDiagram
 participant H as Hunter
 participant F as Edge Function
 participant D as Postgres
 participant R as Realtime
 H->>F: sync
 F->>D: lock match and calculate due slots
 F->>D: insert unique snapshots from latest_fix
 F->>R: publish Hunter snapshots
 F->>R: publish Runner notice only
 F-->>H: role-filtered view
~~~

### QR tag
~~~mermaid
sequenceDiagram
 participant R as Runner
 participant H as Hunter
 participant A as Tag API
 R->>A: request QR
 A-->>R: opaque token and expiry
 H->>A: scanned token
 A->>A: validate match, role, expiry, unused, deadline
 A-->>H: accepted or rejected
 A-->>R: tagged status
~~~

### Host migration and cleanup
~~~mermaid
sequenceDiagram
 participant S as Server
 participant P as Players
 S->>P: host explicitly leaves or heartbeat becomes stale
 P->>S: claim limited controls
 alt claim within five minutes
 S-->>P: grant first valid claim, no info privilege
 else timeout
 S-->>P: auto-end without winner
 end
~~~

~~~mermaid
flowchart TD
 A[Tag, leave, or end] --> B[Delete affected latest_fix]
 C[Match end] --> D[Delete all latest_fix rows]
 D --> E[Emit coordinate-free result]
 E --> F[Daily job removes metadata and snapshots after seven days]
~~~

## 23. Monorepo plan and boundaries
Planned tree only; reuse existing structure.
~~~text
xzones/
  package.json                 # workspace scripts
  pnpm-workspace.yaml          # workspace packages
  tsconfig.base.json           # strict TS config
  vite.config.ts               # PWA build
  index.html                   # shell/font preload
  public/manifest.webmanifest  # install metadata/scope
  public/sw.js                 # generated service worker entry
  apps/web/src/main.tsx        # providers/router
  apps/web/src/app/router.tsx  # route table
  apps/web/src/pages/          # one component per screen
  apps/web/src/components/     # HUD, sheets, buttons, markers
  apps/web/src/hooks/          # realtime/location/wake lock/timer
  apps/web/src/stores/         # Zustand global and match state
  apps/web/src/services/game-api.ts # typed GameApi
  apps/web/src/services/mock-api.ts # explicit simulator adapter
  apps/web/src/services/supabase-api.ts # real adapter
  apps/web/src/lib/            # format/validation/map helpers
  apps/web/src/types/          # UI-only types
  apps/web/src/theme/tokens.css # Dusk/Paper tokens
  apps/web/src/map/            # MapLibre setup/styles/renderers
  backend/supabase/config.toml # local backend config
  backend/supabase/migrations/ # schema/RLS/cleanup
  backend/supabase/functions/api/index.ts # single Edge Function router for all API paths
  packages/game-core/src/types.ts # shared contracts
  packages/game-core/src/rules.ts # pure balance/time/zone rules
  tools/simulator/             # fake clients/clock
  tools/fixtures/               # isolated fake data
  scripts/verify-payloads.ts   # role payload checks
  tests/unit/                   # pure rule tests
  tests/integration/            # local backend tests
  tests/privacy/                # captured payload leak tests
  .github/workflows/checks.yml # typecheck/tests
  .github/workflows/release-apk.yml # Phase B only
  android/README.md             # Phase B placeholder only
~~~
Use kebab-case files, PascalCase components/types, camelCase functions, snake_case SQL. UI imports shared pure rules and GameApi only; never imports service-role/server code. Shared package has no browser/network imports. Simulator credentials and namespace cannot join real lobbies.

## 24. Data layer and privacy controls

Use Supabase Free and one mutable latest_fix row per player. UI/API express a fixed zone as zone_diameter_m; Postgres stores zone_radius_m = zone_diameter_m / 2, and UI always displays diameter. Stateless Edge Functions need a current coordinate at ping time; the overwritten row gives that without a route trail. It is deleted on tag/leave/end. Only PingSnapshots survive, for up to seven days.

~~~sql
create type match_state as enum ('LOBBY','HEAD_START','ACTIVE','ENDED','CANCELLED');
create type player_role as enum ('HUNTER','RUNNER');
create table matches (
 id uuid primary key default gen_random_uuid(),
 code_hash bytea not null unique,
 host_player_id uuid,
 controller_player_id uuid,
 claim_expires_at timestamptz,
 state match_state not null default 'LOBBY',
 round_seconds int not null check (round_seconds between 600 and 10800),
 head_start_seconds int not null check (head_start_seconds between 0 and 900),
 ping_seconds int check (ping_seconds is null or ping_seconds between 60 and 1800),
 zone_lat double precision, zone_lon double precision, zone_radius_m int,
 started_at timestamptz, head_start_ends_at timestamptz, ends_at timestamptz,
 last_ping_index int not null default -1, revision bigint not null default 0,
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 check ((zone_lat is null and zone_lon is null and zone_radius_m is null) or
 (zone_lat between -90 and 90 and zone_lon between -180 and 180 and zone_radius_m between 200 and 1500))
);
create index matches_state_deadline_idx on matches(state, ends_at);
create table players (
 id uuid primary key default gen_random_uuid(), match_id uuid not null references matches(id) on delete cascade,
 auth_user_id uuid not null, display_name text not null check (char_length(display_name) between 1 and 24),
 role player_role, status text not null, ready boolean not null default false,
 session_cap_hash bytea not null, joined_at timestamptz not null default now(),
 last_seen_at timestamptz, unique(match_id, auth_user_id), unique(match_id,id)
);
create index players_match_role_idx on players(match_id,role,status);
create table latest_fix (
 player_id uuid primary key references players(id) on delete cascade,
 match_id uuid not null references matches(id) on delete cascade,
 lat double precision not null check(lat between -90 and 90),
 lon double precision not null check(lon between -180 and 180),
 accuracy_m real not null check(accuracy_m between 0 and 10000),
 captured_at timestamptz not null, received_at timestamptz not null default now(),
 sequence bigint not null, unique(match_id,player_id)
);
create index latest_fix_match_received_idx on latest_fix(match_id,received_at);
create table ping_snapshots (
 id uuid primary key default gen_random_uuid(), match_id uuid not null references matches(id) on delete cascade,
 runner_id uuid not null references players(id), ping_index int not null,
 lat double precision not null, lon double precision not null, accuracy_m real not null,
 captured_at timestamptz not null, ping_at timestamptz not null,
 unique(match_id,runner_id,ping_index)
);
create index ping_snapshots_match_time_idx on ping_snapshots(match_id,ping_at desc);
create table tags (
 id uuid primary key default gen_random_uuid(), match_id uuid not null references matches(id) on delete cascade,
 hunter_id uuid references players(id), runner_id uuid not null references players(id),
 method text not null check(method in ('QR','RUNNER_CONFIRM')), accepted_at timestamptz not null default now(),
 unique(match_id,runner_id), check(hunter_id is null or hunter_id<>runner_id),
 check ((method='QR' and hunter_id is not null) or (method='RUNNER_CONFIRM' and hunter_id is null))
);
create table qr_challenges (
 id uuid primary key default gen_random_uuid(), match_id uuid not null references matches(id) on delete cascade,
 runner_id uuid not null references players(id) on delete cascade, token_hash bytea not null unique,
 expires_at timestamptz not null, used_at timestamptz, created_at timestamptz not null default now()
);
create index qr_expiry_idx on qr_challenges(expires_at);
create table rate_limits (
 bucket_key bytea not null,
 action text not null,
 window_started_at timestamptz not null,
 attempts int not null default 0 check (attempts >= 0),
 expires_at timestamptz not null,
 primary key(bucket_key, action, window_started_at)
);
create index rate_limits_expiry_idx on rate_limits(expires_at);
create table match_results (
 match_id uuid primary key references matches(id) on delete cascade, winner player_role,
 end_reason text not null, ended_at timestamptz not null, cleanup_after timestamptz not null
);
create index results_cleanup_idx on match_results(cleanup_after);
~~~

RLS/authorization:
- Matches: members read safe projection; no code hash/capabilities. Mutations via functions.
- Players: members see names/role/status/readiness only; no auth IDs/token hashes. Own selection/readiness via function.
- latest_fix, ping_snapshots, QR challenges: no direct client read/write. Service-role functions only.
- Tags/results: members read minimal status; writes only functions.
- Realtime private topic match:<id>:hunter or :runner. RLS on realtime.messages checks Auth user is active match member and topic suffix matches DB role; publish cross-role snapshots only from service role.
- Hunter channel contains Hunter team live positions and scheduled Runner snapshots only. Runner channel contains Runner team live positions and generic ping notice; absolutely no Hunter coordinate/distance/direction/marker metadata.
- Never trust client role claims; resolve from players table. Deny table subscriptions for latest_fix and snapshots.
- Service role keys never reach browser. Anonymous Supabase Auth user is the identity; display name is not verified. Capability is random 256-bit, server hashes it, revokes on leave/end.
- Join throttling: persist counters in rate_limits keyed by HMAC/coarse IP bucket and action; 5 failed attempts per 10 minutes per bucket, 10 joins/Auth user/hour. Expire buckets daily. Keep raw IP only transiently if provider exposes it.

Cleanup: location/tag/leave/end functions delete affected latest_fix transactionally; end deletes all match fixes. Daily pg_cron deletes expired challenges and match metadata/snapshots after seven days. If unavailable on Free, protected cleanup function runs on app open/create/sync as fallback; cron availability **verify before relying**. It never copies fixes to history.

## 25. API and Realtime contract

All JSON over HTTPS with Supabase Auth bearer. One deployed Supabase Edge Function named api routes all paths below; it checks membership/role server-side. Common error envelope: {error:{code,message}}. Never return secrets except newly issued code to host or QR token to owning Runner.

| Function | Request | Response | Errors / events |
|---|---|---|---|
| POST /api/lobbies | Auth; {display_name,round_seconds,head_start_seconds,ping_seconds,zone_diameter_m} | {match_id,code,player_id} | 400 INVALID_CONFIG, 429 RATE_LIMITED; lobby.created |
| POST /api/lobbies/join | Auth; {code,display_name} | {match_id,player_id,role:null} | 404 INVALID_CODE/CODE_EXPIRED, 409 LOBBY_FULL/MATCH_STARTED, 429 RATE_LIMITED; lobby.player_joined |
| POST /api/matches/:id/team | Member; {role} | {role,counts,can_start} | 403 NOT_MEMBER, 409 INVALID_TEAM_BALANCE; lobby.teams |
| POST /api/matches/:id/ready | Member; {ready} | {ready,can_start,block_reason} | 409 INVALID_STATE; lobby.readiness |
| POST /api/matches/:id/start | Host; {expected_revision} | {state,start_at,head_start_ends_at,ends_at,revision} | 403 NOT_HOST, 409 NOT_READY/REVISION_CONFLICT; match.started |
| POST /api/matches/:id/sync | Member; {last_revision} | {state,server_now,role_view,due_pings,next_ping_at,revision} | 401/403/404; match.state, Hunter ping or Runner notice |
| POST /api/matches/:id/location | Active member; {lat,lon,accuracy_m,captured_at,sequence} | {accepted,server_received_at,stale} | 400 INVALID_FIX, 409 OLD_SEQUENCE; same-team team.location_live |
| POST /api/matches/:id/qr | Active Runner; {} | {token,expires_at} | 403 WRONG_ROLE, 409 INACTIVE; no token event |
| POST /api/matches/:id/qr/scan | Active Hunter; {token} | {tag_id,status,accepted_at} | 403 WRONG_ROLE, 404 INVALID_QR/WRONG_MATCH, 409 QR_USED/EXPIRED/DEADLINE; tag.accepted |
| POST /api/matches/:id/tag/confirm | Active Runner; {} | {tag_id,status,accepted_at} | 409 ALREADY_TAGGED/DEADLINE; tag.accepted |
| POST /api/matches/:id/leave | Member; {} | {status:LEFT,claim_expires_at?} | 403/409; player.left; deletes own fix; if controller leaves, immediately opens five-minute host-claim window |
| POST /api/matches/:id/end | Host/migrated controller; {reason} | {state,winner,ended_at} | 403/409; match.ended |
| POST /api/matches/:id/host-claim | Member; {} | {controller_player_id,claim_expires_at} | 409 CLAIM_WINDOW_CLOSED/CLAIM_TAKEN; first valid claim wins; match.host_migrated |

Other errors: LOCATION_DENIED, STALE_FIX, NOT_READY, DEADLINE_PASSED, INTERNAL. Join returns generic invalid code where revealing lobby existence would aid guessing. Rate limits as above.

Envelope: {event_id,match_id,revision,server_at,type,data}. Exact data:
- team.location_live: {player_id,lat,lon,accuracy_m,captured_at}; same-team only.
- hunter.runner_ping: {runner_id,status,lat,lon,accuracy_m,captured_at,ping_at,age_seconds,ping_index}; status is OK, NO_FIX, or STALE; Hunter channel only. OK includes fix fields; NO_FIX has null fix fields; STALE includes age_seconds and null coordinates because fixes older than 60 seconds are not ping-eligible. If multiple slots became due since last sync, coalesce them into one current snapshot per Runner and advance past all missed slots; never emit a burst or fabricate historical fixes.
- runner.location_revealed: {ping_index,ping_at}; Runner channel only.
- match.state: {state,server_now,ends_at,active_counts:{hunters,runners}}. Counts are aggregate active players only; no positions.
- tag.accepted: {runner_id,status:TAGGED,method,accepted_at}; no coordinates.
- match.result: {winner,end_reason,ended_at}.
- location.stale: {player_id,is_stale}; own team only.
- lobby.created: {match_id,code_expires_at,revision}; lobby members only.
- lobby.player_joined: {player_id,display_name,status}; lobby members only.
- lobby.teams: {hunter_count,runner_count,own_role,can_start}; lobby members.
- lobby.readiness: {player_id,ready,can_start,block_reason}; lobby members.
- match.started: {state,start_at,head_start_ends_at,ends_at,revision}; all members.
- player.left: {player_id,status}; match members, no coordinates.
- match.host_migrated: {controller_player_id,claim_expires_at}; members, no role elevation.
- match.ended: {state,winner,end_reason,ended_at}; all members.

For the same ping, Hunter receives runner_id, status, coordinates only for OK/STALE-with-fix, capture time, age and ping index; Runner receives only ping_index and ping_at. A sync that missed multiple slots yields one snapshot per Runner with the latest due ping_index. Never include opponent distance, direction, marker metadata, or hidden fields in any API/channel. Methods are POST for all state changes; sync/location polling interval 15s; join rate limit applies per table above.

## 26. Frontend architecture

### Routes/state
| Route | Screen |
|---|---|
| / | Onboarding/home |
| /create | Create |
| /join | Join |
| /lobby/:matchId | Lobby |
| /match/:matchId/head-start | Countdown |
| /match/:matchId | Map |
| /match/:matchId/pings | Hunter Pings |
| /match/:matchId/tag | Runner QR or Hunter scanner |
| /match/:matchId/results | Results |
| /settings | Settings |
| /dev/sim | Dev-only simulator |

Global: anonymous session/preferences/name/theme. Per-match: server-returned role-safe view and revisions. Local: forms/dialog/scanner. Simulation isolated and visibly labelled. No hidden payload in generic store/props.

### GameApi boundary
~~~ts
type Role = "HUNTER" | "RUNNER";
type MatchState = "LOBBY" | "HEAD_START" | "ACTIVE" | "ENDED" | "CANCELLED";
type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };
interface GameApi {
 createLobby(input: CreateInput): Promise<Result<LobbyView>>;
 joinLobby(input: JoinInput): Promise<Result<LobbyView>>;
 selectTeam(id: string, role: Role | "RANDOM"): Promise<Result<TeamView>>;
 setReady(id: string, ready: boolean): Promise<Result<ReadyView>>;
 startMatch(id: string): Promise<Result<ClockView>>;
 syncMatch(id: string, revision?: number): Promise<Result<RoleSafeMatchView>>;
 updateLocation(id: string, fix: LocationInput): Promise<Result<LocationAck>>;
 issueQr(id: string): Promise<Result<QrChallenge>>;
 scanQr(id: string, token: string): Promise<Result<TagResult>>;
 confirmTag(id: string): Promise<Result<TagResult>>;
 leaveMatch(id: string): Promise<Result<void>>;
 endMatch(id: string, reason: string): Promise<Result<MatchResult>>;
 subscribe(id: string, role: Role, handlers: SafeHandlers): Promise<Unsubscribe>;
}
~~~
MOCK adapter is explicitly named MOCK, dev-only, uses fake IDs and a permanent “SIMULATION — NOT A REAL MATCH” banner. It cannot silently feed real-match UI. Real adapter talks to Supabase functions/channels.

### Lifecycle/map/PWA
- Subscribe only after server confirms membership/role; topic must match role. Unsubscribe route exit/leave/end/auth refresh; on reconnect sync before applying events.
- Start geolocation only after permission and explicit ready/start flow. Upload at 10 seconds or 10m movement, monotonic sequence. Stop on tag/leave/end/unmount. Mark stale at 30 sec, ping-ineligible at 60 sec.
- MapLibre + PMTiles, custom Dusk/Paper, no satellite. Library/tool/provider versions and terms **verify before relying**. Marker components accept role-safe types only. Snapshot opacity fades with age and always has text age. Timer uses server time plus monotonic estimate and resync. Accuracy circle/optional zone/recenter own position.
- Players shows own team and aggregate counts only. Hunter Pings shows snapshots; Runner gets Show tag QR. No distances.
- Manifest: standalone, start URL /, scope /, theme colors, SVG icons. Service worker caches app shell/fonts/static styles only; never API coordinates, QR tokens, or realtime.
- Wake lock in active Phase A if available; release on end/leave/visibility loss, reacquire on return. Background may suspend watcher, sockets, timers, haptics; show stale/offline and sync on return. It cannot track locked screen.
- QR uses opaque random 256-bit token; store only SHA-256 hash; 60s expiry, atomic consume. Free qrcode generator and html5-qrcode or jsqr scanner; maintenance/version **verify before relying**. Request camera only on scan; stop camera on exit/success; denied permission explains settings and Runner fallback.
- Self-host Fontsource; no runtime Google Fonts.
- Budget initial compressed JS <=250 KB excluding map engine/style; map/QR/scanner lazy chunks <=350 KB additional. Verify by build. Lazy-load scanner, results/settings/simulator; clean listeners/watchers/channels. Logs never include coordinates/code/token/message.

## 27. Setup and build order
Tool versions **verify before relying**: current Node LTS, pnpm, React, Vite, TypeScript, Supabase CLI, MapLibre/PMTiles, Vitest/Playwright; Capacitor/Android SDK/JDK only Phase B. Pin actual versions in lockfile when coding. Supabase/Cloudflare/GitHub/MapTiler/Fontsource/Sentry free terms **verify before relying**. No custom domain.

Env names only:
- Public: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_MAP_STYLE_URL.
- Server secrets: SUPABASE_SERVICE_ROLE_KEY, QR_SIGNING_SECRET, RATE_LIMIT_HASH_SECRET. Never VITE-prefix secrets.
Local flow: run Supabase CLI locally, apply migrations, start functions/realtime, run Vite, point simulator to same local API. Do not test with service secrets in browser.

Build order (plan, not execution); each step has touched paths and done check:
1. Scaffold hello-world Vite React TS: package.json, vite.config.ts, index.html, main.tsx. Done: local responsive route and CI typecheck.
2. Workspace boundaries: pnpm-workspace.yaml, tsconfig.base, game-core. Done: web imports pure package without network dependency.
3. Tokens/fonts: tokens.css, fonts.css, manifest. Done: Dusk/Paper toggle and offline fonts.
4. Router/state shells: router, pages, StatePanel. Done: required routes have loading/empty/error/offline/success.
5. GameApi MOCK: game-api.ts/mock-api.ts/simulator. Done: simulation banner and fake IDs visible.
6. First migration: 0001_core.sql. Done: local Supabase applies schema/constraints.
7. Lobby APIs: create/join/team/ready functions. Done: local code flow, rate-limit tests.
8. Privacy checks: tests/privacy and verify-payloads. Done: Runner payload has no Hunter data; Hunter has no live Runner stream.
9. Simulator clock/fakes: tools/simulator and game-core rules. Done: deterministic 3-player 1/2 team.
10. Two-fake-player ping: match-sync and simulator. Done: fake Runner latest_fix snapshots once to Hunter before any GPS.
11. Home/create/join UI phase: pages/forms. Done: code errors specific; no public lobby.
12. Lobby UI phase: roster/team/readiness components. Done: 3–12, balanced sides, start reason.
13. Clock/head-start: timer and state reducer. Done: reload cannot reset or reveal early.
14. Gameplay map phase: MapView/styles/markers/sheets. Done: fake teammate vs snapshot visually distinct; role tests pass.
15. Realtime authorization: RLS migration/hook/integration. Done: wrong-role subscription rejected.
16. Pings phase: banner/Pings list. Done: once-only, age/next timer; Runner no snapshot.
17. QR/results phase: QR/scanner/functions/tests. Done: wrong-match/expired/duplicate rejected; fallback tags.
18. Cleanup/results: results/retention. Done: winner paths and latest_fix deletion verified.
19. Settings/polish phase: theme/settings/safe-play. Done: Dusk/Paper persist and controls work.
20. Real phone Phase A: manifest/service worker/location. Use HTTPS (localhost exception only for local browser dev); phone camera and geolocation secure-context requirements otherwise fail. Done: active location; background marks stale; cache has no private data.
21. Definition review: tests/CI. Done: privacy, rules, build checks pass on phone.
22. Phase B later: Capacitor/Android placeholder/release workflow. Done: POC passes, visible FGS, signed APK build documented.

## 28. Simulator and test matrix
| Rule | Test | Expected |
|---|---|---|
| Teams 3–12 | Enumerate counts/manual assignments | Formula, no empty sides |
| Lazy ping | Advance clock/repeat sync/no-sync gap | Each due slot once and ordered |
| Deadline | Tag at/after deadline | Server timestamp decides |
| Zone | Haversine with accuracy and uncertain edge | No reveal until two confident samples |
| QR | Replay/expiry/wrong match | Rejected; no second tag |
| Privacy | Capture all payloads for both roles | Runner never sees Hunter fields or opponent metadata; Hunter no live Runner |
| Cleanup | Tag/leave/end and advance retention | Latest row immediate; metadata/pings by day 7 |
| Idempotency | Retry event | One transition |
| Permission | Deny location | Clear block; no fake fix |
| Network | Disconnect/return | Stale/offline then sync |
| Host loss | Claim/timeout | Limited control or no-winner end |
| Join | Invalid/expired/full/started/rate limit | Safe specific error |

Simulator uses scripted fake players, deterministic paths, stale/low-accuracy fixes, delayed/duplicate events, and controllable clock. Chrome DevTools location override tests browser wiring, not real GPS. Calls same GameApi endpoints/channels using isolated dev credentials and namespace; fake matches cannot appear real.

## 29. Definition of done
- [ ] Private create/join supports 3–12; invalid/expired/full/started/rate errors clear.
- [ ] Balancing, both sides, readiness, start validation.
- [ ] Server timestamps drive head-start, timer, pings, deadline.
- [ ] Live teammates distinct from scheduled age-labelled snapshots.
- [ ] Runner never gets Hunter coords/distance/direction/markers/metadata; Hunter never gets live Runner positions between pings.
- [ ] Single-use QR and Runner fallback work; proximity never tags.
- [ ] Results cover timer/all-tagged/host-end/host-disconnect.
- [ ] latest_fix deleted at tag/leave/end; no route history; snapshots/metadata by seven days.
- [ ] Permission denial, stale, offline, sync recovery clear.
- [ ] Real-phone layout works at 320px; every visible control works.
- [ ] Dusk/Paper, focus, announcements, reduced motion, measured contrast.
- [ ] Build/typecheck/rules/API/privacy tests pass.

## Start here
1. Inspect repository; when coding begins, copy the supplied board to docs/design/XZONES_Dusk_Contour_Game_UI_Board.png and scaffold the Vite React TypeScript PWA.
2. Set up Supabase/local dev and verify free limits/tool versions before relying.
3. Build first migration, shared rules, MOCK GameApi, simulator, and privacy payload tests before real GPS.

**Plan only:** future work; no code or UI assets generated.
