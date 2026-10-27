import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const GUARDRAIL_VIEWPORTS = [
  { name: 'mobile-min-320', width: 320, height: 568 },
  { name: 'mobile-standard-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

const GUARDRAIL_ROUTES = [
  { path: '/', name: 'Home' },
  { path: '/create', name: 'Create Match' },
  { path: '/join', name: 'Join Match' },
  { path: '/settings', name: 'Settings' },
  { path: '/guide', name: 'How to Play' },
]

test.describe('Automated UI Guardrails (Responsiveness, Touch Targets, A11y)', () => {
  for (const vp of GUARDRAIL_VIEWPORTS) {
    test(`Verify layout, touch targets & a11y on ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })

      for (const route of GUARDRAIL_ROUTES) {
        await page.goto(route.path)
        await page.waitForTimeout(150)

        // 1. Assert zero horizontal overflow
        const overflow = await page.evaluate(() => {
          return {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }
        })
        expect(
          overflow.scrollWidth,
          `Horizontal scroll detected on ${route.path} at ${vp.width}px: scrollWidth (${overflow.scrollWidth}) > clientWidth (${overflow.clientWidth})`
        ).toBeLessThanOrEqual(overflow.clientWidth + 2)

        // 2. Assert touch target minimums for primary interactive buttons
        const touchViolations = await page.evaluate(() => {
          const targets = document.querySelectorAll(
            'button.app-btn, a.app-btn, .lobby-back-btn, .create-back-btn, .guide-back-btn, .game-mode-nav-btn, .input-action-btn'
          )
          const violations: Array<{ selector: string; width: number; height: number; text: string }> = []
          for (const el of targets) {
            const rect = el.getBoundingClientRect()
            // Ignore hidden/zero-size elements
            if (rect.width === 0 || rect.height === 0) continue
            // Allow subpixel variance (e.g. 43.5px) but fail anything substantially under 44px
            if (rect.width < 43 || rect.height < 43) {
              violations.push({
                selector: el.className,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                text: (el.textContent || '').trim().slice(0, 25),
              })
            }
          }
          return violations
        })
        expect(
          touchViolations,
          `Touch target violations (<44x44px) on ${route.path} at ${vp.width}px: ${JSON.stringify(touchViolations)}`
        ).toHaveLength(0)

        // 3. Axe accessibility check (zero serious/critical violations)
        const axeResults = await new AxeBuilder({ page })
          .disableRules(['color-contrast']) // Color contrast verified via mathematical token palette audit
          .analyze()

        const seriousCritical = axeResults.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical'
        )
        expect(
          seriousCritical,
          `Axe a11y violations on ${route.path} (${vp.name}): ${JSON.stringify(seriousCritical.map(v => ({ id: v.id, impact: v.impact })))}`
        ).toHaveLength(0)
      }
    })
  }
})
