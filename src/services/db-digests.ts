/**
 * Persistence for the scene digest layer.
 *
 * `[projectId+subsectionId]` is unique, so a digest is REPLACED rather than
 * accumulated — there is one live digest per scene, matching the current prose.
 * History lives in `snapshots`, not here.
 */
import { db as _db } from './db-core'
import { isDigestStale, type SceneDigest } from './generation/sceneDigest'
import type { EntityStateRecord } from './generation/entityStates'

const db = _db as any

// ── branch scope ───────────────────────────────────────────────────────────
//
// Story knowledge follows the branch being read (WHATIF-AND-IMPORT-PLAN.md,
// decision 9). Scene digests and entity states are keyed by scene, so each
// branch already has its own and reads only need filtering to the branch's
// scenes; chapter and volume digests carry `branchId` (schema v55). The branch
// store sets the scope whenever the active branch changes; with no scope set
// (tests, a project not opened through the store) reads are project-wide, as
// they always were.

interface BranchScope {
  branchId: string | number
  isMain: boolean
}
const scopes = new Map<string, BranchScope>()

export function setDigestBranchScope(
  projectId: string | number,
  branchId: string | number | null,
  isMain = false
) {
  if (branchId == null) scopes.delete(String(projectId))
  else scopes.set(String(projectId), { branchId, isMain })
}

export function digestBranchScope(projectId: string | number): BranchScope | null {
  return scopes.get(String(projectId)) || null
}

/** The scene ids of the scoped branch, or null for "every scene of the project". */
async function scopedSceneIds(projectId: string): Promise<Set<string> | null> {
  const scope = digestBranchScope(projectId)
  if (!scope) return null
  const ids = await db.subsections.where({ projectId, branchId: scope.branchId }).primaryKeys()
  return new Set(ids.map((id: unknown) => String(id)))
}

type ScopedRow = { branchId?: unknown; subsectionId?: unknown; sceneId?: unknown }

/** A chapter/volume digest row belongs to the scoped branch (legacy rows: main). */
function inScope(projectId: string, row: { branchId?: unknown }): boolean {
  const scope = digestBranchScope(projectId)
  if (!scope) return true
  if (row.branchId == null) return scope.isMain
  return String(row.branchId) === String(scope.branchId)
}

function scopeBranchId(projectId: string) {
  return digestBranchScope(projectId)?.branchId ?? null
}

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
  return db.sceneDigests.where('[projectId+subsectionId]').equals([projectId, subsectionId]).first()
}

export async function getProjectDigests(projectId: string): Promise<SceneDigest[]> {
  const [all, ids] = await Promise.all([
    db.sceneDigests.where('projectId').equals(projectId).toArray(),
    scopedSceneIds(projectId)
  ])
  const rows = ids ? all.filter((d: ScopedRow) => ids.has(String(d.subsectionId))) : all
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
  /** The branch this rollup describes (v55); absent on rows written before branches mattered. */
  branchId?: string | number | null
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
  branchId?: string | number | null
  volumeId: string
  contentHash: string
  updatedAt: string
  chapterCount: number
  totalWordCount: number
  charactersPresent: string[]
  locations: string[]
  summary: string
}

/**
 * Entity state timeline — what was true of each entity, at each point in the story.
 *
 * The row shape lives with the derivation in `generation/entityStates`, which is
 * the only thing that produces one. This alias keeps the historical import path
 * working for the contradiction rules.
 */
export type { EntityStateRecord }
export type EntityState = EntityStateRecord

export async function putChapterDigest(digest: ChapterDigest) {
  const branchId = digest.branchId ?? scopeBranchId(digest.projectId)
  digest = { ...digest, branchId }
  const existing = await db.chapterDigests
    .where('[projectId+chapterNumber]')
    .equals([digest.projectId, digest.chapterNumber])
    .filter(
      (row: ScopedRow) =>
        (row.branchId ?? null) === (branchId ?? null) ||
        (row.branchId == null && inScope(digest.projectId, row))
    )
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
    .filter((row: ScopedRow) => inScope(projectId, row))
    .first()
}

export async function getProjectChapterDigests(projectId: string): Promise<ChapterDigest[]> {
  const rows = (await db.chapterDigests.where('projectId').equals(projectId).toArray()).filter(
    (row: ScopedRow) => inScope(projectId, row)
  )
  return rows.sort((a: any, b: any) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0))
}

export async function putVolumeDigest(digest: VolumeDigest) {
  const branchId = digest.branchId ?? scopeBranchId(digest.projectId)
  digest = { ...digest, branchId }
  const existing = await db.volumeDigests
    .where('[projectId+volumeId]')
    .equals([digest.projectId, digest.volumeId])
    .filter(
      (row: ScopedRow) =>
        (row.branchId ?? null) === (branchId ?? null) ||
        (row.branchId == null && inScope(digest.projectId, row))
    )
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
    .filter((row: ScopedRow) => inScope(projectId, row))
    .first()
}

export async function getProjectVolumeDigests(projectId: string): Promise<VolumeDigest[]> {
  const rows = await db.volumeDigests.where('projectId').equals(projectId).toArray()
  return rows.filter((row: ScopedRow) => inScope(projectId, row))
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
  const [rows, ids] = await Promise.all([
    db.entityStates.where('projectId').equals(projectId).toArray(),
    scopedSceneIds(projectId)
  ])
  return ids ? rows.filter((s: ScopedRow) => ids.has(String(s.sceneId))) : rows
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
  // Was a query against `[projectId, '', '', sceneId]` on the four-part compound
  // index — a key no row can ever hold, since entityType and entityId are never
  // empty — followed by a filter over the empty result. It could only ever
  // return nothing. v47 adds the `[projectId+sceneId]` index this needs.
  return db.entityStates.where('[projectId+sceneId]').equals([projectId, sceneId]).toArray()
}

/**
 * Replace every state row for one scene, in one transaction.
 *
 * Replace rather than merge: a scene's states are wholly derived from its prose,
 * so when the prose changes the old rows are not stale-but-useful, they are
 * wrong. Leaving them would let a character who was killed in a draft stay dead
 * in the timeline after the author rewrote the scene — a contradiction reported
 * against text that no longer exists.
 */
export async function replaceSceneEntityStates(
  projectId: string,
  sceneId: string,
  states: EntityState[]
) {
  return db.transaction('rw', db.entityStates, async () => {
    const existing = await db.entityStates
      .where('[projectId+sceneId]')
      .equals([projectId, sceneId])
      .primaryKeys()
    if (existing.length) await db.entityStates.bulkDelete(existing)
    if (states.length) await db.entityStates.bulkAdd(states)
    return states.length
  })
}

/** Every state row for a project, in story order (chapter, then scene). */
export async function getEntityStateTimeline(projectId: string): Promise<EntityState[]> {
  const rows = await getEntityStatesForProject(projectId)
  return rows.sort(
    (a: any, b: any) =>
      (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0) || (a.sceneNumber ?? 0) - (b.sceneNumber ?? 0)
  )
}

/** Drop a scene's states — used when the scene itself is deleted. */
export async function deleteSceneEntityStates(projectId: string, sceneId: string) {
  const keys = await db.entityStates
    .where('[projectId+sceneId]')
    .equals([projectId, sceneId])
    .primaryKeys()
  if (keys.length) await db.entityStates.bulkDelete(keys)
  return keys.length
}
