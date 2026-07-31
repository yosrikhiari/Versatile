import { toRaw } from 'vue'
import { db as _db } from './db-core'
import {
  guardStorageWrite,
  guardStorageWriteBatch
} from '../guardrails/integration/storageGuardrails'

const db = _db as any

// Only inserts are guarded. `update()` takes a partial patch, so holding it to
// the table's required-field contract would flag every legitimate field edit.

// ========== CHARACTERS ==========

export async function getCharacters(projectId: any) {
  try {
    return await db.characters.where('projectId').equals(projectId).toArray()
  } catch (error) {
    console.error('Failed to get characters:', error)
    throw error
  }
}

export async function addCharacter(projectId: any, data: any) {
  try {
    guardStorageWrite('characters', data, {
      parentValues: { projectId },
      entryPoint: 'db-entities.addCharacter'
    })
    const now = new Date().toISOString()
    return await db.characters.add({
      projectId,
      generationStatus: 'approved',
      createdAt: now,
      updatedAt: now,
      ...data,
      lastEditedAt: Date.now()
    })
  } catch (error) {
    console.error('Failed to add character:', error)
    throw error
  }
}

export async function updateCharacter(id: any, data: any) {
  try {
    return await db.characters.update(
      id,
      JSON.parse(JSON.stringify(toRaw({ ...data, updatedAt: new Date().toISOString(), lastEditedAt: Date.now() })))
    )
  } catch (error) {
    console.error('Failed to update character:', error)
    throw error
  }
}

export async function updateCharacterPortrait(characterId: any, portraitDataUrl: any) {
  return db.characters.update(characterId, { portrait: portraitDataUrl })
}

export async function getCharacterPortrait(characterId: any) {
  const character = await db.characters.get(characterId)
  return character?.portrait || null
}

export async function deleteCharacter(id: any) {
  return db.characters.delete(id)
}

// Atomic bulk insert — all-or-nothing so a crash mid-bible never leaves a
// half-written character set. Returns the new ids in input order.
export async function addCharactersBatch(projectId: any, characters: any) {
  if (!Array.isArray(characters) || characters.length === 0) return []
  guardStorageWriteBatch('characters', characters, {
    parentValues: { projectId },
    entryPoint: 'db-entities.addCharactersBatch'
  })
  const now = new Date().toISOString()
  const rows = characters.map((data) => ({
    projectId,
    generationStatus: 'approved',
    createdAt: now,
    updatedAt: now,
    ...data,
    lastEditedAt: Date.now()
  }))
  return db.transaction('rw', db.characters, async () => {
    return db.characters.bulkAdd(rows, { allKeys: true })
  })
}

// ========== LOCATIONS ==========

export async function getLocations(projectId: any) {
  return db.locations.where('projectId').equals(projectId).toArray()
}

export async function addLocation(projectId: any, data: any) {
  guardStorageWrite('locations', data, {
    parentValues: { projectId },
    entryPoint: 'db-entities.addLocation'
  })
  const now = new Date().toISOString()
  return db.locations.add({
    projectId,
    generationStatus: 'approved',
    createdAt: now,
    updatedAt: now,
    ...data
  })
}

export async function updateLocation(id: any, data: any) {
  return db.locations.update(id, JSON.parse(JSON.stringify(toRaw({ ...data, updatedAt: new Date().toISOString() }))))
}

export async function deleteLocation(id: any) {
  return db.locations.delete(id)
}

// Atomic bulk insert for locations (see addCharactersBatch).
export async function addLocationsBatch(projectId: any, locations: any) {
  if (!Array.isArray(locations) || locations.length === 0) return []
  guardStorageWriteBatch('locations', locations, {
    parentValues: { projectId },
    entryPoint: 'db-entities.addLocationsBatch'
  })
  const now = new Date().toISOString()
  const rows = locations.map((data) => ({
    projectId,
    generationStatus: 'approved',
    createdAt: now,
    updatedAt: now,
    ...data
  }))
  return db.transaction('rw', db.locations, async () => {
    return db.locations.bulkAdd(rows, { allKeys: true })
  })
}

// ========== PLOT THREADS ==========

export async function getPlotThreads(projectId: any) {
  return db.plotThreads.where('projectId').equals(projectId).toArray()
}

