# Known issues and unverified work

This list records incomplete implementation or checks. It does not imply that an external integration was verified.

## Requires a Supabase project

- No hosted Supabase project is configured. Private create/join, anonymous Auth, Edge Function RPCs, server secrets, RLS, and private Realtime have not been exercised end to end against Supabase.
- Docker was unavailable to this development session, so `supabase start`, `supabase db reset`, and local Edge Function serving were not run. Migrations and SQL smoke tests were instead run on temporary vanilla PostgreSQL 18.6 with test-only Auth/Realtime shims.
- Realtime authorization predicates and event projections have local tests, but admission/publish behavior in Supabase Realtime remains unverified.

## Gameplay and phone verification

- Live teammate coordinates are stored and returned through the role-filtered match sync endpoint. The location upload endpoint does not itself publish a Realtime Broadcast; the map currently relies on its 15-second match sync fallback. True low-latency live position broadcasts have not been verified or implemented.
- Browser tests cover onboarding, settings persistence, join-code validation, and offline messaging. They do not create a real match or exercise location permission, camera, QR tagging, device background suspension, or two-phone play.
- The PWA requires HTTPS on phones for geolocation and camera. No HTTPS deployment or Android device test has been done. Phase A does not provide reliable lock-screen/background location; keep the phone with you and the screen awake.
- Cloudflare Pages deployment is configured as a manual, opt-in workflow but has not been configured or run. GitHub Actions CI has not yet run on GitHub.

## Build and provider notes

- Production build emits a warning for the MapLibre chunk (about 1.07 MB uncompressed); it is about 289.61 KB gzip and within the plan's compressed map budget.
- Oxlint exits successfully with existing React-effect and hook-dependency warnings. They are not treated as build failures.
- OpenFreeMap is the default external tile source. Tile availability and terms can change; the source's continued availability is not guaranteed.
- No `LICENSE` file exists. The project owner must choose MIT or all-rights-reserved before public reuse/redistribution.

## Not started

- Phase B Capacitor/Android packaging, foreground service, signed APK, and release workflow.
- Deferred plan items such as shrinking zones, Radio/chat, spectating, moderation, accounts, public lobbies, push notifications, and satellite maps.
