import { test, expect } from '@playwright/test'

/**
 * Smoke: the app boots, unauthenticated users land on /login, and the
 * masthead + auth form render. Guards against a broken build/router.
 */
test.describe('app boot', () => {
  test('unknown route redirects to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('login masthead renders', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Versatile' })).toBeVisible()
    await expect(page.getByText('a place to write fiction')).toBeVisible()
  })

  test('guarded route bounces to login when unauthenticated', async ({ page }) => {
    await page.goto('/workspace')
    await expect(page).toHaveURL(/\/login$/)
  })
})
