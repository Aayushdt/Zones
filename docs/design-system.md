# XZones Design System — Tactical Game UI

## 1. Vision & Architecture
XZones is an outdoor GPS action game (Seekers vs Hiders). The visual identity balances high-visibility tactical outdoors gameplay with a sleek cyberpunk neon-on-black aesthetic and a matching, accessible light theme for bright daylight conditions.

---

## 2. Design Tokens

### Dark Theme (Default)
- **Background (`--color-bg`, `--color-background`)**: `#000000` (true pitch black for OLED contrast and battery efficiency)
- **Surface Level 1 (`--color-surface`)**: `#060606`
- **Surface Level 2 (`--color-surface-2`)**: `#121212`
- **Border (`--color-border`)**: `#1F1F1F`
- **Text (`--color-text`)**: `#FFFFFF`
- **Muted Text (`--color-muted`)**: `#A7A7AF` (AA contrast >= 4.5:1)
- **Subtle Details (`--color-subtle`)**: `#75757F`
- **Green (Hider / Success / Join / Ready)**: `#00FF89`
  - Text on green: `#000000`
  - Tint: `rgba(0, 255, 137, 0.12)`
  - Ring / Focus: `#024C29`
  - Glow: `0 0 20px rgba(0, 255, 137, 0.35)`
- **Red (Seeker / Destructive / Host / Tag)**: `#FF3B3C`
  - Text on red: `#000000`
  - Tint: `rgba(255, 59, 60, 0.14)`
  - Ring / Focus: `#500A0A`
  - Glow: `0 0 20px rgba(255, 59, 60, 0.35)`
- **Amber (Warnings / Next Zone Shrink)**: `#FFB020`
- **Blue (Active Zone Boundary)**: `#38BDF8`
- **Neutral Surface / Inactive**: `#1F1F1F`

### Light Theme (Paper)
- **Background (`--color-bg`, `--color-background`)**: `#F4F8F5`
- **Surface Level 1 (`--color-surface`)**: `#FFFFFF`
- **Surface Level 2 (`--color-surface-2`)**: `#EAF1EC`
- **Border (`--color-border`)**: `#D3DFD7`
- **Text (`--color-text`)**: `#06130C` (13.8:1 contrast ratio)
- **Muted Text (`--color-muted`)**: `#4B5D52` (4.9:1 contrast ratio)
- **Subtle Details (`--color-subtle`)**: `#5B6C62`
- **Green**: `#00834A` (4.6:1 contrast ratio with white text)
  - Ink: `#007A43`
  - Tint: `#DDF7E8`
  - Glow: `0 0 16px rgba(0, 131, 74, 0.25)`
- **Red**: `#D91F26` (4.7:1 contrast ratio with white text)
  - Ink: `#B3141B`
  - Tint: `#FDE3E3`
- **Amber**: `#8A5200` / Tint: `#FFF1D6`
- **Blue**: `#0B6FA8` / Tint: `#E0F1FB`
- **Neutral Surface / Inactive**: `#D3DFD7`

---

## 3. Strict Color Semantics & Meaning

| Role / Intent | Token Color | Allowed Contexts | Forbidden Contexts | Accessible Indicator (Dual Coding) |
|---|---|---|---|---|
| **Hider (Runner)** | **Green** (`#00FF89` / `#00834A`) | Hider team card, Join Lobby button, Ready indicator, Success toasts | Seekers, Tags, Host CTA, Warnings | Eye-Off icon (`<EyeOff />`) + Green accent + "Hider" label |
| **Seeker (Hunter)** | **Red** (`#FF3B3C` / `#D91F26`) | Seeker team card, Tag confirm button, Host / Create CTA, Disband lobby | Hiders, Join CTA, Safe status | Crosshair icon (`<Crosshair />`) + Red accent + "Seeker" label |
| **Next Shrink Zone** | **Amber** (`#FFB020` / `#8A5200`) | Scheduled shrink circle, stationary penalty alert, GPS stale | Active circle, Hider safe state | Amber dashed line (`stroke-dasharray: 6 6`) + Clock/Alert icon |
| **Current Zone** | **Blue** (`#38BDF8` / `#0B6FA8`) | Active circular boundary, safe zone boundary line | Role indicators, destructive actions | Solid blue line (`#38BDF8`) + Zone badge |
| **Neutral Actions** | **Ghost / Outline** | "How to play", Settings, Copy Code, Share, Back, Filters | Never colored Green or Red | Outline/Ghost button styling with standard border token |
| **Selected State** | **Active Border + Check** | Selected team, active mode, active preset, active unit | Never color alone | 2px Accent Border + Check Icon (`<Check />`) |

---

