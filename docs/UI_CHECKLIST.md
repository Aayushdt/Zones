# UI Contributor & Quality Checklist

Every frontend feature, screen, or bug fix for XZones must adhere to these mobile-first, outdoor real-time gaming rules before being committed.

---

### 1. Design Language & Tokens
- **Use Semantic Design Tokens:** Always use CSS custom properties defined in `theme/tokens.css` (`var(--color-surface)`, `var(--color-text)`, `var(--color-green)`, `var(--color-red)`, etc.). Never introduce ad-hoc hardcoded hex values in component CSS.
- **Sunlight Readability:** The game is played outdoors in bright sunlight. Maintain high contrast:
  - Critical HUD indicators (timers, roles, boundary alerts) must target >= 7:1 contrast.
  - Standard text must meet WCAG AA >= 4.5:1.
  - UI boundaries and interactive components must meet >= 3:1.
- **Dusk & Paper Compatibility:** Verify appearance in both dark (`dusk`) and light (`paper`) themes. Ensure `meta[name="theme-color"]` matches the canvas background (`#000000` / `#F4F8F5`) so mobile OLED status bars seamlessly blend.

---

### 2. Mobile Layout & Safe Areas
- **Dynamic Viewport Units:** Never use plain `100vh` on mobile layout containers; use `100dvh` or `100svh` to account for dynamic address bars and virtual keyboards.
- **Safe-Area Insets:** Floating HUD headers, floating action buttons, and bottom sheets must respect notched displays and gesture navigation bars:
  ```css
  padding-top: max(0.75rem, env(safe-area-inset-top, 0px));
  padding-bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
  ```
- **Zero Horizontal Scroll:** The layout must never produce horizontal overflow on viewports from 320 px wide upwards (`scrollWidth <= clientWidth`). Flex and grid children must declare `min-width: 0` where text might clip.
- **iOS Safari Auto-Zoom Prevention:** All interactive `<input>`, `<select>`, and `<textarea>` elements must declare `font-size: 16px` (or higher) to prevent iOS Safari from automatically zooming the viewport on focus.

---

### 3. Touch Targets & Ergonomics
- **44x44 CSS px Minimum:** All primary interactive elements, back buttons, modal triggers, and form buttons must measure at least 44x44 CSS px bounding box to allow reliable one-handed operation while walking or running outdoors.
- **Tactile Spacing:** Maintain at least 8 px spacing between adjacent actionable touch targets to prevent accidental mis-taps under movement.

---

### 4. Accessibility (a11y) & Screen Readers
- **Semantic Headings & Landmarks:** Every route must have a single `<h1>` landmark. On graphical HUDs or logos, provide an accessible `<h1 className="sr-only">`. Never skip heading levels (e.g., jumping from `<h1>` to `<h3>`).
- **Focus Rings:** Never remove `:focus` or `:focus-visible` outlines without providing a visible replacement. All interactive controls must show `var(--color-focus-ring)`.
- **Modals & Overlays:** Modals (such as the QR Camera Scanner) must trap keyboard focus, support closing via the Escape key, and restore focus to the triggering element upon closure.
- **No Per-Second Live Regions:** Important game events (Tagged, Zone Shrinking, Connection Lost) should be announced via polite status messages (`aria-live="polite"` or `role="status"`). **NEVER** attach `aria-live` to clock timers or countdown seconds, as this floods screen readers with uninterrupted ticks.

---

### 5. Role Privacy & Security (Zero Information Leaks)
- **Zero Data Visibility Regressions:** The UI must NEVER expose hidden role data or live runner locations to the Hunter.
  - Hunter clients receive only stale, periodic runner ping snapshots (`data.runner_snapshots`). Live runner fixes must never appear in Hunter DOM elements, data attributes, tooltips, or accessible names.
  - Active camouflage status and hidden positions must remain completely concealed from the DOM tree until revealed by official game rules.

---

### 6. Performance & Animation Guardrails
- **Isolate Fast Tickers:** Clocks, countdown rings, and seconds tickers must be colocated in leaf components (like `<HudTimer />`). Never trigger root-level state updates from high-frequency intervals.
- **Map Marker Stability:** Always pass memoized coordinate structures to `<GameMap />`. Avoid allocating new object literals on timer ticks when players are stationary.
- **Compositor-Only Motion:** Animate only `transform` and `opacity`. Avoid animating layout properties (`width`, `height`, `top`, `left`).
- **Reduced Motion:** Respect `prefers-reduced-motion` settings. The global stylesheet disables prolonged transitions and loops when reduced motion is preferred.
- **Bundle Budgets:** Run `node scripts/check-bundle-budget.mjs` before committing. Keep initial entry JS below 130 kB gzip and global CSS below 30 kB gzip. Only import required Latin font weights.
