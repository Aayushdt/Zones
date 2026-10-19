# XZones real-phone verification checklist

These checks cannot be established by the current Chromium emulation run. Use a real Android phone on the deployed HTTPS URL (not an HTTP LAN address). Test with another player on a separate phone when the backend is available. Do not test in a street, roadway, private property, or any area where play is unsafe or unauthorized.

For each item, report phone model/Android version, browser version, network type, match ID (do not share join codes or QR tokens), approximate timestamp, expected result, actual result, and a screenshot/video that contains no location coordinates or private game codes.

1. **GPS drift and accuracy:** In a safe open area, compare the displayed accuracy circle and own marker while stationary, then walk a short route. Report whether stale/low-accuracy status is clear and whether marker movement recovers.
2. **Screen lock/background:** Start a test match, background the browser, lock for 1 and 5 minutes, then return. Report GPS watcher, wake-lock behavior, timer continuity, and recovery banner. Avoid sharing location logs.
3. **Battery:** Record battery percentage before and after a 30-minute match with the screen on and map visible. Report device heat and any OS battery warning.
4. **Camera QR scan in daylight:** On Hunter and Runner devices, create a fresh tag QR and scan outdoors in bright and shaded light. Test permission prompt, denial/recovery, expiry, replay rejection and manual fallback. Do not share QR images/tokens.
5. **Haptics:** Enable haptics in settings and exercise supported feedback, then disable it. Report whether the setting persists after reload.
6. **Mobile network:** Test on mobile data and Wi-Fi; briefly toggle airplane mode during a match, restore the network, and report banner, state recovery, duplicate actions and event delay.
7. **Install to home screen:** Install the HTTPS PWA from the browser menu, launch it from the icon, then check update and offline behavior. Report browser/device and any install prompt issues.
8. **Small-device layout:** Check 320px/360px width, portrait and landscape; ensure controls remain reachable, safe areas are respected, and no horizontal scrolling hides important actions.

Status: **PHONE-ONLY / not run** in this verification pass. No real phone or real-world GPS/camera/battery test was available to Codex.
