import Dexie from 'dexie'
import { toRaw } from 'vue'

const DEV_MODE = false

export function deepPlain(obj) {
  return JSON.parse(JSON.stringify(toRaw(obj)))
}

export const db = new Dexie('VersatileDB')

db.version(11)
  .stores({
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
  })
  .upgrade(async (trans) => {
    await trans.graphEdges.toCollection().modify({ volumeId: null })
  })

db.version(12).stores({
  characters: '++id, projectId, name, role, goal, voice, notes, color, portrait'
})

db.version(13)
  .stores({
    sections: '++id, projectId, title, summary, order, status, *tags, volumeId',
    subsections: '++id, projectId, sectionId, title, summary, order, content, *tags'
  })
  .upgrade(async (trans) => {
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
  sessionArchive: '++id, projectId, timestamp, type, signal',
  authorProfile: '++id, projectId',
  storyStateSnapshots: '++id, projectId, timestamp'
})

db.version(15).stores({
  characters: '++id, projectId, name, role, goal, voice, notes, color, portrait, lastEditedAt',
  storyDocuments: '++id, projectId, docType, content, updatedAt'
})

db.version(16).stores({
  generatedStories: '++id, projectId, title, generatedAt, totalWords, qualityScore'
})

db.version(17).stores({
  voiceProfiles: '++id, projectId, createdAt, updatedAt'
})

db.version(18).stores({
  storyDocuments: '++id, projectId, docType, content, updatedAt, [projectId+docType]'
})

db.version(19).stores({
  researchDocuments: '++id, projectId, fileName, fileType, importedAt',
  researchChunks: '++id, documentId, projectId, chunkIndex, embeddingStatus'
})

db.version(20).stores({})

db.version(21).stores({
  researchTags: '++id, name, projectId, [projectId+name]'
})

db.version(22).stores({
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
})

db.version(23).stores({
  embeddingCache: '&hash, createdAt'
})

db.version(24).stores({
  researchDocuments:
    '++id, projectId, fileName, fileType, importedAt, apiId, syncStatus, lastSyncedAt'
})

db.version(25).stores({})

db.version(26)
  .stores({
    projects:
      '++id, userId, name, createdAt, updatedAt, genre, synopsis, apiId, syncStatus, lastSyncedAt',
    users: '++id, passwordHash, displayName, createdAt, &username'
  })
  .upgrade(async (trans) => {
    if (!DEV_MODE) return
    // ⚠️ Dead code behind DEV_MODE=false — test-user seed only, never runs in production.
    const userCount = await trans.users.count()
    if (userCount === 0) {
      const testUser = await trans.users.add({
        username: 'test',
        passwordHash: 'ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae',
        displayName: 'Test User',
        createdAt: new Date().toISOString()
      })
      await trans.projects
        .toCollection()
        .filter((p) => !p.userId)
        .modify({ userId: testUser })
    }
  })

db.version(27).stores({
  dialogueIndex: '++id, projectId, paragraphIndex, speakerId, sectionId, [projectId+speakerId]'
})

db.version(28).stores({
  storyShapeAnalysis:
    '++id, projectId, sceneId, version, analyzedAt, [projectId+sceneId], [projectId+version]'
})

db.version(29).stores({
  chatSessions: '++id, projectId, updatedAt'
})

// v30: checkpoint for one-click generation runs so a long unattended draft can
// survive a reload/crash. One row per project (the in-progress run).
db.version(30).stores({
  genRuns: '++id, &projectId, updatedAt'
})

