import { test, expect } from '@playwright/test'

/**
 * #103 (UX-AUDIT 66): the Generator panel owned its runs and was unmounted
 * whenever another tool panel took the dock, so opening Chapters mid-run
 * stopped a Chapter run and reset the run options. It now stays mounted once
 * opened and is only hidden. A run needs a model, so this checks the thing a
 * run depends on: what the writer set in the panel survives a trip to
 * another panel, which it cannot if the panel was torn down.
 */
async function openEditor(page, name) {
  await page.goto('/login')
  await page.fill('#login-username', 'test')
  await page.fill('#login-password', 'test123')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/workspace$/)
  await page.getByRole('button', { name: 'New' }).click()
  await page.getByLabel('Project name').fill(name)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/\/editor\//)
}

test('the Generator keeps its state while another panel is open', async ({ page }) => {
  await openEditor(page, 'Generator Survives Panels')
  const nav = page.locator('nav[aria-label="Panels"]')
  const generator = page.locator('aside[data-panel="story-generator"]')

  await nav.getByRole('button', { name: 'Generator' }).click()
  await expect(generator).toBeVisible()
  await generator.getByRole('tab', { name: 'Arc' }).click()
  const oneClick = generator.getByRole('switch').first()
  await oneClick.click()
  await expect(oneClick).toHaveAttribute('aria-checked', 'true')
  const brief = generator.getByPlaceholder(/tense reunion/)
  await brief.fill('A harbour clerk and the boat that never left.')

  // Another panel takes the dock: the Generator is hidden, not gone.
  await nav.getByRole('button', { name: 'Chapters' }).click()
  await expect(generator).toBeHidden()
  await expect(generator).toHaveCount(1)

  await nav.getByRole('button', { name: 'Generator' }).click()
  await expect(generator).toBeVisible()
  await expect(generator.getByRole('tab', { name: 'Arc' })).toHaveAttribute('aria-selected', 'true')
  await expect(generator.getByRole('switch').first()).toHaveAttribute('aria-checked', 'true')
  await expect(generator.getByPlaceholder(/tense reunion/)).toHaveValue(
    'A harbour clerk and the boat that never left.'
  )
})
