# Proposal: schedule bounded cleanup outside request paths

This is a design proposal, not an applied migration or deployment change.

- Invoke the existing `xzones_cleanup` from a managed scheduler at a reviewed cadence, using a dedicated least-privilege service identity.
- Keep the request-path call as a best-effort fallback only if latency measurements justify it.
- Emit count/duration/error telemetry without identifiers and alert if the scheduler has not completed within two expected intervals.
- Before enabling production cleanup, validate the existing function against synthetic expired rows in a disposable staging database.
