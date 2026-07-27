import { db as _db } from './db-core'
import { countWords } from '../utils/textUtils'
import { getEmbedding } from './ollamaService'

const db = _db as any

// ========== SECTIONS ==========

export async function getSections(projectId: string, branchId?: string) {
  if (branchId) {
    return db.sections.where({ projectId, branchId }).toArray()
  }
  return db.sections.where('projectId').equals(projectId).toArray()
}

export async function addSection(projectId: string, data: any) {
  const now = new Date().toISOString()
  return db.sections.add({ projectId, createdAt: now, updatedAt: now, ...data })
}

export async function updateSection(id: string, data: any) {
  return db.sections.update(id, { ...data, updatedAt: new Date().toISOString() })
}

export async function deleteSection(id: string) {
  return db.sections.delete(id)
}

export async function reorderSections(sectionIds: string[]) {
  await db.transaction('rw', db.sections, async () => {
    for (let i = 0; i < sectionIds.length; i++) {
      await db.sections.update(sectionIds[i], { order: i })
    }
  })
}

// ========== SUBSECTIONS ==========

export async function getSubsections(projectId: string, sectionId: string | null = null, branchId?: string) {
  if (sectionId) {
    const filter: any = { projectId, sectionId }
    if (branchId) filter.branchId = branchId
    return db.subsections.where(filter).sortBy('order')
  }
  if (branchId) {
    return db.subsections.where({ projectId, branchId }).toArray()
  }
  return db.subsections.where('projectId').equals(projectId).toArray()
}

export async function addSubsection(projectId: string, data: any) {
  const now = new Date().toISOString()
  const result = await db.subsections.add({
    projectId,
    contentStatus: 'draft',
    createdAt: now,
    updatedAt: now,
    ...data
  })
  if (data.content) {
    getEmbedding('subsection', result, data.content).catch((err: Error) => {
      console.error('Failed to generate embedding for new subsection:', result, err)
    })
  }
  return result
}

export async function updateSubsection(id: string, data: any) {
  await db.subsections.update(id, { ...data, updatedAt: new Date().toISOString() })
  if (data.content) {
    getEmbedding('subsection', id, data.content).catch((err: Error) => {
      console.error('Failed to generate embedding for subsection update:', id, err)
    })
  }
}

export async function deleteSubsection(id: string) {
  return db.subsections.delete(id)
}

export async function getFailedSubsections(projectId: string, branchId?: string) {
  const subs = branchId
    ? await db.subsections.where('[projectId+branchId]').equals([projectId, branchId]).toArray()
    : await db.subsections.where('projectId').equals(projectId).toArray()
  return subs.filter(
    (s: any) => s.contentStatus === 'failed' || !(s.content && String(s.content).trim())
  )
}

export async function reorderSubsections(subsectionIds: string[]) {
  await db.transaction('rw', db.subsections, async () => {
    for (let i = 0; i < subsectionIds.length; i++) {
      await db.subsections.update(subsectionIds[i], { order: i })
    }
  })
}

export async function getSectionWordCounts(projectId: string, branchId?: string) {
  const sections = await getSections(projectId, branchId)
  const subsections = await getSubsections(projectId, null, branchId)

  const sectionCounts: Record<string, any> = {}
  let totalWords = 0

  for (const section of sections) {
    const sectionSubsections = subsections.filter((s: any) => s.sectionId === section.id)
    let wordCount = 0

    for (const subsection of sectionSubsections) {
      if (subsection.content) {
        wordCount += countWords(subsection.content)
      }
    }

    sectionCounts[section.id] = {
      sectionId: section.id,
      title: section.title,
      status: section.status,
      summary: section.summary,
      wordCount
    }
    totalWords += wordCount
  }

  return { sectionCounts, totalWords }
}

// ========== VOLUMES ==========

export async function getVolumes(projectId: string) {
  return db.volumes.where('projectId').equals(projectId).toArray()
}

export async function addVolume(projectId: string, data: any) {
  return db.volumes.add({
    projectId,
    title: data.title || 'Untitled Volume',
    description: data.description || '',
    color: data.color || '#6366f1',
    sectionIds: [],
    ...data
  })
}

export async function updateVolume(id: string, data: any) {
  return db.volumes.update(id, data)
}

export async function deleteVolume(id: string) {
  return db.volumes.delete(id)
}

// `volumeId: null` unassigns the section from any volume — see volumeStore.assignSection.
export async function assignSectionToVolume(sectionId: string, volumeId: string | null) {
  const sections = await db.sections.where('id').equals(sectionId).toArray()
  if (sections.length === 0) return
  await db.sections.update(sectionId, { volumeId })
}

export async function removeSectionFromVolume(sectionId: string) {
  const sections = await db.sections.where('id').equals(sectionId).toArray()
  if (sections.length === 0) return
  await db.sections.update(sectionId, { volumeId: null })
}

export async function batchCreatePlanStructure({ projectId, groups, branchId }: { projectId: string; groups: any[]; branchId?: string }) {
  return db.transaction('rw', db.sections, db.subsections, async () => {
    const results = []
    const now = new Date().toISOString()

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]
      const sectionId = await db.sections.add({
        projectId,
        title: group.title,
        summary: group.scenes.map((s: any) => s.title || `Scene ${s.sceneNumber}`).join(', '),
        wordCount: 0,
        order: i,
        status: 'planning',
        branchId,
        createdAt: now,
        updatedAt: now
      })

      const subsectionIds = []
      for (let j = 0; j < group.scenes.length; j++) {
        const scene = group.scenes[j]
        const subId = await db.subsections.add({
          projectId,
          sectionId,
          title: scene.title || `Scene ${scene.sceneNumber}`,
          description: `Scene ${scene.sceneNumber}`,
          content: '',
          wordCount: 0,
          type: 'scene',
          sceneNumber: scene.sceneNumber,
          contentStatus: 'pending',
          branchId,
          order: j,
          createdAt: now,
          updatedAt: now
        })
        subsectionIds.push(subId)
        scene.subsectionId = subId
      }

      if (group.volumeId) {
        await db.sections.update(sectionId, { volumeId: group.volumeId })
      }

      results.push({
        id: sectionId,
        scenes: group.scenes,
        subsectionIds,
        chapterMeta: group.chapterMeta,
        title: group.title,
        summary: group.scenes.map((s: any) => s.title || `Scene ${s.sceneNumber}`).join(', ')
      })
    }

    return results
  })
}
