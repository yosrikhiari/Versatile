import { describe, it, expect, afterEach } from 'vitest'
import { db } from '@/services/db-core'
import { seedSampleStory, SAMPLE_PROJECT_NAME } from '@/services/seedSampleStory'

afterEach(async () => {
  for (const t of [
    'projects',
    'manuscripts',
    'volumes',
    'sections',
    'subsections',
    'characters',
    'locations',
    'plotThreads',
    'branches'
  ]) {
    await db[t].clear()
  }
})

describe('seedSampleStory', () => {
  it('creates a complete small project on the main branch, once per user', async () => {
    const first = await seedSampleStory(7)
    expect(first.created).toBe(true)
    const again = await seedSampleStory(7)
    expect(again.created).toBe(false)
    expect(again.projectId).toBe(first.projectId)

    const project = await db.projects.get(first.projectId)
    expect(project.name).toBe(SAMPLE_PROJECT_NAME)
    // Rows without the main branch are invisible to the manuscript store.
    const branch = await db.branches.where({ projectId: first.projectId, name: 'main' }).first()
    expect(branch).toBeTruthy()
    const sections = await db.sections.where('projectId').equals(first.projectId).toArray()
    const scenes = await db.subsections.where('projectId').equals(first.projectId).toArray()
    expect(sections).toHaveLength(2)
    expect(scenes).toHaveLength(4)
    expect(sections.every((s) => s.branchId === branch.id)).toBe(true)
    expect(scenes.every((s) => s.branchId === branch.id && s.wordCount > 50)).toBe(true)
    // The root document stays empty: prose lives in the scenes (#19).
    const manuscript = await db.manuscripts.where('projectId').equals(first.projectId).first()
    expect(manuscript.content).toBe('')
    expect(await db.characters.where('projectId').equals(first.projectId).count()).toBe(3)
  })
})
