import { test, expect } from '@playwright/test'

/**
 * Station reskin Task 1: tool panels dock RIGHT of the canvas.
 * Flow (verified against LoginView/WorkspaceView/SidebarNav):
 * demo login (test/test123) -> workspace New button -> Create project ->
 * editor -> Generator nav item -> story-generator aside.
 */
test('tool panel docks right of the canvas', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#login-username', 'test')
  await page.fill('#login-password', 'test123')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/workspace$/)

  await page.getByRole('button', { name: 'New' }).click()
  await page.fill('#wp-name', 'Panel Dock Probe')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/\/editor\//)

  await page.locator('nav[aria-label="Panels"]').getByRole('button', { name: 'Generator' }).click()
  const panel = page.locator('aside.tool-panel')
  const canvas = page.locator('#main-content')
  await expect(panel).toBeVisible()
  await expect(canvas).toBeVisible()
  const pb = await panel.boundingBox()
  const cb = await canvas.boundingBox()
  expect(pb).not.toBeNull()
  expect(cb).not.toBeNull()
  expect(pb.x).toBeGreaterThan(cb.x)
})
