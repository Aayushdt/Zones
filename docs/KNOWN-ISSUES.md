# Known issues and unverified work

This list records incomplete implementation or checks. It does not imply that an external integration was verified.

## Requires a Supabase project

- No hosted Supabase project is configured. Private create/join, anonymous Auth, Edge Function RPCs, server secrets, RLS, and private Realtime have not been exercised end to end against Supabase.
- `supabase start` fails in this development environment because access to `/var/run/docker.sock` is denied. A `supabase-realtime` GitHub Actions job now starts the real local Supabase stack, serves the `api` Edge Function, and exercises Auth/Realtime; it has not run yet. Migrations and SQL smoke tests were run on temporary vanilla PostgreSQL with test-only Auth/Realtime shims.
- Realtime event publishing and client application are implemented, with role projections, RLS predicates, mocked transport tests, client deduplication, and a real-stack integration script. Actual Supabase topic admission, delivery latency, tag/leave revocation, and `realtime.messages` persistence checks remain unverified until that job passes.

## Gameplay and phone verification

- Live teammate coordinates are stored in one mutable row and published to private same-team topics after accepted uploads. The map applies role-projected, deduplicated events and keeps a 15-second sync fallback. End-to-end live delivery is not verified until the Supabase integration job passes.
- Browser tests cover onboarding, settings persistence, join-code validation, and offline messaging. They do not create a real match or exercise location permission, camera, QR tagging, device background suspension, or two-phone play.
- The PWA requires HTTPS on phones for geolocation and camera. No HTTPS deployment or Android device test has been done. Phase A does not provide reliable lock-screen/background location; keep the phone with you and the screen awake.
- Cloudflare Pages deployment is configured as a manual, opt-in workflow but has not been configured or run. GitHub Actions CI and its Supabase integration job have not run on GitHub.

## Build and provider notes

- Production build emits a warning for the MapLibre chunk (about 1.07 MB uncompressed); it is about 289.61 KB gzip and within the plan's compressed map budget.
- Oxlint exits successfully with existing React-effect and hook-dependency warnings. They are not treated as build failures.
- OpenFreeMap is the default external tile source. Tile availability and terms can change; the source's continued availability is not guaranteed.
- No `LICENSE` file exists. The project owner must choose MIT or all-rights-reserved before public reuse/redistribution.

## Not started

- Phase B Capacitor/Android packaging, foreground service, signed APK, and release workflow.
- Deferred plan items such as shrinking zones, Radio/chat, spectating, moderation, accounts, public lobbies, push notifications, and satellite maps.
