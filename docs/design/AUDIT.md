# Phase 0 UI audit

## Stack and structure

- React 19, TypeScript, Vite, React Router, Zustand, MapLibre; styles are global CSS in `src/index.css`, `src/App.css`, and `src/components/GameMap.css`.
- Routes cover home/onboarding, create, join, lobby, head start, match HUD, pings, tag/QR, results, host claim, settings, guide, bug report, and a development simulator.
- The existing app already persists Dusk/Paper and map-style preferences, uses MapLibre only after a map route needs it, and updates map markers/layers in place.

## Existing design assets to extend

- Theme semantic variables: `src/theme/tokens.css` (PARTIAL — expand, do not replace with a parallel system).
- Variable fonts: Bricolage Grotesque, Manrope, and JetBrains Mono (PRESENT-BUT-DIFFERENT — retain existing free font packages; use mono only for codes/timers/numbers).
- Reusable forms and state panels: `App.css`, `StatePanel.tsx` (PARTIAL — consolidate presentation classes).
- Existing map and zone layers: `GameMap.tsx`, `ZonePicker.tsx` (PARTIAL — move hard-coded colours to tokens, preserve role filtering).

## Audit findings

- Presentation classes are duplicated across page and global CSS; hard-coded map/QR/overlay colours remain outside the token file.
- `theme` supports only Dusk/Paper; the concept's System option is absent.
- Existing accessible semantic controls, focus ring, offline banner, and reduced-motion override provide a sound base; cards, action hierarchy, and visual grouping need redesign.
- No account, public-lobby, clues, statistics, shop, safe-zone, POI, satellite-map, or spectator features exist. They are omitted under the board mapping.
- Server-safe role handling is already enforced in `GameMap`: Runner payloads exclude hunters; Hunter snapshots are shown only for Hunters. This must remain unchanged.
- Before screenshots can cover locally renderable Home, Create, Join, Settings, Guide, and route-state screens without a live match fixture. Live lobby/map/tag/results require role-safe server state and are captured in end-to-end verification once a local stack is available.
