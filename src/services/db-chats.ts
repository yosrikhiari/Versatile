import { toRaw } from 'vue'
import { db as _db } from './db-core'
const db = _db as any

export async function getChatSessions(projectId: string) {
  try {
    return await db.chatSessions.where('projectId').equals(projectId).toArray()
  } catch (error) {
    console.error('Failed to get chat sessions:', error)
    throw error
  }
}

export async function getChatSession(id: string) {
  try {
    return await db.chatSessions.get(id)
  } catch (error) {
    console.error('Failed to get chat session:', error)
    return null
  }
}

export async function saveChatSession(session: any) {
  try {
    const plain = JSON.parse(JSON.stringify(toRaw(session)))
    const data: Record<string, any> = {
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

export async function deleteChatSession(id: string) {
  try {
    await db.chatSessions.delete(id)
    return true
  } catch (error) {
    console.error('Failed to delete chat session:', error)
    throw error
  }
}

export async function deleteChatSessionsByCharacter(characterId: string) {
  try {
    const sessions = await db.chatSessions
      .filter((s: any) => (s.characterIds || []).includes(characterId))
      .toArray()
    if (sessions.length > 0) {
      await db.chatSessions.bulkDelete(sessions.map((s: any) => s.id))
    }
    return sessions.length
  } catch (error) {
    console.error('Failed to delete chat sessions by character:', error)
    throw error
  }
}

export async function deleteChatSessionsByProject(projectId: string) {
  try {
    const sessions = await db.chatSessions.where('projectId').equals(projectId).toArray()
    if (sessions.length > 0) {
      await db.chatSessions.bulkDelete(sessions.map((s: any) => s.id))
    }
    return sessions.length
  } catch (error) {
    console.error('Failed to delete chat sessions by project:', error)
    throw error
  }
}
