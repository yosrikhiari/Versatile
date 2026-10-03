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
  await page.getByLabel('Project name').fill('Generator Reskin Probe')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/\/editor\//)

  await page.locator('nav[aria-label="Panels"]').getByRole('button', { name: 'Generator' }).click()
  const panel = page.locator('aside.tool-panel')
  await expect(panel).toBeVisible()
  return panel
}

test('the active mode is visibly and accessibly selected', async ({ page }) => {
  // One row of write modes (UX-ENHANCEMENTS #08), opening on Scene. Selection
  // is the elevated surface plus `aria-checked`, which is what a screen
  // reader announces and what this asserts; one accent, never as a fill.
  await openGenerator(page)
  const modes = page.locator('aside.tool-panel').getByRole('radiogroup', { name: 'What to write' })
  const active = modes.getByRole('radio', { name: 'Scene' })
  await expect(active).toBeVisible()
  await expect(active).toHaveAttribute('aria-checked', 'true')
  await expect(active).toHaveClass(/bg-bg-elevated/)

  const inactive = modes.getByRole('radio', { name: 'Arc' })
  await expect(inactive).toHaveAttribute('aria-checked', 'false')
  await expect(inactive).not.toHaveClass(/bg-bg-elevated/)
  // Ideate and Blurb are not a second row of modes: they sit under More.
  await expect(modes.getByRole('radio', { name: 'Ideate' })).toHaveCount(0)
})

test('spark shows a single flow with history reachable and no tab row', async ({ page }) => {
  const generator = await openGenerator(page)
  await generator.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitemradio', { name: /Ideate/ }).click()
  await expect(generator.getByRole('button', { name: 'Ideate' })).toBeVisible()
  // The prompt type is a row of filter chips, not a second segmented control.
  const types = generator.getByRole('group', { name: 'Prompt type' })
  await expect(types.getByRole('button', { name: 'Story seed' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  // Old tab row is gone (buttons removed, not hidden).
  await expect(page.getByRole('button', { name: 'Develop idea' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Get prompts' })).toHaveCount(0)
  // History is a section on the same surface, reachable without switching
  // tabs. Its empty-state copy is the panel pass's, not pinned here.
  const panel = page.locator('aside.tool-panel')
  await expect(panel.getByRole('heading', { name: 'Spark a prompt' })).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'History' })).toBeVisible()
})
