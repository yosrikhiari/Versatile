import { db } from './db-core'
import { guardStorageWrite } from '../guardrails/integration/storageGuardrails'
import type { SceneLabelInput } from '../types/label'

export async function saveSceneLabel(input: SceneLabelInput & { id?: string }) {
  guardStorageWrite('sceneLabels', input, { entryPoint: 'db-labels.saveSceneLabel' })
  const record = {
    ...input,
    createdAt: new Date().toISOString(),
    id: input.id || crypto.randomUUID()
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
