import { chromium } from 'playwright'

const baseUrl = process.env.XZONES_UI_URL ?? 'http://127.0.0.1:5175'
const screens = [
  ['home', '/'],
  ['create', '/create'],
  ['join', '/join'],
  ['settings', '/settings'],
  ['guide', '/guide'],
]
const viewports = [[375, 812], [1280, 800]]
const themes = ['dusk', 'paper']
const browser = await chromium.launch({ headless: true })

for (const theme of themes) {
  for (const [width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme === 'dusk' ? 'dark' : 'light' })
    await context.addInitScript((selectedTheme) => {
      localStorage.setItem('xzones.preferences', JSON.stringify({ state: { theme: selectedTheme, mapStyle: 'auto', hapticsEnabled: false, guestName: '' }, version: 0 }))
    }, theme)
    const page = await context.newPage()
    for (const [name, path] of screens) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
      await page.screenshot({ path: `docs/design/verification/phase3-${name}-${theme}-${width}x${height}.png`, fullPage: true })
    }
    await context.close()
  }
}

await browser.close()
