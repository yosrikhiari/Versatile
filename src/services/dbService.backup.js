import Dexie from 'dexie'
import { toRaw } from 'vue'
import { countWords } from '../utils/textUtils'
import { getEmbedding } from './ollamaService'

function deepPlain(obj) {
  return JSON.parse(JSON.stringify(toRaw(obj)))
}

export const db = new Dexie('VersatileDB')

db.version(11).stores({
  projects: '++id, name, createdAt, updatedAt, genre, synopsis',
  manuscripts: '++id, projectId, content, wordCount, updatedAt',
  characters: '++id, projectId, name, role, goal, voice, notes, color',
  characterRelationships: '++id, projectId, fromCharacterId, toCharacterId, type, notes',
  locations: '++id, projectId, name, description, notes',
  plotThreads: '++id, projectId, title, status, notes',
  chapters: '++id, projectId, title, summary, order, status, *tags, volumeId',
  scenes: '++id, projectId, chapterId, title, summary, order, content, *tags',
  sparkHistory: '++id, projectId, type, prompt, blueprint, createdAt',
  annotations: '++id, projectId, paragraphIndex, type, original, suggestion, reason, status',
  snippets: '++id, projectId, word, count, lastSeen',
  dailyGoals: '++id, projectId, date, [projectId+date]',
  revisionComments: '++id, projectId, paragraphIndex, startOffset, endOffset, selectedText, comment, createdAt',
  storyElements: '++id, projectId, type, title, x, y, width, height, data',
  graphEdges: '++id, projectId, sourceId, sourceType, targetId, targetType, relationshipType, volumeId',
  groupEdges: '++id, projectId, sourceGroupId, targetGroupId, relationshipType',
  nodePositions: '++id, projectId',
  graphGroups: '++id, projectId',
  snapshots: '++id, projectId, chapterId, timestamp, label',
  volumes: '++id, projectId, title, description, color, chapterIds',
  volumeEntities: '++id, volumeId, entityType, entityId, isPrimary, assignedAt, &[volumeId+entityType+entityId]'
})

// Migration from v10 to v11: Add volumeId to graphEdges, create volumeEntities table
db.version(11).upgrade(async (trans) => {
  // Add volumeId to existing graphEdges (set to null for all existing edges)
  await trans.graphEdges.toCollection().modify({ volumeId: null })
  // Note: volumeEntities table is empty initially, entities need to be assigned
})

db.on('ready', async () => {
  // Ensure default volume exists
  const volumeCount = await db.volumes.count()
  if (volumeCount === 0) {
    await db.volumes.add({
      title: 'Default',
      description: 'Default volume for all content',
      color: '#6366f1',
      chapterIds: []
    })
  }
})

export async function createProject(name, genre = '', synopsis = '') {
  const now = new Date().toISOString()
  const projectId = await db.projects.add({
    name,
    genre,
    synopsis,
    createdAt: now,
    updatedAt: now
  })
  await db.manuscripts.add({
    projectId,
    content: '',
    wordCount: 0,
    updatedAt: now
  })
  return projectId
}

export async function updateProject(id, data) {
  const now = new Date().toISOString()
  await db.projects.update(id, {
    ...data,
    updatedAt: now
  })
}

export async function getProject(id) {
  return db.projects.get(id)
}

export async function getAllProjects() {
  return db.projects.toArray()
}

export async function getManuscript(projectId) {
  return db.manuscripts.where('projectId').equals(projectId).first()
}

export async function saveManuscript(projectId, content) {
  const wordCount = countWords(content)
  const now = new Date().toISOString()
  const existing = await db.manuscripts.where('projectId').equals(projectId).first()
  if (existing) {
    return db.manuscripts.update(existing.id, { content, wordCount, updatedAt: now })
  }
  return db.manuscripts.add({ projectId, content, wordCount, updatedAt: now })
}

export async function getCharacters(projectId) {
  return db.characters.where('projectId').equals(projectId).toArray()
}

export async function addCharacter(projectId, data) {
  return db.characters.add({ projectId, ...data })
}

