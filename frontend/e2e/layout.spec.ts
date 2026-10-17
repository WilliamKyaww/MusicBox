import { test, expect, type Page } from '@playwright/test'
import { mockLibrary } from './fixtures'

// Headless Chromium hides scrollbars by default, which would hide the very shift under test.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

/** The Movies endpoints this layout test touches; every title list is empty. */
async function mockMoviesShell(page: Page) {
  await page.route(
    (url) => url.pathname.startsWith('/api/movies/'),
    async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/movies', '')
      const json = (body: unknown) => route.fulfill({ json: body })
      if (path === '/status') {
        return json({
          enabled: true, stage: 'hybrid', catalogue_available: true, playback_available: true,
          free_streaming_enabled: true, metadata_configured: false, media_configured: false,
          local_access: true, schema_version: 3,
        })
      }
      if (path === '/profiles') return json([{ id: 'default', name: 'Local profile', local_default: 1 }])
      if (path === '/catalogue' || path === '/library') {
        return json({ items: [], page: 1, total_pages: 1, source: 'hybrid' })
      }
      return json([])
    },
  )
}

type Box = { x: number; y: number; width: number; height: number; fromRight: number }

/** Where the Video/Music/Movies switch and Settings button sit, relative to the window. */
async function controls(page: Page): Promise<{ group: Box; nav: Box; settings: Box }> {
  await expect(page.locator('.app-controls')).toBeVisible()
  return page.evaluate(() => {
    const measure = (selector: string): Box => {
      const rect = document.querySelector(selector)!.getBoundingClientRect()
      return {
        x: Math.round(rect.x * 10) / 10,
        y: Math.round(rect.y * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        fromRight: Math.round((window.innerWidth - rect.right) * 10) / 10,
      }
    }
    return {
      group: measure('.app-controls'),
      nav: measure('.app-controls .experience-switch'),
      settings: measure('.app-controls .app-icon-button'),
    }
  })
}

// Pages that scroll the window (long content) and pages that do not, in each experience.
const pages = [
  { name: 'Video home', hash: '#/' },
  { name: 'Video playlists', hash: '#/playlists' },
  { name: 'Video settings', hash: '#/settings' },
  { name: 'Music home', hash: '#/music/home' },
  { name: 'Music playlist', hash: '#/music/playlist?id=night-drive' },
  { name: 'Music settings', hash: '#/music/settings' },
  { name: 'Movies home', hash: '#/movies/home' },
  { name: 'Movies browse', hash: '#/movies/movies' },
  { name: 'Movies settings', hash: '#/movies/settings' },
]

for (const width of [1440, 1024, 390]) {
  for (const theme of ['dark', 'light']) {
    test(`the experience switch and Settings button never move or resize (${width}px, ${theme})`, async ({ page }) => {
      await mockLibrary(page)
      await mockMoviesShell(page)
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript((value) => localStorage.setItem('spotimy-theme', value), theme)

      const seen: Record<string, Awaited<ReturnType<typeof controls>>> = {}
      for (const { name, hash } of pages) {
        await page.goto(hash)
        await page.reload()
        seen[name] = await controls(page)
      }
      const [first, ...rest] = Object.entries(seen)
      for (const [name, measured] of rest) {
        for (const part of ['group', 'nav', 'settings'] as const) {
          const a = measured[part]
          const b = first[1][part]
          const label = `${name} ${part} differs from ${first[0]}`
          // Vertical position, height and the gap to the window edge must match exactly. Text
          // width can differ by a fraction while a web font loads, so width and x allow 1px.
          expect({ y: a.y, height: a.height, fromRight: a.fromRight }, label).toEqual({ y: b.y, height: b.height, fromRight: b.fromRight })
          expect(Math.abs(a.width - b.width), label).toBeLessThanOrEqual(1)
          expect(Math.abs(a.x - b.x), label).toBeLessThanOrEqual(1)
        }
      }
      // The shared top-bar contract: a 56px bar, with the controls one gutter (16px, or 8px
      // on phones) from the edge of the page, beside the window's reserved scrollbar space.
      expect(first[1].group.y + first[1].group.height / 2).toBe(28)
      expect(first[1].group.fromRight).toBe((width <= 560 ? 8 : 16) + (await scrollbarGutter(page)))
    })
  }
}

/** The classic scrollbar width the window reserves, so the test also passes with overlay scrollbars. */
const scrollbarGutter = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;top:-999px;width:100px;height:100px;overflow:scroll'
    document.body.append(probe)
    const size = probe.offsetWidth - probe.clientWidth
    probe.remove()
    return size
  })
