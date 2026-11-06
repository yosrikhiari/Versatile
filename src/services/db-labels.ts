import { db } from './db-core'
import { guardStorageWrite } from '../guardrails/integration/storageGuardrails'
import type { SceneLabelInput } from '../types/label'

async function findExistingLabel(input: SceneLabelInput & { id?: string }) {
  const sameReviewer = await db.sceneLabels
    .where('[storyId+reviewerName]')
    .equals([input.storyId, input.reviewerName])
    .toArray()

  if (input.sceneId) {
    const bySceneId = sameReviewer.find((label) => label.sceneId === input.sceneId)
    if (bySceneId) return bySceneId
    // Only a legacy, unbound label may be adopted by title. Falling back to a
    // label already bound to another scene would move that scene's label onto
    // this one when two scenes share a title.
    return (
      sameReviewer.find((label) => label.sceneTitle === input.sceneTitle && !label.sceneId) ?? null
    )
  }

  return sameReviewer.find((label) => label.sceneTitle === input.sceneTitle) ?? null
}

export async function saveSceneLabel(input: SceneLabelInput & { id?: string }) {
  guardStorageWrite('sceneLabels', input, { entryPoint: 'db-labels.saveSceneLabel' })
  const existing = input.id ? await db.sceneLabels.get(input.id) : await findExistingLabel(input)
  const record = {
    ...input,
    sceneId: input.sceneId ?? existing?.sceneId ?? null,
    createdAt: existing?.createdAt || new Date().toISOString(),
    id: input.id || existing?.id || crypto.randomUUID()
  }
  await db.sceneLabels.put(record)
  return record
}

export async function getSceneLabelsByStory(storyId: string) {
  return db.sceneLabels.where('storyId').equals(storyId).reverse().sortBy('createdAt')
}

export async function getSceneLabelsByReviewer(reviewerName: string) {
  return db.sceneLabels.where('reviewerName').equals(reviewerName).reverse().sortBy('createdAt')
}

export async function getSceneLabelsByStoryAndReviewer(storyId: string, reviewerName: string) {
  return db.sceneLabels.where('[storyId+reviewerName]').equals([storyId, reviewerName]).toArray()
}

export async function deleteSceneLabel(id: string) {
  await db.sceneLabels.delete(id)
}

export async function clearSceneLabels() {
  await db.sceneLabels.clear()
}