export async function updateCharacter(id, data) {
  return db.characters.update(id, data)
}

export async function deleteCharacter(id) {
  return db.characters.delete(id)
}

export async function getLocations(projectId) {
  return db.locations.where('projectId').equals(projectId).toArray()
}

export async function addLocation(projectId, data) {
  return db.locations.add({ projectId, ...data })
}

export async function updateLocation(id, data) {
  return db.locations.update(id, data)
}

export async function deleteLocation(id) {
  return db.locations.delete(id)
}

export async function getPlotThreads(projectId) {
  return db.plotThreads.where('projectId').equals(projectId).toArray()
}

export async function addPlotThread(projectId, data) {
  return db.plotThreads.add({ projectId, ...data })
}

export async function updatePlotThread(id, data) {
  return db.plotThreads.update(id, data)
}

export async function deletePlotThread(id) {
  return db.plotThreads.delete(id)
}

export async function getChapters(projectId) {
  return db.chapters.where('projectId').equals(projectId).toArray()
}

export async function addChapter(projectId, data) {
  return db.chapters.add({ projectId, ...data })
}

export async function updateChapter(id, data) {
  return db.chapters.update(id, data)
}

export async function deleteChapter(id) {
  return db.chapters.delete(id)
}

export async function getVolumes(projectId) {
  return db.volumes.where('projectId').equals(projectId).toArray()
}

export async function addVolume(projectId, data) {
  return db.volumes.add({ 
    projectId, 
    title: data.title || 'Untitled Volume',
    description: data.description || '',
    color: data.color || '#6366f1',
    chapterIds: [],
    ...data 
  })
}

export async function updateVolume(id, data) {
  return db.volumes.update(id, data)
}

export async function deleteVolume(id) {
  return db.volumes.delete(id)
}

export async function assignChapterToVolume(chapterId, volumeId) {
  const chapters = await db.chapters.where('id').equals(chapterId).toArray()
  if (chapters.length === 0) return
  await db.chapters.update(chapterId, { volumeId })
}

export async function removeChapterFromVolume(chapterId) {
  const chapters = await db.chapters.where('id').equals(chapterId).toArray()
  if (chapters.length === 0) return
  await db.chapters.update(chapterId, { volumeId: null })
}

// ========== Volume Entity Assignment ==========

export async function getVolumeEntities(projectId, volumeId, entityType = null) {
  let query = db.volumeEntities.where('volumeId').equals(volumeId)
  if (entityType) {
    query = query.filter(item => item.entityType === entityType)
  }
  const entities = await query.toArray()
  // Fetch actual entity data
  const results = await Promise.all(entities.map(async (item) => {
    let entity = null
    switch (item.entityType) {
      case 'character':
        entity = await db.characters.get(item.entityId)
        break
      case 'location':
        entity = await db.locations.get(item.entityId)
        break
      case 'plotThread':
        entity = await db.plotThreads.get(item.entityId)
        break
    }
    return entity ? { ...entity, volumeAssignment: { isPrimary: item.isPrimary, assignedAt: item.assignedAt } } : null
  }))
  return results.filter(Boolean)
}

export async function addEntityToVolume(projectId, entityType, entityId, volumeId, isPrimary = false) {
  const now = new Date().toISOString()
  // Check for existing assignment
  const existing = await db.volumeEntities
    .where('volumeId').equals(volumeId)
    .and(item => item.entityType === entityType && item.entityId === entityId)
    .first()
  
  if (existing) {
    return existing.id
  }
  
  return db.volumeEntities.add({
    volumeId,
    entityType,
    entityId,
    isPrimary,
    assignedAt: now
  })
}

export async function removeEntityFromVolume(entityType, entityId, volumeId) {
  return db.volumeEntities
    .where('volumeId').equals(volumeId)
    .and(item => item.entityType === entityType && item.entityId === entityId)
    .delete()
}

export async function removeEntityFromAllVolumes(entityType, entityId) {
  return db.volumeEntities
    .where('entityType').equals(entityType)
    .and(item => item.entityId === entityId)
    .delete()
}