// v31: generation-pipeline status tracking. Adds `generationStatus` to the Story
// Bible entities and `contentStatus` to subsections so the orchestrator can tell
// pending/generated/authored/failed apart, drive a repair pass, and freeze canon.
// Only the changed tables are listed; Dexie carries the rest forward.
db.version(31)
  .stores({
    characters:
      '++id, projectId, name, role, goal, voice, notes, color, portrait, lastEditedAt, generationStatus, apiId, syncStatus, lastSyncedAt',
    locations:
      '++id, projectId, name, description, notes, generationStatus, apiId, syncStatus, lastSyncedAt',
    plotThreads:
      '++id, projectId, title, status, notes, generationStatus, apiId, syncStatus, lastSyncedAt',
    subsections:
      '++id, projectId, sectionId, title, summary, order, content, *tags, contentStatus, apiId, syncStatus, lastSyncedAt'
  })
  .upgrade(async (trans) => {
    const now = new Date().toISOString()
    // Existing hand-authored/generated entities are treated as approved canon so
    // the pipeline never re-generates or overwrites them.
    await trans.characters.toCollection().modify((c) => {
      if (!c.generationStatus) c.generationStatus = 'approved'
      if (!c.createdAt) c.createdAt = now
      if (!c.updatedAt) c.updatedAt = now
    })
    await trans.locations.toCollection().modify((l) => {
      if (!l.generationStatus) l.generationStatus = 'approved'
      if (!l.createdAt) l.createdAt = now
      if (!l.updatedAt) l.updatedAt = now
    })
    await trans.plotThreads.toCollection().modify((t) => {
      if (!t.generationStatus) t.generationStatus = 'approved'
      if (!t.createdAt) t.createdAt = now
      if (!t.updatedAt) t.updatedAt = now
    })
    // A subsection with prose is 'generated'; an empty stub is 'draft'.
    await trans.subsections.toCollection().modify((s) => {
      if (!s.contentStatus) {
        s.contentStatus = s.content && String(s.content).trim() ? 'generated' : 'draft'
      }
    })
  })

// v32: blurb/synopsis generation history per project
db.version(32).stores({
  projectBlurbs: '++id, projectId, generatedAt'
})

// v33: evaluation persistence — saves critique/gate/revision results so the
// app can show score trends, regression history, and aggregate stats.
db.version(33).stores({
  evalResults: '++id, projectId, sceneId, timestamp, evalType, score'
})

const recoveryFlag = 'versatile_db_recovery'

let _ready
export async function ready() {
  if (!_ready) {
    _ready = db
      .open()
      .then(() => {
        localStorage.removeItem(recoveryFlag)
      })
      .catch((err) => {
        if (localStorage.getItem(recoveryFlag)) {
          console.error('[DB] Automatic recovery failed. Please clear IndexedDB manually.')
          return
        }
        console.warn('[DB] Database error:', err.name, '- recovering...')
        localStorage.setItem(recoveryFlag, '1')
        db.close()

        const delReq = indexedDB.deleteDatabase('VersatileDB')
        delReq.onsuccess = () => window.location.reload()
        delReq.onerror = () => window.location.reload()
        delReq.onblocked = () => window.location.reload()
      })
  }
  return _ready
}

db.on('ready', async () => {
  const volumeCount = await db.volumes.count()
  if (volumeCount === 0) {
    await db.volumes.add({
      title: 'Default',
      description: 'Default volume for all content',
      color: '#6366f1',
      sectionIds: []
    })
  }

  // Dev-only convenience seed. Never ship a hardcoded credential to production:
  // real users authenticate, so a fresh production DB should have no test user.
  if (DEV_MODE) {
    const userCount = await db.users.count()
    if (userCount === 0) {
      const testUser = await db.users.add({
        username: 'test',
        passwordHash: 'ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae',
        displayName: 'Test User',
        createdAt: new Date().toISOString()
      })
      const projectsWithoutUser = await db.projects.filter((p) => !p.userId).toArray()
      for (const p of projectsWithoutUser) {
        await db.projects.update(p.id, { userId: testUser })
      }
    }
  }
})

export async function exportDatabase() {
  const dump = {}
  for (const table of db.tables) {
    dump[table.name] = await table.toArray()
  }
  return dump
}

export async function importDatabase(data) {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear()
      const rows = data[table.name]
      if (rows && rows.length > 0) {
        await table.bulkAdd(rows)
      }
    }
  })
}
