import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { Player } from './player'
import { DbInspector } from './db-inspector'
import { redactTraffic } from './privacy'

const artifacts = process.env.XZONES_ARTIFACTS_DIR ?? '/tmp/xzones-gameplay-artifacts'

test('G1.2-G1.4 onboarding and guest-name persistence', async () => {
  const player = await Player.launch({ name: 'onboarding', artifactsDir: artifacts })
  try {
    await player.page.goto('/')
    await expect(player.page.getByText('Hunter vs Runner')).toBeVisible()
    await expect(player.page.getByText(/Real places\./)).toBeVisible()
    await expect(player.page.getByLabel('Guest name')).toBeVisible()
    await expect(player.page.getByText(/account or sign-in/i)).toHaveCount(0)
    await expect(player.page.getByText(/Murder|public games/i)).toHaveCount(0)

    const name = player.page.getByLabel('Guest name')
    await name.fill('')
    expect(await name.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true)
    await name.fill('Valid Guest')
    await player.page.getByRole('button', { name: 'Continue as guest' }).click()
    await expect(player.page.getByText('Confirm you are 18+ and have read the safe-play guidance.')).toBeVisible()
    await name.fill('a'.repeat(24))
    await player.page.getByLabel('I confirm I am 18 or older.').check()
    await player.page.getByLabel('I have read the safe-play guidance above.').check()
    await player.page.getByRole('button', { name: 'Continue as guest' }).click()
    await expect(player.page.getByText('Welcome,', { exact: false })).toBeVisible()
    await expect(player.page.getByRole('link', { name: 'Create private game' })).toBeVisible()
    await expect(player.page.getByRole('link', { name: 'Join with code' })).toBeVisible()

    await player.page.reload()
    await expect(player.page.getByLabel('Guest name')).toHaveValue('a'.repeat(24))
    await player.page.evaluate(() => localStorage.clear())
    await player.page.reload()
    await expect(player.page.getByLabel('Guest name')).toHaveValue('')

    const dir = 'docs/verification/screens/G1.2-G1.4'
    await mkdir(dir, { recursive: true })
    await player.screenshot(`${dir}/onboarding-mobile.png`)
    await writeFile(`${dir}/onboarding-mobile.traffic.json`, JSON.stringify(redactTraffic(player.traffic), null, 2))
  } finally { await player.close() }
})

test('G2.1-G2.4 create defaults, invalid boundary rejection and persisted lobby config', async () => {
  const player = await Player.launch({ name: 'create-host', artifactsDir: artifacts })
  try {
    const inspector = new DbInspector()
    await player.page.goto('/')
    await player.page.getByLabel('Guest name').fill('Verification Host')
    await player.page.getByLabel('I confirm I am 18 or older.').check()
    await player.page.getByLabel('I have read the safe-play guidance above.').check()
    await player.page.getByRole('button', { name: 'Continue as guest' }).click()
    await player.page.getByRole('link', { name: 'Create private game' }).click()

    await expect(player.page.getByRole('button', { name: '45 min' })).toHaveAttribute('aria-pressed', 'true')
    await expect(player.page.getByRole('slider', { name: /Head start/ })).toHaveValue('180')
    await expect(player.page.getByRole('button', { name: '5 min' })).toHaveAttribute('aria-pressed', 'true')

    await player.page.getByLabel('Use a fixed game boundary').check()
    await player.page.getByRole('button', { name: 'Create private lobby' }).click()
    await expect(player.page.getByText('Enter a valid latitude and longitude, or switch the zone off.')).toBeVisible()
    expect(player.traffic.filter((record) => record.direction === 'request' && record.url.includes('/functions/v1/api/lobbies'))).toHaveLength(0)

    await player.page.getByLabel('Use a fixed game boundary').uncheck()
    await player.page.getByRole('button', { name: 'Create private lobby' }).click()
    await expect(player.page).toHaveURL(/\/lobby\/[0-9a-f-]+$/)
    await expect(player.page.getByText('Private join code')).toBeVisible()
    await expect(player.page.getByText(/[A-HJ-NP-Z2-9]{6}/)).toBeVisible()

    const matchId = player.page.url().split('/').at(-1) ?? ''
    const data = await inspector.match(matchId)
    expect(data.matches).toHaveLength(1)
    expect(data.matches[0]).toMatchObject({ state: 'LOBBY', round_seconds: 2700, head_start_seconds: 180, ping_seconds: 300, zone_radius_m: null })
    expect(data.players).toHaveLength(1)
    expect(data.players[0]).toMatchObject({ display_name: 'Verification Host', status: 'ACTIVE' })
    expect(player.traffic.some((record) => record.direction === 'response' && record.status === 200 && record.url.includes('/functions/v1/api/lobbies'))).toBe(true)
    await inspector.assertInvariants(matchId)

    const dir = 'docs/verification/screens/G2.1-G2.4'
    await mkdir(dir, { recursive: true })
    await player.page.screenshot({ path: `${dir}/created-lobby.png`, fullPage: true, animations: 'disabled', mask: [player.page.locator('.code-input')] })
    await writeFile(`${dir}/created-lobby.traffic.json`, JSON.stringify(redactTraffic(player.traffic), null, 2))
  } finally { await player.close() }
})
