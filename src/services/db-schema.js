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
      chapters: '++id, projectId, title, summary, order, status, *tags, volumeId',
      scenes: '++id, projectId, chapterId, title, summary, order, content, *tags',
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
      nodePositions: '++id, projectId',
      graphGroups: '++id, projectId',
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
      projects: '++id, name, createdAt, updatedAt, genre, synopsis, apiId, syncStatus, lastSyncedAt',
      manuscripts: '++id, projectId, content, wordCount, updatedAt, apiId, syncStatus, lastSyncedAt',
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
  }
]
