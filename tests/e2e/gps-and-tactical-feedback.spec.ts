import { test, expect, type Page } from '@playwright/test'

async function navigateToLobby(page: Page) {
  await page.goto('/')
  const guestInput = page.getByLabel('Guest name')
  if (await guestInput.isVisible()) {
    await guestInput.fill('Tester')
    await page.getByLabel('I confirm I am 18 or older.').check()
    await page.getByLabel('I have read the safe-play guidance above.').check()
    await page.getByRole('button', { name: 'Continue as guest' }).click()
    await expect(page.getByText('Welcome, Tester')).toBeVisible()
  }
  await page.goto('/create')
  await page.locator('button[type="submit"]:has-text("CREATE LOBBY")').click()
  await expect(page).toHaveURL(/\/lobby\//, { timeout: 15_000 })
}

test.describe('Priority 2 & 3 — GPS Readiness and Tactical Gameplay Feedback', () => {
  test('Lobby renders contextual GPS calibration badge with high-accuracy threshold', async ({ page, context }) => {
    // Grant geolocation with high accuracy (12 meters <= 25m threshold)
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 51.5074, longitude: -0.1278, accuracy: 12 })

    await navigateToLobby(page)

    // Check GPS badge is rendered contextually
    const gpsBadge = page.locator('.gps-badge')
    await expect(gpsBadge).toBeVisible()

    // Click to calibrate GPS
    await gpsBadge.click()

    // Because accuracy is 12m (<=25m threshold), badge should update to READY
    await expect(page.locator('.gps-badge--ready')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('.gps-badge--ready')).toContainText('GPS ±12m READY')
  })

  test('Lobby correctly identifies inaccurate GPS (>25m) as WEAK', async ({ page, context }) => {
    // Set inaccurate geolocation (45m > 25m threshold)
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 51.5074, longitude: -0.1278, accuracy: 45 })

    await navigateToLobby(page)

    const gpsBadge = page.locator('.gps-badge')
    await expect(gpsBadge).toBeVisible()
    await gpsBadge.click()

    // Accuracy 45m should yield WEAK badge
    await expect(page.locator('.gps-badge--weak')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('.gps-badge--weak')).toContainText('GPS ±45m WEAK')
  })

  test('Lobby distinguishes permission denial without crashing or infinite loops', async ({ page, context }) => {
    // Clear permissions to test denial
    await context.clearPermissions()

    await navigateToLobby(page)

    const gpsBadge = page.locator('.gps-badge')
    await expect(gpsBadge).toBeVisible()

    // Ready button and lobby roster remain functional and accessible
    await expect(page.locator('.lobby-scoreboard__meta')).toBeVisible()
    await expect(page.locator('.lobby-ready-btn')).toBeVisible()
  })
})
