import { db } from './db-core'

export async function exportProject(projectId) {
  const project = await db.projects.get(projectId)
  const manuscript = await db.manuscripts.where('projectId').equals(projectId).first()
  const characters = await db.characters.where('projectId').equals(projectId).toArray()
  const locations = await db.locations.where('projectId').equals(projectId).toArray()
  const plotThreads = await db.plotThreads.where('projectId').equals(projectId).toArray()
  const chapters = await db.chapters.where('projectId').equals(projectId).toArray()
  const scenes = await db.scenes.where('projectId').equals(projectId).toArray()
  const relationships = await db.characterRelationships.where('projectId').equals(projectId).toArray()
  const storyElements = await db.storyElements.where('projectId').equals(projectId).toArray()
  const sparkHistory = await db.sparkHistory.where('projectId').equals(projectId).toArray()
  const annotations = await db.annotations.where('projectId').equals(projectId).toArray()
  const snippets = await db.snippets.where('projectId').equals(projectId).toArray()
  const volumes = await db.volumes.where('projectId').equals(projectId).toArray()
  const volumeEntities = await db.volumeEntities.where('projectId').equals(projectId).toArray()
  const graphEdges = await db.graphEdges.where('projectId').equals(projectId).toArray()
    
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    project,
    manuscript,
    characters,
    locations,
    plotThreads,
    chapters,
    scenes,
    relationships,
    storyElements,
    sparkHistory,
    annotations,
    snippets,
    volumes,
    volumeEntities,
    graphEdges
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
  const arraysToCheck = ['characters', 'locations', 'chapters', 'scenes', 'relationships', 
                          'storyElements', 'sparkHistory', 'annotations', 'snippets', 
                          'volumes', 'volumeEntities', 'graphEdges']
  for (const key of arraysToCheck) {
    if (data[key] && data[key].length > MAX_ITEMS) {
      throw new Error(`Invalid project file: too many ${key} (max ${MAX_ITEMS})`)
    }
  }

  const projectId = await db.projects.add({
    ...data.project,
    id: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
    
  if (data.manuscript) {
    await db.manuscripts.add({
      ...data.manuscript,
      id: undefined,
      projectId
    })
  }
    
  if (data.characters?.length > 0) {
    const chars = data.characters.map(c => ({ ...c, id: undefined, projectId }))
    await db.characters.bulkAdd(chars)
  }
    
  if (data.locations?.length > 0) {
    const locs = data.locations.map(l => ({ ...l, id: undefined, projectId }))
    await db.locations.bulkAdd(locs)
  }
    
  if (data.plotThreads?.length > 0) {
    const threads = data.plotThreads.map(t => ({ ...t, id: undefined, projectId }))
    await db.plotThreads.bulkAdd(threads)
  }
    
  if (data.chapters?.length > 0) {
    const chapters = data.chapters.map(c => ({ ...c, id: undefined, projectId }))
    await db.chapters.bulkAdd(chapters)
  }
    
  if (data.scenes?.length > 0) {
    const scenes = data.scenes.map(s => ({ ...s, id: undefined, projectId }))
    await db.scenes.bulkAdd(scenes)
  }
    
  if (data.relationships?.length > 0) {
    const rels = data.relationships.map(r => ({ ...r, id: undefined, projectId }))
    await db.characterRelationships.bulkAdd(rels)
  }
    
  if (data.storyElements?.length > 0) {
    const elems = data.storyElements.map(e => ({ ...e, id: undefined, projectId }))
    await db.storyElements.bulkAdd(elems)
  }
    
  if (data.sparkHistory?.length > 0) {
    const history = data.sparkHistory.map(h => ({ ...h, id: undefined, projectId }))
    await db.sparkHistory.bulkAdd(history)
  }
    
  if (data.annotations?.length > 0) {
    const annotations = data.annotations.map(a => ({ ...a, id: undefined, projectId }))
    await db.annotations.bulkAdd(annotations)
  }
    
  if (data.snippets?.length > 0) {
    const snippets = data.snippets.map(s => ({ ...s, id: undefined, projectId }))
    await db.snippets.bulkAdd(snippets)
  }
    
  if (data.volumes?.length > 0) {
    const vols = data.volumes.map(v => ({ ...v, id: undefined, projectId }))
    await db.volumes.bulkAdd(vols)
  }
    
  if (data.version >= 3 && data.volumeEntities?.length > 0) {
    const entities = data.volumeEntities.map(ve => ({ 
      ...ve, id: undefined, projectId, volumeId: ve.volumeId || null 
    }))
    await db.volumeEntities.bulkAdd(entities)
  }
    
  if (data.version >= 3 && data.graphEdges?.length > 0) {
    const edges = data.graphEdges.map(edge => ({ 
      ...edge, id: undefined, projectId, volumeId: edge.volumeId || null 
    }))
    await db.graphEdges.bulkAdd(edges)
  }
    
  return projectId
}

export async function exportToPDF(projectId) {
  const project = await db.projects.get(projectId)
  const manuscript = await db.manuscripts.where('projectId').equals(projectId).first()
  const chapters = await db.chapters.where('projectId').equals(projectId).sortBy('order')
  const characters = await db.characters.where('projectId').equals(projectId).toArray()
  const locations = await db.locations.where('projectId').equals(projectId).toArray()
  const plotThreads = await db.plotThreads.where('projectId').equals(projectId).toArray()
    
  return { project, manuscript, chapters, characters, locations, plotThreads }
}
