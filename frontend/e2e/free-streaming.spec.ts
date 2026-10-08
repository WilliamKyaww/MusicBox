import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockLibrary } from './fixtures'

const clip = readFileSync(new URL('./fixtures/movie.webm', import.meta.url))
const id = 'open:movie:big-buck-bunny'
const origin = 'https://video.blender.org'
const filmId = 'bf1f3fb5-b119-4f9f-9930-8e20e892b898'
const variants = [720, 480].map(height => ({ id: `blender:${height}`, label: `${height}p / free stream`, available: true,
  height, duration: 30, video_codec: 'MP4', audio_codec: 'provider', source_type: 'remote', intro_start: 0, intro_end: 0 }))
const film = { id, kind: 'movie', title: 'Big Buck Bunny', description: 'Creator-authorised open film.', date: '2008', runtime: 10,
  poster: '/test-art/track000000.svg', backdrop: '/test-art/banner3.svg', genres: ['Animation', 'Comedy'], rating: 0,
  cast: [], crew: ['Blender Foundation'], seasons: [], trailer_url: null, provider_url: null, certification: 'Not rated',
  available_providers: ['Blender Open Movies'], playable: true, assets: variants,
  online_source: { provider: 'Blender Open Movies', page_url: `${origin}/w/${filmId}`, licence: 'CC BY 3.0', licence_url: 'https://peach.blender.org/about/', attribution: '(c) 2008 Blender Foundation', verified_on: '2026-10-06' } }

async function fixture(page: Page) {
  await mockLibrary(page)
  let position = 0, sequence = 0, session = 0, saved = false, offline = false
  const resolutions: string[] = []
  await page.route(url => url.origin === origin, async route => {
    expect(route.request().headers()['x-musicbox-desktop']).toBeUndefined()
    expect(route.request().headers()['authorization']).toBeUndefined()
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '')
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), clip.length - 1) : clip.length - 1
    await route.fulfill({ status: range ? 206 : 200, headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes',
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${clip.length}` } : {}) }, body: clip.subarray(start, end + 1) })
  })
  await page.route(url => url.pathname.startsWith('/api/movies/'), async route => {
    const request = route.request(), url = new URL(request.url()), path = decodeURIComponent(url.pathname.replace('/api/movies', ''))
    const send = (json: unknown, status = 200) => route.fulfill({ json, status })
    if (['POST', 'PUT', 'DELETE'].includes(request.method())) expect(request.headers()['x-musicbox-movies']).toBe('1')
    if (path === '/status') return send({ enabled: true, stage: 'hybrid', catalogue_available: true, playback_available: true,
      metadata_configured: false, media_configured: false, free_streaming_enabled: true, local_access: true, schema_version: 3 })
    if (path === '/profiles') return send([{ id: 'default', name: 'Local profile', local_default: 1 }])
    if (path === '/genres') return send([{ id: 16, name: 'Animation' }])
    if (path === '/catalogue') return send({ items: url.searchParams.get('source') === 'local' ? [] : [film], page: 1, total_pages: 1, source: 'free' })
    if (path.endsWith('/recommendations')) return send([])
    if (path === '/titles/' + id) return send(film)
    if (path.endsWith('/titles/' + id)) return send({ saved, progress: position ? { position, duration: 30, completed: false } : null })
    if (path.includes('/watchlist/')) { saved = request.postDataJSON().saved; return send({ saved }) }
    if (path.endsWith('/watchlist')) return send(saved ? [film] : [])
    if (path.endsWith('/history')) return send(position ? [{ ...film, progress: { position, duration: 30, completed: false, updated_at: 1 } }] : [])
    if (path.includes('/playback/')) {
      if (offline) return send({ detail: 'The creator-hosted stream is unavailable. Try again later or use an authorised local copy.' }, 503)
      const selected = url.searchParams.get('asset_id') || 'blender:720'
      resolutions.push(selected); sequence = 0
      return send({ session_id: 'session-' + ++session, title: film, asset_id: selected, source_type: 'remote',
        url: `${origin}/object-storage/web_videos/${filmId}-${selected.split(':')[1]}.mp4`, resume: position, duration: 30, subtitles: [] })
    }
    if (path.includes('/progress/')) {
      const data = request.postDataJSON()
      if (data.session_id === 'session-' + session && data.sequence > sequence) { sequence = data.sequence; position = data.position }
      return send({ accepted: true })
    }
    return send({ detail: 'Unknown test route' }, 404)
  })
  return { position: () => position, resolutions, offline: (value: boolean) => { offline = value } }
}

test('free online film plays without a key or folder, switches quality and resumes', async ({ page }) => {
  const data = await fixture(page)
  await page.goto('/#/movies/home')
  await expect(page.getByRole('heading', { name: 'Free to Watch Online' })).toBeVisible()
  await expect(page.getByText('Free stream', { exact: true }).first()).toBeVisible()
  await page.locator('.movies-feature').getByRole('link', { name: 'Play now' }).click()
  const video = page.locator('.movies-player-frame video')
  await expect(video).toHaveAttribute('src', /^https:\/\/video\.blender\.org\//)
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(.2)
  await video.evaluate((v: HTMLVideoElement) => { v.currentTime = 9; v.pause() })
  await expect.poll(data.position).toBeGreaterThan(8)
  await page.getByRole('combobox', { name: 'Playback quality' }).selectOption('blender:480')
  await expect(video).toHaveAttribute('src', /-480\.mp4$/)
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(8)
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  await page.getByRole('link', { name: 'Back to title' }).click()
  await expect(page.getByRole('region', { name: 'Film licence' })).toContainText('CC BY 3.0')
  await expect(page.getByRole('button', { name: 'Unregister', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add to my list' }).click()
  await page.getByRole('link', { name: 'Resume', exact: true }).click()
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(8)
  expect(data.resolutions).toContain('blender:480')
  const flushed = page.waitForResponse(response => response.url().includes('/progress/'))
  await page.getByRole('link', { name: 'Back to title' }).click()
  await flushed
})

test('provider outage is explicit, retry recovers, and Video still works', async ({ page }) => {
  const data = await fixture(page)
  data.offline(true)
  await page.goto('/#/movies/watch?id=' + encodeURIComponent(id))
  await expect(page.getByRole('alert')).toContainText('creator-hosted stream is unavailable')
  data.offline(false)
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect.poll(() => page.locator('.movies-player-frame video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(.2)
  const flushed = page.waitForResponse(response => response.url().includes('/progress/'))
  await page.getByRole('button', { name: 'Video', exact: true }).click()
  await flushed
  await expect(page.locator('.yt-topbar')).toBeVisible()
})
