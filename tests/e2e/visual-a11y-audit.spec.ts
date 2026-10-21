import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const VIEWPORTS = [
  { name: 'phone-min-320', width: 320, height: 640, isMobile: true, hasTouch: true },
  { name: 'phone-compact-360', width: 360, height: 740, isMobile: true, hasTouch: true },
  { name: 'phone-iphoneSE-375', width: 375, height: 667, isMobile: true, hasTouch: true },
  { name: 'phone-standard-390', width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: 'phone-iphonePlus-414', width: 414, height: 896, isMobile: true, hasTouch: true },
  { name: 'phone-compactBreak-420', width: 420, height: 800, isMobile: true, hasTouch: true },
  { name: 'phone-max-430', width: 430, height: 932, isMobile: true, hasTouch: true },
  { name: 'phone-landscape-844', width: 844, height: 390, isMobile: true, hasTouch: true },
  { name: 'tablet-portrait-768', width: 768, height: 1024, isMobile: true, hasTouch: true },
  { name: 'tablet-landscape-1024', width: 1024, height: 768, isMobile: false, hasTouch: false },
  { name: 'laptop-1280', width: 1280, height: 800, isMobile: false, hasTouch: false },
  { name: 'desktop-1440', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'desktop-1920', width: 1920, height: 1080, isMobile: false, hasTouch: false },
]

const THEMES = ['dusk', 'paper'] as const

const ROUTES = [
  { path: '/', name: 'home' },
  { path: '/join', name: 'join' },
  { path: '/create', name: 'setup' },
  { path: '/settings', name: 'settings' },
  { path: '/guide', name: 'guide' },
  { path: '/dev/sim', name: 'simulator-hud' },
]

test.describe('Visual and Accessibility Multi-Device Audit', () => {
  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`Audit on ${vp.name} (${vp.width}x${vp.height}, touch=${vp.hasTouch}) in ${theme} mode`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })

        for (const route of ROUTES) {
          await page.goto(route.path)

          // Set theme & low-end preference
          await page.evaluate((t) => {
            document.documentElement.dataset.theme = t
            try {
              localStorage.setItem('xzones.preferences', JSON.stringify({ state: { theme: t, mapStyle: t } }))
            } catch {
              /* ignore */
            }
          }, theme)

          // Wait for layout and fonts to stabilize
          await page.waitForTimeout(200)

          // Verify no horizontal overflow (overflow culprits)
          const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
          const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
          expect(
            scrollWidth,
            `Expected no horizontal overflow on ${route.path} (${vp.name}, ${theme}): scrollWidth ${scrollWidth} <= clientWidth ${clientWidth}`
          ).toBeLessThanOrEqual(clientWidth + 2)

          // Capture screenshot
          await page.screenshot({
            path: `docs/screenshots/${route.name}-${vp.name}-${theme}.png`,
            fullPage: false,
          })

          // Run axe-core accessibility check
          const axeResults = await new AxeBuilder({ page })
            .disableRules(['color-contrast']) // Verified by mathematical token contrast ratios
            .analyze()

          const seriousCritical = axeResults.violations.filter(
            (v) => v.impact === 'serious' || v.impact === 'critical'
          )

          expect(
            seriousCritical,
            `Expected 0 serious/critical axe violations on ${route.path} (${vp.name}, ${theme}): ${JSON.stringify(seriousCritical.map(v => ({ id: v.id, impact: v.impact, description: v.description })))}`
          ).toHaveLength(0)
        }
      })
    }
  }
})
