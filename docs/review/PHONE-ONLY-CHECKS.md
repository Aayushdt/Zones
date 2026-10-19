# Physical Android Checks (Phase A PWA)

These cannot be proven by the simulator or desktop browser. Use the deployed HTTPS site on a real Android phone, signed into a test guest session. Keep play in a permitted public area and stop if the device/app behaves unsafely. Do not use private/residential coordinates for reports.

## Checklist and report format

For each check, report: **phone model / Android version / browser version / app URL / test date / steps / expected / actual / pass or fail / relevant screenshot or console text**. Never include access tokens, join codes, QR values, or precise coordinates.

1. **Real GPS and accuracy:** Join a test match, grant while-in-use precise location, walk a short safe route with screen on, then stand still. Confirm own marker and accuracy/status text update; deny or set approximate location and confirm the UI explains the condition. Report whether updates pause when the browser is backgrounded.
2. **Screen lock and wake lock:** Start an ACTIVE match, leave the page foregrounded, wait through the OS display timeout, then unlock. Confirm wake-lock behavior and whether tracking stops/restarts. The PWA does not promise reliable locked-screen tracking.
3. **Camera QR scan:** As Hunter, open scan, grant camera permission, scan a fresh Runner QR, then try expired and already-used QR values. Repeat with camera denied and verify the Runner fallback path. Do not send QR images or token strings in reports.
4. **Battery / thermal behavior:** Run a 45-minute match with the screen awake and location enabled. Note start/end battery percentage, device warmth, and whether uploads/status become stale. This is observational, not a battery-life guarantee.
5. **Real network transitions:** During a test match, briefly switch Wi-Fi/mobile data off and on. Confirm offline/stale indication, retry/recovery, and that duplicate actions do not create duplicate tags or matches.
6. **Permissions and lifecycle:** Test location denied, camera denied, permission revoked mid-match, tab hidden/returned, refresh mid-match, and browser closed/reopened. Report permission prompt timing and whether location is cleared after tag/leave/end.
7. **Touch and layout:** Check 320px-wide viewport, safe-area edges, 44px controls / 56px primary action, Dusk and Paper readability outdoors, screen reader labels/status, keyboard/focus where a hardware keyboard is available.

## Results

All items are **UNVERIFIED — requires a physical Android phone and a live HTTPS deployment** until a human runs them and records actual results here.
