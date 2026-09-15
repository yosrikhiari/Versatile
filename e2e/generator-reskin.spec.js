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

test('the active mode is visibly and accessibly selected', async ({ page }) => {
  // The panel pass replaced the accent-bordered pill with a segmented
  // control: one accent, never as a fill or border on a control. Selection
  // is the elevated surface plus `aria-selected`, which is what a screen
  // reader announces and what this asserts.
  await openGenerator(page)
  const active = page.locator('aside.tool-panel [data-test="tab-brainstorm"]')
  await expect(active).toBeVisible()
  await expect(active).toHaveAttribute('aria-selected', 'true')
  await expect(active).toHaveClass(/bg-bg-elevated/)

  // `tab-scene` is always rendered; the Chapter tab is behind a setting.
  const inactive = page.locator('aside.tool-panel [data-test="tab-scene"]')
  await expect(inactive).toHaveAttribute('aria-selected', 'false')
  await expect(inactive).not.toHaveClass(/bg-bg-elevated/)
})

test('spark shows a single flow with history reachable and no tab row', async ({ page }) => {
  await openGenerator(page)
  // Old tab row is gone (buttons removed, not hidden).
  await expect(page.getByRole('button', { name: 'Develop idea' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Get prompts' })).toHaveCount(0)
  // History is a section on the same surface, reachable without switching
  // tabs. Its empty-state copy is the panel pass's, not pinned here.
  const panel = page.locator('aside.tool-panel')
  await expect(panel.getByRole('heading', { name: 'Spark a prompt' })).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'History' })).toBeVisible()
})
