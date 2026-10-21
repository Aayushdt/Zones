# XZones Responsive & Motion Design System

## 1. Breakpoints & Viewport Architecture

XZones uses a 6-tier fluid breakpoint grid combined with CSS Container Queries (`@container`) for modular component adaptation:

| Tier | Range | Device Archetype | Primary Layout Strategy |
| :--- | :--- | :--- | :--- |
| **Micro** | `320px – 359px` | Ultra-compact phones (SE 1st gen, watches) | Stacked single column, compact typography (`clamp(11px, 3.5vw, 13px)`), touch targets padded to $\ge 48\text{px}$. |
| **Phone Portrait** | `360px – 479px` | Modern phones (iPhone 13/14/15/16, Galaxy S) | Single column, sticky bottom action bar with `env(safe-area-inset-bottom)`, bottom sheets for modals. |
| **Phone Landscape** | `480px – 767px` (short height $<500\text{px}$) | Landscape smartphones (`844x390`, `932x430`) | **Split Horizontal HUD**: top bar compacts to left pill; bottom sheets convert into right slide-out panel (`width: 320px`), preserving 100% map visibility. |
| **Tablet** | `768px – 1023px` | iPad, iPad Mini, Surface portrait | 2-column ergonomic split (Lobby dual team cards side-by-side, Settings 2-column grid, Map with floating sheet). |
| **Laptop / Desktop** | `1024px – 1599px` | MacBook, ThinkPad, 1080p Desktop | **Three-Zone Workspace**: left rail navigation, center interactive workspace/map, right sticky preview & telemetry panel. Keyboard shortcuts active. |
| **Ultrawide** | `1600px+` | 1440p, 4K, 21:9 monitors | Max content centered at `1400px` with dynamic side gutters. Map canvas expands fluidly; typography scales via clamp. |

---

## 2. Fluid Layout & Container Queries

* **Viewport Height:** Always `100dvh` (fallback `100vh`), eliminating mobile browser address bar jump bugs.
* **Safe Areas:**
  ```css
  padding-top: max(1rem, env(safe-area-inset-top));
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
  ```
* **Component-Level Containers:**
  `card`, `team-card`, and `setting-row` use `@container (min-width: 380px)` and `@container (min-width: 520px)` so components respond to their container's width, whether placed in a narrow drawer, mobile column, or wide desktop pane.

---

## 3. Pointer & Input Awareness

* **Fine Pointers (`@media (hover: hover) and (pointer: fine)`):**
  * Subtly elevated cards on hover (`transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0, 255, 137, 0.12);`).
  * Micro-tooltips on icon buttons.
  * Interactive cursor changes.
* **Coarse Pointers (`@media (pointer: coarse)`):**
  * All interactive elements enforce `min-height: 48px; min-width: 48px;`.
  * Sticky hover states are eliminated (no sticky hover bugs on touch).
  * Direct tactile tap animations (`:active { transform: scale(0.97); }`).

---

## 4. Motion Tokens & Easing Curves

All animations follow strict motion curves and timing tokens:

| Token | Duration | Cubic Bezier Curve | Usage |
| :--- | :--- | :--- | :--- |
| `--motion-instant` | `120ms` | `cubic-bezier(0.2, 0, 0, 1)` | Micro-interactions: button presses, toggles, icon flips. |
| `--motion-fast` | `200ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Selection highlights, tab indicator shifts, accordion expansion. |
| `--motion-base` | `320ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Drawer slides, modal entrances, page cross-fades, banner reveals. |
| `--motion-spring` | `450ms` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Confetti bursts, winner trophy pops, XP progress ring fill. |

### Accessibility (`prefers-reduced-motion`)
When `prefers-reduced-motion: reduce` is detected or "Reduce effects" is toggled:
* Durations are clamped to `0.01ms`.
* Transforms, radar pulses, and confetti particles are disabled.
* Transitions become instant cuts or simple opacity fades ($< 100\text{ms}$).

---

## 5. Reactive Game Feedback

1. **Dynamic Countdown Ring:**
   * SVG circle stroke-dashoffset tracking time remaining.
   * Color transitions: Green (`>60s`) $\to$ Amber (`30s – 60s`) $\to$ Red ($<30s$).
   * Subtle pulsing opacity in the critical last 10 seconds.
2. **Hold-to-Confirm Tag Button:**
   * Requires 1.2s continuous hold to prevent accidental triggers while running.
   * Radial or linear progress fill in Seeker Red with haptic feedback at start, tick, and complete.
3. **Web Audio Synthesizer (Optional, default OFF):**
   * Zero external MP3 files. Uses Web Audio API oscillator synthesis.
   * Pings: soft sine wave chirp ($880\text{Hz} \to 1320\text{Hz}$, 80ms).
   * Tag confirmed: dual-tone celebratory chime ($523\text{Hz} \to 659\text{Hz}$, 120ms).
   * Warning: subtle amber pulse tone ($440\text{Hz} \to 330\text{Hz}$, 150ms).
4. **Keyboard Shortcuts:**
   * `Enter`: Join lobby / Continue.
   * `Esc`: Close modal / dismiss drawer.
   * `C`: Copy room code / share link.
   * `T`: Trigger Tag confirmation modal (Seekers).
   * `?`: Toggle keyboard shortcuts cheatsheet popover.
