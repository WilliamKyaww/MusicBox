import { test, expect, type Page } from '@playwright/test'
import { mockLibrary } from './fixtures'

async function mockMovies(page: Page, initial = true) {
  await mockLibrary(page)
  let enabled = initial
  let fail = false
  await page.route((url) => url.pathname === '/api/movies/status', (route) =>
    route.fulfill({ status: fail ? 503 : 200, json: fail ? { detail: 'Unavailable' } : {
      enabled, stage: 'foundation', catalogue_available: false, playback_available: false, schema_version: 1,
    } }))
  await page.route((url) => url.pathname === '/api/settings', async (route) => {
    if (route.request().method() === 'PUT') {
      expect(route.request().headers()['x-musicbox-settings']).toBe('1')
      enabled = route.request().postDataJSON().values.MOVIES_ENABLED
    }
    await route.fulfill({ json: {
      config_file: 'test-config.env', read_only_reason: null,
      groups: [{ id: 'movies', label: 'Movies' }],
      fields: [{ key: 'MOVIES_ENABLED', label: 'Movies experience', group: 'movies', kind: 'boolean',
        description: 'Preview only', restart_required: false, minimum: null, maximum: null,
        is_set: true, value: enabled, locked: false }],
    } })
  })
  return { fail: (value: boolean) => { fail = value } }
}

test('Movies is opt-in, updates from Settings, and can be disabled without losing navigation', async ({ page }) => {
  await mockMovies(page, false)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Movies', exact: true })).toHaveCount(0)
  await page.locator('.app-controls').getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('switch', { name: 'Movies experience' }).click()
  await page.getByRole('button', { name: 'Movies', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ready for the Next Chapter' })).toBeVisible()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page).toHaveURL(/#\/movies\/settings$/)
  await page.getByRole('switch', { name: 'Movies experience' }).click()
  await page.getByRole('link', { name: 'Movies home' }).click()
  await expect(page.getByRole('heading', { name: 'Enable the Preview' })).toBeVisible()
  await page.getByRole('button', { name: 'Video', exact: true }).click()
  await expect(page.locator('.yt-topbar')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Movies', exact: true })).toHaveCount(0)
})

test('Movies browsing keeps the same audio element, playback position and remembered Music route', async ({ page }) => {
  await mockMovies(page)
  await page.goto('/#/music/playlist?id=night-drive')
  await page.getByRole('button', { name: 'Play Night drive', exact: true }).click()
  const audio = page.locator('.audio-player audio')
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0.2)
  const before = await audio.evaluate((a: HTMLAudioElement) => { a.dataset.moviesTest = 'same-element'; return a.currentTime })
  await page.getByRole('button', { name: 'Movies', exact: true }).click()
  await expect(audio).toHaveAttribute('data-movies-test', 'same-element')
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(before)
  await page.getByRole('button', { name: 'Music', exact: true }).click()
  await expect(page).toHaveURL(/#\/music\/playlist\?id=night-drive$/)
  await page.getByRole('button', { name: 'Movies', exact: true }).click()
  await page.reload()
  await expect(page.locator('.movies-workspace')).toBeVisible()
  await expect(page.locator('.audio-player audio')).toHaveCount(1)
})

test('Movies service errors, retry and unknown routes remain isolated', async ({ page }) => {
  const mock = await mockMovies(page)
  mock.fail(true)
  await page.goto('/#/movies')
  await expect(page.getByRole('heading', { name: 'Movies Is Unavailable' })).toBeVisible()
  mock.fail(false)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Ready for the Next Chapter' })).toBeVisible()
  await page.goto('/#/movies/watch?v=not-a-youtube-id')
  await expect(page.getByRole('heading', { name: 'Page Not Available' })).toBeVisible()
  await expect(page.locator('video, iframe')).toHaveCount(0)
  await page.getByRole('button', { name: 'Video', exact: true }).click()
  await expect(page.locator('.yt-topbar')).toBeVisible()
})

for (const width of [1440, 1024, 390]) {
  for (const theme of ['light', 'dark']) {
    test(`Movies at ${width}px in ${theme} has no page overflow and keeps its header`, async ({ page }, testInfo) => {
      await mockMovies(page)
      await page.setViewportSize({ width, height: 850 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.addInitScript((value) => localStorage.setItem('spotimy-theme', value), theme)
      await page.goto('/#/movies')
      await expect(page.getByRole('heading', { name: 'Ready for the Next Chapter' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('movies.png'), fullPage: true })
      await page.evaluate(() => window.scrollTo(0, 600))
      expect((await page.locator('.movies-header').boundingBox())?.y).toBe(0)
      for (const mode of ['Video', 'Music']) {
        await page.getByRole('button', { name: mode, exact: true }).click()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.getByRole('button', { name: 'Movies', exact: true }).click()
      }
    })
  }
}