## 4. Typography System
- **UI Body & Headings**: `Inter`, `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
  - Sentence case for all controls and titles.
  - Heading scale with `clamp()` for smooth device scaling.
- **Data, Timers & Coordinates**: `JetBrains Mono`, `ui-monospace, monospace`
  - `font-variant-numeric: tabular-nums` to prevent layout jitter on countdown ticks.
  - Lobby codes: uppercase, monospace, tracking `0.1em`.
- **Typographic Scale**:
  - Overline / Eyebrow: `11px` / `12px` (uppercase, letter-spacing `0.08em`, font-weight `700`)
  - Caption / Small: `12px` / `13px`
  - Body: `14px` / `15px` (`line-height: 1.5`)
  - Section Title: `18px` / `20px` (`font-weight: 700`)
  - Page Title: `clamp(22px, 4vw, 32px)` (`font-weight: 800`)

---

## 5. Responsive Layout System

### Shared Page Gutter
Every block, card, row, grid, and bottom action bar strictly shares the page gutter to prevent alignment mismatch:
- **Phone (<768px)**: `16px` (`--page-gutter: 16px`)
- **Tablet (768px – 1023px)**: `24px` (`--page-gutter: 24px`)
- **Desktop (>=1024px)**: `32px` (`--page-gutter: 32px`)

### Device Adaptations
1. **Phone (<768px)**:
   - Single column of full-width rounded cards.
   - Sticky bottom action bar (`--bottom-bar-height: 72px`).
   - Main container has `padding-bottom: calc(var(--bottom-bar-height) + env(safe-area-inset-bottom) + 16px)` so no content is obscured.
   - Team selection: side-by-side if width >= 420px, stacked if < 420px; both columns strictly share the 16px gutter.
   - Header with back button, truncated title, and non-wrapping action icons.
   - Interactive tap targets >= 48px on coarse pointer devices.

2. **Tablet (768px – 1023px)**:
   - Two-pane layouts (e.g., Settings + Roster, or Setup form + Map preview).
   - Horizontal tab pill navigation with smooth swipe and indicator fade.

3. **Desktop (>=1024px)**:
   - Multi-column layout: Left navigation rail + Centered main content + Sticky right panel (Live Map preview on Setup, Live Roster on Lobby, Tactical Event Log in Match).
   - Centered container with `max-width: 1400px`.
   - Scale map canvases dynamically to fill pane while keeping typography and controls at readable ergonomic scales.

### Horizontal Scroll Prevention
- `box-sizing: border-box` on all elements (`*`, `*::before`, `*::after`).
- `min-width: 0` on flex and grid children.
- Strict `max-width: 100vw; overflow-x: hidden;` on body and radar background overlays.
- Tested and verified 0 horizontal overflow across all viewports from 320px to 2560px.

---

## 6. Shared Component Inventory

1. **Button (`components/ui/Button.tsx`)**:
   - Variants: `primary-green` (Hider/Join), `primary-red` (Seeker/Host), `secondary-outline` (Neutral actions), `ghost` (Discreet actions), `destructive` (Leave/Cancel).
   - Sizes: `sm` (36px), `md` (44px), `lg` (56px).
   - Feedback: 0.97 press scale, hover lift on fine pointers, animated focus ring.

2. **IconButton (`components/ui/IconButton.tsx`)**:
   - Circular or square icon triggers with tooltip, accessible `aria-label`, and 44px minimum tap target.

3. **Input (`components/ui/Input.tsx`)**:
   - Floating label, leading icon slot, mono variant for codes, auto-uppercase, paste-friendly, inline validation messages.

4. **SegmentedControl (`components/ui/SegmentedControl.tsx`)**:
   - Equal-width grid cells, animated selection background, keyboard arrow navigation, wrapping or scrolling without overflow.

5. **Toggle (`components/ui/Toggle.tsx`)**:
   - Visible "ON" / "OFF" text inside track, thumb spring animation, accessible switch role (`role="switch"`, `aria-checked`).

6. **Tabs (`components/ui/Tabs.tsx`)**:
   - Icon + label support, horizontal scrollable pill bar on mobile with edge fade gradient, vertical rail navigation on desktop.

7. **SettingRow (`components/ui/SettingRow.tsx`)**:
   - Ergonomic ~72px height, label + 28px circular info button (`?`) on left, editable mono value on right, one-line summary under label, slider below.
   - Stacks gracefully on screens < 640px; disabled state with reduced opacity and explanatory tooltip.

8. **Slider (`components/ui/Slider.tsx`)**:
   - Custom styled track, accent thumb with glow on hover, step tick markers, fine-touch scrubbing.

9. **Card (`components/ui/Card.tsx`)**:
   - Variants: `surface` (`#060606`), `raised` (`#121212`), `interactive`.
   - 14px border radius, subtle border token (`#1F1F1F`), hover glow on interactive cards.

10. **TeamCard (`components/ui/TeamCard.tsx`)**:
    - Seeker (Red + Crosshair) and Hider (Green + EyeOff) cards.
    - Full width per team or side-by-side >= 420px.
    - Includes team count, max cap indicator, Join/Joined button with checkmark.

11. **PlayerRow (`components/ui/PlayerRow.tsx`)**:
    - Avatar initial, level badge, host crown badge, ready dot, remove player button (for host).

12. **Scoreboard (`components/ui/Scoreboard.tsx` / Lobby Scoreboard)**:
    - Seeker count vs Hider count, balance recommendation hint, min/max player constraints.

13. **CollapsibleCard (`components/ui/CollapsibleCard.tsx`)**:
    - Grouped setting sections ("Timing & Duration", "Radar & Tagging", "Boundary Circle", "Zone Shrink Schedule", "Sensory Alerts", "Tactical Field Items").
    - Clean chevron toggle, count summary chip.

14. **HoldButton (`components/ui/HoldButton.tsx`)**:
    - Hold-to-confirm interaction for high-consequence game actions (Tag Confirm, Abandon Match).
    - Radial progress fill and haptic vibration on trigger (`navigator.vibrate`).

15. **StatusChip & Badge (`components/ui/Badge.tsx`, `StatusChip.tsx`)**:
    - GPS state (`LOCKED`, `SEARCHING`, `OFFLINE`), connection state, role badge with dual coding.

16. **Logo (`components/ui/Logo.tsx`)**:
    - Original inline SVG mark: concentric tactical radar rings with center zone dot and subtle glow.
