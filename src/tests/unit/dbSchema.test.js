import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '@/services/db-core'

// Locks the resolved Dexie schema (the final schema every client converges to,
// since the app always opens at the latest version). Guards against accidental
// index changes and, in particular, proves that compacting the version chain
// leaves the effective schema byte-identical. If you intentionally change the
// schema, bump the version and update the expected map below.
// See docs/database-schema-changelog.md for per-version documentation.
const EXPECTED = {
  aiResponseCache: 'hash | [provider+model+temperature+feature], createdAt',
  analysisQueue:
    '++id | [projectId+status], createdAt, payload, projectId, status, taskType, updatedAt',
  annotations: '++id | original, paragraphIndex, projectId, reason, status, suggestion, type',
  authorProfile: '++id | projectId',
  // v42 added syncStatus + lastSyncedAt so branches participate in backend sync.
  branches:
    '++id | createdAt, description, lastSyncedAt, name, projectId, sourceBranchId, status, syncStatus, updatedAt',
  characterRelationships:
    '++id | apiId, fromCharacterId, lastSyncedAt, notes, projectId, syncStatus, toCharacterId, type',
  characters:
    '++id | apiId, color, generationStatus, goal, lastEditedAt, lastSyncedAt, name, notes, portrait, projectId, role, syncStatus, voice',
  chatSessions: '++id | projectId, updatedAt',
  dailyGoals: '++id | [projectId+date], date, projectId',
  dialogueIndex: '++id | [projectId+speakerId], paragraphIndex, projectId, sectionId, speakerId',
  embeddingCache: 'hash | createdAt',
  // v43: pairwise draft ranking (see services/db-preferences.ts).
  evalPreferences: '++id | [projectId+sceneId], loserId, projectId, sceneId, timestamp, winnerId',
  evalResults:
    '++id | [projectId+evalType], [projectId+sceneId+evalType], [projectId+sceneId], evalType, projectId, sceneId, score, timestamp',
  genRuns: '++id | &projectId, updatedAt',
  generatedStories: '++id | generatedAt, projectId, qualityScore, title, totalWords',
  // v47: edges carry a validity window in chapter-space, so a relationship that
  // reverses mid-book is representable instead of being dropped as a duplicate.
  graphEdges:
    '++id | [projectId+validFromChapter], projectId, relationshipType, runId, sourceId, sourceType, targetId, targetType, validFromChapter, validUntilChapter, volumeId',
  graphGroupsV2: 'id | color, groupOrder, height, name, projectId, width, x, y',
  graphNodeParents: '[projectId+nodeId] | groupId, nodeId, nodeType, projectId',
  graphNodePositions: '[projectId+nodeId] | nodeId, nodeType, projectId, x, y',
  groupEdges: '++id | projectId, relationshipType, sourceGroupId, targetGroupId',
  locations:
    '++id | apiId, description, generationStatus, lastSyncedAt, name, notes, projectId, syncStatus',
  manuscripts: '++id | apiId, content, lastSyncedAt, projectId, syncStatus, updatedAt, wordCount',
  graphNodeInstances: '[projectId+nodeId] | nodeId, projectId',
  optimizationSessions: '++id | [projectId+sceneId], projectId, sceneId, timestamp',
  pendingDeletions: '++id | apiId, deletedAt, table',
  plotThreads:
    '++id | apiId, generationStatus, lastSyncedAt, notes, projectId, status, syncStatus, title',
  projectBlurbs: '++id | generatedAt, projectId',
  // v44: the derived-artifact layer. `&[projectId+subsectionId]` is unique —
  // one live digest per scene, replaced rather than accumulated.
  sceneDigests: '++id | &[projectId+subsectionId], contentHash, projectId, subsectionId, updatedAt',
  // v45: hierarchical digest rollup + entity-state timeline for contradiction detection.
  chapterDigests:
    '++id | &[projectId+chapterNumber], chapterNumber, contentHash, projectId, updatedAt, volumeId',
  volumeDigests: '++id | &[projectId+volumeId], contentHash, projectId, updatedAt, volumeId',
  // v47: +[projectId+sceneId] (replace-per-scene, and the key the previously
  // unreachable per-scene query needed), +[projectId+chapterNumber] (chapter
  // slice), +[projectId+entityType+entityId] (which getEntityStatesForEntity
  // queried without it ever having been declared).
  entityStates:
    '++id | &[projectId+entityType+entityId+sceneId], [projectId+chapterNumber], [projectId+entityType+entityId], [projectId+sceneId], entityId, entityType, projectId, sceneId, stateHash, updatedAt',
  // v46: +analysisQueue — persistent idle-priority work queue for analysis tasks.
  analysisQueue:
    '++id | [projectId+status], createdAt, payload, projectId, status, taskType, updatedAt',
  projects:
    '++id | apiId, createdAt, genre, lastSyncedAt, name, syncStatus, synopsis, updatedAt, userId',
  researchChunks:
    '++id | chunkIndex, documentId, embeddingStatus, lastSyncedAt, projectId, syncStatus',
  researchDocuments:
    '++id | apiId, fileName, fileType, importedAt, lastSyncedAt, projectId, syncStatus',
  researchTags: '++id | [projectId+name], lastSyncedAt, name, projectId, syncStatus',
  revisionComments:
    '++id | comment, createdAt, endOffset, paragraphIndex, projectId, selectedText, startOffset',
  sections:
    '++id | *tags, [projectId+branchId], apiId, branchId, lastSyncedAt, order, projectId, status, summary, syncStatus, title, volumeId',
  sessionArchive: '++id | projectId, signal, timestamp, type',
  snapshots: '++id | [projectId+chapterId], chapterId, label, projectId, timestamp',
  snippets: '++id | count, lastSeen, projectId, word',
  sparkHistory: '++id | [projectId+type], blueprint, createdAt, projectId, prompt, type',
  storyDocuments: '++id | [projectId+docType], content, docType, projectId, updatedAt',
  storyElements: '++id | data, height, projectId, title, type, width, x, y',
  storyShapeAnalysis:
    '++id | [projectId+sceneId], [projectId+version], analyzedAt, projectId, sceneId, version',
  storyStateSnapshots: '++id | projectId, timestamp',
  subsections:
    '++id | *tags, [projectId+branchId], apiId, branchId, content, contentStatus, lastSyncedAt, order, projectId, sectionId, summary, syncStatus, title',
  users: '++id | &username, createdAt, displayName, passwordHash',
  voiceProfiles: '++id | createdAt, projectId, updatedAt',
  volumeEntities:
    '++id | &[volumeId+entityType+entityId], apiId, assignedAt, entityId, entityType, isPrimary, lastSyncedAt, syncStatus, volumeId',
  volumes:
    '++id | apiId, chapterIds, color, description, lastSyncedAt, projectId, syncStatus, title',
  volumeDigests: '++id | &[projectId+volumeId], contentHash, projectId, updatedAt, volumeId'
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
    expect(verno).toBe(47)
  })

  it('has exactly the expected set of tables', () => {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  it('resolves every table to the expected primary key + indexes', () => {
    expect(actual).toEqual(EXPECTED)
  })
})
