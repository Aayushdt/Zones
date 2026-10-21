import { test, expect } from '@playwright/test'

const ROUTES = [
  { path: '/', name: 'Home' },
  { path: '/create', name: 'Create Match (Setup)' },
  { path: '/join', name: 'Join' },
  { path: '/settings', name: 'Settings' },
  { path: '/guide', name: 'How to Play' },
  { path: '/dev/sim', name: 'Simulator HUD' },
]

test('Compliance audit at 360px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })

  for (const route of ROUTES) {
    await page.goto(route.path)
    await page.waitForTimeout(300)

    const audit = await page.evaluate(() => {
      // Find all overflowing elements
      const overflows = [...document.querySelectorAll('*')]
        .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 0.5)
        .map((e) => ({
          tag: e.tagName,
          className: (e as HTMLElement).className,
          right: Math.round(e.getBoundingClientRect().right),
          width: Math.round(e.getBoundingClientRect().width),
          text: (e.textContent || '').slice(0, 30).trim(),
        }))

      // Check for setting rows layout
      const settingRows = [...document.querySelectorAll('.setting-row')].map((r) => {
        const top = r.querySelector('.setting-row__top')
        const action = r.querySelector('.setting-row__action')
        const helpBtn = r.querySelector('.setting-row__help-btn')
        const summary = r.querySelector('.setting-row__summary')
        const helpRect = helpBtn ? helpBtn.getBoundingClientRect() : null
        return {
          hasAction: Boolean(action),
          actionWidth: action ? Math.round(action.getBoundingClientRect().width) : 0,
          helpDimensions: helpRect ? `${Math.round(helpRect.width)}x${Math.round(helpRect.height)}` : 'none',
          helpWidth: helpRect ? Math.round(helpRect.width) : 0,
          helpHeight: helpRect ? Math.round(helpRect.height) : 0,
          hasSummary: Boolean(summary),
        }
      })

      // Check for tabs
      const tabs = [...document.querySelectorAll('.app-tab')].map((t) => ({
        text: (t.textContent || '').trim(),
        width: Math.round(t.getBoundingClientRect().width),
        right: Math.round(t.getBoundingClientRect().right),
        visible: t.getBoundingClientRect().right <= window.innerWidth,
      }))

      // Check for overlines and subtitles
      const subtitles = [
        ...document.querySelectorAll(
          '.card-subtitle, .create-subtitle, .settings-subtitle, .join-subtitle, .game-mode-desc, .collapsible-card__subtitle, .setting-row__summary, .card-overline, .create-overline, .settings-overline, .guide-overline, .join-overline, .lobby-header__overline'
        ),
      ].map((s) => ({
        className: (s as HTMLElement).className,
        text: (s.textContent || '').trim().slice(0, 40),
      }))

      return {
        overflows,
        settingRowsCount: settingRows.length,
        settingRows,
        tabs,
        subtitlesCount: subtitles.length,
        subtitles,
      }
    })

    console.log(`=== AUDIT FOR ${route.name} (${route.path}) ===`)
    console.log(`Overflows: ${audit.overflows.length}`, JSON.stringify(audit.overflows.slice(0, 5)))
    console.log(`Subtitles/Overlines: ${audit.subtitlesCount}`, JSON.stringify(audit.subtitles.slice(0, 4)))

    // Assert zero horizontal overflow
    expect(audit.overflows, `Expected 0 overflowing elements on ${route.name}`).toHaveLength(0)

    // Assert zero subheadings or overlines
    expect(audit.subtitlesCount, `Expected 0 secondary subheadings/overlines on ${route.name}`).toBe(0)

    // Assert SettingRows structure
    for (const row of audit.settingRows) {
      expect(row.hasSummary, 'SettingRow must not have summary/description elements').toBe(false)
      if (row.helpWidth > 0) {
        expect(row.helpWidth).toBeGreaterThanOrEqual(24)
        expect(row.helpWidth).toBeLessThanOrEqual(30)
        expect(Math.abs(row.helpWidth - row.helpHeight)).toBeLessThanOrEqual(2)
      }
    }
  }
})

test('Setup tabs all visible at 320px viewport without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/create')
  await page.waitForTimeout(300)

  const tabs = await page.evaluate(() => {
    return [...document.querySelectorAll('.app-tab')].map((t) => ({
      text: (t.textContent || '').trim(),
      right: Math.round(t.getBoundingClientRect().right),
      visible: t.getBoundingClientRect().right <= 320,
    }))
  })

  expect(tabs).toHaveLength(4)
  for (const tab of tabs) {
    expect(tab.visible, `Tab "${tab.text}" right edge (${tab.right}px) must be <= 320px`).toBe(true)
  }
})

test('Sticky bottom bar on setup does not overlap content', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/create')
  await page.waitForTimeout(300)

  const check = await page.evaluate(() => {
    const stickyBar = document.querySelector('.create-bottom-bar, .sticky-bottom-bar')
    const main = document.querySelector('main')
    if (!stickyBar || !main) return { ok: true }
    const barHeight = stickyBar.getBoundingClientRect().height
    const paddingBottom = parseFloat(window.getComputedStyle(main).paddingBottom || '0')
    return {
      barHeight: Math.round(barHeight),
      paddingBottom: Math.round(paddingBottom),
      ok: paddingBottom >= barHeight - 1,
    }
  })

  expect(check.ok, `Expected main paddingBottom (${check.paddingBottom}px) >= sticky bar height (${check.barHeight}px)`).toBe(true)
})

