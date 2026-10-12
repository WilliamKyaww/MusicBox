import { test, expect } from '@playwright/test'
import { mockLibrary, songs } from './fixtures'

test('watch Back restores the previous search and filters, including after reload', async ({ page }) => {
  await mockLibrary(page)
  await page.goto('/#/results?search_query=M83&duration=short&order=date')
  await expect(page.locator('.yt-topbar')).toBeVisible()
  await page.evaluate((id) => { location.hash = `#/watch?v=${id}` }, songs[0].id)
  const back = page.getByRole('button', { name: 'Back to previous page' })
  await expect(back).toBeVisible()
  await page.reload()
  await expect(back).toBeVisible()
  await back.click()
  await expect(page).toHaveURL(/search_query=M83&duration=short&order=date$/)
})

test('a directly opened watch page goes home instead of leaving MusicBox', async ({ page }) => {
  await mockLibrary(page)
  await page.goto(`/#/watch?v=${songs[0].id}`)
  await page.getByRole('button', { name: 'Back to previous page' }).click()
  await expect(page).toHaveURL(/#\/$/)
})

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 1024, 390]) {
    test(`watch Back is usable at ${width}px in ${theme} theme`, async ({ page }) => {
      await mockLibrary(page)
      await page.setViewportSize({ width, height: 960 })
      await page.addInitScript((value) => localStorage.setItem('spotimy-theme', value), theme)
      await page.goto(`/#/watch?v=${songs[0].id}`)
      const back = page.getByRole('button', { name: 'Back to previous page' })
      await expect(back).toBeVisible()
      await back.focus()
      await expect(back).toBeFocused()
      await expect(page.locator('.watch__title')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `${process.env.TEMP}/musicbox-watch-back-${theme}-${width}.png` })
      await back.press('Enter')
      await expect(page).toHaveURL(/#\/$/)
    })
  }
}
