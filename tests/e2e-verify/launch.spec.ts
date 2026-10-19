import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { Player } from './player'
import { redactTraffic } from './privacy'

test('G1.1 home renders in an isolated mobile guest context without requesting location', async () => {
  const artifacts = process.env.XZONES_ARTIFACTS_DIR ?? '/tmp/xzones-gameplay-artifacts'
  const player = await Player.launch({ name: 'host', artifactsDir: artifacts })
  try {
    await player.context.addInitScript(() => {
      const geo = navigator.geolocation
      let calls = 0
      Object.defineProperty(window, '__xzonesGeoCalls', { get: () => calls })
      const originalGet = geo.getCurrentPosition.bind(geo)
      const originalWatch = geo.watchPosition.bind(geo)
      Object.defineProperty(geo, 'getCurrentPosition', { configurable: true, value: (...args: Parameters<typeof geo.getCurrentPosition>) => { calls++; return originalGet(...args) } })
      Object.defineProperty(geo, 'watchPosition', { configurable: true, value: (...args: Parameters<typeof geo.watchPosition>) => { calls++; return originalWatch(...args) } })
    })
    await player.page.goto(process.env.XZONES_BASE_URL ?? 'http://127.0.0.1:4175')
    await expect(player.page.getByRole('button', { name: 'Continue as guest' })).toBeVisible()
    await expect(player.page.getByText(/Real places\./)).toBeVisible()
    expect(await player.page.evaluate(() => (window as Window & { __xzonesGeoCalls: number }).__xzonesGeoCalls)).toBe(0)
    expect(player.consoleErrors).toEqual([])
    expect(player.pageErrors).toEqual([])
    const screenshotDir = 'docs/verification/screens/G1.1'
    await mkdir(screenshotDir, { recursive: true })
    await player.screenshot(`${screenshotDir}/home-mobile.png`)
    await player.recordStatus()
    await import('node:fs/promises').then(({ writeFile }) => writeFile(`${screenshotDir}/home-mobile.traffic.json`, JSON.stringify(redactTraffic(player.traffic), null, 2)))
  } finally {
    await player.close()
  }
})
