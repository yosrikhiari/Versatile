// aliased: the lookup helpers below take a parameter named `table`
import { table as dbTable } from './db-core'

interface SyncEntityConfig {
  table: string
  endpoint: string | ((storyApiId: string) => string)
  isTopLevel: boolean
  parentField: string | null
  providesStoryId?: boolean
  entityType?: string
  toApi: (local: Record<string, unknown>) => unknown | Promise<unknown>
  fromApi: (api: Record<string, unknown>) => unknown | Promise<unknown>
  idBridge?: {
    localParentField: string | null
    apiParentField: string | null
    needsTranslation: string[]
  }
}

export function findSyncConfig(tableName: string): SyncEntityConfig | undefined {
  return SYNC_ENTITIES.find((e) => e.table === tableName)
}

function tagsToApi(tags: unknown): string | null {
  if (!tags) return null
  return JSON.stringify(tags)
}

function tagsFromApi(tags: unknown): unknown[] {
  if (!tags) return []
  try {
    return JSON.parse(tags as string)
  } catch {
    return []
  }
}

async function lookupApiId(table: string, localId: string | null | undefined): Promise<string | null> {
  if (localId == null) return null
  const record = await dbTable(table).get(localId)
  return record?.apiId || null
}

async function lookupLocalId(table: string, apiId: string | null | undefined): Promise<string | null> {
  if (!apiId) return null
  const records = await dbTable(table).where('apiId').equals(apiId).toArray()
  return records.length > 0 ? records[0].id : null
}

