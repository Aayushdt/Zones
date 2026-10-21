import { expect, test, type BrowserContext } from '@playwright/test'

interface MockPlayer {
  id: string
  auth_user_id: string
  display_name: string
  role: 'HUNTER' | 'RUNNER' | null
  ready: boolean
  status: 'ACTIVE' | 'TAGGED' | 'LEFT'
}

function setupMockGameBackend(contexts: BrowserContext[]) {
  const matchId = '11111111-2222-3333-4444-555555555555'
  const code = 'SMK892'
  let state: 'LOBBY' | 'ACTIVE' | 'ENDED' = 'LOBBY'
  let revision = 1
  const players: MockPlayer[] = []
  let tagCount = 0

  for (const ctx of contexts) {
    ctx.route('**/auth/v1/signup', async (route) => {
      const authId = 'auth-' + Math.random().toString(36).slice(2)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: `token-${authId}`,
          refresh_token: `refresh-${authId}`,
          expires_at: Math.floor(Date.now() / 1000) + 7200,
          user: { id: authId },
        }),
      })
    })

    ctx.route('**/functions/v1/api/**', async (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname.replace(/^.*\/functions\/v1\/api/, '')
      const method = route.request().method()
      const authHeader = route.request().headers()['authorization'] || ''
      const token = authHeader.replace(/^Bearer\s+/, '')
      const authId = token.replace(/^token-/, '')

      if (path === '/rejoinable') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ match_id: null }),
        })
        return
      }

      if (path === '/lobbies' && method === 'POST') {
        const body = route.request().postDataJSON() as { display_name: string }
        const hostPlayer: MockPlayer = {
          id: 'player-host',
          auth_user_id: authId,
          display_name: body.display_name || 'Host',
          role: null,
          ready: false,
          status: 'ACTIVE',
        }
        players.push(hostPlayer)
        revision += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            match_id: matchId,
            player_id: hostPlayer.id,
            code,
            role: null,
            revision,
          }),
        })
        return
      }

      if (path === '/lobbies/join' && method === 'POST') {
        const body = route.request().postDataJSON() as { display_name: string; code: string }
        const guestPlayer: MockPlayer = {
          id: 'player-guest',
          auth_user_id: authId,
          display_name: body.display_name || 'Guest',
          role: null,
          ready: false,
          status: 'ACTIVE',
        }
        players.push(guestPlayer)
        revision += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            match_id: matchId,
            player_id: guestPlayer.id,
            code,
            role: null,
            revision,
          }),
        })
        return
      }

      if (path.includes('/items/enabled')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items_enabled: false }),
        })
        return
      }

      if (path.includes('/items/alerts')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ alerts: [] }),
        })
        return
      }

      if (path.endsWith('/team') && method === 'POST') {
        const body = route.request().postDataJSON() as { role: 'HUNTER' | 'RUNNER' }
        const p = players.find((pl) => pl.auth_user_id === authId)
        if (p) {
          p.role = body.role
          revision += 1
        }
        const hunters = players.filter((pl) => pl.role === 'HUNTER').length
        const runners = players.filter((pl) => pl.role === 'RUNNER').length
        const canStart = hunters >= 1 && runners >= 1 && players.every((pl) => pl.ready)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            role: p?.role ?? null,
            counts: { hunters, runners },
            can_start: canStart,
            block_reason: canStart ? undefined : 'WAITING_FOR_READY',
          }),
        })
        return
      }

      if (path.includes('/ready') && method === 'POST') {
        const body = route.request().postDataJSON() as { ready: boolean }
        const p = players.find((pl) => pl.auth_user_id === authId)
        if (p) {
          p.ready = body.ready
          revision += 1
        }
        const hunters = players.filter((pl) => pl.role === 'HUNTER').length
        const runners = players.filter((pl) => pl.role === 'RUNNER').length
        const canStart = hunters >= 1 && runners >= 1 && players.every((pl) => pl.ready)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ready: p?.ready ?? false,
            can_start: canStart,
            block_reason: canStart ? undefined : 'WAITING_FOR_READY',
          }),
        })
        return
      }

      if (path.includes('/start') && method === 'POST') {
        state = 'ACTIVE'
        revision += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            state: 'ACTIVE',
            server_now: new Date().toISOString(),
            start_at: new Date().toISOString(),
            head_start_ends_at: new Date().toISOString(),
            ends_at: new Date(Date.now() + 600_000).toISOString(),
            revision,
          }),
        })
        return
      }

      if (path.includes('/sync') && method === 'POST') {
        const p = players.find((pl) => pl.auth_user_id === authId) || players[0]
        const hunters = players.filter((pl) => pl.role === 'HUNTER').length
        const runners = players.filter((pl) => pl.role === 'RUNNER').length

        if (state === 'LOBBY') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              state: 'LOBBY',
              own_player_id: p.id,
              host_player_id: players[0]?.id,
              controller_player_id: players[0]?.id,
              revision,
              players,
              active_counts: { hunters, runners },
              can_start: hunters >= 1 && runners >= 1 && players.every((pl) => pl.ready),
            }),
          })
          return
        }

        // Active / Ended match sync
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            role: p.role,
            state,
            server_now: new Date().toISOString(),
            active_counts: { hunters, runners },
            can_end: p.id === players[0]?.id,
            own_player_id: p.id,
            own_status: p.status,
            revision,
            next_ping_at: new Date(Date.now() + 180_000).toISOString(),
            zone: {
              enabled: true,
              center: { lat: 51.5074, lon: -0.1278 },
              radius: 300,
              stage: 0,
              nextShrinkAt: new Date(Date.now() + 300_000).toISOString(),
              nextRadius: 150,
            },
            events: [],
          }),
        })
        return
      }

      if (path.includes('/qr') && method === 'POST' && !path.includes('/scan')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            token: 'test-qr-token-xyz-12345',
            server_now: new Date().toISOString(),
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          }),
        })
        return
      }

      if (path.includes('/tag/confirm') && method === 'POST') {
        const p = players.find((pl) => pl.auth_user_id === authId)
        if (p) p.status = 'TAGGED'
        tagCount += 1
        state = 'ENDED'
        revision += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            accepted: true,
            state: 'ENDED',
            winner: 'HUNTER',
            eliminated_player_id: p?.id,
            revision,
          }),
        })
        return
      }

      if (path.includes('/result')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            winner: 'HUNTER',
            end_reason: 'ALL_RUNNERS_TAGGED',
            duration_seconds: 142,
            tag_count: tagCount || 1,
            ended_at: new Date().toISOString(),
          }),
        })
        return
      }

      // Default ok
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })
  }

  return { matchId, code }
}

