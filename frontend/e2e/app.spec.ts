import { test, expect, type Page } from '@playwright/test'
import { mockLibrary, songs } from './fixtures'

/** The computed look of the Video/Music switch and Settings button. */
function measureControls(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector('.experience-switch') as HTMLElement
    const pick = (element: Element, properties: string[]) =>
      Object.fromEntries(
        properties.map((name) => [name, getComputedStyle(element).getPropertyValue(name)]),
      )
    const idle = nav.querySelector('button[aria-pressed="false"]')!
    const active = nav.querySelector('button[aria-pressed="true"]')!
    return {
      width: Math.round(nav.getBoundingClientRect().width),
      nav: pick(nav, ['height', 'border-radius', 'background-color', 'border-top-color', 'padding-top']),
      button: pick(idle, ['font-family', 'font-size', 'font-weight', 'height', 'padding-left', 'color']),
      active: pick(active, ['background-color', 'color']),
      settings: pick(document.querySelector('.app-icon-button')!, ['width', 'height', 'color']),
    }
  })
}

const width = async (page: Page, selector: string) =>
  Math.round((await page.locator(selector).first().boundingBox())!.width)

test('the Video/Music switch and Settings button are identical in both experiences', async ({ page }) => {
  await mockLibrary(page)
  await page.addInitScript(() => localStorage.setItem('spotimy-theme', 'dark'))
  await page.goto('/#/')
  await expect(page.locator('.yt-topbar .app-controls')).toBeVisible()
  const video = await measureControls(page)
  await page.goto('/#/music/home')
  await expect(page.locator('.music-topbar .app-controls')).toBeVisible()
  expect(await measureControls(page)).toEqual(video)
})

