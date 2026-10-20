# Hide & Seek Phase 3: Three-phone verification

Run this checklist on three physical phones using the same HTTPS deployment: one Hunter and two Runners. Apply all Supabase migrations and deploy the API Edge Function first. Use a permitted, open area; never test near roads, restricted land, or people who have not agreed to participate. Record pass/fail and visible errors, but do not record or share exact coordinates, join codes, QR tokens, or credentials.

## Setup

- Confirm all three phones have current location permission enabled, network access, and the deployed app open in a foreground browser.
- On Phone 1 create a Hide & Seek match; join Phone 2 and Phone 3 as Runners. Start with a small, safely walkable zone and a short round timer for testing.
- Verify roles and match settings on all phones. Verify a Runner cannot see Hunter coordinates and receives no direct opponent location stream.

## Scenarios

1. **Happy path and GPS tag:** Keep Phone 2 inside the active zone. Bring Hunter Phone 1 within the configured tag radius, tap **GPS Tag**, and verify a server-confirmed success, the Runner's tagged state, stopped location sharing, and updated match state. Confirm the other Runner remains active.
2. **Tag range boundary:** With Phone 3 active, attempt GPS Tag just outside the configured radius, then just inside it. The outside attempt must display **Nothing in range** without exposing Runner identity or distance; the inside attempt must be accepted at most once. Allow for GPS accuracy and do not treat a noisy boundary sample as a deterministic exact-distance assertion.
3. **Zone shrink:** Leave Phone 3 in the current zone while the next zone advances. Verify the map shows the current zone, next-zone preview, and timer before the transition, then shows the new active zone. Confirm no premature elimination.
4. **Zone exit and re-entry:** Move Phone 3 clearly outside the active zone and keep it there. Verify the warning/reveal path and grace-period behavior; return inside before the configured elimination threshold and confirm the outside timer resets. Repeat and remain outside past the threshold; verify elimination and location cleanup, not a GPS tag.
5. **QR fallback:** Generate a one-time Runner QR on Phone 3 and scan it with Hunter Phone 1. Verify the server-confirmed tag. Also verify an expired/invalid QR cannot tag, and the Runner's **I was tagged** fallback remains available if camera permission is denied.
6. **Stationary Runner:** In a fresh match, leave Phone 3 safely stationary while maintaining valid location updates. Verify movement beyond the configured 15 m threshold resets the stationary timer; otherwise, verify a warning around four minutes and reveal at five minutes. This reveal must not eliminate or tag the Runner.

## Completion record

For each scenario record PASS/FAIL, phone model, OS and browser versions, approximate test conditions, and any visible error text. Report failures without including coordinates, match codes, QR material, authentication tokens, or server secrets. The automated suite does not replace these real-device geolocation, camera, and timing checks.

