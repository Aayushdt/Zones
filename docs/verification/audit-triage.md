# Audit Defect Triage — 2026-10-20

The referenced `full_audit_report.md` is absent from the checkout and from the available local repository history. `error.md` is the available Phase A audit report and records all 13 findings. This triage uses that report, current `docs/KNOWN-ISSUES.md`, and the baseline suite in `baseline.md`.

| Finding | Severity | Current status | Evidence / action |
|---|---|---|---|
| F-01 | Critical | Fixed and verified | `error.md` records fix `0739254`; current game-core, SQL scenario, and full baseline pass. |
| F-02 | Critical | Implemented; real-stack verification open | Role-projected publisher, client subscription, authorization, and `tests/realtime/integration.mjs` exist. `docs/KNOWN-ISSUES.md` records that the Supabase stack job has not run because Docker access is unavailable. Keep this open until the integration job passes; do not claim live delivery verified. |
| F-03 | High | Fixed and verified | `error.md` records fix `0b3ef2d`; Edge tests and SQL checks pass. |
| F-04 | High | Fixed and verified | `error.md` records fix `0b3ef2d`; hostile API and SQL checks pass. |
| F-05 | High | Fixed and verified | `error.md` records fix `eb93ab8`; SQL lifecycle scenario passes. |
| F-06 | High | Fixed and verified | `error.md` records fix `e5d60b9`; SQL lifecycle scenario passes. |
| F-07 | High | Fixed and verified | `error.md` records fix `652eca5`; shared rules and SQL scenario pass. |
| F-08 | Medium | Fixed and verified | `error.md` records fix `3b11f92`; SQL and payload privacy tests pass. |
| F-09 | Medium | Fixed and verified | `error.md` records fix `5645f6a`; hostile API and SQL checks pass. |
| F-10 | Medium | Fixed and verified | `error.md` records fix `b0c8415`; hostile API and client logic tests pass. |
| F-11 | Medium | Fixed and verified | `error.md` records fix `5645f6a`; hostile API and SQL checks pass. |
| F-12 | Medium | Fixed and verified | `error.md` records fix `a61c62a`; client lifecycle tests pass. |
| F-13 | Medium | Fixed and verified | `error.md` records fix `a61c62a`; client lifecycle and SQL tests pass. |

The only open Critical/High item is F-02's external Supabase integration verification. No additional application fix is justified from the available evidence; the implementation is present, but the required real-stack result cannot be produced without a working Docker-backed Supabase environment or its CI result. Phase 1.4 must preserve the existing Realtime-first behavior and report fallback polling separately.
