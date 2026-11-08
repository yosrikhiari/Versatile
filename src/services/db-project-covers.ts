import { db } from './db-core'

/**
 * Project cover images (local-only, schema v59).
 *
 * Stored in a separate table and deliberately NOT synced: `projects` is synced,
 * but cover blobs are large and have no sync contract. One cover per project.
 */

type ProjectId = number | string

export interface ProjectCover {
  id?: number
  projectId: ProjectId
  blob: Blob
  mimeType: string
  updatedAt: string
}

export async function getProjectCover(projectId: ProjectId | null | undefined) {
  if (projectId == null) return null
  const row = (await db.projectCovers.where('projectId').equals(projectId).first()) as
    ProjectCover | undefined
  return row || null
}

export async function saveProjectCover(
  projectId: ProjectId | null | undefined,
  image: Blob | File
) {
  if (projectId == null) throw new Error('projectId is required')
  if (!(image instanceof Blob)) throw new Error('image must be a Blob or File')
  const now = new Date().toISOString()
  const mimeType = image.type || 'image/png'
  const existing = (await db.projectCovers.where('projectId').equals(projectId).first()) as
    ProjectCover | undefined
  if (existing?.id != null) {
    await db.projectCovers.update(existing.id, {
      blob: image,
      mimeType,
      updatedAt: now
    })
    return existing.id
  }
  return (await db.projectCovers.add({
    projectId,
    blob: image,
    mimeType,
    updatedAt: now
  } as ProjectCover)) as number
}

export async function deleteProjectCover(projectId: ProjectId | null | undefined) {
  if (projectId == null) return
  await db.projectCovers.where('projectId').equals(projectId).delete()
}