test('settings save the API key without ever showing it again', async ({ page }) => {
  const data = await mockLibrary(page)
  await page.goto('/#/')
  await page.locator('.app-controls').getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/#\/settings$/)
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()

  const row = page.locator('.settings-row', { hasText: 'YouTube Data API Key' })
  await expect(row.getByText('Not set')).toBeVisible()
  await row.getByRole('button', { name: 'Add key' }).click()
  const input = row.getByLabel('YouTube Data API Key')
  await expect(input).toHaveAttribute('type', 'password')
  const key = 'AIzaFakeTestKey' + 'x'.repeat(24)
  await input.fill(key)
  await row.getByRole('button', { name: 'Check key' }).click()
  await expect(row.getByText('The key works.')).toBeVisible()
  await row.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(row.getByText('Saved', { exact: true })).toBeVisible()
  expect(data.settingsWrites.at(-1)).toEqual({ values: { YOUTUBE_API_KEY: key }, guarded: true })
  // Once saved, the key appears nowhere in the page, not even in attributes.
  expect(await page.content()).not.toContain(key)

  await row.getByRole('button', { name: 'Remove' }).click()
  await expect(row.getByText('Not set')).toBeVisible()
  expect(data.settingsWrites.at(-1)?.values).toEqual({ YOUTUBE_API_KEY: null })

  // Switches save at once; numbers save with their own button and say when a restart is needed.
  await page.getByRole('switch', { name: 'Discord Status' }).click()
  expect(data.settingsWrites.at(-1)?.values).toEqual({ DISCORD_PRESENCE_ENABLED: true })
  await page.getByLabel('Simultaneous Downloads').fill('4')
  await page.locator('.settings-row', { hasText: 'Simultaneous Downloads' }).getByRole('button', { name: 'Save' }).click()
  expect(data.settingsWrites.at(-1)?.values).toEqual({ MAX_CONCURRENT_DOWNLOADS: 4 })
  await expect(page.getByText('Restart MusicBox for it to take effect.')).toBeVisible()

  // The Video theme moved from the top bar into Settings.
  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  // The same Settings page is part of the Music experience.
  await page.goto('/#/music/settings')
  await expect(page.locator('.music-app .settings-row', { hasText: 'YouTube Data API Key' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Private session' })).toBeVisible()
})

test('music panels resize by dragging or keyboard, snap the library to its rail and remember widths', async ({
  page,
}) => {
  await mockLibrary(page)
  await page.goto('/#/music/playlist?id=night-drive')
  const handle = page.getByRole('separator', { name: 'Resize Your Library' })
  const before = await width(page, '.music-library')
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 100, box.y + 200, { steps: 6 })
  await page.mouse.up()
  await expect.poll(() => width(page, '.music-library')).toBeGreaterThan(before + 60)

  await handle.focus()
  await page.keyboard.press('Home')
  await expect(page.getByRole('button', { name: 'Expand Your Library' })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Collapse Your Library' })).toBeVisible()
  await expect.poll(() => width(page, '.music-library')).toBe(300)

  await page.getByRole('button', { name: 'Play Night drive', exact: true }).click()
  const panelBefore = await width(page, '.music-panel')
  const panelHandle = page.getByRole('separator', { name: 'Resize Now Playing view' })
  await panelHandle.focus()
  for (let step = 0; step < 3; step++) await page.keyboard.press('ArrowLeft')
  await expect.poll(() => width(page, '.music-panel')).toBe(panelBefore + 48)

  await page.reload()
  await expect.poll(() => width(page, '.music-panel')).toBe(panelBefore + 48)
  await expect.poll(() => width(page, '.music-library')).toBe(300)
})

test('the video guide resizes and page headers stay pinned while scrolling', async ({ page }) => {
  await mockLibrary(page)
  await page.addInitScript((data) => {
    const history = Array.from({ length: 30 }, (_, index) => ({
      video: { ...data[index % data.length], id: `hist${String(index).padStart(7, '0')}` },
      watchedAt: '2026-10-03T10:00:00Z',
    }))
    localStorage.setItem('musicbox-history', JSON.stringify(history))
  }, songs)
  await page.goto('/#/history')
  const title = page.getByRole('heading', { name: 'Watch History', exact: true })
  await expect(title).toBeVisible()
  await page.mouse.wheel(0, 2000)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600)
  expect(await page.locator('.page-header').evaluate((header) => header.getBoundingClientRect().top)).toBe(56)
  await expect(title).toBeInViewport()

  const handle = page.getByRole('separator', { name: 'Resize guide' })
  await handle.focus()
  for (let step = 0; step < 4; step++) await page.keyboard.press('ArrowRight')
  await expect.poll(() => width(page, '.yt-sidebar')).toBe(304)
  expect(await page.locator('main.yt-main').evaluate((main) => getComputedStyle(main).marginLeft)).toBe('304px')
})

test('saved playlists open as YouTube-style pages, and the download pages are tidy', async ({ page }) => {
  const data = await mockLibrary(page)
  await page.goto('/#/playlists')
  await expect(page.getByRole('heading', { name: 'Playlists', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Night drive', exact: true }).click()
  await expect(page).toHaveURL(/#\/playlists\?id=night-drive/)
  await expect(page.getByRole('heading', { name: 'Night drive', exact: true })).toBeVisible()
  await expect(page.locator('.saved-row')).toHaveCount(6)

  await page.getByRole('button', { name: 'Play all' }).click()
  await expect(page.locator('.audio-player__title')).toContainText('Midnight City')

  await page.locator('.saved-row').first().getByRole('button', { name: 'Move track down' }).click()
  await expect
    .poll(() => data.playlists[0].items.sort((a, b) => a.position - b.position)[0].title)
    .toBe('Sunset Lover')

  await page.getByRole('link', { name: 'Playlists', exact: true }).first().click()
  await page.getByRole('button', { name: 'New playlist' }).first().click()
  await page.getByLabel('Playlist name').fill('Gym')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/#\/playlists\?id=new-1/)
  await expect(page.getByRole('heading', { name: 'Gym', exact: true })).toBeVisible()
  await expect(page.getByText('This playlist is empty.')).toBeVisible()

  await page.goto('/#/songs')
  await expect(page.getByRole('heading', { name: 'Downloads', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No Downloads Yet' })).toBeVisible()

  await page.goto('/#/import')
  await expect(page.getByRole('heading', { name: 'Playlist Download', exact: true })).toBeVisible()
  await page.getByText('One combined MP3').click()
  await expect(page.getByRole('radio', { name: /One combined MP3/ })).toBeChecked()
})

test('new and redesigned pages fit a phone screen', async ({ page }) => {
  await mockLibrary(page)
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/#/playlists', '/#/playlists?id=night-drive', '/#/songs', '/#/import', '/#/history', '/#/settings', '/#/music/settings']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${path} overflows`,
    ).toBe(true)
  }

  // On a phone the search box folds into an icon that opens a full-width bar.
  await page.goto('/#/history')
  await expect(page.getByRole('search')).toBeHidden()
  await page.getByRole('button', { name: 'Open search' }).click()
  await expect(page.getByRole('button', { name: 'Close search' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('daft punk')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/results\?/)
  await expect(page.getByRole('button', { name: 'Open search' })).toBeVisible()
})
