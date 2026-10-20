import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
]

const THEMES = ['dusk', 'paper'] as const

const ROUTES = [
  { path: '/', name: 'home' },
  { path: '/join', name: 'join' },
  { path: '/create', name: 'setup' },
  { path: '/settings', name: 'settings' },
  { path: '/guide', name: 'guide' },
  { path: '/simulator', name: 'simulator-hud' },
]

test.describe('Visual and Accessibility Audit', () => {
  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`Audit screens on ${vp.name} (${vp.width}x${vp.height}) in ${theme} mode`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })

        for (const route of ROUTES) {
          await page.goto(route.path)
          // Set theme
          await page.evaluate((t) => {
            document.documentElement.dataset.theme = t
            try {
              localStorage.setItem('xzones.preferences', JSON.stringify({ state: { theme: t, mapStyle: t } }))
            } catch {
              /* ignore */
            }
          }, theme)

          // Wait for layout stability
          await page.waitForTimeout(300)

          // Capture screenshot
          await page.screenshot({
            path: `docs/screenshots/${route.name}-${vp.name}-${theme}.png`,
            fullPage: false,
          })

          // Run axe-core accessibility check
          const axeResults = await new AxeBuilder({ page })
            .disableRules(['color-contrast']) // We verify color tokens mathematically in design tokens
            .analyze()

          const seriousCritical = axeResults.violations.filter(
            (v) => v.impact === 'serious' || v.impact === 'critical'
          )

          expect(
            seriousCritical,
            `Expected 0 serious/critical axe violations on ${route.path} (${theme}): ${JSON.stringify(seriousCritical.map(v => ({ id: v.id, impact: v.impact, description: v.description })))}`
          ).toHaveLength(0)
        }
      })
    }
  }
})
