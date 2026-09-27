import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * Data integrity under branches, backups and project import, over the REAL
 * Dexie schema (fake-indexeddb). WHATIF-AND-IMPORT-PLAN.md, build step 1.
 */

let db, branches, exporter, recovery

const TABLES = [
  'projects',
  'manuscripts',
  'sections',
  'subsections',
  'branches',
  'characters',
  'locations',
  'plotThreads',
  'characterRelationships',
  'graphEdges',
  'storyElements',
  'volumes',
  'volumeEntities',
  'sceneDigests',
  'entityStates',
  'storyDocuments',
  'voiceProfiles'
]

beforeEach(async () => {
  setActivePinia(createPinia())
  db = (await import('@/services/db-core')).db
  branches = await import('@/services/db-branches')
  exporter = await import('@/services/db-export')
  recovery = await import('@/services/dbRecovery')
  for (const t of TABLES) await db[t].clear()
})

async function book(projectId, branchId) {
  const s1 = await db.sections.add({ projectId, branchId, title: 'One', order: 0 })
  const s2 = await db.sections.add({ projectId, branchId, title: 'Two', order: 1 })
  const a = await db.subsections.add({
    projectId,
    branchId,
    sectionId: s1,
    title: 'A',
    order: 0,
    content: '<p>Alpha.</p>',
    sceneNumber: 1,
    description: 'brief A',
    pov: 'Mara',
    apiId: 'server-1'
  })
  const b = await db.subsections.add({
    projectId,
    branchId,
    sectionId: s2,
    title: 'B',
    order: 0,
    content: '<p>Beta.</p>',
    sceneNumber: 2
  })
  return { s1, s2, a, b }
}

describe('adoptUnbranchedRows', () => {
  it('gives rows with no branch, or a foreign branch, to main', async () => {
    const main = await branches.ensureMainBranch('p1')
    await db.sections.add({ projectId: 'p1', title: 'no branch' })
    await db.sections.add({ projectId: 'p1', title: 'foreign', branchId: 99999 })
    await db.sections.add({ projectId: 'p1', title: 'own', branchId: main.id })
    await db.sections.add({ projectId: 'p2', title: 'other project' })

    expect(await branches.adoptUnbranchedRows('p1', main.id)).toBe(2)
    const rows = await db.sections.where({ projectId: 'p1', branchId: main.id }).toArray()
    expect(rows.map((r) => r.title).sort()).toEqual(['foreign', 'no branch', 'own'])
    const other = await db.sections.where('projectId').equals('p2').first()
    expect(other.branchId).toBeUndefined()
  })
})

describe('copyManuscriptToBranch', () => {
  it('copies prose and every field, links each copy to its source, drops sync identity', async () => {
    const main = await branches.ensureMainBranch('p1')
    const src = await book('p1', main.id)
    const fork = await branches.createBranch('p1', 'fork', main.id)

    const maps = await branches.copyManuscriptToBranch('p1', main.id, fork.id)

    const copies = await db.subsections.where({ projectId: 'p1', branchId: fork.id }).toArray()
    expect(copies).toHaveLength(2)
    const a = copies.find((c) => c.sourceSubsectionId === src.a)
    expect(a).toMatchObject({
      content: '<p>Alpha.</p>',
      description: 'brief A',
      pov: 'Mara',
      sceneNumber: 1,
      sectionId: maps.sections.get(src.s1)
    })
    expect(a.apiId).toBeUndefined()
    expect(a.id).not.toBe(src.a)
    // The source is untouched.
    expect((await db.subsections.get(src.a)).branchId).toBe(main.id)
  })
})

describe('deleteBranch', () => {
  it('removes the branch rows, digests and entity states, and refuses main', async () => {
    const main = await branches.ensureMainBranch('p1')
    await book('p1', main.id)
    const fork = await branches.createBranch('p1', 'fork', main.id)
    const maps = await branches.copyManuscriptToBranch('p1', main.id, fork.id)
    const copyId = [...maps.subsections.values()][0]
    await db.sceneDigests.add({ projectId: 'p1', subsectionId: copyId, contentHash: 'h' })
    await db.entityStates.add({
      projectId: 'p1',
      entityType: 'character',
      entityId: 'c1',
      sceneId: copyId
    })

    await branches.deleteBranch(fork.id)

    expect(await db.branches.get(fork.id)).toBeUndefined()
    expect(await db.subsections.where('projectId').equals('p1').count()).toBe(2)
    expect(await db.sections.where('projectId').equals('p1').count()).toBe(2)
    expect(await db.sceneDigests.count()).toBe(0)
    expect(await db.entityStates.count()).toBe(0)
    await expect(branches.deleteBranch(main.id)).rejects.toThrow(/main/)
  })
})

describe('branch store', () => {
  it('does not carry the last project’s branch into the next one', async () => {
    const { useBranchStore } = await import('@/stores/branchStore')
    const store = useBranchStore()
    const m1 = await branches.ensureMainBranch('p1')
    const m2 = await branches.ensureMainBranch('p2')

    expect(await store.branchIdFor('p1')).toBe(m1.id)
    expect(await store.branchIdFor('p2')).toBe(m2.id)
  })

  it('shares one load between concurrent callers and adopts orphans on open', async () => {
    const { useBranchStore } = await import('@/stores/branchStore')
    const store = useBranchStore()
    await db.sections.add({ projectId: 'p3', title: 'legacy chapter' })

    const [a, b] = await Promise.all([store.initForProject('p3'), store.branchIdFor('p3')])
    expect(a).toBe(b)
    expect(await db.branches.where({ projectId: 'p3' }).count()).toBe(1)
    const row = await db.sections.where('projectId').equals('p3').first()
    expect(row.branchId).toBe(a)
  })

  it('forkBranch copies the manuscript; switchTo reloads it', async () => {
    const { useBranchStore } = await import('@/stores/branchStore')
    const { useManuscriptStore } = await import('@/stores/manuscriptStore')
    const store = useBranchStore()
    const main = await branches.ensureMainBranch('p4')
    await book('p4', main.id)
    await store.initForProject('p4')

    const fork = await store.forkBranch('p4', 'alt')
    await store.switchTo('p4', fork.id)

    const ms = useManuscriptStore()
    expect(ms.sections.map((s) => s.branchId)).toEqual([fork.id, fork.id])
    expect(ms.subsections).toHaveLength(2)
    expect(ms.getFullText()).toBe('Alpha.\n\nBeta.')
  })
})