export async function getEntityVolumes(entityType, entityId) {
  const assignments = await db.volumeEntities
    .where('entityType').equals(entityType)
    .and(item => item.entityId === entityId)
    .toArray()
  return assignments.map(a => a.volumeId)
}

export async function getVolumeEntityCount(volumeId, entityType = null) {
  let query = db.volumeEntities.where('volumeId').equals(volumeId)
  if (entityType) {
    query = query.filter(item => item.entityType === entityType)
  }
  return query.count()
}

export async function getVolumeEdgeCount(volumeId, includeGlobal = false) {
  if (includeGlobal) {
    return db.graphEdges.where('volumeId').equals(volumeId).or('volumeId').equals(null).count()
  }
  return db.graphEdges.where('volumeId').equals(volumeId).count()
}

export async function addVolumeEdge(projectId, sourceType, sourceId, targetType, targetId, relationshipType, volumeId = null) {
  // Check if edge already exists
  const existing = await db.graphEdges
    .where('sourceId').equals(sourceId)
    .and(e => e.sourceType === sourceType)
    .and('targetId').equals(targetId)
    .and(e => e.targetType === targetType)
    .and(e => e.relationshipType === relationshipType)
    .and(e => e.volumeId === volumeId)
    .first()
  
  if (existing) {
    return existing.id
  }
  
  return db.graphEdges.add({
    projectId,
    sourceType,
    sourceId,
    targetType,
    targetId,
    relationshipType,
    volumeId
  })
}

export async function updateVolumeEdgeVolume(edgeId, newVolumeId) {
  return db.graphEdges.update(edgeId, { volumeId: newVolumeId })
}

export async function getVolumeEdges(volumeId, includeGlobal = true) {
  if (includeGlobal) {
    return db.graphEdges
      .where('volumeId').equals(volumeId)
      .or('volumeId').equals(null)
      .toArray()
  }
  return db.graphEdges.where('volumeId').equals(volumeId).toArray()
}

export async function getSparkHistory(projectId) {
  return db.sparkHistory.where('projectId').equals(projectId).reverse().toArray()
}

export async function addSparkHistory(projectId, data) {
  return db.sparkHistory.add({ projectId, ...data, createdAt: new Date().toISOString() })
}

export async function clearSparkHistory(projectId) {
  return db.sparkHistory.where('projectId').equals(projectId).delete()
}

export async function getAnnotations(projectId) {
  return db.annotations.where('projectId').equals(projectId).toArray()
}

export async function addAnnotation(projectId, data) {
  return db.annotations.add({ projectId, ...data })
}

export async function updateAnnotation(id, data) {
  return db.annotations.update(id, data)
}

export async function deleteAnnotation(id) {
  return db.annotations.delete(id)
}

export async function clearAnnotations(projectId) {
  return db.annotations.where('projectId').equals(projectId).delete()
}

export async function getSnippets(projectId) {
  return db.snippets.where('projectId').equals(projectId).toArray()
}

export async function addSnippet(projectId, data) {
  return db.snippets.add({ projectId, ...data })
}

export async function updateSnippet(id, data) {
  return db.snippets.update(id, data)
}

export async function deleteSnippet(id) {
  return db.snippets.delete(id)
}

