# Active-match request budget

This estimate describes the client behavior after Step 1.4. It counts browser-to-Edge API requests separately from database RPCs; Realtime WebSocket messages are not counted as HTTP requests. It assumes 100 players remain active for one hour.

## Per-player budget

| Traffic | Expected rate | Fast-poll / movement ceiling | Notes |
|---|---:|---:|---|
| Match fallback sync | 3.2 API requests/min | 4/min | One jittered cycle every 30–45 seconds (37.5-second mean); the map currently calls both `syncMatch` and `syncClock`, each through `/sync`. |
| Match sync database fan-out | 16 RPC/min | 20/min | Each `/sync` makes up to five RPCs: lobby status, match sync/resolve, controls, team positions, and clock. |
| Location uploads | 0 while stationary; up to 6/min when moving | 6/min | Client sends no more than once per 10 seconds and requires 10 m movement after the previous accepted fix. One `/location` request uses two RPCs (resolve and update). |
| Location database fan-out | 0 while stationary; up to 12 RPC/min when moving | 12/min | Two RPCs for each accepted upload. Server rate limits can reduce this further. |
| Pings view fallback sync | 1.6 API requests/min | 2/min | One `/sync` per jittered cycle; no separate clock API call. |

For a player on the map who is moving continuously enough to trigger every allowed upload, the expected total is about **9.2 Edge API requests/minute** (3.2 match sync plus 6 location uploads), or **10/minute** at the fastest fallback interval. Expected database fan-out is about **28 RPC/minute**, up to **32/minute** at the fastest fallback interval. A stationary map player receives only the fallback portion, about 3.2 API requests and 16 RPC/minute.

## 100-player hour

| Scenario | Edge API requests / 100-player hour | Database RPCs / 100-player hour |
|---|---:|---:|
| 100 players on map, stationary | 19,200 | 96,000 |
| 100 players on map, continuous movement at the client upload ceiling | **55,200 expected**; 60,000 fast-poll upper estimate | **168,000 expected**; 192,000 fast-poll upper estimate |
| 100 players on Pings view, continuous movement | 45,600 expected | 120,000 expected |

The request totals use 96 expected fallback cycles/hour (3,600 seconds / 37.5 seconds) or 120 cycles/hour at the 30-second minimum. Map totals count two `/sync` calls per cycle; Pings totals count one. Continuous movement assumes the client meets its 10 m displacement gate on every 10-second upload opportunity.

## Exclusions and caveats

- Initial page loads, channel membership checks, reconnect reconciliation, manual syncs, visibility-resume syncs, lobby actions, result actions, and retries add event-driven traffic; they are excluded from the steady-state hour.
- Realtime presence/broadcast traffic uses WebSockets and may add connection/message load without adding a request per event.
- The five-RPC `/sync` count is the current active-match API path. Reducing the duplicate map `/sync` calls is a separate optimization and would lower this estimate.
- This is a call-count model, not a load test, capacity claim, billing estimate, or latency guarantee. Step 1.8 measures actual behavior under 100 simulated players.
