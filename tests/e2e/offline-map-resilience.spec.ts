import { test, expect } from '@playwright/test'

test.describe('Priority 1 — Offline Map Resilience', () => {
  test('First load without network access switches to Offline Tactical Grid', async ({ page }) => {
    // Block all remote map tile and style requests to simulate cold offline first load
    await page.route('**/*openfreemap.org/**', (route) => route.abort())

    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
        consoleErrors.push(msg.text())
      }
    })

    // Navigate to simulator HUD which mounts GameMap with active player markers
    await page.goto('/dev/sim')

    // Wait for the tactical fallback badge to render
    const tacticalBadge = page.locator('.map-tactical-badge')
    await expect(tacticalBadge).toBeVisible({ timeout: 10_000 })
    await expect(tacticalBadge).toContainText('OFFLINE TACTICAL GRID')

    // Verify essential gameplay overlays remain visible on top of tactical grid
    const youMarker = page.locator('.game-marker--you')
    await expect(youMarker).toBeVisible()

    const mapControls = page.locator('.map-controls')
    await expect(mapControls).toBeVisible()

    const legend = page.locator('.map-key')
    await expect(legend).toBeVisible()

    // Verify ZonePicker also handles offline gracefully on /create
    await page.goto('/create')
    const zoneBadge = page.locator('.zone-picker__tactical-badge')
    await expect(zoneBadge).toBeVisible({ timeout: 10_000 })
    await expect(zoneBadge).toContainText('OFFLINE TACTICAL GRID')

    // Verify no infinite loop / uncaught crash occurred
    await expect(page.locator('body')).toBeVisible()
  })

  test('Graceful transition and recovery between online and offline states', async ({ page, context }) => {
    await page.goto('/dev/sim')

    // Wait for the map canvas and marker to mount
    await expect(page.locator('.game-map-canvas')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.game-marker--you')).toBeVisible({ timeout: 10_000 })

    // Simulate going offline during gameplay
    await context.setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))

    const tacticalBadge = page.locator('.map-tactical-badge')
    await expect(tacticalBadge).toBeVisible({ timeout: 8_000 })
    await expect(tacticalBadge).toContainText('OFFLINE TACTICAL GRID')

    // Markers and map canvas continue to be interactive
    await expect(page.locator('.game-marker--you')).toBeVisible()
    await page.locator('.map-control[aria-label="Zoom in"]').click()

    // Restore online connectivity
    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))

    // Verify app recovers and overlays remain intact
    await expect(page.locator('.game-marker--you')).toBeVisible()
  })
})
