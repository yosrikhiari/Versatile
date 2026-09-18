import { test, expect } from '@playwright/test'

/**
 * The Agents panel (Write → Agents): the orchestrator and mode are editable in
 * place, switching to LangGraph reveals the run sections with an empty state
 * that leads to the generator, and the role table edits placement — a second
 * GPU model shows the eviction error while editing.
 *
 * Same flow as panel-dock: demo login -> new project -> editor -> Panels nav.
 * Nothing here calls a model.
 */
test('Agents panel: orchestrator, empty state, placement error', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#login-username', 'test')
  await page.fill('#login-password', 'test123')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/workspace$/)

  await page.getByRole('button', { name: 'New' }).click()
  await page.fill('#wp-name', 'Agents Panel Probe')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/\/editor\//)

  await page.locator('nav[aria-label="Panels"]').getByRole('button', { name: 'Agents' }).click()
  const panel = page.locator('[data-test="orchestration-panel"]')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('Legacy')
  await expect(panel.locator('[data-test="lane-gpu"]')).toHaveCount(0)

  // Switch to LangGraph: the run sections appear with an empty state.
  await panel
    .locator('[data-test="orchestrator-segmented"]')
    .getByRole('radio', { name: /LangGraph/ })
    .click()
  await expect(panel).toContainText('No graph run yet')
  await expect(panel.getByRole('button', { name: /Open the generator/ })).toBeVisible()

  // The tracing switch is off by default and toggles.
  const tracing = panel.locator('[data-test="tracing-switch"] button')
  await expect(tracing).toHaveAttribute('aria-checked', 'false')
  await tracing.click()
  await expect(tracing).toHaveAttribute('aria-checked', 'true')
  await tracing.click()

  // Placement edits in place; a second distinct GPU model is refused while editing.
  const critic = panel.locator('[data-test="agent-critic"]')
  await expect(critic).toBeVisible()
  const criticModel = critic.locator('select[aria-label="Critic model"]')
  const options = await criticModel.locator('option').allTextContents()
  // The demo box lists whatever Ollama serves; pick any model that is not the
  // inherited one. Without a second model the rule cannot be exercised here.
  const other = options.find((o) => o && o !== 'Inherit' && !/qwen3:8b/.test(o))
  test.skip(!other, 'only one local model available; the eviction rule needs two')
  await criticModel.selectOption({ label: other })
  await expect(panel.locator('[data-test="placement-issue"]').first()).toContainText(
    /evicts the first/
  )
  await critic.locator('select[aria-label="Critic device"]').selectOption('cpu')
  await expect(panel.locator('[data-test="placement-issue"]')).toHaveCount(0)
})
