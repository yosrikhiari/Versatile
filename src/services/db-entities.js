import { db, deepPlain } from './db-core'

// ========== CHARACTERS ==========

export async function getCharacters(projectId) {
  try {
    return await db.characters.where('projectId').equals(projectId).toArray()
  } catch (error) {
    console.error('Failed to get characters:', error)
    throw error
  }
}

export async function addCharacter(projectId, data) {
  try {
    return await db.characters.add({ projectId, ...data, lastEditedAt: Date.now() })
  } catch (error) {
    console.error('Failed to add character:', error)
    throw error
  }
}

export async function updateCharacter(id, data) {
  try {
    return await db.characters.update(id, deepPlain({ ...data, lastEditedAt: Date.now() }))
  } catch (error) {
    console.error('Failed to update character:', error)
    throw error
  }
}

export async function updateCharacterPortrait(characterId, portraitDataUrl) {
  return db.characters.update(characterId, { portrait: portraitDataUrl })
}

export async function getCharacterPortrait(characterId) {
  const character = await db.characters.get(characterId)
  return character?.portrait || null
}

export async function deleteCharacter(id) {
  return db.characters.delete(id)
}

// ========== LOCATIONS ==========

export async function getLocations(projectId) {
  return db.locations.where('projectId').equals(projectId).toArray()
}

export async function addLocation(projectId, data) {
  return db.locations.add({ projectId, ...data })
}

export async function updateLocation(id, data) {
  return db.locations.update(id, deepPlain(data))
}

export async function deleteLocation(id) {
  return db.locations.delete(id)
}

// ========== PLOT THREADS ==========

export async function getPlotThreads(projectId) {
  return db.plotThreads.where('projectId').equals(projectId).toArray()
}

export async function addPlotThread(projectId, data) {
  return db.plotThreads.add({ projectId, ...data })
}

export async function updatePlotThread(id, data) {
  return db.plotThreads.update(id, deepPlain(data))
}

export async function deletePlotThread(id) {
  return db.plotThreads.delete(id)
}

// ========== CHARACTER RELATIONSHIPS ==========

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

export async function deleteCharacterRelationshipsByCharacter(characterId) {
  const rels = await db.characterRelationships
    .filter(r => r.fromCharacterId === characterId || r.toCharacterId === characterId)
    .toArray()
  if (rels.length > 0) {
    await db.characterRelationships.bulkDelete(rels.map(r => r.id))
  }
  return rels.length
}

// ========== VOICE PROFILES ==========

export async function saveVoiceProfile(projectId, voiceProfileData) {
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

export async function loadVoiceProfile(projectId) {
  try {
    const record = await db.voiceProfiles.where('projectId').equals(projectId).first()
    return record?.data || null
  } catch (error) {
    console.error('Failed to load voice profile:', error)
    return null
  }
}

export async function deleteVoiceProfile(projectId) {
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
