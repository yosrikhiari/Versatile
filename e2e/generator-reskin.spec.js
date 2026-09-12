import { test, expect } from '@playwright/test'

/**
 * Station reskin Task 2: generator pills + single spark flow.
 * Flow (same as panel-dock): demo login (test/test123) -> workspace New ->
 * Create project -> editor -> Generator nav item -> story-generator aside.
 */
async function openGenerator(page) {
  await page.goto('/login')
  await page.fill('#login-username', 'test')
  await page.fill('#login-password', 'test123')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/workspace$/)

  await page.getByRole('button', { name: 'New' }).click()
  await page.fill('#wp-name', 'Generator Reskin Probe')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/\/editor\//)

  await page.locator('nav[aria-label="Panels"]').getByRole('button', { name: 'Generator' }).click()
  const panel = page.locator('aside.tool-panel')
  await expect(panel).toBeVisible()
  return panel
}

test('active mode pill carries a visible accent border', async ({ page }) => {
  await openGenerator(page)
  const pill = page.locator('aside.tool-panel [data-test="tab-brainstorm"]')
  await expect(pill).toBeVisible()
  await expect(pill).toHaveClass(/border-accent/)
})

test('spark shows a single flow with history reachable and no tab row', async ({ page }) => {
  await openGenerator(page)
  // Old tab row is gone (buttons removed, not hidden).
  await expect(page.getByRole('button', { name: 'Develop idea' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Get prompts' })).toHaveCount(0)
  // History content is reachable without switching tabs.
  await expect(page.getByText('No history yet.')).toBeVisible()
})
