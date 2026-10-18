# Real-phone test checklist (HTTPS required)

Geolocation and camera permissions require a secure context on a phone. Deploy the PWA to an HTTPS hostname first; `http://localhost` is an exception only on the device itself, and a LAN IP over HTTP is not secure.

## Before testing

1. Create a Supabase project and configure its URL and anon key in the deployment's public variables.
2. Apply `backend/supabase/migrations` and deploy the single `api` Edge Function. Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JOIN_CODE_HMAC_SECRET`, `QR_SIGNING_SECRET`, and `RATE_LIMIT_HASH_SECRET` as server-only Function secrets.
3. Enable anonymous Auth and private Realtime as required by the setup docs. Never put service-role or signing/HMAC secrets in browser variables.
4. Use two or more Android phones with a current browser. Start in a permitted, open, safe area and keep the phones with their players.

## Test on each phone

- Open the HTTPS deployment at 320px or a narrow phone viewport; verify the page and controls fit.
- Create a private game on one phone and join by code on another. Check team assignment, Ready, and host Start.
- Deny location permission and confirm Ready is blocked with a clear explanation. Grant while-in-use permission and Ready again.
- Verify same-team live locations only. A Runner must never receive Hunter coordinates or opponent markers. Hunters should receive Runner coordinates only as scheduled, age-labelled pings, not as a live stream.
- Put the app in the background for over 30 seconds and briefly disconnect/reconnect network. Confirm location uploads pause and stale/offline state is clear; foreground and verify sync resumes.
- Test Runner QR display and Hunter camera scan. Also deny camera access and confirm the Runner “I was tagged” fallback remains usable.
- Complete a tag and a match end. Confirm results display and that the tagged/leaving/ended player's latest fix is removed.
- Check that no GPS proximity alone tags a player. Confirm the server-derived timer, team counts, Dusk/Paper setting, and safe-play prompts.

## Report back

Share phone model, Android version, browser/version, deployment URL (if public), which steps passed or failed, and visible error text. Do not send coordinates, join codes, QR tokens, access tokens, or server secrets. A short screen recording can help for UI issues; avoid recording private location details.

## Safe play

Play only where games are permitted. Stay out of roads, private property, and restricted areas; walk and remain aware of bystanders. Stop if anyone feels unsafe or asks to end the match. Do not use the game while driving or cycling.
