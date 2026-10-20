# 100-player load test

**Result: PASS** against the project’s Step 1.8 acceptance criteria.

| Metric | Result |
|---|---:|
| Concurrent simulated players | 100 |
| Sustained run | 600 seconds (10 minutes) |
| Scheduled simulator ticks | 9,063 |
| Simulated Edge API requests | 9,055 (15.09 requests/second) |
| Simulated database RPC calls | 27,380 |
| Request errors | 0 / 9,055 (0%) |
| RPC errors | 0 / 27,380 |
| RPC latency p95 | 1.063 ms |
| RPC latency maximum | 7.414 ms |
| pgbench transaction latency average | 1.503 ms |
| pgbench failed transactions | 0 |

## Method

`bash scripts/run-load-test.sh` created a disposable PostgreSQL 18.6 instance, applied the repository migration chain and schema smoke tests, populated one active match with 100 distinct fake players (10 Hunters, 90 Runners), and used 100 concurrent `pgbench` clients for 600 seconds. Each client represents a fixed player slot. Its schedule models GPS uploads at the client’s 10-second minimum, a moving fix over 10 metres per accepted upload, and two `/sync` requests after a jittered 30–45-second poll interval. The benchmark measures every SQL RPC in the current location and sync API fan-out and counts request/RPC errors. The temporary database and raw pgbench logs were deleted after summary extraction.

## Limits

This is a local PostgreSQL RPC load test using the repository’s vanilla Supabase shim, not a hosted Supabase/Edge/Realtime deployment. It excludes internet latency, WebSocket traffic, browser rendering, and managed-project resource limits. The result is specific to this local PostgreSQL 18.6 host and is not a production capacity guarantee. A prior random-endpoint smoke model was discarded because it did not honor the client-side GPS pacing; the reported run uses the corrected per-player schedule.
