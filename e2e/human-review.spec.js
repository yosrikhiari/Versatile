import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * End-to-end human-review pilot:
 * login -> /study -> import a 12-scene pack -> give informed consent ->
 * complete two anonymous rater sessions -> export both raw rater files.
 *
 * The pack is generated in the test, so this spec does not depend on the
 * gitignored local corpus. The exports are checked for provenance and shape;
 * `agreement.py` is run on them separately.
 */
const DIMENSIONS = ['Continuity', 'Voice', 'Show vs tell', 'Pacing', 'Emotional goal']
const OUT_DIR = join(process.cwd(), 'reports', 'live', 'human-review-e2e')

function pack() {
  return {
    studyId: 'e2e-human-pilot',
    rubricVersion: 'v1',
    title: 'E2E human-reference pilot',
    scenes: Array.from({ length: 12 }, (_, i) => ({
      sceneId: `scene-${i + 1}`,
      sceneTitle: `E2E scene ${i + 1}`,
      brief: `Brief for scene ${i + 1}.`,
      facts: [`Fact for scene ${i + 1}.`],
      text: `Plain prose for scene ${i + 1}.`
    }))
  }
}

async function login(page) {
  await page.goto('/login')
  await page.fill('#login-username', 'test')
  await page.fill('#login-password', 'test123')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/workspace$/)
}

async function importPack(page) {
  await page.goto('/study')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'human-review-pack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(pack()))
  })
  await expect(page.getByText('Imported packs')).toBeVisible()
}

async function startRater(page, raterId) {
  await page.getByLabel('Rater ID').fill(raterId)
  await page.getByRole('button', { name: 'Start review' }).click()
  await expect(page.getByText('Informed consent', { exact: true })).toBeVisible()
  const consent = page.getByRole('button', { name: 'I consent, start review' })
  await expect(consent).toBeDisabled()
  await page.getByLabel('Consent to take part').check()
  await expect(consent).toBeEnabled()
  await consent.click()
  await expect(page.getByText('1 of 12', { exact: true })).toBeVisible()
}

async function answerScene(page, index) {
  await page
    .getByRole('radiogroup', { name: 'Overall decision' })
    .getByRole('radio', { name: 'Keep' })
    .click()
  for (const dimension of DIMENSIONS) {
    await page
      .getByRole('radiogroup', { name: dimension })
      .getByRole('radio', { name: 'Fine' })
      .click()
  }
  if (index < 12) {
    await page.getByRole('button', { name: 'Save and next scene' }).click()
    await expect(page.getByText(`${index + 1} of 12`, { exact: true })).toBeVisible()
  } else {
    await page.getByRole('button', { name: 'Save and finish' }).click()
    await expect(page.getByText('Study complete')).toBeVisible()
  }
}

async function completeRater(page, raterId, filename) {
  await startRater(page, raterId)
  for (let index = 1; index <= 12; index++) {
    await answerScene(page, index)
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const path = join(OUT_DIR, filename)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export rater labels' }).click()
  const download = await downloadPromise
  await download.saveAs(path)

  const exported = JSON.parse(readFileSync(path, 'utf8'))
  expect(exported).toHaveLength(12)
  expect(exported.every((row) => row.labeller === raterId)).toBe(true)
  expect(exported.every((row) => row.overall === 'Keep')).toBe(true)
  expect(exported.every((row) => row.rubricVersion === 'v1')).toBe(true)
  expect(new Set(exported.map((row) => row.sceneId)).size).toBe(12)

  await page.getByRole('button', { name: 'Back to sessions' }).click()
  return exported
}

test('two anonymous raters complete the frozen pilot and export usable labels', async ({
  page
}) => {
  test.setTimeout(90_000)
  await login(page)
  await importPack(page)

  const first = await completeRater(page, 'Rater A', 'rater-a.json')
  const second = await completeRater(page, 'Rater B', 'rater-b.json')

  expect(first.map((row) => row.sceneId).sort()).toEqual(second.map((row) => row.sceneId).sort())
  expect(first[0]).toMatchObject({
    studyId: 'e2e-human-pilot',
    pass: 'Pass 1',
    labeller: 'Rater A',
    dims: {
      continuity: 'Fine',
      voice: 'Fine',
      show_tell: 'Fine',
      pacing: 'Fine',
      emotional_goal: 'Fine'
    }
  })
})
