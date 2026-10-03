import { test, expect } from '@playwright/test'
import { mockLibrary, songs } from './fixtures'

test('switches views, remembers route on reload, and keeps the same shared playlists', async ({
  page,
}) => {
  await mockLibrary(page)
  await page.goto('/')
  await expect(page.locator('.yt-topbar')).toBeVisible()
  await page.getByRole('button', { name: 'Music', exact: true }).click()
  await expect(page.locator('.music-app')).toBeVisible()
  await page
    .getByRole('button', { name: 'Night drive Playlist / 6 songs' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Night drive', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Video', exact: true }).click()
  await expect(page.locator('.yt-topbar')).toBeVisible()
  await page.getByRole('button', { name: 'Music', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Night drive', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Night drive', exact: true }),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-experience', 'music')
})

test('likes persist, songs can be filtered, and queue editing does not restart playback', async ({
  page,
}) => {
  await mockLibrary(page)
  await page.goto('/#/music/playlist?id=night-drive')
  await page
    .getByRole('button', { name: 'Like Midnight City', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Play Night drive', exact: true })
    .click()
  const audio = page.locator('.audio-player audio')
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.2)
  await page.getByRole('button', { name: 'Toggle queue', exact: true }).click()
  await page
    .getByRole('button', { name: 'Move queued Nights up', exact: true })
    .click()
  await expect(page.locator('.music-queue-track').nth(1)).toContainText(
    'Nights',
  )
  await page
    .getByRole('button', { name: 'Remove queued A Walk', exact: true })
    .click()
  await expect(page.locator('.music-queue-track')).toHaveCount(4)
  const before = await audio.evaluate((a: HTMLAudioElement) => a.currentTime)
  await page.getByRole('button', { name: 'Video', exact: true }).click()
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(before)
  await page.getByRole('button', { name: 'Music', exact: true }).click()
  await expect(audio).toHaveCount(1)
  await page.goto('/#/music/liked')
  await expect(page.locator('.music-track__title')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.music-track__title')).toContainText(
    'Midnight City',
  )
  await expect
    .poll(() =>
      page
        .locator('.audio-player audio')
        .evaluate((a: HTMLAudioElement) => a.paused),
    )
    .toBe(true)
})

test('playlist creation, renaming, folders and pins survive view changes', async ({
  page,
}) => {
  const data = await mockLibrary(page)
  await page.goto('/#/music/home')
  await page
    .getByRole('button', { name: 'Create playlist', exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Road trip')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Road trip', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Pin playlist', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Pin playlist', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Create folder', exact: true }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Driving')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page
    .getByLabel('Playlist folder', { exact: true })
    .selectOption({ label: 'Driving' })
  await page.getByRole('button', { name: 'Rename', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Long way home')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Long way home', exact: true }),
  ).toBeVisible()
  expect(data.playlists.at(-1)?.name).toBe('Long way home')
  await page.getByRole('button', { name: 'Video', exact: true }).click()
  await page.goto('/#/playlists')
  await expect(page.locator('main')).toContainText('Long way home')
  await page.getByRole('button', { name: 'Music', exact: true }).click()
  await expect(page.getByLabel('Playlist folder', { exact: true })).toHaveValue(
    /.+/,
  )
})

test('failed rename stays open and reports the error without losing the playlist', async ({
  page,
}) => {
  const data = await mockLibrary(page)
  data.failRename = true
  await page.goto('/#/music/playlist?id=night-drive')
  await page.getByRole('button', { name: 'Rename', exact: true }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Changed')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Rename unavailable')
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('heading', { name: 'Night drive', exact: true }),
  ).toBeVisible()
})

test('private listening suppresses history and presence, and sleep timer pauses at track end', async ({
  page,
}) => {
  const data = await mockLibrary(page)
  await page.goto('/#/music/settings')
  await page.getByRole('button', { name: 'Off', exact: true }).click()
  await page.getByLabel('Sleep timer', { exact: true }).selectOption('end')
  await page.goto('/#/music/playlist?id=night-drive')
  await page
    .getByRole('button', { name: 'Play Night drive', exact: true })
    .click()
  const audio = page.locator('.audio-player audio')
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.1)
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('musicbox-history') ?? '[]'),
    ),
  ).toEqual([])
  expect(
    data.calls.some((c) => c.startsWith('PUT /api/discord-presence')),
  ).toBe(false)
  await audio.evaluate((a: HTMLAudioElement) => {
    a.currentTime = a.duration - 0.1
  })
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused))
    .toBe(true)
  await expect(page.locator('.audio-player__track-label')).toContainText(
    'Midnight City',
  )
})

