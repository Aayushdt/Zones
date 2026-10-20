# Findings register

Each status reflects the evidence presently available. No production data or remote project was accessed.

| ID | Severity | Status | Area | Summary |
| --- | --- | --- | --- | --- |
| DB-001 | Medium | LIKELY | Auth abuse | Anonymous sign-in is enabled with no configured CAPTCHA in the checked-in configuration. |
| DB-002 | Medium | UNVERIFIED | Realtime | Private topic RLS exists in migrations, but the hosted **Allow public access** Realtime setting was not inspectable. |
| DB-003 | Low | LIKELY | Deployment hardening | The versioned local Auth redirect configuration mixes `http` site URL and `https` additional redirect URL. |

## DB-001 — anonymous account growth / abuse controls

- **Evidence:** `backend/supabase/config.toml:177` enables signup, `backend/supabase/config.toml:179` enables anonymous sign-ins, `backend/supabase/config.toml:203` sets 30 anonymous users/hour/IP, and CAPTCHA is only commented at `backend/supabase/config.toml:214`.
- **Impact:** an attacker can consume anonymous-account capacity and associated database resources. The official Supabase anonymous-auth guidance specifically recommends CAPTCHA/Turnstile and notes that anonymous users are stored until an application deletes them.
- **Why LIKELY, not VERIFIED:** `config.toml` governs local development; production Auth dashboard settings and anonymous-user cleanup were not accessible.
- **Validation:** inspect hosted Auth configuration and confirm CAPTCHA plus an anonymous-user retention job in a non-production project.

## DB-002 — hosted Realtime authorization switch

- **Evidence:** RLS receive policies are defined in `backend/supabase/migrations/202610180006_realtime_role_authorization.sql:36` and the client/server explicitly use private topics at `apps/web/src/services/supabase-api.ts:484` and `backend/supabase/functions/api/broadcast.ts:30`.
- **Impact:** if the hosted project's Realtime setting permits public channels, it weakens the intended private-only channel posture and leaves configuration drift undetected.
- **Why UNVERIFIED:** the Realtime Settings value is not represented in migrations/configuration and Docker access prevented a full local Realtime exercise.
- **Validation:** set hosted Realtime **Allow public access** to disabled, then run the access matrix with two synthetic users across both role topics.

## DB-003 — local redirect URI consistency

- **Evidence:** `backend/supabase/config.toml:160` uses `http://127.0.0.1:3000`, while `backend/supabase/config.toml:164` permits `https://127.0.0.1:3000`.
- **Impact:** local redirect flows can fail or diverge from expected development behavior.
- **Why LIKELY:** only the versioned local configuration was inspected; deployed URLs are unknown.
