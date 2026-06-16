import Dexie from 'dexie'
import { toRaw } from 'vue'

export function deepPlain(obj) {
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
}).upgrade(async (trans) => {
  await trans.graphEdges.toCollection().modify({ volumeId: null })
})

db.version(12).stores({
  projects: '++id, name, createdAt, updatedAt, genre, synopsis',
  manuscripts: '++id, projectId, content, wordCount, updatedAt',
  characters: '++id, projectId, name, role, goal, voice, notes, color, portrait',
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

db.version(13).stores({
  projects: '++id, name, createdAt, updatedAt, genre, synopsis',
  manuscripts: '++id, projectId, content, wordCount, updatedAt',
  characters: '++id, projectId, name, role, goal, voice, notes, color, portrait',
  characterRelationships: '++id, projectId, fromCharacterId, toCharacterId, type, notes',
  locations: '++id, projectId, name, description, notes',
  plotThreads: '++id, projectId, title, status, notes',
  chapters: '++id, projectId, title, summary, order, status, *tags, volumeId',
  scenes: '++id, projectId, chapterId, title, summary, order, content, *tags',
  sections: '++id, projectId, title, summary, order, status, *tags, volumeId',
  subsections: '++id, projectId, sectionId, title, summary, order, content, *tags',
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
}).upgrade(async (trans) => {
  const chapters = await trans.chapters.toArray()
  for (const ch of chapters) {
    await trans.sections.add({
      ...ch,
      projectId: ch.projectId,
      title: ch.title,
      summary: ch.summary,
      order: ch.order,
      status: ch.status,
      tags: ch.tags,
      volumeId: ch.volumeId
    })
  }
  
  const scenes = await trans.scenes.toArray()
  for (const sc of scenes) {
    await trans.subsections.add({
      ...sc,
      projectId: sc.projectId,
      sectionId: sc.chapterId,
      title: sc.title,
      summary: sc.summary,
      order: sc.order,
      content: sc.content,
      tags: sc.tags
    })
  }
})

db.version(14).stores({
  projects: '++id, name, createdAt, updatedAt, genre, synopsis',
  manuscripts: '++id, projectId, content, wordCount, updatedAt',
  characters: '++id, projectId, name, role, goal, voice, notes, color, portrait',
  characterRelationships: '++id, projectId, fromCharacterId, toCharacterId, type, notes',
  locations: '++id, projectId, name, description, notes',
  plotThreads: '++id, projectId, title, status, notes',
  chapters: '++id, projectId, title, summary, order, status, *tags, volumeId',
  scenes: '++id, projectId, chapterId, title, summary, order, content, *tags',
  sections: '++id, projectId, title, summary, order, status, *tags, volumeId',
  subsections: '++id, projectId, sectionId, title, summary, order, content, *tags',
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
  volumeEntities: '++id, volumeId, entityType, entityId, isPrimary, assignedAt, &[volumeId+entityType+entityId]',
  sessionArchive: '++id, projectId, timestamp, type, signal',
  authorProfile: '++id, projectId',
  storyStateSnapshots: '++id, projectId, timestamp'
})

db.version(15).stores({
  projects: '++id, name, createdAt, updatedAt, genre, synopsis',
  manuscripts: '++id, projectId, content, wordCount, updatedAt',
  characters: '++id, projectId, name, role, goal, voice, notes, color, portrait, lastEditedAt',
  characterRelationships: '++id, projectId, fromCharacterId, toCharacterId, type, notes',
  locations: '++id, projectId, name, description, notes',
  plotThreads: '++id, projectId, title, status, notes',
  sections: '++id, projectId, title, summary, order, status, *tags, volumeId',
  subsections: '++id, projectId, sectionId, title, summary, order, content, *tags',
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
  volumeEntities: '++id, volumeId, entityType, entityId, isPrimary, assignedAt, &[volumeId+entityType+entityId]',
  sessionArchive: '++id, projectId, timestamp, type, signal',
  authorProfile: '++id, projectId',
  storyStateSnapshots: '++id, projectId, timestamp',
  storyDocuments: '++id, projectId, docType, content, updatedAt'
})

db.version(16).stores({
  projects: '++id, name, createdAt, updatedAt, genre, synopsis',
  manuscripts: '++id, projectId, content, wordCount, updatedAt',
  characters: '++id, projectId, name, role, goal, voice, notes, color, portrait, lastEditedAt',
  characterRelationships: '++id, projectId, fromCharacterId, toCharacterId, type, notes',
  locations: '++id, projectId, name, description, notes',
  plotThreads: '++id, projectId, title, status, notes',
  sections: '++id, projectId, title, summary, order, status, *tags, volumeId',
  subsections: '++id, projectId, sectionId, title, summary, order, content, *tags',
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
  volumeEntities: '++id, volumeId, entityType, entityId, isPrimary, assignedAt, &[volumeId+entityType+entityId]',
  sessionArchive: '++id, projectId, timestamp, type, signal',
  authorProfile: '++id, projectId',
  storyStateSnapshots: '++id, projectId, timestamp',
  storyDocuments: '++id, projectId, docType, content, updatedAt',
  generatedStories: '++id, projectId, title, generatedAt, totalWords, qualityScore'
})

db.version(17).stores({
  projects: '++id, name, createdAt, updatedAt, genre, synopsis',
  manuscripts: '++id, projectId, content, wordCount, updatedAt',
  characters: '++id, projectId, name, role, goal, voice, notes, color, portrait, lastEditedAt',
  characterRelationships: '++id, projectId, fromCharacterId, toCharacterId, type, notes',
  locations: '++id, projectId, name, description, notes',
  plotThreads: '++id, projectId, title, status, notes',
  sections: '++id, projectId, title, summary, order, status, *tags, volumeId',
  subsections: '++id, projectId, sectionId, title, summary, order, content, *tags',
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
  volumeEntities: '++id, volumeId, entityType, entityId, isPrimary, assignedAt, &[volumeId+entityType+entityId]',
  sessionArchive: '++id, projectId, timestamp, type, signal',
  authorProfile: '++id, projectId',
  storyStateSnapshots: '++id, projectId, timestamp',
  storyDocuments: '++id, projectId, docType, content, updatedAt',
  generatedStories: '++id, projectId, title, generatedAt, totalWords, qualityScore',
  voiceProfiles: '++id, projectId, createdAt, updatedAt'
})

db.version(18).stores({
  projects: '++id, name, createdAt, updatedAt, genre, synopsis',
  manuscripts: '++id, projectId, content, wordCount, updatedAt',
  characters: '++id, projectId, name, role, goal, voice, notes, color, portrait, lastEditedAt',
  characterRelationships: '++id, projectId, fromCharacterId, toCharacterId, type, notes',
  locations: '++id, projectId, name, description, notes',
  plotThreads: '++id, projectId, title, status, notes',
  sections: '++id, projectId, title, summary, order, status, *tags, volumeId',
  subsections: '++id, projectId, sectionId, title, summary, order, content, *tags',
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
  volumeEntities: '++id, volumeId, entityType, entityId, isPrimary, assignedAt, &[volumeId+entityType+entityId]',
  sessionArchive: '++id, projectId, timestamp, type, signal',
  authorProfile: '++id, projectId',
  storyStateSnapshots: '++id, projectId, timestamp',
  storyDocuments: '++id, projectId, docType, content, updatedAt, [projectId+docType]',
  generatedStories: '++id, projectId, title, generatedAt, totalWords, qualityScore',
  voiceProfiles: '++id, projectId, createdAt, updatedAt'
})

db.version(19).stores({
  projects: '++id, name, createdAt, updatedAt, genre, synopsis',
  manuscripts: '++id, projectId, content, wordCount, updatedAt',
  characters: '++id, projectId, name, role, goal, voice, notes, color, portrait, lastEditedAt',
  characterRelationships: '++id, projectId, fromCharacterId, toCharacterId, type, notes',
  locations: '++id, projectId, name, description, notes',
  plotThreads: '++id, projectId, title, status, notes',
  sections: '++id, projectId, title, summary, order, status, *tags, volumeId',
  subsections: '++id, projectId, sectionId, title, summary, order, content, *tags',
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
  volumeEntities: '++id, volumeId, entityType, entityId, isPrimary, assignedAt, &[volumeId+entityType+entityId]',
  sessionArchive: '++id, projectId, timestamp, type, signal',
  authorProfile: '++id, projectId',
  storyStateSnapshots: '++id, projectId, timestamp',
  storyDocuments: '++id, projectId, docType, content, updatedAt, [projectId+docType]',
  generatedStories: '++id, projectId, title, generatedAt, totalWords, qualityScore',
  voiceProfiles: '++id, projectId, createdAt, updatedAt',
  researchDocuments: '++id, projectId, fileName, fileType, importedAt',
  researchChunks: '++id, documentId, projectId, chunkIndex, embeddingStatus'
})

db.version(20).stores({
  researchChunks: '++id, documentId, projectId, chunkIndex, embeddingStatus'
})

db.version(21).stores({
  projects: '++id, name, createdAt, updatedAt, genre, synopsis',
  manuscripts: '++id, projectId, content, wordCount, updatedAt',
  characters: '++id, projectId, name, role, goal, voice, notes, color, portrait, lastEditedAt',
  characterRelationships: '++id, projectId, fromCharacterId, toCharacterId, type, notes',
  locations: '++id, projectId, name, description, notes',
  plotThreads: '++id, projectId, title, status, notes',
  sections: '++id, projectId, title, summary, order, status, *tags, volumeId',
  subsections: '++id, projectId, sectionId, title, summary, order, content, *tags',
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
  volumeEntities: '++id, volumeId, entityType, entityId, isPrimary, assignedAt, &[volumeId+entityType+entityId]',
  sessionArchive: '++id, projectId, timestamp, type, signal',
  authorProfile: '++id, projectId',
  storyStateSnapshots: '++id, projectId, timestamp',
  storyDocuments: '++id, projectId, docType, content, updatedAt, [projectId+docType]',
  generatedStories: '++id, projectId, title, generatedAt, totalWords, qualityScore',
  voiceProfiles: '++id, projectId, createdAt, updatedAt',
  researchDocuments: '++id, projectId, fileName, fileType, importedAt',
  researchChunks: '++id, documentId, projectId, chunkIndex, embeddingStatus',
  researchTags: '++id, name, projectId, [projectId+name]'
})

db.on('ready', async () => {
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