export async function incrementSnippetWord(projectId, word) {
  const existing = await db.snippets.where({ projectId, word }).first()
  if (existing) {
    return db.snippets.update(existing.id, { count: existing.count + 1, lastSeen: new Date().toISOString() })
  }
  return db.snippets.add({ projectId, word, count: 1, lastSeen: new Date().toISOString() })
}

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
  if (!data.version || !data.project) {
    throw new Error('Invalid project file')
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
  
  for (const char of data.characters || []) {
    await db.characters.add({ ...char, id: undefined, projectId })
  }
  
  for (const loc of data.locations || []) {
    await db.locations.add({ ...loc, id: undefined, projectId })
  }
  
  for (const thread of data.plotThreads || []) {
    await db.plotThreads.add({ ...thread, id: undefined, projectId })
  }
  
  for (const chapter of data.chapters || []) {
    await db.chapters.add({ ...chapter, id: undefined, projectId })
  }
  
  for (const scene of data.scenes || []) {
    await db.scenes.add({ ...scene, id: undefined, projectId })
  }
  
  for (const rel of data.relationships || []) {
    await db.characterRelationships.add({ ...rel, id: undefined, projectId })
  }
  
  for (const elem of data.storyElements || []) {
    await db.storyElements.add({ ...elem, id: undefined, projectId })
  }
  
  for (const history of data.sparkHistory || []) {
    await db.sparkHistory.add({ ...history, id: undefined, projectId })
  }
  
  for (const annotation of data.annotations || []) {
    await db.annotations.add({ ...annotation, id: undefined, projectId })
  }
  
  for (const snippet of data.snippets || []) {
    await db.snippets.add({ ...snippet, id: undefined, projectId })
  }
  
  // Import volumes (v2+)
  for (const vol of data.volumes || []) {
    await db.volumes.add({ ...vol, id: undefined, projectId })
  }
  
  // Import volume entities (v3+)
  if (data.version >= 3) {
    for (const ve of data.volumeEntities || []) {
      await db.volumeEntities.add({ ...ve, id: undefined, projectId })
    }
  }
  
  // Import graph edges (v3+)
  if (data.version >= 3) {
    for (const edge of data.graphEdges || []) {
      await db.graphEdges.add({ ...edge, id: undefined, projectId })
    }
  }
  
  return projectId
}

export function getTodayDateString() {
  return new Date().toISOString().split('T')[0]
}

export async function getDailyGoal(projectId) {
  const today = getTodayDateString()
  return db.dailyGoals.where({ projectId, date: today }).first()
}

export async function setDailyGoal(projectId, goalWords) {
  const today = getTodayDateString()
  const existing = await db.dailyGoals.where({ projectId, date: today }).first()
  if (existing) {
    return db.dailyGoals.update(existing.id, { goalWords })
  }
  return db.dailyGoals.add({ projectId, date: today, goalWords, wordCount: 0 })
}

export async function updateDailyWordCount(projectId, wordCount) {
  const today = getTodayDateString()
  const existing = await db.dailyGoals.where({ projectId, date: today }).first()
  if (existing) {
    return db.dailyGoals.update(existing.id, { wordCount })
  }
  return db.dailyGoals.add({ projectId, date: today, goalWords: 500, wordCount })
}

export async function getStreakData(projectId) {
  const entries = await db.dailyGoals
    .where('projectId')
    .equals(projectId)
    .filter(e => e.wordCount > 0)
    .toArray()
  
  if (entries.length === 0) {
    return { currentStreak: 0, longestStreak: 0, lastWrittenDate: null }
  }
  
  entries.sort((a, b) => b.date.localeCompare(a.date))
  
  const today = getTodayDateString()
  const yesterday = getYesterdayDateString()
  
  let currentStreak = 0
  let longestStreak = 0
  let tempStreak = 0
  let prevDate = null
  
  for (const entry of entries) {
    if (prevDate === null) {
      if (entry.date === today || entry.date === yesterday) {
        currentStreak = 1
      } else {
        currentStreak = 0
      }
      tempStreak = 1
    } else {
      const daysDiff = dateDiff(prevDate, entry.date)
      if (daysDiff === 1) {
        tempStreak++
        if (currentStreak > 0) currentStreak++
      } else {
        longestStreak = Math.max(longestStreak, tempStreak)
        tempStreak = 1
        if (currentStreak > 0) currentStreak = 0
      }
    }
    prevDate = entry.date
  }
  
  longestStreak = Math.max(longestStreak, tempStreak)
  if (currentStreak > 0) currentStreak = longestStreak
  
  return {
    currentStreak,
    longestStreak,
    lastWrittenDate: entries[0].date
  }
}

function getYesterdayDateString() {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  return date.toISOString().split('T')[0]
}

