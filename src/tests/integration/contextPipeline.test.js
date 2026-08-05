import { describe, it, expect, beforeEach } from 'vitest'

/**
 * End-to-end against a REAL Dexie database (fake-indexeddb, loaded in setup.js).
 *
 * Every other suite for this work mocks persistence, which is exactly where the
 * two nastiest bugs lived: a field that was silently dropped on save, and a
 * duplicate primary key that only surfaces inside `bulkAdd`. A mocked store
 * cannot fail either way. These tests write and read the actual tables.
 */

import { db } from '@/services/db-core'
import {
  getGraphGroups,
  saveGraphGroups,
  getNodeParents,
  saveNodeParents,
  getNodeInstances,
  saveNodeInstances
} from '@/services/db-graph'
import { scopeBibleToVolume } from '@/services/volumeScope'
import { computeVolumeGroups, volumeGroupId } from '@/utils/networkGrouping'
import { putSceneDigest, getProjectChapterDigests } from '@/services/db-digests'
import {
  rollupProjectDigests,
  buildEarlierChaptersBlock
} from '@/services/generation/digestContext'

const PROJECT = 'proj-int-1'
const V1 = 'vol-1'
const V2 = 'vol-2'

async function reset() {
  await Promise.all([
    db.volumes.clear(),
    db.volumeEntities.clear(),
    db.characters.clear(),
    db.locations.clear(),
    db.plotThreads.clear(),
    db.graphGroupsV2.clear(),
    db.graphNodeParents.clear(),
    db.graphNodeInstances.clear(),
    db.sceneDigests.clear(),
    db.chapterDigests.clear(),
    db.volumeDigests.clear()
  ])
}

async function seedProject() {
  await db.volumes.bulkAdd([
    { id: V1, projectId: PROJECT, title: 'Volume I' },
    { id: V2, projectId: PROJECT, title: 'Volume II' }
  ])
  await db.characters.bulkAdd([
    { id: 'c1', projectId: PROJECT, name: 'Kael' },
    { id: 'c2', projectId: PROJECT, name: 'Riven' },
    { id: 'c3', projectId: PROJECT, name: 'Sera' },
    { id: 'c4', projectId: PROJECT, name: 'Drifter' }
  ])
  await db.locations.bulkAdd([{ id: 'l1', projectId: PROJECT, name: 'Ashfall Keep' }])
  await db.plotThreads.bulkAdd([{ id: 't1', projectId: PROJECT, title: 'The Betrayal' }])
  await db.volumeEntities.bulkAdd([
    { volumeId: V1, entityType: 'character', entityId: 'c1', isPrimary: false },
    { volumeId: V2, entityType: 'character', entityId: 'c2', isPrimary: false },
    { volumeId: V1, entityType: 'character', entityId: 'c3', isPrimary: false },
    { volumeId: V2, entityType: 'character', entityId: 'c3', isPrimary: false },
    { volumeId: V1, entityType: 'location', entityId: 'l1', isPrimary: false },
    { volumeId: V1, entityType: 'plotThread', entityId: 't1', isPrimary: false }
  ])
  // c4 ("Drifter") is deliberately assigned to nothing.
}

beforeEach(async () => {
  await reset()
  await seedProject()
})

describe('volume scoping against the real database', () => {
  const bible = () => ({
    characters: [
      { id: 'c1', name: 'Kael' },
      { id: 'c2', name: 'Riven' },
      { id: 'c3', name: 'Sera' },
      { id: 'c4', name: 'Drifter' }
    ],
    locations: [{ id: 'l1', name: 'Ashfall Keep' }],
    plotThreads: [{ id: 't1', title: 'The Betrayal' }]
  })

  it('narrows a volume to its own cast, keeping shared and unassigned entities', async () => {
    const scoped = await scopeBibleToVolume({ projectId: PROJECT, volumeId: V1, ...bible() })
    const names = scoped.characters.map((c) => c.name).sort()

    expect(names).toEqual(['Drifter', 'Kael', 'Sera'])
    expect(names).not.toContain('Riven')
    expect(scoped.scoped).toBe(true)
    expect(scoped.omitted).toBe(1)
  })

  it('gives each volume a different cast from the same bible', async () => {
    const v1 = await scopeBibleToVolume({ projectId: PROJECT, volumeId: V1, ...bible() })
    const v2 = await scopeBibleToVolume({ projectId: PROJECT, volumeId: V2, ...bible() })

    expect(v1.characters.map((c) => c.name)).toContain('Kael')
    expect(v2.characters.map((c) => c.name)).toContain('Riven')
    // Sera spans both volumes and appears in both.
    expect(v1.characters.map((c) => c.name)).toContain('Sera')
    expect(v2.characters.map((c) => c.name)).toContain('Sera')
  })

  it('returns the whole bible when the project has a single volume', async () => {
    await db.volumes.delete(V2)
    const scoped = await scopeBibleToVolume({ projectId: PROJECT, volumeId: V1, ...bible() })
    expect(scoped.characters).toHaveLength(4)
    expect(scoped.scoped).toBe(false)
  })
})

