# XZones Design System — Neon Game UI

## 1. Vision & Architecture
XZones is an outdoor GPS action game (Seekers vs Hiders). The visual identity balances high-visibility tactical outdoors gameplay with a sleek cyberpunk neon-on-black aesthetic and a matching, accessible light theme for bright daylight conditions.

---

## 2. Design Tokens

### Dark Theme (Default)
- **Background (`--color-bg`, `--color-background`)**: `#000000` (true pitch black for OLED contrast and power saving)
- **Surface (`--color-surface`)**: `#060606`
- **Surface Raised (`--color-surface-2`)**: `#121212`
- **Border (`--color-border`)**: `#1F1F1F`
- **Text (`--color-text`)**: `#FFFFFF`
- **Muted Text (`--color-muted`)**: `#A7A7AF`
- **Subtle Details (`--color-subtle`)**: `#75757F`
- **Green (Neon Hider / Success / Join)**: `#00FF89`
  - Tint: `#012614`
  - Ring: `#024C29`
  - Glow: `rgba(0, 255, 137, 0.35)`
- **Red (Neon Seeker / Destructive / Host)**: `#FF3B3C`
  - Text on red: `#000000`
  - Tint: `rgba(255, 59, 60, 0.14)`
  - Glow: `rgba(255, 59, 60, 0.35)`
- **Amber (Warnings / Next Zone Shrink)**: `#FFB020`
- **Blue (Active Zone Boundary)**: `#38BDF8`
- **Grey (Neutral / Disabled)**: `#242428`

### Light Theme
- **Background (`--color-bg`)**: `#F4F8F5`
- **Surface (`--color-surface`)**: `#FFFFFF`
- **Surface 2 (`--color-surface-2`)**: `#EAF1EC`
- **Border (`--color-border`)**: `#D3DFD7`
- **Text (`--color-text`)**: `#06130C` (AA 13.8:1 contrast)
- **Muted Text (`--color-muted`)**: `#4B5D52` (AA 4.9:1 contrast)
- **Subtle Details (`--color-subtle`)**: `#5B6C62`
- **Green**: `#00834A` (AA 4.6:1 with white text)
  - Ink: `#007A43`
  - Tint: `#DDF7E8`
  - Glow: `rgba(0, 131, 74, 0.25)`
- **Red**: `#D91F26` (AA 4.7:1 with white text)
  - Ink: `#B3141B`
  - Tint: `#FDE3E3`
- **Amber**: `#8A5200` / Tint: `#FFF1D6`
- **Blue**: `#0B6FA8` / Tint: `#E0F1FB`
- **Grey**: `#E5EDE8`

---

## 3. Strict Color Semantics

| Color | Meaning | Never Reused For | Dual Coding Requirement |
|---|---|---|---|
| **Green** | Hiders, Join, Ready, Success, Brand Accent | Seekers, Tags, Warnings | Green + Eye-Off (`eye-off`) icon + "Hider" label |
| **Red** | Seekers, Tag Action, Create/Host, Destructive | Hiders, Join, Non-destructive CTA | Red + Crosshair (`crosshair`) icon + "Seeker" label |
| **Amber** | System Warnings, Next Shrink Zone (Dashed) | Primary success or safe zones | Warning triangle / Clock icon + Amber dashed line |
| **Blue** | Active/Current Zone Boundary Circle | Roles, generic actions | Solid blue line + Zone indicator |
| **Grey** | Neutral, Disabled, Inactive | Active game state | Disabled tooltip explaining why |

### Glow Rule
Glow is applied strictly as an accent:
- Brand Logo (`box-shadow: 0 0 24px rgba(0, 255, 137, 0.35)`)
- Primary Action CTAs
- Focus states (`:focus-visible`)
- **NEVER** applied to body text or general paragraphs.
- Reduced motion: pulses and radar sweeps are disabled when `prefers-reduced-motion: reduce`.

---

## 4. Typography System
- **UI Font**: `Inter` (sentence case, clean optical legibility at 12–20px)
- **Data & Numbers**: `JetBrains Mono` with `font-variant-numeric: tabular-nums` (zone codes, timers, distances, GPS accuracy, coordinate values)
- **Scale**:
  - Overline / Eyebrow: `11px` / `12px` (uppercase, letter-spacing `0.08em`)
  - Small / Caption: `12px` / `14px`
  - Body: `14px` / `16px`
  - Section Title: `20px`
  - Page Title: `28px`
  - Hero Display: `40px`

---

## 5. Layout & Spacing
- **Base Grid**: `4px`
- **Cards**: `radius: 14px`
- **Controls & Inputs**: `radius: 12px`, min height `44px` (`56px` for primary Dual CTAs)
- **Chips & Badges**: `radius: 999px`
- **Transitions**: `150ms` (hover/active), `200ms` (sheet / drawer / dialogs)
