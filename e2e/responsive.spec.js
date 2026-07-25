import { test, expect } from '@playwright/test'

/**
 * Responsive smoke (M-4.1 / M-4.2): the login route must lay out cleanly on a
 * phone — no horizontal scroll, masthead visible, and the primary submit control
 * meets a comfortable touch-target height. Uses a manual mobile viewport so it
 * runs on the installed chromium (device presets default to webkit).
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test.describe('mobile layout', () => {
  test('login has no horizontal overflow on a phone', async ({ page }) => {
    await page.goto('/login')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    )
    expect(overflow).toBe(true)
    await expect(page.getByRole('heading', { name: 'Versatile' })).toBeVisible()
  })

  test('submit control is a usable touch target', async ({ page }) => {
    await page.goto('/login')
    const box = await page.locator('button[type="submit"]').boundingBox()
    expect(box).not.toBeNull()
    // Comfortable minimum for the primary action on touch.
    expect(box.height).toBeGreaterThanOrEqual(40)
  })
})
