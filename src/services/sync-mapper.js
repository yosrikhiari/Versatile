import { db } from './db-core'

export function findSyncConfig(tableName) {
  return SYNC_ENTITIES.find((e) => e.table === tableName)
}

function tagsToApi(tags) {
  if (!tags) return null
  return JSON.stringify(tags)
}

function tagsFromApi(tags) {
  if (!tags) return []
  try {
    return JSON.parse(tags)
  } catch {
    return []
  }
}

async function lookupApiId(table, localId) {
  if (localId == null) return null
  const record = await db[table].get(localId)
  return record?.apiId || null
}

async function lookupLocalId(table, apiId) {
  if (!apiId) return null
  const records = await db[table].where('apiId').equals(apiId).toArray()
  return records.length > 0 ? records[0].id : null
}

export const SYNC_ENTITIES = [
  {
    table: 'projects',
    endpoint: '/story',
    isTopLevel: true,
    parentField: null,
    providesStoryId: true,
    toApi: (local) => ({
      title: local.name || local.title || '',
      premise: local.description || local.premise || '',
      genre: local.genre || '',
      tone: local.tone || '',
      writingStyle: local.writingStyle || '',
      targetAudience: local.targetAudience || ''
    }),
    fromApi: (api) => ({
      apiId: api.id,
      name: api.title,
      premise: api.premise || '',
      description: api.premise || '',
      genre: api.genre || '',
      tone: api.tone || '',
      writingStyle: api.writingStyle || '',
      targetAudience: api.targetAudience || '',
      createdAt: api.createdAt || new Date().toISOString(),
      updatedAt: api.updatedAt || new Date().toISOString(),
      syncStatus: 'synced',
      lastSyncedAt: new Date().toISOString()
    }),
    idBridge: {
      localParentField: null,
      apiParentField: null,
      needsTranslation: []
    }
  },

  {
    table: 'sections',
    endpoint: (storyApiId) => `/story/${storyApiId}/section`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: (local) => ({
      title: local.title || '',
      summary: local.summary || null,
      order: local.order ?? 0,
      status: local.status || 'draft',
      tags: tagsToApi(local.tags),
      content: null
    }),
    fromApi: (api) => ({
      apiId: api.id,
      title: api.title || '',
      summary: api.summary || '',
      order: api.order ?? 0,
      status: api.status || 'draft',
      tags: tagsFromApi(api.tags),
      content: api.content || '',
      volumeId: null,
      createdAt: api.createdAt || new Date().toISOString(),
      updatedAt: api.updatedAt || new Date().toISOString(),
      syncStatus: 'synced',
      lastSyncedAt: new Date().toISOString()
    }),
    idBridge: {
      localParentField: 'projectId',
      apiParentField: 'storyId',
      needsTranslation: ['volumeId']
    }
  },

  {
    table: 'subsections',
    endpoint: (storyApiId) => `/story/${storyApiId}/subsection`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: async (local) => {
      const sectionApiId = local.sectionId ? await lookupApiId('sections', local.sectionId) : null
      return {
        sectionId: sectionApiId || '00000000-0000-0000-0000-000000000000',
        title: local.title || '',
        summary: local.summary || null,
        content: local.content || '',
        tags: tagsToApi(local.tags)
      }
    },
    fromApi: async (api) => {
      const sectionLocalId = api.sectionId ? await lookupLocalId('sections', api.sectionId) : null
      return {
        apiId: api.id,
        sectionId: sectionLocalId,
        title: api.title || '',
        summary: api.summary || '',
        content: api.content || '',
        order: api.order ?? 0,
        tags: tagsFromApi(api.tags),
        createdAt: api.createdAt || new Date().toISOString(),
        updatedAt: api.updatedAt || new Date().toISOString(),
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString()
      }
    },
    idBridge: {
      localParentField: 'projectId',
      apiParentField: 'storyId',
      needsTranslation: ['sectionId']
    }
  },

  {
    table: 'characters',
    endpoint: (storyApiId) => `/story/${storyApiId}/entity`,
    isTopLevel: false,
    parentField: 'projectId',
    entityType: 'Character',
    toApi: (local) => ({
      name: local.name || '',
      type: 'Character',
      description:
        local.notes || local.description || local.role || local.goal || local.voice || '',
      metadata: JSON.stringify({
        role: local.role,
        goal: local.goal,
        voice: local.voice,
        color: local.color,
        portrait: local.portrait,
        notes: local.notes
      })
    }),
    fromApi: (api) => {
      let meta = {}
      try {
        meta = JSON.parse(api.metadata || '{}')
      } catch {
        meta = {}
      }
      return {
        apiId: api.id,
        name: api.name,
        notes: meta.notes || api.description || '',
        role: meta.role || '',
        goal: meta.goal || '',
        voice: meta.voice || '',
        color: meta.color || '',
        portrait: meta.portrait || '',
        lastEditedAt: Date.now(),
        createdAt: api.createdAt || new Date().toISOString(),
        updatedAt: api.updatedAt || new Date().toISOString(),
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString()
      }
    },
    idBridge: {
      localParentField: 'projectId',
      apiParentField: 'storyId',
      needsTranslation: []
    }
  },

  {
    table: 'locations',
    endpoint: (storyApiId) => `/story/${storyApiId}/entity`,
    isTopLevel: false,
    parentField: 'projectId',
    entityType: 'Location',
    toApi: (local) => ({
      name: local.name || '',
      type: 'Location',
      description: local.description || local.notes || '',
      metadata: JSON.stringify({ notes: local.notes })
    }),
    fromApi: (api) => {
      let meta = {}
      try {
        meta = JSON.parse(api.metadata || '{}')
      } catch {
        meta = {}
      }
      return {
        apiId: api.id,
        name: api.name,
        description: api.description || meta.notes || '',
        notes: meta.notes || '',
        createdAt: api.createdAt || new Date().toISOString(),
        updatedAt: api.updatedAt || new Date().toISOString(),
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString()
      }
    },
    idBridge: {
      localParentField: 'projectId',
      apiParentField: 'storyId',
      needsTranslation: []
    }
  },

  {
    table: 'plotThreads',
    endpoint: (storyApiId) => `/story/${storyApiId}/plot-thread`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: (local) => ({
      title: local.title || '',
      status: local.status || 'active',
      notes: local.notes || null
    }),
    fromApi: (api) => ({
      apiId: api.id,
      title: api.title || '',
      status: api.status || 'active',
      notes: api.notes || '',
      createdAt: api.createdAt || new Date().toISOString(),
      updatedAt: api.updatedAt || new Date().toISOString(),
      syncStatus: 'synced',
      lastSyncedAt: new Date().toISOString()
    }),
    idBridge: {
      localParentField: 'projectId',
      apiParentField: 'storyId',
      needsTranslation: []
    }
  },

  {
    table: 'characterRelationships',
    endpoint: (storyApiId) => `/story/${storyApiId}/character-relationship`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: async (local) => {
      const fromApiId = await lookupApiId('characters', local.fromCharacterId)
      const toApiId = await lookupApiId('characters', local.toCharacterId)
      return {
        fromCharacterId: fromApiId || '00000000-0000-0000-0000-000000000000',
        toCharacterId: toApiId || '00000000-0000-0000-0000-000000000000',
        relationshipType: local.type || 'unknown',
        notes: local.notes || null
      }
    },
    fromApi: async (api) => {
      const fromLocal = await lookupLocalId('characters', api.fromCharacterId)
      const toLocal = await lookupLocalId('characters', api.toCharacterId)
      return {
        apiId: api.id,
        fromCharacterId: fromLocal,
        toCharacterId: toLocal,
        type: api.relationshipType || 'unknown',
        notes: api.notes || '',
        createdAt: api.createdAt || new Date().toISOString(),
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString()
      }
    },
    idBridge: {
      localParentField: 'projectId',
      apiParentField: 'storyId',
      needsTranslation: ['fromCharacterId', 'toCharacterId']
    }
  },

  {
    table: 'volumes',
    endpoint: (storyApiId) => `/story/${storyApiId}/volume`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: (local) => ({
      title: local.title || '',
      description: local.description || null,
      color: local.color || '#6366f1',
      sortOrder: local.sortOrder ?? 0,
      sectionIds: Array.isArray(local.sectionIds)
        ? JSON.stringify(local.sectionIds)
        : local.sectionIds || null
    }),
    fromApi: (api) => ({
      apiId: api.id,
      title: api.title || '',
      description: api.description || '',
      color: api.color || '#6366f1',
      sortOrder: api.sortOrder ?? 0,
      sectionIds: api.sectionIds || null,
      createdAt: api.createdAt || new Date().toISOString(),
      updatedAt: api.updatedAt || new Date().toISOString(),
      syncStatus: 'synced',
      lastSyncedAt: new Date().toISOString()
    }),
    idBridge: {
      localParentField: 'projectId',
      apiParentField: 'storyId',
      needsTranslation: []
    }
  },

  {
    table: 'volumeEntities',
    endpoint: (storyApiId) => `/story/${storyApiId}/volume-entity`,
    isTopLevel: false,
    parentField: 'volumeId',
    toApi: async (local) => {
      const volApiId = local.volumeId ? await lookupApiId('volumes', local.volumeId) : null
      return {
        volumeId: volApiId || '00000000-0000-0000-0000-000000000000',
        entityType: local.entityType || '',
        entityId: local.entityId || '',
        isPrimary: local.isPrimary ?? true
      }
    },
    fromApi: async (api) => {
      const volLocalId = await lookupLocalId('volumes', api.volumeId)
      return {
        apiId: api.id,
        volumeId: volLocalId,
        entityType: api.entityType || '',
        entityId: api.entityId || '',
        isPrimary: api.isPrimary ?? true,
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString()
      }
    },
    idBridge: {
      localParentField: null,
      apiParentField: 'storyId',
      needsTranslation: ['volumeId']
    }
  },

  {
    table: 'manuscripts',
    endpoint: (storyApiId) => `/story/${storyApiId}/manuscript`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: (local) => ({
      content: local.content || '',
      wordCount: local.wordCount ?? 0
    }),
    fromApi: (api) => ({
      apiId: api.id,
      content: api.content || '',
      wordCount: api.wordCount ?? 0,
      updatedAt: api.updatedAt || new Date().toISOString(),
      syncStatus: 'synced',
      lastSyncedAt: new Date().toISOString()
    }),
    idBridge: {
      localParentField: 'projectId',
      apiParentField: 'storyId',
      needsTranslation: []
    }
  },

  {
    table: 'researchDocuments',
    endpoint: (storyApiId) => `/story/${storyApiId}/research`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: (local) => ({
      title: local.fileName || '',
      fileType: local.fileType || ''
    }),
    fromApi: (api) => ({
      apiId: api.id,
      fileName: api.title || api.fileName || '',
      fileType: api.fileType || '',
      importedAt: api.importedAt || new Date().toISOString(),
      syncStatus: 'synced',
      lastSyncedAt: new Date().toISOString()
    }),
    idBridge: {
      localParentField: 'projectId',
      apiParentField: 'storyId',
      needsTranslation: []
    }
  }
]