export const SYNC_ENTITIES: SyncEntityConfig[] = [
  {
    table: 'projects',
    endpoint: '/story',
    isTopLevel: true,
    parentField: null,
    providesStoryId: true,
    toApi: (local: Record<string, unknown>) => ({
      title: (local.name || local.title || '') as string,
      premise: (local.description || local.premise || '') as string,
      genre: (local.genre || '') as string,
      tone: (local.tone || '') as string,
      writingStyle: (local.writingStyle || '') as string,
      targetAudience: (local.targetAudience || '') as string
    }),
    fromApi: (api: Record<string, unknown>) => ({
      apiId: api.id,
      name: api.title as string,
      premise: (api.premise || '') as string,
      description: (api.premise || '') as string,
      genre: (api.genre || '') as string,
      tone: (api.tone || '') as string,
      writingStyle: (api.writingStyle || '') as string,
      targetAudience: (api.targetAudience || '') as string,
      createdAt: (api.createdAt || new Date().toISOString()) as string,
      updatedAt: (api.updatedAt || new Date().toISOString()) as string,
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
    endpoint: (storyApiId: string) => `/story/${storyApiId}/section`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: (local: Record<string, unknown>) => ({
      title: (local.title || '') as string,
      summary: (local.summary || null) as string | null,
      order: (local.order ?? 0) as number,
      status: (local.status || 'draft') as string,
      tags: tagsToApi(local.tags),
      content: null
    }),
    fromApi: (api: Record<string, unknown>) => ({
      apiId: api.id,
      title: (api.title || '') as string,
      summary: (api.summary || '') as string,
      order: (api.order ?? 0) as number,
      status: (api.status || 'draft') as string,
      tags: tagsFromApi(api.tags),
      content: (api.content || '') as string,
      volumeId: null,
      createdAt: (api.createdAt || new Date().toISOString()) as string,
      updatedAt: (api.updatedAt || new Date().toISOString()) as string,
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
    endpoint: (storyApiId: string) => `/story/${storyApiId}/subsection`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: async (local: Record<string, unknown>) => {
      const sectionApiId = local.sectionId ? await lookupApiId('sections', local.sectionId as string) : null
      return {
        sectionId: sectionApiId || '00000000-0000-0000-0000-000000000000',
        title: (local.title || '') as string,
        summary: (local.summary || null) as string | null,
        content: (local.content || '') as string,
        tags: tagsToApi(local.tags)
      }
    },
    fromApi: async (api: Record<string, unknown>) => {
      const sectionLocalId = api.sectionId ? await lookupLocalId('sections', api.sectionId as string) : null
      return {
        apiId: api.id,
        sectionId: sectionLocalId,
        title: (api.title || '') as string,
        summary: (api.summary || '') as string,
        content: (api.content || '') as string,
        order: (api.order ?? 0) as number,
        tags: tagsFromApi(api.tags),
        createdAt: (api.createdAt || new Date().toISOString()) as string,
        updatedAt: (api.updatedAt || new Date().toISOString()) as string,
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
    endpoint: (storyApiId: string) => `/story/${storyApiId}/entity`,
    isTopLevel: false,
    parentField: 'projectId',
    entityType: 'Character',
    toApi: (local: Record<string, unknown>) => ({
      name: (local.name || '') as string,
      type: 'Character',
      description:
        (local.notes || local.description || local.role || local.goal || local.voice || '') as string,
      metadata: JSON.stringify({
        role: local.role,
        goal: local.goal,
        voice: local.voice,
        color: local.color,
        portrait: local.portrait,
        notes: local.notes
      })
    }),
    fromApi: (api: Record<string, unknown>) => {
      let meta: Record<string, unknown> = {}
      try {
        meta = JSON.parse((api.metadata || '{}') as string)
      } catch {
        meta = {}
      }
      return {
        apiId: api.id,
        name: api.name as string,
        notes: (meta.notes || api.description || '') as string,
        role: (meta.role || '') as string,
        goal: (meta.goal || '') as string,
        voice: (meta.voice || '') as string,
        color: (meta.color || '') as string,
        portrait: (meta.portrait || '') as string,
        lastEditedAt: Date.now(),
        createdAt: (api.createdAt || new Date().toISOString()) as string,
        updatedAt: (api.updatedAt || new Date().toISOString()) as string,
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
    endpoint: (storyApiId: string) => `/story/${storyApiId}/entity`,
    isTopLevel: false,
    parentField: 'projectId',
    entityType: 'Location',
    toApi: (local: Record<string, unknown>) => ({
      name: (local.name || '') as string,
      type: 'Location',
      description: (local.description || local.notes || '') as string,
      metadata: JSON.stringify({ notes: local.notes })
    }),
    fromApi: (api: Record<string, unknown>) => {
      let meta: Record<string, unknown> = {}
      try {
        meta = JSON.parse((api.metadata || '{}') as string)
      } catch {
        meta = {}
      }
      return {
        apiId: api.id,
        name: api.name as string,
        description: (api.description || meta.notes || '') as string,
        notes: (meta.notes || '') as string,
        createdAt: (api.createdAt || new Date().toISOString()) as string,
        updatedAt: (api.updatedAt || new Date().toISOString()) as string,
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
    endpoint: (storyApiId: string) => `/story/${storyApiId}/plot-thread`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: (local: Record<string, unknown>) => ({
      title: (local.title || '') as string,
      status: (local.status || 'active') as string,
      notes: (local.notes || null) as string | null
    }),
    fromApi: (api: Record<string, unknown>) => ({
      apiId: api.id,
      title: (api.title || '') as string,
      status: (api.status || 'active') as string,
      notes: (api.notes || '') as string,
      createdAt: (api.createdAt || new Date().toISOString()) as string,
      updatedAt: (api.updatedAt || new Date().toISOString()) as string,
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
    endpoint: (storyApiId: string) => `/story/${storyApiId}/character-relationship`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: async (local: Record<string, unknown>) => {
      const fromApiId = await lookupApiId('characters', local.fromCharacterId as string)
      const toApiId = await lookupApiId('characters', local.toCharacterId as string)
      return {
        fromCharacterId: fromApiId || '00000000-0000-0000-0000-000000000000',
        toCharacterId: toApiId || '00000000-0000-0000-0000-000000000000',
        relationshipType: (local.type || 'unknown') as string,
        notes: (local.notes || null) as string | null
      }
    },
    fromApi: async (api: Record<string, unknown>) => {
      const fromLocal = await lookupLocalId('characters', api.fromCharacterId as string)
      const toLocal = await lookupLocalId('characters', api.toCharacterId as string)
      return {
        apiId: api.id,
        fromCharacterId: fromLocal,
        toCharacterId: toLocal,
        type: (api.relationshipType || 'unknown') as string,
        notes: (api.notes || '') as string,
        createdAt: (api.createdAt || new Date().toISOString()) as string,
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
    endpoint: (storyApiId: string) => `/story/${storyApiId}/volume`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: (local: Record<string, unknown>) => ({
      title: (local.title || '') as string,
      description: (local.description || null) as string | null,
      color: (local.color || '#6366f1') as string,
      sortOrder: (local.sortOrder ?? 0) as number,
      sectionIds: Array.isArray(local.sectionIds)
        ? JSON.stringify(local.sectionIds)
        : (local.sectionIds || null)
    }),
    fromApi: (api: Record<string, unknown>) => ({
      apiId: api.id,
      title: (api.title || '') as string,
      description: (api.description || '') as string,
      color: (api.color || '#6366f1') as string,
      sortOrder: (api.sortOrder ?? 0) as number,
      sectionIds: api.sectionIds || null,
      createdAt: (api.createdAt || new Date().toISOString()) as string,
      updatedAt: (api.updatedAt || new Date().toISOString()) as string,
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
    endpoint: (storyApiId: string) => `/story/${storyApiId}/volume-entity`,
    isTopLevel: false,
    parentField: 'volumeId',
    toApi: async (local: Record<string, unknown>) => {
      const volApiId = local.volumeId ? await lookupApiId('volumes', local.volumeId as string) : null
      return {
        volumeId: volApiId || '00000000-0000-0000-0000-000000000000',
        entityType: (local.entityType || '') as string,
        entityId: (local.entityId || '') as string,
        isPrimary: (local.isPrimary ?? true) as boolean
      }
    },
    fromApi: async (api: Record<string, unknown>) => {
      const volLocalId = await lookupLocalId('volumes', api.volumeId as string)
      return {
        apiId: api.id,
        volumeId: volLocalId,
        entityType: (api.entityType || '') as string,
        entityId: (api.entityId || '') as string,
        isPrimary: (api.isPrimary ?? true) as boolean,
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
    endpoint: (storyApiId: string) => `/story/${storyApiId}/manuscript`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: (local: Record<string, unknown>) => ({
      content: (local.content || '') as string,
      wordCount: (local.wordCount ?? 0) as number
    }),
    fromApi: (api: Record<string, unknown>) => ({
      apiId: api.id,
      content: (api.content || '') as string,
      wordCount: (api.wordCount ?? 0) as number,
      updatedAt: (api.updatedAt || new Date().toISOString()) as string,
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
    endpoint: (storyApiId: string) => `/story/${storyApiId}/research`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: (local: Record<string, unknown>) => ({
      title: (local.fileName || '') as string,
      fileType: (local.fileType || '') as string
    }),
    fromApi: (api: Record<string, unknown>) => ({
      apiId: api.id,
      fileName: (api.title || api.fileName || '') as string,
      fileType: (api.fileType || '') as string,
      importedAt: (api.importedAt || new Date().toISOString()) as string,
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
    table: 'researchChunks',
    endpoint: (storyApiId: string) => `/story/${storyApiId}/research-chunk`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: async (local: Record<string, unknown>) => {
      const docApiId = local.documentId
        ? await lookupApiId('researchDocuments', local.documentId as string)
        : null
      return {
        documentId: docApiId || '00000000-0000-0000-0000-000000000000',
        chunkIndex: (local.chunkIndex ?? 0) as number,
        content: (local.text || local.content || '') as string,
        embedding: local.embedding
          ? JSON.stringify(Array.from(local.embedding as ArrayLike<number>))
          : null
      }
    },
    fromApi: async (api: Record<string, unknown>) => {
      const docLocalId = api.documentId
        ? await lookupLocalId('researchDocuments', api.documentId as string)
        : null
      return {
        apiId: api.id,
        documentId: docLocalId,
        chunkIndex: (api.chunkIndex ?? 0) as number,
        text: (api.content || '') as string,
        embedding: api.embedding ? JSON.parse(api.embedding as string) : null,
        embeddingStatus: api.embedding ? 'READY' : 'PENDING',
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString()
      }
    },
    idBridge: {
      localParentField: 'projectId',
      apiParentField: 'storyId',
      needsTranslation: ['documentId']
    }
  },

  {
    table: 'researchTags',
    endpoint: (storyApiId: string) => `/story/${storyApiId}/research-tag`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: (local: Record<string, unknown>) => ({
      name: (local.name || '') as string,
      color: (local.color || null) as string | null
    }),
    fromApi: (api: Record<string, unknown>) => ({
      apiId: api.id,
      name: (api.name || '') as string,
      color: (api.color || '') as string,
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
    table: 'branches',
    endpoint: (storyApiId: string) => `/story/${storyApiId}/branch`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: (local: Record<string, unknown>) => ({
      name: (local.name || '') as string,
      sourceBranchId: (local.sourceBranchId || null) as string | null,
      description: (local.description || '') as string,
      status: (local.status || 'active') as string
    }),
    fromApi: (api: Record<string, unknown>) => ({
      apiId: api.id,
      name: (api.name || '') as string,
      sourceBranchId: (api.sourceBranchId || null) as string | null,
      description: (api.description || '') as string,
      status: (api.status || 'active') as string,
      createdAt: (api.createdAt || new Date().toISOString()) as string,
      updatedAt: (api.updatedAt || new Date().toISOString()) as string,
      syncStatus: 'synced',
      lastSyncedAt: new Date().toISOString()
    }),
    idBridge: {
      localParentField: 'projectId',
      apiParentField: 'storyId',
      needsTranslation: ['sourceBranchId']
    }
  }
]
