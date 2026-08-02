/**
 * Persistence for the scene digest layer.
 *
 * `[projectId+subsectionId]` is unique, so a digest is REPLACED rather than
 * accumulated — there is one live digest per scene, matching the current prose.
 * History lives in `snapshots`, not here.
 */
import { db as _db } from './db-core'
import { isDigestStale, type SceneDigest } from './generation/sceneDigest'

const db = _db as any

export async function putSceneDigest(digest: SceneDigest) {
  const existing = await db.sceneDigests
    .where('[projectId+subsectionId]')
    .equals([digest.projectId, digest.subsectionId])
    .first()
  if (existing) {
    await db.sceneDigests.update(existing.id, digest)
    return existing.id
  }
  return db.sceneDigests.add(digest)
}

export async function getSceneDigest(projectId: string, subsectionId: string) {
  return db.sceneDigests
    .where('[projectId+subsectionId]')
    .equals([projectId, subsectionId])
    .first()
}

export async function getProjectDigests(projectId: string): Promise<SceneDigest[]> {
  const rows = await db.sceneDigests.where('projectId').equals(projectId).toArray()
  return rows.sort((a: any, b: any) => (a.sceneNumber ?? 0) - (b.sceneNumber ?? 0))
}

export async function deleteSceneDigest(projectId: string, subsectionId: string) {
  const existing = await getSceneDigest(projectId, subsectionId)
  if (existing) await db.sceneDigests.delete(existing.id)
}

/**
 * Which scenes need their digest recomputed.
 *
 * This is what makes whole-manuscript analysis O(dirty) rather than O(n): a
 * normal editing session dirties a handful of scenes, not three hundred.
 */
export async function findStaleDigests(
  projectId: string,
  subsections: Array<{ id: string; content?: string }>
): Promise<Array<{ id: string; content?: string }>> {
  const existing = await getProjectDigests(projectId)
  const byId = new Map(existing.map((d: any) => [d.subsectionId, d]))
  return subsections.filter((s) => {
    if (!s?.content || !String(s.content).trim()) return false
    return isDigestStale(byId.get(s.id), s.content)
  })
}

/** Coverage, for reporting how much of a manuscript has been analysed. */
export async function getDigestCoverage(
  projectId: string,
  subsections: Array<{ id: string; content?: string }>
) {
  const withContent = subsections.filter((s) => s?.content && String(s.content).trim())
  const stale = await findStaleDigests(projectId, withContent)
  return {
    total: withContent.length,
    fresh: withContent.length - stale.length,
    stale: stale.length
  }
}

/** Chapter digest — rollup of scene digests within one chapter. */
export interface ChapterDigest {
  projectId: string
  chapterNumber: number
  volumeId: string | null
  contentHash: string
  updatedAt: string
  sceneCount: number
  totalWordCount: number
  charactersPresent: string[]
  locations: string[]
  timelineStart: string | null
  timelineEnd: string | null
  summary: string
}

/** Volume digest — rollup of chapter digests within one volume. */
export interface VolumeDigest {
  projectId: string
  volumeId: string
  contentHash: string
  updatedAt: string
  chapterCount: number
  totalWordCount: number
  charactersPresent: string[]
  locations: string[]
  summary: string
}

/** Entity state timeline — tracks entity state changes per scene for contradiction detection. */
export interface EntityState {
  projectId: string
  entityType: 'character' | 'location' | 'object' | 'plotThread'
  entityId: string
  sceneId: string
  stateHash: string
  updatedAt: string
}

export async function putChapterDigest(digest: ChapterDigest) {
  const existing = await db.chapterDigests
    .where('[projectId+chapterNumber]')
    .equals([digest.projectId, digest.chapterNumber])
    .first()
  if (existing) {
    await db.chapterDigests.update(existing.id, digest)
    return existing.id
  }
  return db.chapterDigests.add(digest)
}

export async function getChapterDigest(projectId: string, chapterNumber: number) {
  return db.chapterDigests
    .where('[projectId+chapterNumber]')
    .equals([projectId, chapterNumber])
    .first()
}

export async function getProjectChapterDigests(projectId: string): Promise<ChapterDigest[]> {
  const rows = await db.chapterDigests.where('projectId').equals(projectId).toArray()
  return rows.sort((a: any, b: any) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0))
}

export async function putVolumeDigest(digest: VolumeDigest) {
  const existing = await db.volumeDigests
    .where('[projectId+volumeId]')
    .equals([digest.projectId, digest.volumeId])
    .first()
  if (existing) {
    await db.volumeDigests.update(existing.id, digest)
    return existing.id
  }
  return db.volumeDigests.add(digest)
}

export async function getVolumeDigest(projectId: string, volumeId: string) {
  return db.volumeDigests
    .where('[projectId+volumeId]')
    .equals([projectId, volumeId])
    .first()
}

export async function getProjectVolumeDigests(projectId: string): Promise<VolumeDigest[]> {
  const rows = await db.volumeDigests.where('projectId').equals(projectId).toArray()
  return rows
}

/** Entity state timeline — tracks state changes per entity for contradiction candidate generation. */
export async function putEntityState(state: EntityState) {
  const existing = await db.entityStates
    .where('[projectId+entityType+entityId+sceneId]')
    .equals([state.projectId, state.entityType, state.entityId, state.sceneId])
    .first()
  if (existing) {
    await db.entityStates.update(existing.id, state)
    return existing.id
  }
  return db.entityStates.add(state)
}

export async function getEntityStatesForProject(projectId: string): Promise<EntityState[]> {
  return db.entityStates.where('projectId').equals(projectId).toArray()
}

export async function getEntityStatesForEntity(
  projectId: string,
  entityType: string,
  entityId: string
): Promise<EntityState[]> {
  return db.entityStates
    .where('[projectId+entityType+entityId]')
    .equals([projectId, entityType, entityId])
    .toArray()
}

export async function getEntityStatesForScene(
  projectId: string,
  sceneId: string
): Promise<EntityState[]> {
  return db.entityStates
    .where('[projectId+entityType+entityId+sceneId]')
    .equals([projectId, '', '', sceneId]) // workaround for compound index
    .toArray()
    .then((rows: any[]) => rows.filter((r: any) => r.sceneId === sceneId))
}