function dateDiff(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1)
  const d2 = new Date(dateStr2)
  const diffTime = Math.abs(d1.getTime() - d2.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

export async function getLastSessionData(projectId) {
  const entries = await db.dailyGoals
    .where('projectId')
    .equals(projectId)
    .filter(e => e.wordCount > 0)
    .toArray()
  
  if (entries.length === 0) return null
  
  entries.sort((a, b) => b.date.localeCompare(a.date))
  
  const today = getTodayDateString()
  if (entries[0].date === today) return null
  
  return {
    date: entries[0].date,
    wordCount: entries[0].wordCount
  }
}

export async function getRevisionComments(projectId) {
  return db.revisionComments.where('projectId').equals(projectId).toArray()
}

export async function addRevisionComment(projectId, data) {
  return db.revisionComments.add({
    projectId,
    createdAt: new Date().toISOString(),
    ...data
  })
}

export async function updateRevisionComment(id, data) {
  return db.revisionComments.update(id, data)
}

export async function deleteRevisionComment(id) {
  return db.revisionComments.delete(id)
}

export async function getCharacterRelationships(projectId) {
  return db.characterRelationships.where('projectId').equals(projectId).toArray()
}

export async function addCharacterRelationship(projectId, data) {
  return db.characterRelationships.add({ projectId, ...data })
}

export async function updateCharacterRelationship(id, data) {
  return db.characterRelationships.update(id, data)
}

export async function deleteCharacterRelationship(id) {
  return db.characterRelationships.delete(id)
}

export async function getScenes(projectId, chapterId = null) {
  if (chapterId) {
    return db.scenes.where({ projectId, chapterId }).sortBy('order')
  }
  return db.scenes.where('projectId').equals(projectId).toArray()
}

export async function addScene(projectId, data) {
  const result = await db.scenes.add({ projectId, ...data })
  if (data.content) {
    getEmbedding('scene', result, data.content).catch(() => {})
  }
  return result
}

export async function updateScene(id, data) {
  await db.scenes.update(id, data)
  if (data.content) {
    getEmbedding('scene', id, data.content).catch(() => {})
  }
}

export async function deleteScene(id) {
  return db.scenes.delete(id)
}

export async function getChapterWordCounts(projectId) {
  const chapters = await getChapters(projectId)
  const scenes = await getScenes(projectId)
  
  const chapterCounts = {}
  let totalWords = 0
  
  for (const chapter of chapters) {
    const chapterScenes = scenes.filter(s => s.chapterId === chapter.id)
    let wordCount = 0
    
    for (const scene of chapterScenes) {
      if (scene.content) {
        wordCount += scene.content.split(/\\s+/).filter(w => w.length > 0).length
      }
    }
    
    chapterCounts[chapter.id] = {
      chapterId: chapter.id,
      title: chapter.title,
      status: chapter.status,
      summary: chapter.summary,
      wordCount
    }
    totalWords += wordCount
  }
  
  return { chapterCounts, totalWords }
}

export async function reorderScenes(sceneIds) {
  for (let i = 0; i < sceneIds.length; i++) {
    await db.scenes.update(sceneIds[i], { order: i })
  }
}

export async function reorderChapters(chapterIds) {
  for (let i = 0; i < chapterIds.length; i++) {
    await db.chapters.update(chapterIds[i], { order: i })
  }
}

export async function getStoryElements(projectId) {
  return db.storyElements.where('projectId').equals(projectId).toArray()
}

export async function addStoryElement(projectId, data) {
  return db.storyElements.add({ projectId, ...data })
}

export async function updateStoryElement(id, data) {
  return db.storyElements.update(id, data)
}

export async function deleteStoryElement(id) {
  return db.storyElements.delete(id)
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

export async function updateProjectMeta(projectId, data) {
  return db.projects.update(projectId, data)
}

export async function getGraphEdges(projectId) {
  return db.graphEdges.where('projectId').equals(projectId).toArray()
}

export async function addGraphEdge(projectId, data) {
  return db.graphEdges.add({ projectId, ...data })
}

export async function updateGraphEdge(id, data) {
  return db.graphEdges.update(id, data)
}

export async function deleteGraphEdge(id) {
  return db.graphEdges.delete(id)
}

export async function clearAllGraphEdges(projectId) {
  const allEdges = await db.graphEdges.where('projectId').equals(projectId).toArray()
  const edgeIds = allEdges.map(e => e.id)
  if (edgeIds.length > 0) {
    await db.graphEdges.bulkDelete(edgeIds)
  }
  return edgeIds.length
}

export async function getNodePositions(projectId) {
  const result = await db.nodePositions.where('projectId').equals(projectId).first()
  return result?.positions || {}
}

export async function saveNodePositions(projectId, positions) {
  const plainPositions = deepPlain(positions)
  const existing = await db.nodePositions.where('projectId').equals(projectId).first()
  if (existing) {
    return db.nodePositions.update(existing.id, { positions: plainPositions })
  } else {
    return db.nodePositions.add({ projectId, positions: plainPositions })
  }
}

export async function getNodeInstances(projectId) {
  const result = await db.nodePositions.where('projectId').equals(projectId).first()
  return result?.instances || {}
}

export async function saveNodeInstances(projectId, instances) {
  const plainInstances = deepPlain(instances)
  const existing = await db.nodePositions.where('projectId').equals(projectId).first()
  if (existing) {
    return db.nodePositions.update(existing.id, { instances: plainInstances })
  } else {
    return db.nodePositions.add({ projectId, instances: plainInstances })
  }
}

export async function getGraphGroups(projectId) {
  const result = await db.graphGroups.where('projectId').equals(projectId).first()
  return result?.groups || []
}

export async function saveGraphGroups(projectId, groups) {
  const plainGroups = deepPlain(groups)
  const existing = await db.graphGroups.where('projectId').equals(projectId).first()
  if (existing) {
    return db.graphGroups.update(existing.id, { groups: plainGroups })
  } else {
    return db.graphGroups.add({ projectId, groups: plainGroups })
  }
}

export async function getNodeParents(projectId) {
  const result = await db.graphGroups.where('projectId').equals(projectId).first()
  return result?.nodeParents || {}
}

export async function saveNodeParents(projectId, nodeParents) {
  const plainParents = deepPlain(nodeParents)
  const existing = await db.graphGroups.where('projectId').equals(projectId).first()
  if (existing) {
    return db.graphGroups.update(existing.id, { nodeParents: plainParents })
  } else {
    return db.graphGroups.add({ projectId, groups: [], nodeParents: plainParents })
  }
}

export async function getGroupEdges(projectId) {
  return db.groupEdges.where('projectId').equals(projectId).toArray()
}

export async function addGroupEdge(projectId, data) {
  const now = new Date().toISOString()
  return db.groupEdges.add({ projectId, createdAt: now, ...data })
}

export async function updateGroupEdge(id, data) {
  return db.groupEdges.update(id, data)
}

export async function deleteGroupEdge(id) {
  return db.groupEdges.delete(id)
}

export async function getSnapshots(projectId, chapterId = null) {
  let query = db.snapshots.where('projectId').equals(projectId)
  let results = await query.toArray()
  if (chapterId !== null) {
    results = results.filter(s => s.chapterId === chapterId)
  }
  return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export async function addSnapshot(projectId, chapterId, content, label = '') {
  return db.snapshots.add({
    projectId,
    chapterId,
    content,
    label,
    timestamp: new Date().toISOString()
  })
}

export async function getSnapshot(id) {
  return db.snapshots.get(id)
}

export async function deleteSnapshot(id) {
  return db.snapshots.delete(id)
}

export async function getSceneSnapshots(projectId, chapterId) {
  return db.snapshots
    .where('projectId')
    .equals(projectId)
    .filter(s => s.chapterId === chapterId)
    .toArray()
    .then(arr => arr.sort((a, b) => b.timestamp.localeCompare(a.timestamp)))
}
