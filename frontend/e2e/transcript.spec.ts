import { test, expect, type Page } from '@playwright/test'
import { mockLibrary, songs } from './fixtures'

test('Show transcript opens a panel with timed lines that can be closed', async ({ page }) => {
  await mockLibrary(page)
  await page.goto(`/#/watch?v=${songs[0].id}`)

  // The button lives in the expanded description, like YouTube.
  await expect(page.getByRole('button', { name: 'Show transcript' })).toHaveCount(0)
  await page.locator('.description__toggle').click()
  await page.getByRole('button', { name: 'Show transcript' }).click()

  const panel = page.getByRole('region', { name: 'Transcript' })
  await expect(panel).toBeVisible()
  await expect(panel.locator('.transcript__line').first()).toContainText(/\d+:\d{2}/)
  await expect(page.getByRole('button', { name: 'Show transcript' })).toBeDisabled()

  await panel.getByRole('button', { name: 'Timestamps' }).click()
  await expect(panel.locator('.transcript__time')).toHaveCount(0)

  await panel.getByRole('button', { name: 'Close transcript' }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Show transcript' })).toBeEnabled()
})

async function openTranscript(page: Page) {
  await page.goto(`/#/watch?v=${songs[0].id}`)
  await page.locator('.description__toggle').click()
  await page.getByRole('button', { name: 'Show transcript' }).click()
  const panel = page.getByRole('region', { name: 'Transcript' })
  await expect(panel.locator('.transcript__line').first()).toBeVisible()
  return panel
}

test('searching the transcript highlights matches and steps through them', async ({ page }) => {
  await mockLibrary(page)
  const panel = await openTranscript(page)
  const search = panel.getByRole('textbox', { name: 'Search transcript' })
  const count = panel.getByRole('status').filter({ hasText: /of|No results/ })

  await search.fill('line')
  await expect(count).toHaveText('1 of 8')
  await expect(panel.locator('.transcript__line mark')).toHaveCount(8)
  await expect(panel.locator('.transcript__line--current-match')).toHaveCount(1)
  await expect(panel.locator('.transcript__line--current-match')).toContainText('First line')

  await search.press('Enter')
  await expect(count).toHaveText('2 of 8')
  await expect(panel.locator('.transcript__line--current-match')).toContainText('Second line')

  await search.press('Shift+Enter')
  await search.press('Shift+Enter')
  await expect(count).toHaveText('8 of 8')

  await panel.getByRole('button', { name: 'Next result' }).click()
  await expect(count).toHaveText('1 of 8')

  await search.fill('third')
  await expect(count).toHaveText('1 of 1')
  await expect(panel.locator('.transcript__line--current-match')).toContainText('Third line')
})

test('a search with no matches says so, and Escape clears it', async ({ page }) => {
  await mockLibrary(page)
  const panel = await openTranscript(page)
  const search = panel.getByRole('textbox', { name: 'Search transcript' })

  await search.fill('xyzzy')
  await expect(panel.getByText('No results')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Next result' })).toBeDisabled()
  await expect(panel.locator('.transcript__line mark')).toHaveCount(0)

  await search.press('Escape')
  await expect(search).toHaveValue('')
  await expect(panel.getByText('No results')).toHaveCount(0)
  await expect(panel.locator('.transcript__line').first()).toBeVisible()
})

test('Ctrl+F focuses the transcript search while the transcript is open', async ({ page }) => {
  await mockLibrary(page)
  const panel = await openTranscript(page)
  const search = panel.getByRole('textbox', { name: 'Search transcript' })
  await page.locator('body').click({ position: { x: 5, y: 300 } })
  await expect(search).not.toBeFocused()
  await page.keyboard.press('Control+f')
  await expect(search).toBeFocused()
})

test('transcript search fits narrow screens without horizontal scrolling', async ({ page }) => {
  await mockLibrary(page)
  await page.setViewportSize({ width: 390, height: 900 })
  const panel = await openTranscript(page)
  await panel.getByRole('textbox', { name: 'Search transcript' }).fill('line')
  await expect(panel.getByText('1 of 8')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
