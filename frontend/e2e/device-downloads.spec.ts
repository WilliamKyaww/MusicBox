import { test, expect, type Page } from '@playwright/test'
import { createServer } from 'node:http'
import { mockLibrary, songs } from './fixtures'

const servers: ReturnType<typeof createServer>[] = []
test.afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

async function startClip(page: Page) {
  await page.goto(`/#/watch?v=${songs[0].id}`)
  await page.getByRole('button', { name: 'Clip', exact: true }).click()
  await page.getByRole('button', { name: 'Download section' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Download', exact: true }).click()
}

test('a device clip shows preparation, saves only when ready, and can be saved again', async ({ page }) => {
  await mockLibrary(page)
  let ready = false
  let fileRequests = 0
  const server = createServer((_request, response) => {
    fileRequests++
    response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Disposition': 'attachment; filename="clip.mp4"' })
    response.end('fixture video bytes')
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const fileUrl = `http://127.0.0.1:${address.port}/clip.mp4`
  let payload: Record<string, unknown> = {}
  await page.route('**/api/downloads/device**', async (route) => {
    if (route.request().method() === 'POST') payload = route.request().postDataJSON()
    await route.fulfill({ json: { id: 'device-one', status: ready ? 'ready' : 'preparing', detail: ready ? 'Ready to save.' : 'Downloading and cutting the selected section...', progress: null, download_path: ready ? fileUrl : null } })
  })
  await startClip(page)
  const status = page.getByRole('complementary', { name: 'Device downloads' })
  await expect(status.getByText('Downloading and cutting the selected section...')).toBeVisible()
  expect(payload.media_kind).toBe('video')
  expect(fileRequests).toBe(0)
  const saved = page.waitForEvent('download')
  ready = true
  const download = await saved
  expect(download.suggestedFilename()).toBe('clip.mp4')
  expect(await download.failure()).toBeNull()
  await expect(status.getByRole('link', { name: 'Save again' })).toBeVisible()
  const again = page.waitForEvent('download')
  await status.getByRole('link', { name: 'Save again' }).click()
  expect(await (await again).failure()).toBeNull()
  expect(fileRequests).toBe(2)
})

test('preparation errors are visible and retry starts a new task that can be cancelled', async ({ page }) => {
  await mockLibrary(page)
  let count = 0
  let cancelled = false
  await page.route('**/api/downloads/device**', async (route) => {
    if (route.request().method() === 'POST') count++
    if (route.request().method() === 'DELETE') cancelled = true
    const status = cancelled ? 'cancelled' : count === 1 ? 'failed' : 'preparing'
    await route.fulfill({ json: { id: `task-${count}`, status, detail: status === 'failed' ? 'YouTube refused the source. Try again.' : status === 'cancelled' ? 'Download cancelled.' : 'Preparing the video source...', progress: null, download_path: null } })
  })
  await startClip(page)
  const panel = page.getByRole('complementary', { name: 'Device downloads' })
  await expect(panel.getByText('YouTube refused the source. Try again.')).toBeVisible()
  await panel.getByRole('button', { name: 'Retry' }).click()
  await panel.getByRole('button', { name: 'Cancel download' }).click()
  await expect(panel.getByText('Download cancelled.')).toBeVisible()
  expect(count).toBe(2)
  expect(cancelled).toBe(true)
})

for (const theme of ['light', 'dark']) for (const width of [1440, 1024, 390]) {
  test(`device preparation fits ${width}px ${theme}`, async ({ page }) => {
    await mockLibrary(page)
    await page.setViewportSize({ width, height: 960 })
    await page.addInitScript((value) => localStorage.setItem('spotimy-theme', value), theme)
    await page.route('**/api/downloads/device**', (route) => route.fulfill({ json: { id: 'visual', status: 'preparing', detail: 'Downloading and cutting the selected section...', progress: null, download_path: null } }))
    await startClip(page)
    const button = page.getByRole('button', { name: 'Cancel download' })
    await expect(button).toBeVisible()
    await button.focus()
    await expect(button).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `${process.env.TEMP}/musicbox-device-${theme}-${width}.png` })
  })
}
