# Concept board mapping

| Board element | Maps to | Decision |
| --- | --- | --- |
| Contour splash with XZONES identity | `HomePage`, global theme tokens | Build/adapt; retains guest safety confirmation and no-account flow. |
| Create Account / Sign In | NONE | Omit; product uses anonymous guest sessions. |
| Get started / Join with code | `HomePage`, `JoinPage` | Adapt. |
| Choose a Game / Hide and Seek card | `HomePage`, `GuidePage` | Adapt as a single, data-ready Hide & Seek entry; no fake modes. |
| Murder game card | NONE | Omit; only Hide & Seek exists. |
| Create-game segmented controls and zone preview | `CreatePage`, `ZonePicker` | Adapt existing timer, ping, head-start, boundary, and preset controls. |
| Lobby mini-map / player list / host and ready badges | `LobbyPage`, `ZonePicker` | Adapt using actual private-code, role, ready, controller, and remove-player data. |
| Public / require approval controls | NONE | Omit; all games are private-code lobbies. |
| Share / QR lobby code | `LobbyPage`, existing `qrcode` package | Adapt only after preserving existing code access rules. |
| Full map HUD / zone ring / role markers | `MatchPage`, `GameMap` | Adapt; preserve role-filtered payloads. |
| Hunter markers or distances for Runners | NONE | Omit; never sent by the server. |
| Hunter live Runner distances | NONE | Omit; Hunters receive scheduled snapshots only. |
| Players panel | Existing match payload/roster only | Adapt only from role-safe data already present. |
| Clues tab and clue cards | NONE | Omit; no clues feature exists. |
| Safe zone, danger zone, POI legend | NONE | Omit; existing layer is the optional circular game boundary and next shrink boundary. |
| Satellite / third-party styles | NONE | Omit; existing map source is OpenFreeMap styles only. |
| Settings theme/map/haptics | `SettingsPage`, `app-store` | Adapt; no low-battery toggle because it does not exist. |
| Stats / XP / Economy / shop | NONE | Omit; no implementation exists. |
| Spectate | NONE | Omit; explicitly deferred in product rules. |

## Privacy crosswalk

Runner screens show only the Runner's own and teammates' live positions. Hunter screens show only Hunter-team live positions plus server-authorized scheduled Runner snapshots, with their age. The UI performs no supplementary fetches to create markers, distances, players, or legends.
