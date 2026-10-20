# XZONES Dusk/Paper UI redesign progress

| Step | Title | Classification | Status | Evidence | Gate | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 0.1 | Existing UI audit | PARTIAL | DONE | `AUDIT.md` | Static review | Existing UI and product feature inventory recorded. |
| 0.2 | Board mapping | PRESENT-BUT-DIFFERENT | DONE | `board-mapping.md` | Privacy crosswalk | Unsupported board elements explicitly omitted. |
| 0.3 | Before screenshots | PARTIAL | DONE | `verification/before/{home,create,join,settings,guide}.png` | Chromium at 375×812 | Live match fixtures remain deferred to end-to-end verification. |
| 0.4 | Board colour sampling | ABSENT | DONE | `board-colours.md` | Image quantization | Sampled design-board swatches documented. |
| 1 | Foundations | PARTIAL | DONE | semantic token layer, System theme, pre-paint script, contour texture | Web build + lint | Build passes; lint warnings pre-existed in effect-heavy pages. |
| 2 | Shared primitives | PARTIAL | DONE | existing buttons, cards, chips, segmented controls and form controls restyled as a system | Web build + 7 e2e | Native semantic controls retained; Radix was not added because no missing interaction primitive required it. |
| 3 | Entry, setup, lobby | PARTIAL | BLOCKED | Home, Create, Join and Lobby presentation; local loading/error/offline states retained | Web build + 7 e2e passed; screenshot capture blocked | `tools/capture-ui.mjs` could not resolve `playwright` from the root tools directory after two local attempts. |