describe('graph group persistence', () => {
  // The bug: saveGraphGroups/getGraphGroups only round-tripped id/name/color and
  // geometry. Structural fields were dropped, so nesting flattened and volume
  // groups came back unidentifiable.
  it('round-trips volumeId, parentVolumeId and parentGroupId', async () => {
    await saveGraphGroups(PROJECT, [
      { id: volumeGroupId(V1), name: 'Volume I', volumeId: V1, parentGroupId: null },
      {
        id: 'group-faction-the-shadow-court',
        name: 'The Shadow Court',
        parentVolumeId: V1,
        parentGroupId: volumeGroupId(V1)
      }
    ])

    const loaded = await getGraphGroups(PROJECT)
    const vol = loaded.find((g) => g.id === volumeGroupId(V1))
    const faction = loaded.find((g) => g.id === 'group-faction-the-shadow-court')

    expect(vol.volumeId).toBe(V1)
    expect(faction.parentVolumeId).toBe(V1)
    expect(faction.parentGroupId).toBe(volumeGroupId(V1))
  })

  // This is the crash the fix prevents, exercised where it actually happened:
  // inside bulkAdd, on a duplicate `&id`.
  it('regrouping after a reload does not collide on a duplicate primary key', async () => {
    const volumes = [
      { id: V1, title: 'Volume I' },
      { id: V2, title: 'Volume II' }
    ]
    const volumeNodeIds = { [V1]: ['char-c1'], [V2]: ['char-c2'] }

    const first = computeVolumeGroups({ volumes, volumeNodeIds })
    await saveGraphGroups(PROJECT, first.groups)

    // Simulate the pre-fix rows: reload, then strip volumeId the way the old
    // mapper did, and regroup on top of that.
    const reloaded = (await getGraphGroups(PROJECT)).map(({ volumeId: _drop, ...rest }) => rest)
    const second = computeVolumeGroups({ volumes, volumeNodeIds, existingGroups: reloaded })

    // Assert on the ids BEFORE saving. Left to the save, the unfixed path throws
    // `BulkError: ConstraintError` out of bulkAdd as an unhandled rejection,
    // which vitest cannot attribute to a test — it takes the whole file down
    // instead of pointing at the bug. Checking here fails cleanly and early.
    const proposedIds = second.groups.map((g) => g.id)
    expect(new Set(proposedIds).size).toBe(proposedIds.length)

    await saveGraphGroups(PROJECT, second.groups)

    const after = await getGraphGroups(PROJECT)
    const ids = after.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(after.filter((g) => g.id === volumeGroupId(V1))).toHaveLength(1)
    expect(after.find((g) => g.id === volumeGroupId(V1)).volumeId).toBe(V1)
  })

  it('persists node parents and instances', async () => {
    await saveNodeInstances(PROJECT, { 'char-c1': ['char-c1'], 'loc-l1': ['loc-l1'] })
    await saveNodeParents(PROJECT, { 'char-c1': volumeGroupId(V1) })

    expect(Object.keys(await getNodeInstances(PROJECT))).toEqual(
      expect.arrayContaining(['char-c1', 'loc-l1'])
    )
    expect((await getNodeParents(PROJECT))['char-c1']).toBe(volumeGroupId(V1))
  })
})

