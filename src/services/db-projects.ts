import { db as _db } from './db-core'
import { countWords } from '../utils/textUtils'

const db = _db as any

/**
 * `description` is the field the workspace reads back (`projectStore.loadProject`,
 * the generator brief, export); it used to be written as `synopsis`, which
 * nothing read — so a premise typed during onboarding never reached the
 * generator. `category` is the workspace type (creative, screenplay, …).
 */
export type ProjectCreateMetadata = {
  authorName?: string
  subtitle?: string
  language?: string
  series?: string
  tags?: string[]
}

export async function createProject(
  name: any,
  genre: any = '',
  description: any = '',
  userId: any = null,
  category: any = '',
  metadata: ProjectCreateMetadata = {}
) {
  try {
    const now = new Date().toISOString()
    const meta =
      metadata && typeof metadata === 'object'
        ? {
            ...(metadata.authorName ? { authorName: metadata.authorName } : {}),
            ...(metadata.subtitle ? { subtitle: metadata.subtitle } : {}),
            ...(metadata.language ? { language: metadata.language } : {}),
            ...(metadata.series ? { series: metadata.series } : {}),
            ...(Array.isArray(metadata.tags) && metadata.tags.length ? { tags: metadata.tags } : {})
          }
        : {}
    const projectId = await db.transaction('rw', db.projects, db.manuscripts, async () => {
      const id = await db.projects.add({
        name,
        genre,
        category,
        description,
        userId,
        // Cloud-audit consent is opt-in and per project; a new book starts off.
        cloudAuditOptIn: false,
        ...meta,
        createdAt: now,
        updatedAt: now
      })
      await db.manuscripts.add({
        projectId: id,
        content: '',
        wordCount: 0,
        updatedAt: now
      })
      return id
    })
    return projectId
  } catch (error) {
    console.error('Failed to create project:', error)
    throw error
  }
}

export async function updateProject(id: any, data: any) {
  try {
    const now = new Date().toISOString()
    const cleanData = JSON.parse(JSON.stringify(data))
    await db.projects.update(id, {
      ...cleanData,
      updatedAt: now
    })
  } catch (error) {
    console.error('Failed to update project:', error)
    throw error
  }
}

export async function getProject(id: any) {
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

export async function getManuscript(projectId: any) {
  try {
    return await db.manuscripts.where('projectId').equals(projectId).first()
  } catch (error) {
    console.error('Failed to get manuscript:', error)
    throw error
  }
}

export async function saveManuscript(projectId: any, content: any) {
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

export async function updateProjectMeta(projectId: any, data: any) {
  const cleanData = JSON.parse(JSON.stringify(data))
  return db.projects.update(projectId, cleanData)
}
