import { test, expect, type Page } from '@playwright/test'
import { mockLibrary, songs } from './fixtures'

type Bridge = {
  folder: string
  revealed: string[]
  listeners: ((details: unknown) => void)[]
}

const DEFAULT_FOLDER = 'C:\\Users\\me\\Downloads\\MusicBox'

async function openClipDialog(page: Page) {
  await page.goto(`/#/watch?v=${songs[0].id}`)
  await page.getByRole('button', { name: 'Clip', exact: true }).click()
  await page.getByRole('button', { name: 'Download section' }).click()
  return page.getByRole('dialog')
}

/** Stands in for the desktop app's preload bridge, which the browser doesn't have. */
async function installDesktopBridge(page: Page) {
  await page.addInitScript((defaultFolder) => {
    const bridge: Bridge = { folder: defaultFolder, revealed: [], listeners: [] }
    const target = window as unknown as Record<string, unknown>
    target.__bridge = bridge
    target.musicboxDesktop = {
      getDownloadFolder: async () => ({
        folder: bridge.folder,
        defaultFolder,
        isDefault: bridge.folder === defaultFolder,
      }),
      chooseDownloadFolder: async () => 'D:\\Clips',
      openDownloadFolder: async () => true,
      showInFolder: async (path: string) => {
        bridge.revealed.push(path)
        return true
      },
      onDownloadSaved: (listener: (details: unknown) => void) => {
        bridge.listeners.push(listener)
        return () => {}
      },
    }
  }, DEFAULT_FOLDER)
}

test('a device clip is named from the title and its time range, and the name can be changed', async ({ page }) => {
  await mockLibrary(page)
  let payload: Record<string, unknown> = {}
  await page.route('**/api/downloads/device**', async (route) => {
    if (route.request().method() === 'POST') payload = route.request().postDataJSON()
    await route.fulfill({
      json: { id: 'named', status: 'preparing', detail: 'Preparing the video source...', progress: null, download_path: null },
    })
  })

  const dialog = await openClipDialog(page)
  const name = dialog.getByLabel('File name')
  await expect(name).toHaveValue(`${songs[0].title} (first 20s)`)
  await expect(dialog.getByText(/^Saved as .*\.mp4$/)).toBeVisible()

  await name.fill('Wedding: first dance?')
  await expect(dialog.getByText('Saved as Wedding first dance.mp4')).toBeVisible()
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()

  await expect.poll(() => payload.title).toBe('Wedding first dance')
  expect(payload.exact_filename).toBe(true)
})

test('the name field resets to the suggestion and cannot be left empty', async ({ page }) => {
  await mockLibrary(page)
  const dialog = await openClipDialog(page)
  const name = dialog.getByLabel('File name')
  const suggestion = await name.inputValue()

  await name.fill('Something else')
  await dialog.getByRole('button', { name: 'Reset' }).click()
  await expect(name).toHaveValue(suggestion)

  await name.fill('   ')
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Enter a name for the file.')
})

test('settings explain where browser downloads go when not in the desktop app', async ({ page }) => {
  await mockLibrary(page)
  await page.goto('/#/settings')
  const section = page.locator('#settings-downloads')
  await expect(section.getByText(/saved by your browser/)).toBeVisible()
  await expect(section.getByRole('button', { name: 'Change folder' })).toHaveCount(0)
})

test('the desktop app can show, change and reset the download folder', async ({ page }) => {
  await installDesktopBridge(page)
  const state = await mockLibrary(page)
  await page.goto('/#/settings')
  const section = page.locator('#settings-downloads')
  await expect(section.getByText(DEFAULT_FOLDER)).toBeVisible()
  await expect(section.getByText('Default', { exact: true })).toBeVisible()

  // The real app saves the setting and then reports the new folder back.
  await page.evaluate(() => {
    ;(window as unknown as { __bridge: Bridge }).__bridge.folder = 'D:\\Clips'
  })
  await section.getByRole('button', { name: 'Change folder' }).click()
  await expect(section.getByText('New downloads will be saved to this folder.')).toBeVisible()
  expect(state.settingsWrites.at(-1)).toEqual({ values: { DEVICE_DOWNLOADS_DIR: 'D:\\Clips' }, guarded: true })
  await expect(section.getByText('D:\\Clips', { exact: true })).toBeVisible()

  await page.evaluate((folder) => {
    ;(window as unknown as { __bridge: Bridge }).__bridge.folder = folder
  }, DEFAULT_FOLDER)
  await section.getByRole('button', { name: 'Reset to default' }).click()
  expect(state.settingsWrites.at(-1)?.values).toEqual({ DEVICE_DOWNLOADS_DIR: null })
  await expect(section.getByText('Default', { exact: true })).toBeVisible()
})

test('a finished desktop download says where it was saved and can reveal the file', async ({ page }) => {
  await installDesktopBridge(page)
  await mockLibrary(page)
  await page.route('**/api/downloads/device**', (route) =>
    route.fulfill({
      json: { id: 'saved-one', status: 'ready', detail: 'Ready to save.', progress: 100, download_path: '/api/downloads/device/saved-one/file' },
    }),
  )
  await page.route('**/api/downloads/device/saved-one/file', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'video/mp4', 'Content-Disposition': 'attachment; filename="x.mp4"' },
      body: 'x',
    }),
  )
  const dialog = await openClipDialog(page)
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()

  const toasts = page.getByRole('complementary', { name: 'Device downloads' })
  await expect(toasts.getByText('Saving to your computer...')).toBeVisible()

  const savedPath = `${DEFAULT_FOLDER}\\My clip.mp4`
  await page.evaluate(
    ({ folder, path }) => {
      const bridge = (window as unknown as { __bridge: Bridge }).__bridge
      bridge.listeners.forEach((listener) => listener({ id: 'saved-one', name: 'My clip.mp4', folder, path }))
    },
    { folder: DEFAULT_FOLDER, path: savedPath },
  )
  await expect(toasts.getByText(`Saved to ${DEFAULT_FOLDER}`)).toBeVisible()
  await expect(toasts.getByText('My clip.mp4', { exact: true })).toBeVisible()
  await toasts.getByRole('button', { name: 'Show in folder' }).click()
  expect(await page.evaluate(() => (window as unknown as { __bridge: Bridge }).__bridge.revealed)).toEqual([savedPath])
})
