# Hide & Seek Mode Specification

This document defines the one implemented mode, `HIDE_AND_SEEK`, for XZones. The shared game-mode column defaults to this value. Other modes are out of scope.

## Roles and match flow

- `HUNTER` is the seeker and `RUNNER` is the hider. Existing enum names stay unchanged.
- A match supports 2–100 active players. By default, Hunters are `ceil(playerCount / 10)`; the host can choose 1 through `floor(playerCount / 2)`. All remaining players are Runners.
- The server owns role assignments, timers, tags, zone state, item activation, and outcomes. Requests may propose inputs but may not authoritatively set these values.
- `roundSeconds: null` disables the timer. Runners cannot win by timeout when it is disabled; the match ends when all Runners are tagged or leave, or the host ends it.
- The existing default round/head start/ping values remain 2700/180/300 seconds. Ping may be off.

## Location and tags

- Reject implausible fixes faster than 15 m/s, fixes outside the existing timestamp clamps, and positions farther than 10 km from the zone center. Log rejections for the host's results view only.
- Browser GPS is not attestable. These checks deter mistakes and simple spoofing but cannot prove the device's actual position.
- A Hunter's GPS tag targets the nearest eligible Runner within `20 m + min(hunterAccuracy + runnerAccuracy, 25 m) + 3 m/s × min(runnerFixAge, 30 s)`. The Hunter must provide a fresh high-accuracy fix. A miss returns only `NOTHING_IN_RANGE`; no candidate identity or distance is exposed.
- QR remains a fallback, but is rejected when both fixes are fresh and their distance exceeds 100 m. Runner self-surrender stays available.
- Tag, QR, surrender, and match-end races serialize on the server; one Runner can be tagged only once.

## Zone

- The zone is a circle. It can be off or have a selected center and radius. Start radius follows the existing 200–1500 m bounds; final radius is at least 50 m and no greater than the start radius.
- Shrink stages are configurable from 0 through 10. Stage 1 starts after head start plus the first shrink interval. Defaults for shrink interval and stage count are marked `UNSPECIFIED-IN-REFERENCE` in `hideAndSeekConfig.ts`.
- A sample counts as outside only when `distance - accuracy > radius`. After two consecutive confirmed outside samples, the Runner is revealed to Hunters on their next ping. At 30 seconds outside, warn the Runner. At 120 continuous seconds outside, eliminate them. One sample or poor accuracy never causes elimination.
- Zone state is computed from match start and current server time; no per-match scheduler is required.

## Movement and host lifecycle

- A Runner who remains below 15 m of confirmed movement for 300 seconds receives a warning at 80% of the window. The consequence is a Hunter reveal on the next ping; stationary behavior does not itself eliminate the Runner.
- Host inactivity uses a 180-second threshold and excludes time during which the host's latest heartbeat reported a hidden tab.
- Fallback sync is Realtime-first, randomized between 30 and 45 seconds, and paused while the tab is hidden.

## Privacy and rejoin

- Hunters receive no live Runner positions; they receive scheduled snapshots, confirmed zone/stationary reveals, and server-authorized item results. Runners never receive Hunter positions.
- Match completion removes retained coordinate rows, including ping snapshots.
- Rejoin requires the persisted guest session and an ACTIVE player record in a non-ended match. A name or lobby code alone never restores a player. An explicitly departed player cannot rejoin.

## Lobby and guide

- Chat allows at most 280 characters. Lobby messages go to all lobby players; match messages are team-only. The server validates and rate-limits messages, projects them by role, and deletes them at match end.
- Host settings presets are local-only and every localStorage access is guarded.
- The Hide & Seek rules guide is available from lobby and settings. Bug reports use insert-only server access and collect no extra PII beyond text the user enters.

## Optional items

- Items are off by default. If enabled, every player receives one use of each item for their role. Activation is a server RPC requiring an ACTIVE match, ownership, and available use/cooldown state.
- Hunter items: Scan reveals active Runner positions to that Hunter for `SCAN_S`; Proximity Alarm alerts only its placer once when a Runner enters its radius; Zone Mover shifts the circle center once per match by at most its configured distance while preserving at least 50% overlap, and announces the move.
- Runner items: Decoy adds one fake ping within its configured offset to Hunters' next ping; Zone Shield suspends zone-exit consequences temporarily; Camouflage omits the Runner from the next snapshot and Scan for its configured duration.
- Item durations and tunings marked `UNSPECIFIED-IN-REFERENCE` are starting assumptions for playtesting, not claims about the reference app.
- Ghost Mode is deferred because it only has meaning if Runners can see Hunters, which the current role projection forbids.
