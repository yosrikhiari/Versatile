import { test, expect } from '@playwright/test'

/**
 * Auth form: the local (offline) sign-in form is usable — fields accept input
 * and the submit control is present. Full backend auth is covered by API tests;
 * this asserts the client form wiring.
 */
test.describe('login form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('accepts a name into the primary field', async ({ page }) => {
    const nameField = page.getByPlaceholder('your name')
    await expect(nameField).toBeVisible()
    await nameField.fill('Ada Lovelace')
    await expect(nameField).toHaveValue('Ada Lovelace')
  })

  test('has a submit button', async ({ page }) => {
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })
})
