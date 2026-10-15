import { test, expect } from '@playwright/test'
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
