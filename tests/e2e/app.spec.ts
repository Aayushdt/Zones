import { expect, test } from '@playwright/test'

test('guest onboarding requires safe-play confirmations and offers private actions', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Guest name').fill('Runner One')
  await page.getByRole('button', { name: 'Continue as guest' }).click()
  await expect(page.getByRole('alert')).toContainText('Confirm you are 18+')
  await page.getByLabel('I confirm I am 18 or older.').check()
  await page.getByLabel('I have read the safe-play guidance above.').check()
  await page.getByRole('button', { name: 'Continue as guest' }).click()
  await expect(page.getByText('Welcome, Runner One')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create private game' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Join with code' })).toBeVisible()
})

test('settings persist theme and map style preferences across reload', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Paper · Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper')
  await page.getByRole('button', { name: 'Dusk · Dark' }).click()
  await page.getByRole('button', { name: 'Paper', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Dusk · Dark' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Paper', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('join form normalizes codes and rejects an incomplete code before network access', async ({ page }) => {
  await page.goto('/join')
  await expect(page.getByText(/Lobbies support 2–100 players/)).toBeVisible()
  await page.getByLabel('Guest name').fill('Guest')
  const code = page.getByLabel('Private lobby code')
  await code.fill('abc12')
  await expect(code).toHaveValue('ABC12')
  await page.getByRole('button', { name: 'Join private lobby' }).click()
  await expect(page.getByRole('alert')).toContainText('six-character private lobby code')
})

test('offline state is announced and match data is explicitly not cached', async ({ page, context }) => {
  await page.goto('/')
  await context.setOffline(true)
  await expect(page.getByRole('status')).toContainText('Offline — match data is not cached')
  await context.setOffline(false)
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('PWA manifest serves installable 192px and 512px PNG icons', async ({ page }) => {
  await page.goto('/')
  const manifestResponse = await page.request.get('/manifest.webmanifest')
  expect(manifestResponse.ok()).toBeTruthy()
  const manifest = await manifestResponse.json() as { icons: Array<{ src: string; sizes: string; type: string }> }
  for (const size of ['192x192', '512x512']) {
    const icon = manifest.icons.find((candidate) => candidate.sizes === size && candidate.type === 'image/png')
    expect(icon, `manifest should include ${size} PNG`).toBeTruthy()
    const response = await page.request.get(icon!.src)
    expect(response.ok()).toBeTruthy()
    expect(response.headers()['content-type']).toContain('image/png')
  }
})