test('Full smoke flow: 2-player create, join, team switch, ready, start, zone shrink, tag, results', async ({ browser }) => {
  const hostContext = await browser.newContext()
  const guestContext = await browser.newContext()

  try {
    setupMockGameBackend([hostContext, guestContext])

    await hostContext.grantPermissions(['geolocation'])
    await hostContext.setGeolocation({ latitude: 51.5074, longitude: -0.1278, accuracy: 12 })

    await guestContext.grantPermissions(['geolocation'])
    await guestContext.setGeolocation({ latitude: 51.5076, longitude: -0.1280, accuracy: 12 })

    const hostPage = await hostContext.newPage()
    const guestPage = await guestContext.newPage()

    // 1. Host onboarding
    await hostPage.goto('/')
    const hostGuestInput = hostPage.getByLabel('Guest name')
    if (await hostGuestInput.isVisible()) {
      await hostGuestInput.fill('Host Hunter')
      await hostPage.getByLabel('I confirm I am 18 or older.').check()
      await hostPage.getByLabel('I have read the safe-play guidance above.').check()
      await hostPage.getByRole('button', { name: 'Continue as guest' }).click()
      await expect(hostPage.getByText('Welcome, Host Hunter')).toBeVisible()
    }

    // 2. Host creates match
    await hostPage.goto('/create')
    await expect(hostPage.getByRole('heading', { name: 'Create match' })).toBeVisible()

    await hostPage.locator('button[type="submit"]:has-text("CREATE LOBBY")').click()
    await expect(hostPage).toHaveURL(/\/lobby\//, { timeout: 10_000 })

    const matchId = hostPage.url().split('/lobby/')[1]
    expect(matchId).toBeTruthy()

    // 3. Guest onboarding and join
    await guestPage.goto('/')
    const guestInput = guestPage.getByLabel('Guest name')
    if (await guestInput.isVisible()) {
      await guestInput.fill('Guest Runner')
      await guestPage.getByLabel('I confirm I am 18 or older.').check()
      await guestPage.getByLabel('I have read the safe-play guidance above.').check()
      await guestPage.getByRole('button', { name: 'Continue as guest' }).click()
      await expect(guestPage.getByText('Welcome, Guest Runner')).toBeVisible()
    }

    await guestPage.goto('/join?code=SMK892')
    await guestPage.getByRole('button', { name: 'Join private lobby' }).click()
    await expect(guestPage).toHaveURL(`/lobby/${matchId}`, { timeout: 10_000 })

    // 4. Team selection: Host selects Seeker (Hunter), Guest selects Hider (Runner)
    await hostPage.getByRole('button', { name: 'SEEKER' }).click()
    await guestPage.getByRole('button', { name: 'HIDER' }).click()

    // 5. GPS calibration and readiness
    const hostGpsBadge = hostPage.locator('.gps-badge')
    await hostGpsBadge.click()
    await expect(hostPage.locator('.gps-badge--ready')).toBeVisible({ timeout: 8_000 })
    await hostPage.locator('.lobby-ready-btn').click()
    await expect(hostPage.locator('.lobby-ready-btn')).toContainText('✓ READY', { timeout: 8_000 })

    const guestGpsBadge = guestPage.locator('.gps-badge')
    await guestGpsBadge.click()
    await expect(guestPage.locator('.gps-badge--ready')).toBeVisible({ timeout: 8_000 })
    await guestPage.locator('.lobby-ready-btn').click()
    await expect(guestPage.locator('.lobby-ready-btn')).toContainText('✓ READY', { timeout: 8_000 })

    // 6. Host starts match
    await hostPage.reload()
    const startButton = hostPage.locator('button:has-text("START MATCH")')
    await expect(startButton).toBeEnabled({ timeout: 10_000 })
    await startButton.click()

    await expect(hostPage).toHaveURL(`/match/${matchId}`, { timeout: 10_000 })

    // 7. Active match screen with safe zone and map
    await guestPage.goto(`/match/${matchId}`)
    await expect(guestPage).toHaveURL(`/match/${matchId}`, { timeout: 10_000 })

    await expect(hostPage.locator('.hud-screen')).toBeVisible({ timeout: 10_000 })
    await expect(guestPage.locator('.hud-screen')).toBeVisible({ timeout: 10_000 })

    // 8. Tag flow: Guest opens tag resolution page
    await guestPage.goto(`/match/${matchId}/tag`)
    await expect(guestPage.locator('.tag-screen')).toBeVisible({ timeout: 10_000 })

    // Guest issues QR token
    const qrBtn = guestPage.getByRole('button', { name: 'SHOW MY TAG QR' })
    await expect(qrBtn).toBeVisible()
    await qrBtn.click()
    await expect(guestPage.locator('.tag-qr-img')).toBeVisible({ timeout: 10_000 })

    // Guest self-confirms tag
    const selfConfirmBtn = guestPage.getByRole('button', { name: /I WAS TAGGED/i })
    await expect(selfConfirmBtn).toBeVisible()
    await selfConfirmBtn.click()

    // 9. Results screen verification
    await expect(guestPage).toHaveURL(`/match/${matchId}/results`, { timeout: 10_000 })
    await expect(guestPage.getByText(/SEEKERS WIN/i)).toBeVisible()

    await hostPage.goto(`/match/${matchId}/results`)
    await expect(hostPage.getByText(/SEEKERS WIN/i)).toBeVisible({ timeout: 10_000 })
    await expect(hostPage.getByText(/Total Duration/i)).toBeVisible()
    await expect(hostPage.getByText(/Confirmed Tags/i)).toBeVisible()
  } finally {
    await hostContext.close()
    await guestContext.close()
  }
})
