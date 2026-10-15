import { test, expect } from '@playwright/test'
import { mockLibrary, songs } from './fixtures'

test('video cards, search rows and watch details show relative and full publication dates', async ({ page }) => {
  await mockLibrary(page)
  await page.goto(`/#/channel/${songs[0].channel_id}`)
  await expect(page.locator('.yt-card__meta').first()).toContainText(/ago.*3rd October 2026/)

  await page.goto('/#/results?search_query=M83')
  await expect(page.locator('.yt-row--large .yt-row__meta').first()).toContainText(/ago.*3rd October 2026/)

  await page.goto(`/#/watch?v=${songs[0].id}`)
  await expect(page.locator('.description__headline')).toContainText(/ago.*3rd October 2026/)
  await expect(page.locator('.yt-row--compact .yt-row__meta').first()).toContainText(/ago.*3rd October 2026/)
  await page.locator('.description__toggle').click()
  await expect(page.locator('.description__headline')).toContainText('3rd October 2026')
})

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 1024, 390]) {
    test(`full upload dates fit video cards at ${width}px in ${theme} theme`, async ({ page }) => {
      await mockLibrary(page)
      await page.setViewportSize({ width, height: 960 })
      await page.addInitScript((value) => localStorage.setItem('spotimy-theme', value), theme)
      await page.goto(`/#/channel/${songs[0].channel_id}`)
      const meta = page.locator('.yt-card__meta').first()
      await expect(meta).toContainText('3rd October 2026')
      await expect(meta).toHaveCSS('white-space', 'normal')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `${process.env.TEMP}/musicbox-upload-date-${theme}-${width}.png` })
    })
  }
}
