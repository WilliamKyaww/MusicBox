import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockLibrary } from './fixtures'

const clip = readFileSync(new URL('./fixtures/movie.webm', import.meta.url))
const baseMovie = {
  id: 'local:movie:test', kind: 'movie', title: 'The Quiet Horizon',
  description: 'An original test film about a quiet evening by the sea.',
  date: '2026-03-12', runtime: 96, poster: '/test-art/track000000.svg', backdrop: '/test-art/banner3.svg', genres: ['Drama'],
  rating: 7.54, cast: ['Test Performer', 'Second Performer'], crew: ['Test Director'], seasons: [], trailer_url: null,
  provider_url: null, certification: 'PG', available_providers: [], playable: true, watchable: true,
  assets: [{ id: 'asset-1', label: '90p', height: 90, video_codec: 'vp8', audio_codec: 'vorbis', duration: 30, available: true }],
}
/** A title the user added with almost no metadata: nothing here may render as "undefined" or "0". */
const bareMovie = {
  ...baseMovie, id: 'local:movie:bare', title: 'Home Video', description: '', date: '', runtime: 0, poster: null, backdrop: null,
  genres: [], rating: 0, cast: [], crew: [], certification: '', playable: true, watchable: true,
}
/** Metadata that no file backs: saved before, but it must never be listed as something to watch. */
const detailsOnly = { ...baseMovie, id: 'tmdb:movie:7', title: 'Metadata Only', playable: false, watchable: false, assets: [] }

type Options = { enabled?: boolean; playback?: boolean; bare?: boolean; many?: number }

