import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { ref, reactive } from 'vue'
import { db } from '@/services/db-core'
import { enqueueAnalysisTasks } from '@/services/analysisQueue'
import { useDigestBackfill } from '@/composables/useDigestBackfill'

// The digest backfill built its task payloads from the manuscript store's
// rows, whose arrays are Vue proxies (a scene's `charactersPresent`). IndexedDB
// cannot clone a proxy, so every changed scene failed with DataCloneError and
// never got a digest. The mocked-queue tests could not see it; this one writes
// through real Dexie.
beforeEach(async () => {
  await db.analysisQueue.clear()
  await db.sceneDigests.clear()
})

describe('analysis queue payloads', () => {
  it('stores a payload that holds reactive values, as plain data', async () => {
    const scene = reactive({ title: 'The count', charactersPresent: ['Ilse', 'Tomas'] })
    const [id] = await enqueueAnalysisTasks('p1', [
      { taskType: 'sceneDigest', payload: { projectId: 'p1', scene } }
    ])
    const row = await db.analysisQueue.get(id)
    expect(row.payload.scene).toEqual({ title: 'The count', charactersPresent: ['Ilse', 'Tomas'] })
  })

  it('lets the backfill enqueue scenes straight from a store', async () => {
    const subsections = ref([
      {
        id: 1,
        sceneNumber: 1,
        title: 'Counting the boats',
        content: '<p>She counted the boats twice.</p>',
        charactersPresent: ['Ilse'],
        location: 'Harbour'
      }
    ])
    await expect(useDigestBackfill().enqueue('p1', subsections.value)).resolves.toBe(1)
    const [row] = await db.analysisQueue.toArray()
    expect(row.payload.scene.charactersPresent).toEqual(['Ilse'])
  })
})
