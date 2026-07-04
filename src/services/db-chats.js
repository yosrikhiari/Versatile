import { db, deepPlain } from './db-core'

export async function getChatSessions(projectId) {
  try {
    return await db.chatSessions.where('projectId').equals(projectId).toArray()
  } catch (error) {
    console.error('Failed to get chat sessions:', error)
    throw error
  }
}

export async function getChatSession(id) {
  try {
    return await db.chatSessions.get(id)
  } catch (error) {
    console.error('Failed to get chat session:', error)
    return null
  }
}

export async function saveChatSession(session) {
  try {
    const plain = deepPlain(session)
    const data = {
      projectId: plain.projectId,
      characterIds: plain.characterIds || [],
      title: plain.title || '',
      messages: plain.messages || [],
      createdAt: plain.createdAt || Date.now(),
      updatedAt: Date.now()
    }

    if (plain.id) {
      const existing = await db.chatSessions.get(plain.id)
      if (existing) {
        await db.chatSessions.update(plain.id, data)
        return plain.id
      }
      data.id = plain.id
    }

    data.createdAt = Date.now()
    const id = await db.chatSessions.add(data)
    return id
  } catch (error) {
    console.error('Failed to save chat session:', error)
    throw error
  }
}

export async function deleteChatSession(id) {
  try {
    await db.chatSessions.delete(id)
    return true
  } catch (error) {
    console.error('Failed to delete chat session:', error)
    throw error
  }
}

export async function deleteChatSessionsByCharacter(characterId) {
  try {
    const sessions = await db.chatSessions
      .filter((s) => (s.characterIds || []).includes(characterId))
      .toArray()
    if (sessions.length > 0) {
      await db.chatSessions.bulkDelete(sessions.map((s) => s.id))
    }
    return sessions.length
  } catch (error) {
    console.error('Failed to delete chat sessions by character:', error)
    throw error
  }
}

export async function deleteChatSessionsByProject(projectId) {
  try {
    const sessions = await db.chatSessions.where('projectId').equals(projectId).toArray()
    if (sessions.length > 0) {
      await db.chatSessions.bulkDelete(sessions.map((s) => s.id))
    }
    return sessions.length
  } catch (error) {
    console.error('Failed to delete chat sessions by project:', error)
    throw error
  }
}