async function mockMovies(page: Page, { enabled = true, playback = true, bare = false, many = 0 }: Options = {}) {
  await mockLibrary(page)
  let isEnabled = enabled
  let fail = false
  let saved = false
  let position = 0
  let sequence = 0
  let session = 0
  let profileCount = 1
  let registered = true
  const writes: { position: number; sequence: number }[] = []
  const profiles = [{ id: 'default', name: 'Local profile', local_default: 1 }]
  const movie = () => ({ ...baseMovie, playable: registered, watchable: registered, assets: registered ? baseMovie.assets : [] })
  await page.route(url => url.pathname.startsWith('/api/movies/'), async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = decodeURIComponent(url.pathname.replace('/api/movies', ''))
    const method = request.method()
    const send = (json: unknown, status = 200) => route.fulfill({ status, json })
    if (path === '/status') {
      return send(fail ? { detail: 'Unavailable' } : {
        enabled: isEnabled, stage: 'hybrid', catalogue_available: isEnabled, playback_available: isEnabled && playback,
        free_streaming_enabled: playback, metadata_configured: false, media_configured: false, local_access: true, schema_version: 3,
      }, fail ? 503 : 200)
    }
    if (['POST', 'PUT', 'DELETE'].includes(method)) expect(request.headers()['x-musicbox-movies']).toBe('1')
    if (path === '/profiles') {
      if (method === 'POST') profiles.push({ id: 'profile-' + profileCount++, name: request.postDataJSON().name, local_default: 0 })
      return send(method === 'POST' ? profiles.at(-1) : profiles)
    }
    if (path.startsWith('/profiles/') && method === 'DELETE' && !path.includes('history')) {
      profiles.splice(profiles.findIndex(p => p.id === path.split('/')[2]), 1)
      return route.fulfill({ status: 204 })
    }
    if (path === '/library') {
      const extra = Array.from({ length: many }, (_, index) => ({ ...baseMovie, id: `local:movie:extra-${index}`, title: `Extra Film ${index + 1}` }))
      const items = [...(registered ? [movie()] : []), ...(bare ? [bareMovie] : []), ...extra]
      return send({ items, total: items.length })
    }
    if (path.endsWith('/recommendations')) return send([])
    if (path === '/titles/' + baseMovie.id) return send(movie())
    if (path === '/titles/' + bareMovie.id) return send(bareMovie)
    if (path.includes('/titles/')) {
      return send({ saved: path.includes('/default/') && saved, progress: position ? { position, duration: 30, completed: false, updated_at: 1 } : null })
    }
    if (path.includes('/watchlist/')) { saved = request.postDataJSON().saved; return send({ saved }) }
    if (path.endsWith('/watchlist')) return send(path.includes('/default/') && saved ? [movie(), detailsOnly] : [])
    if (path.endsWith('/history')) {
      if (method === 'DELETE') { position = 0; return route.fulfill({ status: 204 }) }
      return send(position ? [{ ...movie(), progress: { position, duration: 30, completed: position >= 29, updated_at: 1 } }] : [])
    }
    if (path.includes('/playback/')) {
      sequence = 0
      return send({ session_id: 'session-' + ++session, title: movie(), asset_id: 'asset-1', url: '/api/movies/assets/asset-1/file', duration: 30, resume: position, subtitles: [] })
    }
    if (path.includes('/progress/')) {
      const body = request.postDataJSON()
      const accepted = body.sequence > sequence && body.session_id === 'session-' + session
      if (accepted) { sequence = body.sequence; position = body.position; writes.push(body) }
      return send({ accepted })
    }
    if (path === '/assets/asset-1' && method === 'DELETE') { registered = false; return route.fulfill({ status: 204 }) }
    if (path === '/assets/asset-1/file') {
      const range = /bytes=(\d+)-(\d*)/.exec(request.headers().range || '')
      const start = range ? Number(range[1]) : 0
      const end = range?.[2] ? Math.min(Number(range[2]), clip.length - 1) : clip.length - 1
      return route.fulfill({
        status: range ? 206 : 200,
        headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${clip.length}` } : {}) },
        body: clip.subarray(start, end + 1),
      })
    }
    return send({ detail: 'No Movies fixture for ' + path }, 404)
  })
  // Registering a file is a POST to /library, which the GET handler above would shadow.
  await page.route(url => url.pathname === '/api/movies/library', async route => {
    const request = route.request()
    if (request.method() !== 'POST') return route.fallback()
    expect(request.headers()['x-musicbox-movies']).toBe('1')
    const body = request.postDataJSON()
    if (body.relative_path.includes('..')) return route.fulfill({ status: 422, json: { detail: 'Choose a relative file inside the configured Movies folder.' } })
    registered = true
    return route.fulfill({ status: 201, json: movie() })
  })
  await page.route(url => url.pathname === '/api/settings', async route => {
    if (route.request().method() === 'PUT') isEnabled = route.request().postDataJSON().values.MOVIES_ENABLED
    await route.fulfill({ json: {
      config_file: 'test.env', read_only_reason: null, groups: [{ id: 'movies', label: 'Movies' }],
      fields: [{ key: 'MOVIES_ENABLED', label: 'Movies experience', group: 'movies', kind: 'boolean', description: 'Movies', restart_required: false, minimum: null, maximum: null, is_set: true, value: isEnabled, locked: false }],
    } })
  })
  return { fail: (value: boolean) => { fail = value }, writes, getPosition: () => position }
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Movies navigation' })

test('Movies can be enabled and disabled from Settings without losing existing navigation', async ({ page }) => {
  await mockMovies(page, { enabled: false })
  await page.goto('/#/movies')
  await expect(page.getByRole('heading', { name: 'Enable Movies' })).toBeVisible()
  await page.getByRole('link', { name: 'Open settings', exact: true }).click()
  await page.getByRole('switch', { name: 'Movies experience' }).click()
  await page.getByRole('link', { name: 'Movies home' }).click()
  await expect(page.locator('.movies-hero')).toContainText('The Quiet Horizon')
  await page.locator('.app-controls').getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('switch', { name: 'Movies experience' }).click()
  await page.getByRole('button', { name: 'Video', exact: true }).click()
  await expect(page.locator('.yt-topbar')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Movies', exact: true })).toHaveCount(0)
})

test('playback that is not configured says so, with what to switch on, and never lists titles', async ({ page }) => {
  await mockMovies(page, { playback: false })
  await page.goto('/#/movies/home')
  await expect(page.getByRole('heading', { name: "Playback Isn't Set Up" })).toBeVisible()
  await expect(page.getByText('switch on Free online films or choose a Movies media folder')).toBeVisible()
  await expect(page.locator('.movies-setup')).toContainText('Free online filmsOff')
  await expect(page.locator('.movies-setup')).toContainText('Movies media folderNot set')
  await expect(page.locator('.movie-card')).toHaveCount(0)
  // The shared top bar is still there, and Settings is reachable to fix it.
  await expect(page.locator('.app-controls')).toBeVisible()
  await page.getByRole('link', { name: 'Open Movies settings' }).click()
  await expect(page).toHaveURL(/movies\/settings/)
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  // Direct links to a title or the player show the same explanation.
  await page.goto('/#/movies/watch?id=' + encodeURIComponent(baseMovie.id))
  await expect(page.getByRole('heading', { name: "Playback Isn't Set Up" })).toBeVisible()
})

test('only titles that can be played are listed, searched or saved', async ({ page }) => {
  await mockMovies(page)
  await page.goto('/#/movies/home')
  await expect(page.getByRole('heading', { name: 'Your Collection' })).toBeVisible()
  await page.goto('/#/movies/details?id=' + encodeURIComponent(baseMovie.id))
  await page.getByRole('button', { name: 'Add to my list' }).click()
  await expect(page.getByRole('button', { name: 'Remove from my list' })).toBeEnabled()
  await nav(page).getByRole('link', { name: 'My list' }).click()
  await expect(page.getByRole('link', { name: 'Details for The Quiet Horizon' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Details for Metadata Only' })).toHaveCount(0)
  await expect(page.getByText('1 saved title is not available to play here, so it is not shown.')).toBeVisible()
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search movies and TV' }).fill('Metadata')
  await expect(page.getByText('No playable titles match that search.')).toBeVisible()
})

test('search, details, My List and local profiles use real actions', async ({ page }) => {
  await mockMovies(page)
  await page.goto('/#/movies')
  await expect(page.getByRole('heading', { name: 'Your Collection' })).toBeVisible()
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search movies and TV' }).fill('Horizon')
  await expect(page.getByRole('region', { name: 'Search suggestions' }).getByRole('link', { name: /The Quiet Horizon/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Search Results' })).toBeVisible()
  await expect(page.getByText('Results for “Horizon”')).toBeVisible()
  await page.getByRole('link', { name: 'Details for The Quiet Horizon' }).click()
  await page.getByRole('button', { name: 'Add to my list' }).click()
  await expect(page.getByRole('button', { name: 'Remove from my list' })).toBeEnabled()
  await nav(page).getByRole('link', { name: 'My list' }).click()
  await expect(page.getByRole('link', { name: 'Details for The Quiet Horizon' })).toBeVisible()

  await page.getByRole('button', { name: 'Profile: Local profile' }).click()
  await page.getByRole('link', { name: 'Manage profiles' }).click()
  await page.getByRole('textbox', { name: 'New profile name' }).fill('Guest')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await page.getByRole('button', { name: 'Profile: Local profile' }).click()
  await page.getByRole('button', { name: 'Guest' }).click()
  await expect(page.getByRole('button', { name: 'Profile: Guest' })).toBeVisible()
  await nav(page).getByRole('link', { name: 'My list' }).click()
  await expect(page.getByRole('heading', { name: 'Nothing Here Yet' })).toBeVisible()
})

test('rows scroll sideways with arrows that appear only when there is more to see', async ({ page }) => {
  await mockMovies(page, { many: 8 })
  await page.setViewportSize({ width: 800, height: 900 })
  await page.goto('/#/movies/home')
  const row = page.locator('.movie-row', { has: page.getByRole('heading', { name: 'Your Collection' }) })
  const items = row.locator('.movie-row__items')
  await expect(row.getByRole('link', { name: 'Details for Extra Film 8' })).toHaveCount(1)
  await expect(row.locator('.movie-row__nav--prev')).toBeHidden()
  await row.hover()
  const next = row.getByRole('button', { name: 'Scroll Your Collection forward' })
  await expect(next).toBeVisible()
  await next.click()
  await expect.poll(() => items.evaluate(element => element.scrollLeft)).toBeGreaterThan(100)
  await row.hover()
  await expect(row.getByRole('button', { name: 'Scroll Your Collection back' })).toBeVisible()
  await items.evaluate(element => { element.scrollLeft = element.scrollWidth })
  await expect(row.locator('.movie-row__nav--next')).toBeHidden()
})

test('a search with no playable match says why', async ({ page }) => {
  await mockMovies(page)
  await page.goto('/#/movies/search?q=missing')
  await expect(page.getByRole('heading', { name: 'No Matches' })).toBeVisible()
  await expect(page.getByText('Only titles that can be played here are searched.')).toBeVisible()
})

test('every piece of metadata is shown correctly, and unknown values are left out', async ({ page }) => {
  await mockMovies(page, { bare: true })
  await page.goto('/#/movies/details?id=' + encodeURIComponent(baseMovie.id))
  const facts = page.locator('.movies-facts')
  await expect(page.getByRole('heading', { name: 'The Quiet Horizon', level: 1 })).toBeVisible()
  await expect(page.locator('.movies-meta')).toHaveText('2026PG1h 36m')
  await expect(page.getByText('An original test film about a quiet evening by the sea.')).toBeVisible()
  await expect(facts.locator('div', { hasText: 'Cast' }).first()).toContainText('Test Performer, Second Performer')
  await expect(facts.locator('div', { hasText: 'Director' }).first()).toContainText('Test Director')
  await expect(facts).toContainText('GenresDrama')
  await expect(facts).toContainText('Released12 March 2026')
  await expect(facts).toContainText('Runtime1h 36m')
  await expect(facts).toContainText('Maturity ratingPG')
  await expect(facts).toContainText('TMDB rating7.5 / 10')

  await page.goto('/#/movies/details?id=' + encodeURIComponent(bareMovie.id))
  await expect(page.getByRole('heading', { name: 'Home Video', level: 1 })).toBeVisible()
  await expect(page.getByText('No description available.')).toBeVisible()
  await expect(page.locator('.movies-meta')).toHaveCount(0)
  for (const label of ['Cast', 'Director', 'Genres', 'Released', 'Runtime', 'Maturity rating', 'TMDB rating']) {
    await expect(page.locator('.movies-facts dt', { hasText: label })).toHaveCount(0)
  }
  const text = await page.locator('main').innerText()
  expect(text).not.toMatch(/undefined|NaN|null|\b0m\b|Not available/)
  // Cards and rows cope with the same missing artwork and dates.
  await page.goto('/#/movies/home')
  await expect(page.getByRole('link', { name: 'Details for Home Video' })).toBeVisible()
  await expect(page.locator('.movie-card', { hasText: 'Home Video' }).locator('.movie-art__fallback')).toHaveText('H')
})

test('movie playback pauses music, seeks, saves progress and resumes after returning', async ({ page }) => {
  const fixture = await mockMovies(page)
  await page.goto('/#/music/playlist?id=night-drive')
  await page.getByRole('button', { name: 'Play Night drive', exact: true }).click()
  const audio = page.locator('.audio-player audio')
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0.2)
  await page.getByRole('button', { name: 'Movies', exact: true }).click()
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused)).toBe(false)
  await page.locator('.movies-hero').getByRole('link', { name: 'Play', exact: true }).click()
  const video = page.locator('.movies-player-frame video')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.2)
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true)
  await video.evaluate((v: HTMLVideoElement) => { v.currentTime = 12; v.pause() })
  await expect.poll(() => fixture.getPosition()).toBeGreaterThan(11)
  await page.getByRole('link', { name: 'Back to title' }).click()
  await page.getByRole('link', { name: 'Resume', exact: true }).click()
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(11)
  await page.getByRole('button', { name: 'Start over' }).click()
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(3)
  expect(fixture.writes.length).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Music', exact: true }).click()
  await expect(audio).toHaveCount(1)
  await expect(page.locator('.movies-player-frame')).toHaveCount(0)
})

test('local registration validates rights and missing paths; unregister leaves an honest details-only title', async ({ page }) => {
  await mockMovies(page)
  await page.goto('/#/movies/library')
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('My Film')
  await page.getByRole('textbox', { name: 'Relative file path' }).fill('../outside.mp4')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Register file', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('inside the configured Movies folder')
  await page.getByRole('textbox', { name: 'Relative file path' }).fill('Films/My Film.mp4')
  await page.getByRole('button', { name: 'Register file', exact: true }).click()
  await expect(page).toHaveURL(/movies\/details/)
  page.on('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Unregister', exact: true }).click()
  await expect(page.getByText('Details only. Register an authorised file below to watch here.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Play', exact: true })).toHaveCount(0)
  await page.goto('/#/movies/home')
  await expect(page.getByRole('heading', { name: 'Nothing to Watch Yet' })).toBeVisible()
})

test('Movies outage and unknown routes do not break Video or Music', async ({ page }) => {
  const fixture = await mockMovies(page)
  fixture.fail(true)
  await page.goto('/#/movies')
  await expect(page.getByRole('alert')).toContainText('Movies service could not be reached')
  fixture.fail(false)
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.locator('.movies-hero')).toBeVisible()
  await page.goto('/#/movies/watch?v=not-youtube')
  await expect(page.getByRole('heading', { name: 'Page Not Available' })).toBeVisible()
  await page.getByRole('button', { name: 'Video', exact: true }).click()
  await expect(page.locator('.yt-topbar')).toBeVisible()
})

test('an unexpected Movies render failure leaves Video accessible, and navigating recovers', async ({ page }) => {
  await mockMovies(page)
  await page.route(url => url.pathname === '/api/movies/library', route => route.fulfill({ json: { items: [null], total: 1 } }))
  await page.goto('/#/movies/home')
  await expect(page.getByRole('heading', { name: 'Movies Could Not Be Displayed' })).toBeVisible()
  await page.getByRole('link', { name: 'Return to Video' }).click()
  await expect(page.locator('.yt-topbar')).toBeVisible()
})

test('the phone layout keeps navigation, search and profiles within reach', async ({ page }) => {
  await mockMovies(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/movies/home')
  await expect(nav(page)).toBeHidden()
  await page.getByRole('button', { name: 'Browse Movies' }).click()
  await page.getByRole('navigation', { name: 'Browse Movies' }).getByRole('link', { name: 'My list' }).click()
  await expect(page).toHaveURL(/movies\/list/)
  await page.getByRole('button', { name: 'Browse Movies' }).click()
  await expect(page.getByRole('button', { name: 'Local profile' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  const box = await page.getByRole('searchbox', { name: 'Search movies and TV' }).boundingBox()
  expect(box!.width).toBeGreaterThan(200)
})

for (const width of [1440, 1024, 390]) {
  for (const theme of ['light', 'dark']) {
    test(`Movies layouts ${width}px ${theme}`, async ({ page }, testInfo) => {
      await mockMovies(page)
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.addInitScript(value => localStorage.setItem('spotimy-theme', value), theme)
      for (const view of ['home', 'details?id=local%3Amovie%3Atest', 'movies', 'library', 'settings']) {
        await page.goto('/#/movies/' + view)
        await expect(page.locator('.movies-header')).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Credits and Availability' })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        // Movies is always dark, whatever theme Video uses.
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(11, 11, 15)')
        await page.screenshot({ path: testInfo.outputPath(view.split('?')[0] + '.png'), fullPage: true })
        await page.evaluate(() => window.scrollTo(0, 600))
        expect((await page.locator('.movies-header').boundingBox())?.y).toBe(0)
      }
    })
  }
}