describe('faction nesting survives a full save/load cycle', () => {
  it('re-nests the faction under its volume box after reload', async () => {
    // Cast expansion writes a faction tagged to the volume, before the volume's
    // box exists — the shape this whole design depends on.
    await saveGraphGroups(PROJECT, [
      {
        id: 'group-faction-the-shadow-court',
        name: 'The Shadow Court',
        parentVolumeId: V1,
        parentGroupId: null
      }
    ])
    await saveNodeParents(PROJECT, { 'char-c1': 'group-faction-the-shadow-court' })

    const existingGroups = await getGraphGroups(PROJECT)
    const existingNodeParents = await getNodeParents(PROJECT)

    const { groups, nodeParents } = computeVolumeGroups({
      volumes: [{ id: V1, title: 'Volume I' }],
      volumeNodeIds: { [V1]: ['char-c1', 'loc-l1'] },
      existingGroups,
      existingNodeParents
    })
    await saveGraphGroups(PROJECT, groups)
    await saveNodeParents(PROJECT, nodeParents)

    const reloaded = await getGraphGroups(PROJECT)
    const faction = reloaded.find((g) => g.id === 'group-faction-the-shadow-court')
    const volBox = reloaded.find((g) => g.id === volumeGroupId(V1))

    expect(faction.parentGroupId).toBe(volBox.id)
    // The faction keeps its member; the loose node goes to the volume box.
    const parents = await getNodeParents(PROJECT)
    expect(parents['char-c1']).toBe('group-faction-the-shadow-court')
    expect(parents['loc-l1']).toBe(volBox.id)
  })
})

describe('digest hierarchy against the real database', () => {
  async function seedScenes(chapters, scenesPerChapter = 3) {
    let sceneNumber = 1
    for (let ch = 1; ch <= chapters; ch++) {
      for (let s = 0; s < scenesPerChapter; s++) {
        await putSceneDigest({
          projectId: PROJECT,
          subsectionId: `sub-${sceneNumber}`,
          contentHash: `hash-${sceneNumber}`,
          version: 1,
          updatedAt: new Date().toISOString(),
          summary: `Chapter ${ch} scene ${s + 1}: something changes`,
          sceneNumber: sceneNumber++,
          chapterNumber: ch,
          title: `Scene ${sceneNumber}`,
          charactersPresent: ['Kael'],
          location: 'Ashfall Keep',
          keyFacts: [],
          facts: { characters: [], locations: [], events: [], objects: [] },
          wordCount: 500,
          uniqueWordCount: 300
        })
      }
    }
  }

  it('rolls scene digests up into persisted chapter and volume digests', async () => {
    await seedScenes(4)
    const book = await rollupProjectDigests({ projectId: PROJECT, volumeId: V1 })

    const chapters = await getProjectChapterDigests(PROJECT)
    expect(chapters).toHaveLength(4)
    expect(chapters.every((c) => c.volumeId === V1)).toBe(true)
    expect(await db.volumeDigests.count()).toBe(1)
    expect(book.totalWordCount).toBe(4 * 3 * 500)
  })

  it('is idempotent — re-running replaces rather than accumulates', async () => {
    await seedScenes(4)
    await rollupProjectDigests({ projectId: PROJECT, volumeId: V1 })
    await rollupProjectDigests({ projectId: PROJECT, volumeId: V1 })

    expect(await getProjectChapterDigests(PROJECT)).toHaveLength(4)
    expect(await db.volumeDigests.count()).toBe(1)
  })

  it('recovers the chapters the recent-scene window has dropped', async () => {
    await seedScenes(10) // 30 scenes; a 20-scene window reaches back into ch4
    await rollupProjectDigests({ projectId: PROJECT, volumeId: V1 })

    const block = await buildEarlierChaptersBlock({
      projectId: PROJECT,
      recentSceneCount: 20
    })

    expect(block).toContain('Chapter 1:')
    expect(block).toContain('Chapter 3:')
    expect(block).not.toContain('Chapter 4:') // still inside the recent window
  })

  it('adds nothing while the whole draft still fits the recent window', async () => {
    await seedScenes(5) // 15 scenes < 20
    await rollupProjectDigests({ projectId: PROJECT, volumeId: V1 })
    expect(await buildEarlierChaptersBlock({ projectId: PROJECT, recentSceneCount: 20 })).toBe('')
  })
})