test('repeat queue advances to the next song rather than repeating the first', async ({
  page,
}) => {
  await mockLibrary(page)
  await page.goto('/#/music/playlist?id=night-drive')
  await page
    .getByRole('button', { name: 'Play Night drive', exact: true })
    .click()
  await page.getByRole('button', { name: 'Loop off', exact: true }).click()
  const audio = page.locator('.audio-player audio')
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.duration))
    .toBeGreaterThan(1)
  await audio.evaluate((a: HTMLAudioElement) => {
    a.currentTime = a.duration - 0.1
  })
  await expect(page.locator('.audio-player__track-label')).toContainText(
    'Sunset Lover',
  )
})

test('search, more menu and play-next use real shared actions', async ({
  page,
}) => {
  await mockLibrary(page)
  await page.goto('/#/music/home')
  await page.keyboard.press('Control+k')
  await expect(
    page.getByRole('searchbox', { name: 'Search music', exact: true }),
  ).toBeFocused()
  await page
    .getByRole('searchbox', { name: 'Search music', exact: true })
    .fill('Tycho')
  await page
    .getByRole('button', { name: 'Submit music search', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Results for "Tycho"', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Filter songs', { exact: true }).fill('Midnight')
  await expect(page.locator('.music-track__title')).toHaveCount(1)
  await page
    .getByRole('button', {
      name: 'More options for Midnight City',
      exact: true,
    })
    .click()
  await page.getByRole('button', { name: 'Add to queue', exact: true }).click()
  await expect(page.locator('.audio-player__track-label')).toContainText(
    'Midnight City',
  )
})

test('duplicate queued songs restart correctly and the mobile player remains usable', async ({
  page,
}, testInfo) => {
  await mockLibrary(page)
  await page.goto('/#/music/playlist?id=night-drive')
  await page
    .getByRole('button', { name: 'Play Night drive', exact: true })
    .click()
  await page
    .getByRole('button', {
      name: 'More options for Midnight City',
      exact: true,
    })
    .click()
  await page.getByRole('button', { name: 'Play next', exact: true }).click()
  const audio = page.locator('.audio-player audio')
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.duration))
    .toBeGreaterThan(1)
  await audio.evaluate((a: HTMLAudioElement) => {
    a.currentTime = a.duration - 0.1
  })
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('musicbox-audio-queue')!).index,
      ),
    )
    .toBe(1)
  await expect
    .poll(() =>
      audio.evaluate(
        (a: HTMLAudioElement) =>
          !a.paused && a.currentTime > 0.1 && a.currentTime < 5,
      ),
    )
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('music-player-desktop.png'),
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .getByRole('button', { name: 'Close side panel', exact: true })
    .click()
  await expect(
    page
      .locator('.audio-player')
      .getByRole('button', { name: 'Pause', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('music-player-mobile.png'),
  })
})

test('private listening clears activity after an in-flight Discord update completes', async ({
  page,
}) => {
  const data = await mockLibrary(page)
  data.presenceDelay = 700
  await page.goto('/#/music/playlist?id=night-drive')
  await page
    .getByRole('button', { name: 'Play Night drive', exact: true })
    .click()
  await expect
    .poll(() => data.calls.includes('PUT /api/discord-presence/activity'))
    .toBe(true)
  await page
    .getByRole('link', { name: 'Listening settings', exact: true })
    .click()
  await page.getByRole('button', { name: 'Off', exact: true }).click()
  await expect.poll(() => data.completedPresence.includes('PUT')).toBe(true)
  await expect.poll(() => data.completedPresence.at(-1)).toBe('DELETE')
  expect(data.presenceActive).toBe(false)
})

test('timed sleep pauses playback and resets the timer', async ({ page }) => {
  await mockLibrary(page)
  await page.goto('/#/music/playlist?id=night-drive')
  await page
    .getByRole('button', { name: 'Play Night drive', exact: true })
    .click()
  const audio = page.locator('.audio-player audio')
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.1)
  await page.clock.install()
  await page
    .getByRole('link', { name: 'Listening settings', exact: true })
    .click()
  await page.getByLabel('Sleep timer', { exact: true }).selectOption('15')
  await page.clock.fastForward(15 * 60000 + 1)
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused))
    .toBe(true)
  await expect(page.getByLabel('Sleep timer', { exact: true })).toHaveValue(
    'off',
  )
})

test('desktop music layout and mobile layouts do not overflow', async ({
  page,
}, testInfo) => {
  await mockLibrary(page)
  await page.addInitScript(
    (data) =>
      localStorage.setItem(
        'musicbox-history',
        JSON.stringify(
          data.map((video) => ({ video, watchedAt: '2026-10-03' })),
        ),
      ),
    songs,
  )
  await page.goto('/#/music/home')
  await expect(
    page.getByRole('heading', { name: 'Jump back in', exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('music-desktop.png'),
    fullPage: true,
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Music', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('music-mobile.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Video', exact: true }).click()
  await expect(page.locator('.yt-topbar')).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})
