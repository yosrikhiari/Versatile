import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * Volume/chapter membership over the real Dexie schema.
 *
 * `section.volumeId` is the persisted fact. `volume.sectionIds` used to be a
 * second, memory-only copy of it, so it was empty after any reload — and
 * deleting a volume walked that empty list and detached nothing.
 */

let db, volumeStore, getSectionIdsByVolume, unassignAllSectionsFromVolume

const PROJECT = 'p-volumes'

beforeEach(async () => {
  setActivePinia(createPinia())
  const core = await import('@/services/db-core')
  db = core.db
  ;({ getSectionIdsByVolume, unassignAllSectionsFromVolume } =
    await import('@/services/db-structure'))
  const { useVolumeStore } = await import('@/stores/volumeStore')
  volumeStore = useVolumeStore()

  await db.sections.clear()
  await db.volumes.clear()
})

async function seed() {
  const volumeId = await volumeStore.createVolume(PROJECT, { title: 'Volume One' })
  const ids = []
  for (let i = 0; i < 3; i++) {
    ids.push(
      await db.sections.add({ projectId: PROJECT, title: `Chapter ${i + 1}`, order: i, volumeId })
    )
  }
  return { volumeId, sectionIds: ids }
}

describe('volume membership survives a reload', () => {
  it('derives sectionIds from the sections, not from the volume row', async () => {
    const { volumeId, sectionIds } = await seed()

    // Simulate a fresh session: nothing in memory, everything from the database.
    setActivePinia(createPinia())
    const { useVolumeStore } = await import('@/stores/volumeStore')
    const fresh = useVolumeStore()
    await fresh.loadVolumes(PROJECT)

    const volume = fresh.volumes.find((v) => v.id === volumeId)
    expect(volume.sectionIds).toEqual(sectionIds)
  })

  it('orders derived membership by chapter order', async () => {
    const volumeId = await volumeStore.createVolume(PROJECT, { title: 'V' })
    const third = await db.sections.add({ projectId: PROJECT, title: 'C3', order: 2, volumeId })
    const first = await db.sections.add({ projectId: PROJECT, title: 'C1', order: 0, volumeId })
    const second = await db.sections.add({ projectId: PROJECT, title: 'C2', order: 1, volumeId })

    const byVolume = await getSectionIdsByVolume(PROJECT)
    expect(byVolume[volumeId]).toEqual([first, second, third])
  })

  it('deleting a volume after a reload detaches its chapters', async () => {
    // The actual bug: on a freshly loaded project the in-memory sectionIds was
    // empty, so deleteVolumeData detached nothing and every chapter was left
    // pointing at a volume that no longer existed.
    const { volumeId } = await seed()

    setActivePinia(createPinia())
    const { useVolumeStore } = await import('@/stores/volumeStore')
    const fresh = useVolumeStore()
    await fresh.loadVolumes(PROJECT)
    await fresh.deleteVolumeData(volumeId, PROJECT)

    const sections = await db.sections.where('projectId').equals(PROJECT).toArray()
    expect(sections).toHaveLength(3)
    expect(sections.every((s) => s.volumeId === null)).toBe(true)
    expect(await db.volumes.get(volumeId)).toBeUndefined()
  })

  it('leaves other volumes untouched when one is deleted', async () => {
    const { volumeId: keep } = await seed()
    const drop = await volumeStore.createVolume(PROJECT, { title: 'Volume Two' })
    const orphan = await db.sections.add({
      projectId: PROJECT,
      title: 'Chapter 4',
      order: 3,
      volumeId: drop
    })

    await unassignAllSectionsFromVolume(drop)

    expect((await db.sections.get(orphan)).volumeId).toBeNull()
    const stillAssigned = await db.sections.where('volumeId').equals(keep).toArray()
    expect(stillAssigned).toHaveLength(3)
  })

  it('assigning a chapter persists so the next load still sees it', async () => {
    const volumeId = await volumeStore.createVolume(PROJECT, { title: 'V' })
    const sectionId = await db.sections.add({ projectId: PROJECT, title: 'C1', order: 0 })

    await volumeStore.assignSection(sectionId, volumeId, PROJECT)

    const byVolume = await getSectionIdsByVolume(PROJECT)
    expect(byVolume[volumeId]).toEqual([sectionId])
  })

  it('reassigning a chapter moves it rather than duplicating it', async () => {
    const a = await volumeStore.createVolume(PROJECT, { title: 'A' })
    const b = await volumeStore.createVolume(PROJECT, { title: 'B' })
    const sectionId = await db.sections.add({ projectId: PROJECT, title: 'C1', order: 0 })

    await volumeStore.assignSection(sectionId, a, PROJECT)
    await volumeStore.assignSection(sectionId, b, PROJECT)

    const byVolume = await getSectionIdsByVolume(PROJECT)
    expect(byVolume[a]).toBeUndefined()
    expect(byVolume[b]).toEqual([sectionId])
  })

  it('reports no membership for a volume with no chapters', async () => {
    const volumeId = await volumeStore.createVolume(PROJECT, { title: 'Empty' })
    await volumeStore.loadVolumes(PROJECT)
    const volume = volumeStore.volumes.find((v) => v.id === volumeId)
    expect(volume.sectionIds).toEqual([])
    expect(await unassignAllSectionsFromVolume(volumeId)).toBe(0)
  })
})
