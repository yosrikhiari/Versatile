import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '@/services/db-core'

// Locks the resolved Dexie schema (the final schema every client converges to,
// since the app always opens at the latest version). Guards against accidental
// index changes and, in particular, proves that compacting the version chain
// leaves the effective schema byte-identical. If you intentionally change the
// schema, bump the version and update the expected map below.
const EXPECTED = {
  annotations: '++id | original, paragraphIndex, projectId, reason, status, suggestion, type',
  authorProfile: '++id | projectId',
  chapters: '++id | *tags, order, projectId, status, summary, title, volumeId',
  characterRelationships:
    '++id | apiId, fromCharacterId, lastSyncedAt, notes, projectId, syncStatus, toCharacterId, type',
  characters:
    '++id | apiId, color, generationStatus, goal, lastEditedAt, lastSyncedAt, name, notes, portrait, projectId, role, syncStatus, voice',
  chatSessions: '++id | projectId, updatedAt',
  dailyGoals: '++id | [projectId+date], date, projectId',
  dialogueIndex: '++id | [projectId+speakerId], paragraphIndex, projectId, sectionId, speakerId',
  embeddingCache: 'hash | createdAt',
  evalResults: '++id | evalType, projectId, sceneId, score, timestamp',
  genRuns: '++id | &projectId, updatedAt',
  optimizationSessions: '++id | projectId, sceneId, status, timestamp',
  generatedStories: '++id | generatedAt, projectId, qualityScore, title, totalWords',
  graphEdges:
    '++id | projectId, relationshipType, sourceId, sourceType, targetId, targetType, volumeId',
  graphGroups: '++id | projectId',
  groupEdges: '++id | projectId, relationshipType, sourceGroupId, targetGroupId',
  locations:
    '++id | apiId, description, generationStatus, lastSyncedAt, name, notes, projectId, syncStatus',
  manuscripts: '++id | apiId, content, lastSyncedAt, projectId, syncStatus, updatedAt, wordCount',
  nodePositions: '++id | projectId',
  pendingDeletions: '++id | apiId, deletedAt, table',
  plotThreads:
    '++id | apiId, generationStatus, lastSyncedAt, notes, projectId, status, syncStatus, title',
  projectBlurbs: '++id | generatedAt, projectId',
  projects:
    '++id | apiId, createdAt, genre, lastSyncedAt, name, syncStatus, synopsis, updatedAt, userId',
  researchChunks: '++id | chunkIndex, documentId, embeddingStatus, projectId',
  researchDocuments:
    '++id | apiId, fileName, fileType, importedAt, lastSyncedAt, projectId, syncStatus',
  researchTags: '++id | [projectId+name], name, projectId',
  revisionComments:
    '++id | comment, createdAt, endOffset, paragraphIndex, projectId, selectedText, startOffset',
  scenes: '++id | *tags, chapterId, content, order, projectId, summary, title',
  sections:
    '++id | *tags, apiId, lastSyncedAt, order, projectId, status, summary, syncStatus, title, volumeId',
  sessionArchive: '++id | projectId, signal, timestamp, type',
  snapshots: '++id | chapterId, label, projectId, timestamp',
  snippets: '++id | count, lastSeen, projectId, word',
  sparkHistory: '++id | blueprint, createdAt, projectId, prompt, type',
  storyDocuments: '++id | [projectId+docType], content, docType, projectId, updatedAt',
  storyElements: '++id | data, height, projectId, title, type, width, x, y',
  storyShapeAnalysis:
    '++id | [projectId+sceneId], [projectId+version], analyzedAt, projectId, sceneId, version',
  storyStateSnapshots: '++id | projectId, timestamp',
  subsections:
    '++id | *tags, apiId, content, contentStatus, lastSyncedAt, order, projectId, sectionId, summary, syncStatus, title',
  users: '++id | &username, createdAt, displayName, passwordHash',
  voiceProfiles: '++id | createdAt, projectId, updatedAt',
  volumeEntities:
    '++id | &[volumeId+entityType+entityId], apiId, assignedAt, entityId, entityType, isPrimary, lastSyncedAt, syncStatus, volumeId',
  volumes:
    '++id | apiId, chapterIds, color, description, lastSyncedAt, projectId, syncStatus, title'
}

describe('resolved Dexie schema', () => {
  let actual = {}
  let verno = 0
  beforeAll(async () => {
    await db.open()
    verno = db.verno
    for (const t of db.tables) {
      const primKey = t.schema.primKey.src
      const indexes = t.schema.indexes.map((i) => i.src).sort()
      actual[t.name] = `${primKey} | ${indexes.join(', ')}`
    }
  })

  it('opens at the expected version', () => {
    expect(verno).toBe(34)
  })

  it('has exactly the expected set of tables', () => {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  it('resolves every table to the expected primary key + indexes', () => {
    expect(actual).toEqual(EXPECTED)
  })
})