export async function addPlotThread(projectId: any, data: any) {
  guardStorageWrite('plotThreads', data, {
    parentValues: { projectId },
    entryPoint: 'db-entities.addPlotThread'
  })
  const now = new Date().toISOString()
  return db.plotThreads.add({
    projectId,
    generationStatus: 'approved',
    createdAt: now,
    updatedAt: now,
    ...data
  })
}

export async function updatePlotThread(id: any, data: any) {
  return db.plotThreads.update(id, JSON.parse(JSON.stringify(toRaw({ ...data, updatedAt: new Date().toISOString() }))))
}

export async function deletePlotThread(id: any) {
  return db.plotThreads.delete(id)
}

// Atomic bulk insert for plot threads (see addCharactersBatch).
export async function addPlotThreadsBatch(projectId: any, plotThreads: any) {
  if (!Array.isArray(plotThreads) || plotThreads.length === 0) return []
  guardStorageWriteBatch('plotThreads', plotThreads, {
    parentValues: { projectId },
    entryPoint: 'db-entities.addPlotThreadsBatch'
  })
  const now = new Date().toISOString()
  const rows = plotThreads.map((data) => ({
    projectId,
    generationStatus: 'approved',
    createdAt: now,
    updatedAt: now,
    ...data
  }))
  return db.transaction('rw', db.plotThreads, async () => {
    return db.plotThreads.bulkAdd(rows, { allKeys: true })
  })
}

// ========== CHARACTER RELATIONSHIPS ==========

export async function getCharacterRelationships(projectId: any) {
  return db.characterRelationships.where('projectId').equals(projectId).toArray()
}

export async function addCharacterRelationship(projectId: any, data: any) {
  guardStorageWrite('characterRelationships', data, {
    parentValues: { projectId },
    entryPoint: 'db-entities.addCharacterRelationship'
  })
  return db.characterRelationships.add({ projectId, ...data })
}

// Atomic bulk insert for the Story Network stage.
export async function addCharacterRelationshipsBatch(projectId: any, relationships: any) {
  if (!Array.isArray(relationships) || relationships.length === 0) return []
  guardStorageWriteBatch('characterRelationships', relationships, {
    parentValues: { projectId },
    entryPoint: 'db-entities.addCharacterRelationshipsBatch'
  })
  const now = new Date().toISOString()
  const rows = relationships.map((r) => ({ projectId, createdAt: now, ...r }))
  return db.transaction('rw', db.characterRelationships, async () => {
    return db.characterRelationships.bulkAdd(rows, { allKeys: true })
  })
}

export async function updateCharacterRelationship(id: any, data: any) {
  return db.characterRelationships.update(id, data)
}

export async function deleteCharacterRelationship(id: any) {
  return db.characterRelationships.delete(id)
}

export async function deleteCharacterRelationshipsByCharacter(characterId: any) {
  const rels = await db.characterRelationships
    .filter((r: any) => r.fromCharacterId === characterId || r.toCharacterId === characterId)
    .toArray()
  if (rels.length > 0) {
    await db.characterRelationships.bulkDelete(rels.map((r: any) => r.id))
  }
  return rels.length
}

// ========== VOICE PROFILES ==========

export async function saveVoiceProfile(projectId: any, voiceProfileData: any) {
  try {
    // Use upsert pattern: if exists, update; else insert
    const existing = await db.voiceProfiles.where('projectId').equals(projectId).first()
    if (existing) {
      return await db.voiceProfiles.update(existing.id, {
        projectId,
        data: voiceProfileData,
        updatedAt: new Date()
      })
    } else {
      return await db.voiceProfiles.add({
        projectId,
        data: voiceProfileData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    }
  } catch (error) {
    console.error('Failed to save voice profile:', error)
    throw error
  }
}

export async function loadVoiceProfile(projectId: any) {
  try {
    const record = await db.voiceProfiles.where('projectId').equals(projectId).first()
    return record?.data || null
  } catch (error) {
    console.error('Failed to load voice profile:', error)
    return null
  }
}

export async function deleteVoiceProfile(projectId: any) {
  try {
    const record = await db.voiceProfiles.where('projectId').equals(projectId).first()
    if (record) {
      await db.voiceProfiles.delete(record.id)
      return true
    }
    return false
  } catch (error) {
    console.error('Failed to delete voice profile:', error)
    throw error
  }
}
