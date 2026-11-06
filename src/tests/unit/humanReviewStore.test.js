import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { db } from '@/services/db-core'
import { useHumanReviewStore } from '@/stores/humanReviewStore'
import { buildHumanReviewExport } from '@/services/humanReviewExport'

const dims = {
  continuity: 'Fine',
  voice: 'Unsure',
  show_tell: 'Fine',
  pacing: 'Fine',
  emotional_goal: 'Fine'
}

function studyPack(overrides = {}) {
  return {
    studyId: 'gate-human-pilot-v1',
    rubricVersion: 'v1',
    title: 'Gate human-reference pilot',
    scenes: Array.from({ length: 12 }, (_, i) => ({
      sceneId: `scene-${i + 1}`,
      sceneTitle: `Scene ${i + 1}`,
      text: `Plain prose for scene ${i + 1}.`,
      brief: `Brief ${i + 1}.`,
      facts: [`Fact ${i + 1}.`]
    })),
    ...overrides
  }
}

async function openStudy(store, raterId = 'Rater A') {
  const study = await store.importStudy(studyPack())
  const session = await store.startSession({
    studyRecordId: study.id,
    raterId,
    passLabel: 'Pass 1'
  })
  return { study, session }
}

describe('humanReviewStore', () => {
  let store

  beforeAll(async () => {
    await db.open()
  })

  beforeEach(async () => {
    await db.humanReviewResponses.clear()
    await db.humanReviewSessions.clear()
    await db.humanReviewStudies.clear()
    setActivePinia(createPinia())
    store = useHumanReviewStore()
  })

  it('imports a pack and starts a session with a private rater id', async () => {
    const { study, session } = await openStudy(store)
    expect(study.id).toBeTruthy()
    expect(session.raterId).toBe('Rater A')
    expect(session.status).toBe('in-progress')
    expect(store.sceneOrder).toHaveLength(12)
    expect(store.currentSceneIndex).toBe(0)
  })

  it('reuses an existing session for the same study, rater and pass', async () => {
    const { study, session } = await openStudy(store)
    store.leaveSession()
    const again = await store.startSession({
      studyRecordId: study.id,
      raterId: 'Rater A',
      passLabel: 'Pass 1'
    })
    expect(again.id).toBe(session.id)
    expect(store.sessions.filter((s) => s.id === session.id)).toHaveLength(1)
  })

  it('saves one response per scene, completes at 12, and exports agreement rows', async () => {
    await openStudy(store)
    for (let i = 0; i < 12; i++) {
      await store.saveDraft({ overall: 'Keep', dims, note: `Note ${i + 1}` })
    }
    expect(store.isComplete).toBe(true)
    expect(store.activeSession.status).toBe('complete')
    expect(await db.humanReviewResponses.count()).toBe(12)

    const exported = await store.exportSession(store.activeSession.id)
    expect(exported.labels).toHaveLength(12)
    expect(exported.raterId).toBe('Rater A')
    expect(exported.labels[0]).toMatchObject({
      labeller: 'Rater A',
      studyId: 'gate-human-pilot-v1',
      rubricVersion: 'v1',
      pass: 'Pass 1',
      overall: 'Keep',
      dims
    })
    expect(exported.labels[0].sceneId).toBe('scene-1')
  })

  it('saves to the scene the form was showing, even if another save advanced the cursor', async () => {
    await openStudy(store)
    const firstSceneId = store.currentScene.sceneId
    await store.saveDraft({ overall: 'Keep', dims, note: 'first' }, firstSceneId)
    expect(store.responses[0].sceneId).toBe(firstSceneId)
    expect(store.currentScene.sceneId).not.toBe(firstSceneId)
  })

  it('refuses to save until every rubric question is answered', async () => {
    await openStudy(store)
    await expect(store.saveDraft({ overall: null, dims: {}, note: '' })).rejects.toThrow(/overall/i)
    expect(store.error).toMatch(/overall/i)

    await expect(
      store.saveDraft({ overall: 'Keep', dims: { continuity: 'Fine' }, note: '' })
    ).rejects.toThrow(/voice|problem|fine|unsure/i)
    expect(store.error).toMatch(/voice|problem|fine|unsure/i)
  })

  it('refuses to export an unfinished session', async () => {
    const { session } = await openStudy(store)
    await expect(store.exportSession(session.id)).rejects.toThrow(/finish/i)
  })

  it('removes a session and its responses', async () => {
    const { session } = await openStudy(store)
    await store.saveDraft({ overall: 'Keep', dims, note: '' })
    await store.removeSession(session.id)
    expect(await db.humanReviewSessions.count()).toBe(0)
    expect(await db.humanReviewResponses.count()).toBe(0)
  })
})

describe('buildHumanReviewExport', () => {
  it('keeps provenance on every row', () => {
    const study = {
      id: 1,
      studyId: 's',
      rubricVersion: 'v1',
      title: 'T',
      packHash: 'h',
      scenes: [{ sceneId: 'one', sceneTitle: 'One', text: 'Prose' }],
      importedAt: 'now'
    }
    const session = {
      id: 2,
      studyRecordId: 1,
      studyId: 's',
      packHash: 'h',
      raterId: 'Rater A',
      passLabel: 'Pass 1',
      status: 'complete',
      startedAt: 'now',
      updatedAt: 'now'
    }
    const exported = buildHumanReviewExport(study, session, [
      {
        id: 1,
        sessionId: 2,
        sceneId: 'one',
        overall: 'Revise',
        dims,
        note: '',
        createdAt: 'now',
        updatedAt: 'now'
      }
    ])
    expect(exported.labels[0]).toMatchObject({
      sceneId: 'one',
      labeller: 'Rater A',
      studyId: 's',
      packHash: 'h'
    })
  })
})
