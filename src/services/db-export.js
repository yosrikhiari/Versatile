import { db } from './db-core'

export async function exportProject(projectId) {
  const project = await db.projects.get(projectId)
  const manuscript = await db.manuscripts.where('projectId').equals(projectId).first()
  const characters = await db.characters.where('projectId').equals(projectId).toArray()
  const locations = await db.locations.where('projectId').equals(projectId).toArray()
  const plotThreads = await db.plotThreads.where('projectId').equals(projectId).toArray()
  const relationships = await db.characterRelationships
    .where('projectId')
    .equals(projectId)
    .toArray()
  const storyElements = await db.storyElements.where('projectId').equals(projectId).toArray()
  const sparkHistory = await db.sparkHistory.where('projectId').equals(projectId).toArray()
  const annotations = await db.annotations.where('projectId').equals(projectId).toArray()
  const snippets = await db.snippets.where('projectId').equals(projectId).toArray()
  const volumes = await db.volumes.where('projectId').equals(projectId).toArray()
  const volumeEntities = await db.volumeEntities.filter((e) => e.projectId === projectId).toArray()
  const graphEdges = await db.graphEdges.where('projectId').equals(projectId).toArray()
  const sections = await db.sections.where('projectId').equals(projectId).toArray()
  const subsections = await db.subsections.where('projectId').equals(projectId).toArray()

  return {
    version: 4,
    exportedAt: new Date().toISOString(),
    project,
    manuscript,
    characters,
    locations,
    plotThreads,
    relationships,
    storyElements,
    sparkHistory,
    annotations,
    snippets,
    volumes,
    volumeEntities,
    graphEdges,
    sections,
    subsections
  }
}

export async function importProject(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid project file: not an object')
  }
  if (!data.version || typeof data.version !== 'number') {
    throw new Error('Invalid project file: missing or invalid version')
  }
  if (!data.project || typeof data.project !== 'object' || !data.project.name) {
    throw new Error('Invalid project file: missing or invalid project data')
  }

  const MAX_ITEMS = 10000
  const arraysToCheck = [
    'characters',
    'locations',
    'chapters',
    'scenes',
    'relationships',
    'storyElements',
    'sparkHistory',
    'annotations',
    'snippets',
    'volumes',
    'volumeEntities',
    'graphEdges',
    'sections',
    'subsections'
  ]
  for (const key of arraysToCheck) {
    if (data[key] && data[key].length > MAX_ITEMS) {
      throw new Error(`Invalid project file: too many ${key} (max ${MAX_ITEMS})`)
    }
  }

  const projectId = await db.transaction(
    'rw',
    db.projects,
    db.manuscripts,
    db.characters,
    db.locations,
    db.plotThreads,
    db.characterRelationships,
    db.storyElements,
    db.sparkHistory,
    db.annotations,
    db.snippets,
    db.volumes,
    db.volumeEntities,
    db.graphEdges,
    db.sections,
    db.subsections,
    async () => {
      const id = await db.projects.add({
        ...data.project,
        id: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })

      if (data.manuscript) {
        await db.manuscripts.add({
          ...data.manuscript,
          id: undefined,
          projectId: id
        })
      }

      if (data.characters?.length > 0) {
        const chars = data.characters.map((c) => ({ ...c, id: undefined, projectId: id }))
        await db.characters.bulkAdd(chars)
      }

      if (data.locations?.length > 0) {
        const locs = data.locations.map((l) => ({ ...l, id: undefined, projectId: id }))
        await db.locations.bulkAdd(locs)
      }

      if (data.plotThreads?.length > 0) {
        const threads = data.plotThreads.map((t) => ({ ...t, id: undefined, projectId: id }))
        await db.plotThreads.bulkAdd(threads)
      }

      if (data.relationships?.length > 0) {
        const rels = data.relationships.map((r) => ({ ...r, id: undefined, projectId: id }))
        await db.characterRelationships.bulkAdd(rels)
      }

      if (data.storyElements?.length > 0) {
        const elems = data.storyElements.map((e) => ({ ...e, id: undefined, projectId: id }))
        await db.storyElements.bulkAdd(elems)
      }

      if (data.sparkHistory?.length > 0) {
        const history = data.sparkHistory.map((h) => ({ ...h, id: undefined, projectId: id }))
        await db.sparkHistory.bulkAdd(history)
      }

      if (data.annotations?.length > 0) {
        const annotations = data.annotations.map((a) => ({ ...a, id: undefined, projectId: id }))
        await db.annotations.bulkAdd(annotations)
      }

      if (data.snippets?.length > 0) {
        const snippets = data.snippets.map((s) => ({ ...s, id: undefined, projectId: id }))
        await db.snippets.bulkAdd(snippets)
      }

      if (data.volumes?.length > 0) {
        const vols = data.volumes.map((v) => ({ ...v, id: undefined, projectId: id }))
        await db.volumes.bulkAdd(vols)
      }

      if (data.version >= 3 && data.volumeEntities?.length > 0) {
        const entities = data.volumeEntities.map((ve) => ({
          ...ve,
          id: undefined,
          projectId: id,
          volumeId: ve.volumeId || null
        }))
        await db.volumeEntities.bulkAdd(entities)
      }

      if (data.version >= 3 && data.graphEdges?.length > 0) {
        const edges = data.graphEdges.map((edge) => ({
          ...edge,
          id: undefined,
          projectId: id,
          volumeId: edge.volumeId || null
        }))
        await db.graphEdges.bulkAdd(edges)
      }

      if (data.version >= 4) {
        if (data.sections?.length > 0) {
          const secs = data.sections.map((s) => ({ ...s, id: undefined, projectId: id }))
          await db.sections.bulkAdd(secs)
        }
        if (data.subsections?.length > 0) {
          const subs = data.subsections.map((s) => ({ ...s, id: undefined, projectId: id }))
          await db.subsections.bulkAdd(subs)
        }
      } else {
        if (data.chapters?.length > 0) {
          const secs = data.chapters.map((c) => ({
            projectId: id,
            title: c.title,
            summary: c.summary,
            order: c.order,
            status: c.status,
            tags: c.tags,
            volumeId: c.volumeId
          }))
          await db.sections.bulkAdd(secs)
        }
        if (data.scenes?.length > 0) {
          const subs = data.scenes.map((s) => ({
            projectId: id,
            sectionId: s.chapterId,
            title: s.title,
            summary: s.summary,
            content: s.content,
            order: s.order,
            tags: s.tags
          }))
          await db.subsections.bulkAdd(subs)
        }
      }

      return id
    }
  )

  return projectId
}

export async function exportToPDF(projectId) {
  const project = await db.projects.get(projectId)
  const manuscript = await db.manuscripts.where('projectId').equals(projectId).first()
  const sections = await db.sections.where('projectId').equals(projectId).sortBy('order')
  const subsections = await db.subsections.where('projectId').equals(projectId).sortBy('order')
  const characters = await db.characters.where('projectId').equals(projectId).toArray()
  const locations = await db.locations.where('projectId').equals(projectId).toArray()
  const plotThreads = await db.plotThreads.where('projectId').equals(projectId).toArray()

  return { project, manuscript, sections, subsections, characters, locations, plotThreads }
}
