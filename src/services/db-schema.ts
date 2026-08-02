// See docs/database-schema-changelog.md for full per-version rationale.
export const SCHEMA_VERSIONS = [
  {
    // v11: Initial schema — 21 core tables (projects, characters, scenes, etc.)
    version: 11,
    stores: {
      projects: '++id, name, createdAt, updatedAt, genre, synopsis',
      manuscripts: '++id, projectId, content, wordCount, updatedAt',
      characters: '++id, projectId, name, role, goal, voice, notes, color',
      characterRelationships: '++id, projectId, fromCharacterId, toCharacterId, type, notes',
      locations: '++id, projectId, name, description, notes',
      plotThreads: '++id, projectId, title, status, notes',
      sparkHistory: '++id, projectId, type, prompt, blueprint, createdAt',
      annotations: '++id, projectId, paragraphIndex, type, original, suggestion, reason, status',
      snippets: '++id, projectId, word, count, lastSeen',
      dailyGoals: '++id, projectId, date, [projectId+date]',
      revisionComments:
        '++id, projectId, paragraphIndex, startOffset, endOffset, selectedText, comment, createdAt',
      storyElements: '++id, projectId, type, title, x, y, width, height, data',
      graphEdges:
        '++id, projectId, sourceId, sourceType, targetId, targetType, relationshipType, volumeId',
      groupEdges: '++id, projectId, sourceGroupId, targetGroupId, relationshipType',
      snapshots: '++id, projectId, chapterId, timestamp, label',
      volumes: '++id, projectId, title, description, color, chapterIds',
      volumeEntities:
        '++id, volumeId, entityType, entityId, isPrimary, assignedAt, &[volumeId+entityType+entityId]'
    }
  },
  {
    // v12: +portrait on characters
    version: 12,
    stores: {
      characters: '++id, projectId, name, role, goal, voice, notes, color, portrait'
    }
  },
  {
    // v13: Added sections + subsections (replaces chapters/scenes concept)
    version: 13,
    stores: {
      sections: '++id, projectId, title, summary, order, status, *tags, volumeId',
      subsections: '++id, projectId, sectionId, title, summary, order, content, *tags'
    }
  },
  {
    // v14: +sessionArchive, authorProfile, storyStateSnapshots
    version: 14,
    stores: {
      sessionArchive: '++id, projectId, timestamp, type, signal',
      authorProfile: '++id, projectId',
      storyStateSnapshots: '++id, projectId, timestamp'
    }
  },
  // v15: +lastEditedAt on characters, +storyDocuments table
  {
    version: 15,
    stores: {
      characters: '++id, projectId, name, role, goal, voice, notes, color, portrait, lastEditedAt',
      storyDocuments: '++id, projectId, docType, content, updatedAt'
    }
  },
  // v16: +generatedStories
  {
    version: 16,
    stores: {
      generatedStories: '++id, projectId, title, generatedAt, totalWords, qualityScore'
    }
  },
  // v17: +voiceProfiles
  {
    version: 17,
    stores: {
      voiceProfiles: '++id, projectId, createdAt, updatedAt'
    }
  },
  // v18: +[projectId+docType] on storyDocuments
  {
    version: 18,
    stores: {
      storyDocuments: '++id, projectId, docType, content, updatedAt, [projectId+docType]'
    }
  },
  // v19: +researchDocuments, researchChunks
  {
    version: 19,
    stores: {
      researchDocuments: '++id, projectId, fileName, fileType, importedAt',
      researchChunks: '++id, documentId, projectId, chunkIndex, embeddingStatus'
    }
  },
  // v20: No-op placeholder (re-index)
  {
    version: 20,
    stores: {}
  },
  // v21: +researchTags
  {
    version: 21,
    stores: {
      researchTags: '++id, name, projectId, [projectId+name]'
    }
  },
  // v22: +sync fields (apiId, syncStatus, lastSyncedAt) on 10 tables, +pendingDeletions
  {
    version: 22,
    stores: {
      projects:
        '++id, name, createdAt, updatedAt, genre, synopsis, apiId, syncStatus, lastSyncedAt',
      manuscripts:
        '++id, projectId, content, wordCount, updatedAt, apiId, syncStatus, lastSyncedAt',
      characters:
        '++id, projectId, name, role, goal, voice, notes, color, portrait, lastEditedAt, apiId, syncStatus, lastSyncedAt',
      characterRelationships:
        '++id, projectId, fromCharacterId, toCharacterId, type, notes, apiId, syncStatus, lastSyncedAt',
      locations: '++id, projectId, name, description, notes, apiId, syncStatus, lastSyncedAt',
      plotThreads: '++id, projectId, title, status, notes, apiId, syncStatus, lastSyncedAt',
      sections:
        '++id, projectId, title, summary, order, status, *tags, volumeId, apiId, syncStatus, lastSyncedAt',
      subsections:
        '++id, projectId, sectionId, title, summary, order, content, *tags, apiId, syncStatus, lastSyncedAt',
      volumes:
        '++id, projectId, title, description, color, chapterIds, apiId, syncStatus, lastSyncedAt',
      volumeEntities:
        '++id, volumeId, entityType, entityId, isPrimary, assignedAt, &[volumeId+entityType+entityId], apiId, syncStatus, lastSyncedAt',
      pendingDeletions: '++id, table, apiId, deletedAt'
    }
  },
  // v23: +embeddingCache
  {
    version: 23,
    stores: {
      embeddingCache: '&hash, createdAt'
    }
  },
  // v24: +sync fields on researchDocuments
  {
    version: 24,
    stores: {
      researchDocuments:
        '++id, projectId, fileName, fileType, importedAt, apiId, syncStatus, lastSyncedAt'
    }
  },
  // v25: No-op placeholder (re-index)
  {
    version: 25,
    stores: {}
  },
  // v26: +userId on projects, +users table
  {
    version: 26,
    stores: {
      projects:
        '++id, userId, name, createdAt, updatedAt, genre, synopsis, apiId, syncStatus, lastSyncedAt',
      users: '++id, passwordHash, displayName, createdAt, &username'
    }
  },
  // v27: +dialogueIndex
  {
    version: 27,
    stores: {
      dialogueIndex: '++id, projectId, paragraphIndex, speakerId, sectionId, [projectId+speakerId]'
    }
  },
  // v28: +storyShapeAnalysis
  {
    version: 28,
    stores: {
      storyShapeAnalysis:
        '++id, projectId, sceneId, version, analyzedAt, [projectId+sceneId], [projectId+version]'
    }
  },
  // v29: +chatSessions
  {
    version: 29,
    stores: {
      chatSessions: '++id, projectId, updatedAt'
    }
  },
  // v30: +genRuns
  {
    version: 30,
    stores: {
      genRuns: '++id, &projectId, updatedAt'
    }
  },
  // v31: +generationStatus/contentStatus/createdAt/updatedAt on chars/locs/threads/subsections
  {
    version: 31,
    stores: {
      characters:
        '++id, projectId, name, role, goal, voice, notes, color, portrait, lastEditedAt, generationStatus, apiId, syncStatus, lastSyncedAt',
      locations:
        '++id, projectId, name, description, notes, generationStatus, apiId, syncStatus, lastSyncedAt',
      plotThreads:
        '++id, projectId, title, status, notes, generationStatus, apiId, syncStatus, lastSyncedAt',
      subsections:
        '++id, projectId, sectionId, title, summary, order, content, *tags, contentStatus, apiId, syncStatus, lastSyncedAt'
    }
  },
  // v32: +projectBlurbs
  {
    version: 32,
    stores: {
      projectBlurbs: '++id, projectId, generatedAt'
    }
  },
  // v33: +evalResults
  {
    version: 33,
    stores: {
      evalResults: '++id, projectId, sceneId, timestamp, evalType, score'
    }
  },
  // v34: +branches table, +branchId + [projectId+branchId] on sections/subsections
  {
    version: 34,
    stores: {
      branches: '++id, projectId, name, sourceBranchId, createdAt, updatedAt',
      sections:
        '++id, projectId, title, summary, order, status, *tags, volumeId, branchId, [projectId+branchId], apiId, syncStatus, lastSyncedAt',
      subsections:
        '++id, projectId, sectionId, title, summary, order, content, *tags, contentStatus, branchId, [projectId+branchId], apiId, syncStatus, lastSyncedAt'
    }
  },
  // v35: +description, status on branches (re-declares sections/subsections unchanged)
  {
    version: 35,
    stores: {
      branches: '++id, projectId, name, sourceBranchId, description, status, createdAt, updatedAt',
      sections:
        '++id, projectId, title, summary, order, status, *tags, volumeId, branchId, [projectId+branchId], apiId, syncStatus, lastSyncedAt',
      subsections:
        '++id, projectId, sectionId, title, summary, order, content, *tags, contentStatus, branchId, [projectId+branchId], apiId, syncStatus, lastSyncedAt'
    }
  },
  // v36: Normalized graph tables — graphNodePositions, graphGroupsV2, graphNodeParents.
  {
    version: 36,
    stores: {
      graphNodePositions: '[projectId+nodeId], projectId, nodeId, nodeType, x, y',
      graphGroupsV2: '&id, projectId, name, color, x, y, width, height, groupOrder',
      graphNodeParents: '[projectId+nodeId], projectId, nodeId, nodeType, groupId'
    }
  },
  // v37: Compound indexes on query hotspots — evalResults, optimizationSessions, sparkHistory
  {
    version: 37,
    stores: {
      evalResults:
        '++id, projectId, sceneId, timestamp, evalType, score, [projectId+sceneId], [projectId+evalType], [projectId+sceneId+evalType]',
      optimizationSessions: '++id, projectId, sceneId, timestamp, [projectId+sceneId]',
      snapshots: '++id, projectId, chapterId, timestamp, label, [projectId+chapterId]',
      sparkHistory: '++id, projectId, type, prompt, blueprint, createdAt, [projectId+type]'
    }
  },
  // v38: +aiResponseCache
  {
    version: 38,
    stores: {
      aiResponseCache: '&hash, createdAt, [provider+model+temperature+feature]'
    }
  },
  // v39: +graphNodeInstances, drops nodePositions
  {
    version: 39,
    stores: {
      graphNodeInstances: '[projectId+nodeId], projectId, nodeId'
    }
  },
  // v40: +syncStatus, lastSyncedAt on researchChunks
  {
    version: 40,
    stores: {
      researchChunks: '++id, documentId, projectId, chunkIndex, embeddingStatus, syncStatus, lastSyncedAt'
    }
  },
  // v41: +syncStatus, lastSyncedAt on researchTags (was missing from v22 sync expansion)
  {
    version: 41,
    stores: {
      researchTags: '++id, name, projectId, [projectId+name], syncStatus, lastSyncedAt'
    }
  },
  // v42: +syncStatus, lastSyncedAt on branches (was missing from v34/v35)
  {
    version: 42,
    stores: {
      branches: '++id, projectId, name, sourceBranchId, description, status, createdAt, updatedAt, syncStatus, lastSyncedAt'
    }
  },
  // v43: +evalPreferences for pairwise draft ranking
  {
    version: 43,
    stores: {
      evalPreferences: '++id, winnerId, loserId, sceneId, timestamp, projectId, [projectId+sceneId]'
    }
  },
  /**
   * v44: +sceneDigests — the derived-artifact layer.
   *
   * Whole-manuscript analysis currently re-reads raw prose every time: the beta
   * reader runs one sequential LLM call per scene to build a fact ledger, which
   * on a 300-chapter manuscript is hours, and then concatenates the entire
   * ledger into a single prompt. A digest computed ONCE per scene, at commit
   * time, from data the writer already produced turns every O(n) pass into
   * O(dirty).
   *
   * `contentHash` is the invalidation key — a scene whose prose has not changed
   * does not need recomputing. `[projectId+subsectionId]` is unique: one live
   * digest per scene, replaced rather than accumulated.
   */
  {
    version: 44,
    stores: {
      sceneDigests:
        '++id, projectId, subsectionId, contentHash, updatedAt, &[projectId+subsectionId]'
    }
  },
  /**
   * v45: +chapterDigests, volumeDigests, entityStates — hierarchical rollup and
   * entity-state timeline for contradiction candidate generation.
   *
   * Phase 2 of the offline-first architecture: instead of a flat O(n²) scan
   * over all scenes, we now have:
   * - scene digest → chapter digest → volume digest → book digest hierarchy
   * - entityStates table keyed by entity ID for O(n·k) candidate filtering
   * - deterministic contradiction rules that run before any LLM call
   */
  {
    version: 45,
    stores: {
      chapterDigests:
        '++id, projectId, chapterNumber, volumeId, contentHash, updatedAt, &[projectId+chapterNumber]',
      volumeDigests:
        '++id, projectId, volumeId, contentHash, updatedAt, &[projectId+volumeId]',
      entityStates:
        '++id, projectId, entityType, entityId, sceneId, stateHash, updatedAt, &[projectId+entityType+entityId+sceneId]'
    }
  },
  /**
   * v46: +analysisQueue — persistent idle-priority work queue for analysis tasks.
   *
   * Phase 3 of the offline-first architecture: the digest layer and hierarchy
   * exist, but the backfill still runs in-memory and loses progress on tab close.
   * This queue persists work items so analysis can resume after tab close/crash,
   * surfaces progress, and runs at idle priority via `awaitForegroundIdle`.
   *
   * Each queue item represents a unit of work (e.g., "build scene digest for X").
   * Items are processed at idle priority and can be resumed after crash/close.
   */
  {
    version: 46,
    stores: {
      analysisQueue:
        '++id, projectId, taskType, payload, status, createdAt, updatedAt, [projectId+status]'
    }
  }
]
