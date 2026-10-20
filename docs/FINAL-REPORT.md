# Hide & Seek final report

## Parity

| Feature | Status | Evidence |
| --- | --- | --- |
| Server-authoritative teams, timers, tags, and wins | Complete | `backend/supabase/migrations/202610180001_core.sql` |
| Zone schedule, exit enforcement, and timer-off | Complete | `backend/supabase/migrations/202610200020_zone_schedule_config.sql` |
| GPS/QR tagging and anti-cheat | Complete | `backend/supabase/migrations/202610200024_location_plausibility.sql` |
| Rejoin, stealth, offline tiles, chat, presets, guide | Complete | `apps/web/src/pages/MatchPage.tsx` |
| Optional item framework and six role-safe items | Complete | `backend/supabase/migrations/202610200033_item_framework.sql` |
| Ghost Mode | Deferred | `docs/design/ghost-mode-deferred.md` |

## Audit findings

Closed: D07 timer-off, D10 finish-time coordinate deletion, D14 zone picker, D15/D19 in-place map updates, D16/D17 PWA caching/icons, and D20 location watcher mutable state. Remaining: hosted Supabase, real HTTPS phone GPS/camera/background behavior, and live multi-device Realtime require deployment testing.

## Capacity

`docs/design/request-budget.md` records the per-player and 100-player request budget. `docs/verification/load-test.md` records the local 100-player/10-minute simulator: 9,055 API requests, 27,380 RPCs, zero errors, and 1.063ms p95 RPC latency.

## Manual three-phone script

1. Create a fixed-zone match on phone A, join as Hunter on A and Runner on B/C; verify role-safe maps and ready/start flow.
2. Verify zone shrink, leave the zone with good accuracy for warning/reveal/elimination, then repeat while Shield is active.
3. At tag-range boundary, test GPS Tag; test QR fallback and confirm a relay is refused.
4. Lock B's screen, enter/exit stealth screen, disconnect/rejoin B, and drop host A to claim controls from C.
5. Run once with items off, then with items on: Scan, Alarm, Zone Mover, Decoy, Shield, and Camouflage. Confirm alarms and Scan never reveal data to the wrong role.

## Tunables

All values marked `UNSPECIFIED-IN-REFERENCE` are centralized in `packages/game-core/src/hideAndSeekConfig.ts`: stealth hold 1500ms; map smoothing 250ms; tile cache 200; chat rate 2s/poll 5s; bug reports 2000 chars/1h; Scan 30s; Alarm 100m/300s/5s poll; Zone Mover 200m/50%; Decoy 50m; Shield 120s; Camouflage 30s. Items default off and one use each.

## Existing versus built

Earlier foundations existed in part and were completed or hardened during phases 0–4. Chat, presets, guide, bug reports, the optional item framework, all six scoped items, and Ghost Mode deferral documentation were built during this work branch.
