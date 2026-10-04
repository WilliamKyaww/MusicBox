import { test, expect, type Page } from '@playwright/test'
import { mockLibrary, songs } from './fixtures'

const library = (page: Page) =>
  page.getByRole('complementary', { name: 'Your Library' })
const player = (page: Page) => page.locator('.audio-player')

async function songMenu(page: Page, title: string, item: string) {
  await page
    .getByRole('button', { name: `More options for ${title}`, exact: true })
    .first()
    .click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}

async function playlistMenu(page: Page, name: string, item: string) {
  await page
    .getByRole('button', { name: `More options for ${name}`, exact: true })
    .click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}

test('switches views, remembers route on reload, and keeps the same shared playlists', async ({
  page,
}) => {
  await mockLibrary(page)
  await page.goto('/')
  await expect(page.locator('.yt-topbar')).toBeVisible()
  await page.getByRole('button', { name: 'Music', exact: true }).click()
  await expect(page.locator('.music-app')).toBeVisible()
  await library(page).getByRole('link', { name: /Night drive/ }).click()
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
  await expect(page.getByText('Added to Liked Songs.')).toBeVisible()
  await page
    .getByRole('button', { name: 'Play Night drive', exact: true })
    .click()
  const audio = page.locator('.audio-player audio')
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.2)
  await player(page).getByRole('button', { name: 'Queue', exact: true }).click()
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

test('playlist creation, editing, folders and pins survive view changes', async ({
  page,
}) => {
  const data = await mockLibrary(page)
  await page.goto('/#/music/home')
  await page
    .getByRole('button', { name: 'Create playlist or folder', exact: true })
    .click()
  await page.getByRole('menuitem', { name: 'Playlist', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Road trip')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Road trip', exact: true }),
  ).toBeVisible()
  // An empty playlist offers Spotify's "find something for your playlist" search.
  await expect(
    page.getByRole('heading', { name: "Let's Find Something for Your Playlist" }),
  ).toBeVisible()
  await playlistMenu(page, 'Road trip', 'Pin playlist')
  await page
    .getByRole('button', { name: 'More options for Road trip', exact: true })
    .click()
  await expect(
    page.getByRole('menuitem', { name: 'Unpin playlist', exact: true }),
  ).toBeVisible()
  await page.getByRole('menuitem', { name: 'Move to folder', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Create folder', exact: true }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Driving')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await playlistMenu(page, 'Road trip', 'Edit details')
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Long way home')
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('For the last hour of the drive')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Long way home', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('For the last hour of the drive')).toBeVisible()
  expect(data.playlists.at(-1)?.name).toBe('Long way home')
  await page.getByRole('button', { name: 'Video', exact: true }).click()
  await page.goto('/#/playlists')
  await expect(page.locator('main')).toContainText('Long way home')
  await page.getByRole('button', { name: 'Music', exact: true }).click()
  const folder = library(page).getByRole('button', { name: /Driving/ })
  await expect(folder).toBeVisible()
  await folder.click()
  await expect(
    library(page).getByRole('link', { name: /Long way home/ }),
  ).toBeVisible()
})

test('failed rename stays open and reports the error without losing the playlist', async ({
  page,
}) => {
  const data = await mockLibrary(page)
  data.failRename = true
  await page.goto('/#/music/playlist?id=night-drive')
  await playlistMenu(page, 'Night drive', 'Edit details')
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
  await page.getByRole('switch', { name: 'Private session', exact: true }).click()
  await page.getByLabel('Sleep timer', { exact: true }).selectOption('end')
  await page.goto('/#/music/playlist?id=night-drive')
  await expect(page.locator('.music-private')).toBeVisible()
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
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('musicbox-music-library-v1') ?? '{}')
          .recentContexts ?? [],
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
  // A matching artist becomes the top result, as in Spotify.
  await expect(page.locator('.music-top-result')).toContainText('Tycho')
  await page.getByRole('button', { name: 'Songs', exact: true }).click()
  await page.getByLabel('Filter songs', { exact: true }).fill('Midnight')
  await expect(page.locator('.music-track__title')).toHaveCount(1)
  await songMenu(page, 'Midnight City', 'Add to queue')
  await expect(page.locator('.audio-player__track-label')).toContainText(
    'Midnight City',
  )
  await page.goto('/#/music/search')
  await expect(
    page.getByRole('heading', { name: 'Recent Searches', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Tycho', exact: true })).toBeVisible()
})

test('typing in search shows results without pressing Enter', async ({ page }) => {
  await mockLibrary(page)
  await page.goto('/#/music/home')
  await page
    .getByRole('searchbox', { name: 'Search music', exact: true })
    .pressSequentially('daft punk', { delay: 30 })
  await expect(
    page.getByRole('heading', { name: 'Results for "daft punk"', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('searchbox', { name: 'Search music', exact: true }),
  ).toHaveValue('daft punk')
})

test('duplicate queued songs restart correctly and the mobile player remains usable', async ({
  page,
}, testInfo) => {
  await mockLibrary(page)
  await page.goto('/#/music/playlist?id=night-drive')
  await page
    .getByRole('button', { name: 'Play Night drive', exact: true })
    .click()
  await songMenu(page, 'Midnight City', 'Play next')
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
    player(page).getByRole('button', { name: 'Pause', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  // Tapping the mini player opens the full-screen player.
  await page.locator('.audio-player__artwork--button').click()
  await expect(
    page.getByRole('dialog', { name: 'Now playing: Midnight City' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Exit full screen', exact: true }).click()
  await page.getByRole('button', { name: 'Your Library', exact: true }).click()
  await expect(library(page).getByRole('link', { name: /Night drive/ })).toBeVisible()
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
    .getByRole('link', { name: 'Settings', exact: true })
    .click()
  await page.getByRole('switch', { name: 'Private session', exact: true }).click()
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
    .getByRole('link', { name: 'Settings', exact: true })
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
    page.getByRole('heading', { name: 'Recently Played', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Made for You', exact: true }),
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
  await expect(
    page.getByRole('navigation', { name: 'Music sections' }),
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

test('artist pages show popular songs, follow the artist and open its playlists as albums', async ({
  page,
}) => {
  await mockLibrary(page)
  await page.goto('/#/music/playlist?id=night-drive')
  // Playlist songs have no channel id, so the artist is looked up from the video first.
  await page.locator('.music-track__artist', { hasText: 'M83' }).first().click()
  await expect(page).toHaveURL(/#\/music\/artist\?id=channel-track000000/)
  await expect(page.getByRole('heading', { name: 'M83', exact: true })).toBeVisible()
  await expect(page.getByText('Verified Artist')).toBeVisible()
  await expect(page.getByText('4,550,000 followers').first()).toBeVisible()
  // Popular is ranked by views: Innerbloom has the most in the fixture.
  const popular = page.getByRole('list', { name: 'Popular songs' })
  await expect(popular.locator('.music-track__title').first()).toHaveText('Innerbloom')
  await page.getByRole('button', { name: 'Follow', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Following', exact: true })).toBeVisible()
  await expect(library(page).getByRole('link', { name: /M83/ })).toBeVisible()
  await page.getByRole('button', { name: 'Night Sessions', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Night Sessions', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Save to Your Library', exact: true }).click()
  await library(page).getByRole('button', { name: 'Albums', exact: true }).click()
  await expect(library(page).getByRole('link', { name: /Night Sessions/ })).toBeVisible()
  await page.getByRole('button', { name: 'Play Night Sessions', exact: true }).click()
  await expect(page.locator('.audio-player__track-label')).toContainText('Midnight City')
  await expect(page.locator('.music-panel__header')).toContainText('Night Sessions')
})

test('synced lyrics follow playback and seek when a line is clicked', async ({ page }) => {
  await mockLibrary(page)
  await page.goto('/#/music/playlist?id=night-drive')
  await page.getByRole('button', { name: 'Play Night drive', exact: true }).click()
  await player(page).getByRole('button', { name: 'Lyrics', exact: true }).click()
  await expect(page).toHaveURL(/#\/music\/lyrics/)
  const lines = page.locator('.music-lyrics__lines--page')
  await expect(lines.getByRole('button', { name: 'First line of Midnight City' })).toBeVisible()
  // "[Music]" cues are not lyrics.
  await expect(lines.getByText('[Music]')).toHaveCount(0)
  const audio = page.locator('.audio-player audio')
  await audio.evaluate((a: HTMLAudioElement) => {
    a.pause()
    a.currentTime = 5
  })
  await expect(lines.locator('.is-active')).toHaveText('Second line')
  await lines.getByRole('button', { name: 'Fifth line' }).click()
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThanOrEqual(10)
  await expect(lines.locator('.is-active')).toHaveText('Fifth line')
})

test('queue shows Next in queue before the playlist, clears, and autoplays similar songs', async ({
  page,
}) => {
  await mockLibrary(page)
  await page.goto('/#/music/playlist?id=night-drive')
  await page.getByRole('button', { name: 'Play Night drive', exact: true }).click()
  await songMenu(page, 'Nights', 'Add to queue')
  await songMenu(page, 'A Walk', 'Add to queue')
  await player(page).getByRole('button', { name: 'Queue', exact: true }).click()
  const queue = page.getByRole('complementary', { name: 'Play queue' })
  await expect(queue.getByRole('heading', { name: 'Next in Queue' })).toBeVisible()
  await expect(queue.getByRole('heading', { name: 'Next from: Night drive' })).toBeVisible()
  await expect(queue.locator('.music-queue-track').nth(0)).toContainText('Nights')
  await expect(queue.locator('.music-queue-track').nth(1)).toContainText('A Walk')
  await queue.getByRole('button', { name: 'Clear queue', exact: true }).click()
  await expect(queue.getByRole('heading', { name: 'Next in Queue' })).toHaveCount(0)
  await expect(queue.locator('.music-queue-track')).toHaveCount(5)
  // Starting the last song lines up recommendations so the music keeps going.
  await page.getByRole('button', { name: 'Play Innerbloom', exact: true }).click()
  await expect(queue.getByRole('heading', { name: 'Autoplay' })).toBeVisible()
  await expect(queue).toContainText('Radio Song A')
})

test('song menus add to playlists, and songs can be dragged onto a playlist', async ({
  page,
}) => {
  const data = await mockLibrary(page)
  await page.goto('/#/music/home')
  await page.getByRole('button', { name: 'Create playlist or folder', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Playlist', exact: true }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Road trip')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Road trip', exact: true })).toBeVisible()
  await library(page).getByRole('link', { name: /Night drive/ }).click()
  await page.getByRole('button', { name: 'More options for Nights', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Add to playlist', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Find a playlist' }).fill('road')
  await page.getByRole('menuitem', { name: 'Road trip', exact: true }).click()
  await expect(page.getByText('Added "Nights" to "Road trip".')).toBeVisible()
  const roadTrip = () => data.playlists.find((p) => p.name === 'Road trip')!
  expect(roadTrip().items.map((i) => i.title)).toEqual(['Nights'])
  await page
    .locator('.music-track', { hasText: 'Sunset Lover' })
    .dragTo(library(page).getByRole('link', { name: /Road trip/ }))
  await expect.poll(() => roadTrip().items.length).toBe(2)
  // Dragging within a playlist reorders it: dropping on the lower half of a row places the song after it.
  await page
    .locator('.music-track', { hasText: 'Nights' })
    .dragTo(page.locator('.music-track', { hasText: 'Midnight City' }), {
      targetPosition: { x: 300, y: 44 },
    })
  await expect
    .poll(() =>
      data.playlists
        .find((p) => p.id === 'night-drive')!
        .items.sort((a, b) => a.position - b.position)
        .map((item) => item.title)
        .slice(0, 3),
    )
    .toEqual(['Midnight City', 'Nights', 'Sunset Lover'])
})

test('song radio, full screen, keyboard shortcuts and the Now Playing view', async ({ page }) => {
  await mockLibrary(page)
  await page.goto('/#/music/playlist?id=night-drive')
  await songMenu(page, 'Sunset Lover', 'Go to song radio')
  await expect(
    page.getByRole('heading', { name: 'Sunset Lover Radio', exact: true }),
  ).toBeVisible()
  // Song radio starts with the song itself, followed by songs like it.
  await expect(page.locator('.music-track__title').first()).toHaveText('Sunset Lover')
  await expect(page.locator('.music-tracks')).toContainText('Radio Song A')
  await page.getByRole('button', { name: 'Play Sunset Lover Radio', exact: true }).click()
  await expect(page.locator('.audio-player__track-label')).toContainText('Sunset Lover')
  const panel = page.getByRole('complementary', { name: 'Now Playing' })
  await expect(panel.getByText('About the artist')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Follow', exact: true })).toBeVisible()
  await expect(panel.getByText('1,822,932,824')).toBeVisible()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Alt+Shift+B')
  await expect(page.getByText('Added to Liked Songs.')).toBeVisible()
  await page.keyboard.press('Control+/')
  await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeVisible()
  await page.keyboard.press('Escape')
  const audio = page.locator('.audio-player audio')
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused))
    .toBe(false)
  await page.keyboard.press('Space')
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused))
    .toBe(true)
  await page.keyboard.press('f')
  const fullscreen = page.getByRole('dialog', { name: 'Now playing: Sunset Lover' })
  await expect(fullscreen).toBeVisible()
  await fullscreen.getByRole('button', { name: 'Play', exact: true }).click()
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused))
    .toBe(false)
  await page.keyboard.press('Escape')
  await expect(fullscreen).toHaveCount(0)
  await page.getByRole('button', { name: 'Collapse Your Library', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Expand Your Library', exact: true })).toBeVisible()
})
