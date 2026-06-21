import { db } from './db-core'
import { countWords } from '../utils/textUtils'

export async function createProject(name, genre = '', synopsis = '', userId = null) {
  try {
    const now = new Date().toISOString()
    const projectId = await db.projects.add({
      name,
      genre,
      synopsis,
      userId,
      createdAt: now,
      updatedAt: now
    })
    await db.manuscripts.add({
      projectId,
      content: '',
      wordCount: 0,
      updatedAt: now
    })
    return projectId
  } catch (error) {
    console.error('Failed to create project:', error)
    throw error
  }
}

export async function updateProject(id, data) {
  try {
    const now = new Date().toISOString()
    await db.projects.update(id, {
      ...data,
      updatedAt: now
    })
  } catch (error) {
    console.error('Failed to update project:', error)
    throw error
  }
}

export async function getProject(id) {
  try {
    return await db.projects.get(id)
  } catch (error) {
    console.error('Failed to get project:', error)
    throw error
  }
}

export async function getAllProjects(userId = null) {
  if (userId != null) {
    return db.projects.where('userId').equals(userId).toArray()
  }
  return db.projects.toArray()
}

export async function getManuscript(projectId) {
  try {
    return await db.manuscripts.where('projectId').equals(projectId).first()
  } catch (error) {
    console.error('Failed to get manuscript:', error)
    throw error
  }
}

export async function saveManuscript(projectId, content) {
  try {
    const wordCount = countWords(content)
    const now = new Date().toISOString()
    const existing = await db.manuscripts.where('projectId').equals(projectId).first()
    if (existing) {
      return await db.manuscripts.update(existing.id, { content, wordCount, updatedAt: now })
    }
    return await db.manuscripts.add({ projectId, content, wordCount, updatedAt: now })
  } catch (error) {
    console.error('Failed to save manuscript:', error)
    throw error
  }
}

export async function updateProjectMeta(projectId, data) {
  return db.projects.update(projectId, data)
}