describe('importProject (JSON backup)', () => {
  it('remaps every reference to the new rows and strips sync identity', async () => {
    const main = await branches.ensureMainBranch('src')
    const { s1, a } = await book('src', main.id)
    const c1 = await db.characters.add({ projectId: 'src', name: 'Mara', apiId: 'srv-c1' })
    const c2 = await db.characters.add({ projectId: 'src', name: 'Ines' })
    const v1 = await db.volumes.add({ projectId: 'src', title: 'Vol' })
    await db.sections.update(s1, { volumeId: v1 })
    await db.characterRelationships.add({
      projectId: 'src',
      fromCharacterId: c1,
      toCharacterId: c2,
      type: 'sister'
    })
    await db.graphEdges.add({
      projectId: 'src',
      sourceId: String(c1),
      sourceType: 'character',
      targetId: String(c2),
      targetType: 'character',
      relationshipType: 'rival'
    })
    await db.storyElements.add({
      projectId: 'src',
      type: 'section',
      title: 'One',
      data: { sourceType: 'section', sourceId: s1, sectionId: s1 }
    })
    await db.projects.add({ id: 'src', name: 'Source' })

    // Pad the ids so new ids can never coincide with old ones by accident.
    for (let i = 0; i < 5; i++) await db.characters.add({ projectId: 'pad', name: 'x' })
    const file = JSON.parse(JSON.stringify(await exporter.exportProject('src')))
    const pid = await exporter.importProject(file)

    const secs = await db.sections.where('projectId').equals(pid).toArray()
    const subs = await db.subsections.where('projectId').equals(pid).toArray()
    const chars = await db.characters.where('projectId').equals(pid).toArray()
    const vols = await db.volumes.where('projectId').equals(pid).toArray()
    const newBranch = await db.branches.where({ projectId: pid }).first()
    const secIds = new Set(secs.map((s) => s.id))
    const charIds = new Set(chars.map((c) => String(c.id)))

    expect(secs).toHaveLength(2)
    expect(subs).toHaveLength(2)
    expect(subs.every((s) => secIds.has(s.sectionId))).toBe(true)
    expect(subs.every((s) => s.branchId === newBranch.id)).toBe(true)
    expect(secs.find((s) => s.title === 'One').volumeId).toBe(vols[0].id)
    expect(subs.find((s) => s.title === 'A').apiId).toBeUndefined()
    expect(chars.find((c) => c.name === 'Mara').apiId).toBeUndefined()
    expect(subs.some((s) => s.id === a)).toBe(false)

    const rel = await db.characterRelationships.where('projectId').equals(pid).first()
    expect(charIds.has(String(rel.fromCharacterId))).toBe(true)
    expect(charIds.has(String(rel.toCharacterId))).toBe(true)
    const edge = await db.graphEdges.where('projectId').equals(pid).first()
    expect(charIds.has(edge.sourceId) && charIds.has(edge.targetId)).toBe(true)
    const el = await db.storyElements.where('projectId').equals(pid).first()
    expect(secIds.has(el.data.sectionId) && secIds.has(el.data.sourceId)).toBe(true)
  })

  it('maps a version 3 file (chapters and scenes) onto chapters and their scenes', async () => {
    const pid = await exporter.importProject({
      version: 3,
      project: { name: 'Old' },
      chapters: [{ id: 7, title: 'Ch', order: 0 }],
      scenes: [{ id: 9, chapterId: 7, title: 'Sc', content: '<p>x</p>', order: 0 }]
    })
    const sec = await db.sections.where('projectId').equals(pid).first()
    const sub = await db.subsections.where('projectId').equals(pid).first()
    expect(sub.sectionId).toBe(sec.id)
    expect(sub.branchId).toBe(sec.branchId)
    expect(sub.branchId).not.toBeUndefined()
  })
})

describe('recovery backup', () => {
  it('covers chapters, scenes and branches, and skips caches', () => {
    const stores = recovery.backupStores()
    expect(stores).toEqual(expect.arrayContaining(['sections', 'subsections', 'branches']))
    expect(stores).not.toContain('contentVectors')
  })

  it('restoring an older backup without chapters does not wipe them', async () => {
    await db.sections.add({ projectId: 'p1', title: 'keep me' })
    await recovery.importData({ projects: [{ id: 'p1', name: 'P' }] })
    expect(await db.sections.count()).toBe(1)
    expect(await db.projects.count()).toBe(1)
  })

  it('round-trips prose', async () => {
    await book('p1', 1)
    const backup = await recovery.exportAllData()
    await db.subsections.clear()
    await recovery.importData(JSON.parse(JSON.stringify(backup)))
    const subs = await db.subsections.toArray()
    expect(subs.map((s) => s.content).sort()).toEqual(['<p>Alpha.</p>', '<p>Beta.</p>'])
  })
})
