import { db as _db } from './db-core'

const db = _db as any

type Id = string | number
type Row = Record<string, unknown> & { id: Id }

export async function getBranches(projectId: any) {
  return db.branches.where({ projectId }).toArray()
}

export async function getBranch(id: any) {
  return db.branches.get(id)
}

export async function createBranch(
  projectId: any,
  name: any,
  sourceBranchId: any = null,
  opts: any = {}
) {
  const now = new Date().toISOString()
  const id = await db.branches.add({
    projectId,
    name,
    sourceBranchId,
    description: opts.description ?? '',
    status: opts.status ?? 'active',
    createdAt: now,
    updatedAt: now
  })
  const result = await db.branches.get(id)
  return result
}

export async function updateBranch(id: any, data: any) {
  const updates = { ...data, updatedAt: new Date().toISOString() }
  await db.branches.update(id, updates)
  return db.branches.get(id)
}

/**
 * Delete a branch and the chapters and scenes it owns (plus their scene
 * digests and entity states). Deleting only the branch row, as this used to,
 * left its rows orphaned: invisible to every branch-filtered read, but still
 * counted by anything that reads the project whole. `main` is never deleted.
 */
export async function deleteBranch(id: Id) {
  const branch = await db.branches.get(id)
  if (!branch) return
  if (branch.name === 'main') throw new Error('The main branch cannot be deleted')
  await db.transaction(
    'rw',
    [db.branches, db.sections, db.subsections, db.sceneDigests, db.entityStates],
    async () => {
      const subs = await db.subsections
        .where({ projectId: branch.projectId, branchId: id })
        .toArray()
      for (const sub of subs as Row[]) {
        await db.sceneDigests.where({ projectId: branch.projectId, subsectionId: sub.id }).delete()
        // Entity states store the scene id as a string (deriveEntityStates).
        await db.entityStates
          .where({ projectId: branch.projectId, sceneId: String(sub.id) })
          .delete()
      }
      await db.subsections.where({ projectId: branch.projectId, branchId: id }).delete()
      await db.sections.where({ projectId: branch.projectId, branchId: id }).delete()
      await db.branches.delete(id)
    }
  )
}

/**
 * Give every chapter and scene of a project that no branch of it owns to
 * `mainBranchId`. Such rows have no `branchId` (written before branches
 * existed, or by a caller that ran before the branch store had loaded) or one
 * that names a branch of another database (a JSON import). A branch-filtered
 * load cannot see them and a fork does not copy them, which is how a what-if
 * of a real book came back "done" with nothing in it. Returns the rows moved.
 */
export async function adoptUnbranchedRows(projectId: Id, mainBranchId: Id): Promise<number> {
  const own = new Set(
    ((await db.branches.where({ projectId }).toArray()) as Row[]).map((b) => String(b.id))
  )
  let moved = 0
  await db.transaction('rw', db.sections, db.subsections, async () => {
    for (const table of [db.sections, db.subsections]) {
      const rows: Row[] = await table.where('projectId').equals(projectId).toArray()
      for (const row of rows) {
        if (row.branchId == null || !own.has(String(row.branchId))) {
          await table.update(row.id, { branchId: mainBranchId })
          moved++
        }
      }
    }
  })
  return moved
}

// Fields a copy must not inherit: its own identity, and the source row's link
// to a server record (a copy that kept `apiId` would sync over the original).
const NOT_COPIED = [
  'id',
  'branchId',
  'apiId',
  'syncStatus',
  'lastSyncedAt',
  'createdAt',
  'updatedAt'
]

function copyOf(row: Row) {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) if (!NOT_COPIED.includes(k)) out[k] = v
  return out
}

/**
 * Copy every chapter and scene of `sourceBranchId` into `targetBranchId`,
 * prose included, in one transaction. Each copy records the row it came from
 * (`sourceSectionId` / `sourceSubsectionId`) so compare and merge can match a
 * branch scene to its original by identity rather than by title. Returns the
 * source-id -> copy-id maps.
 */
export async function copyManuscriptToBranch(
  projectId: Id,
  sourceBranchId: Id,
  targetBranchId: Id
): Promise<{ sections: Map<Id, Id>; subsections: Map<Id, Id> }> {
  const sections = new Map<Id, Id>()
  const subsections = new Map<Id, Id>()
  await db.transaction('rw', db.sections, db.subsections, async () => {
    const srcSections: Row[] = await db.sections
      .where({ projectId, branchId: sourceBranchId })
      .toArray()
    const srcSubs: Row[] = await db.subsections
      .where({ projectId, branchId: sourceBranchId })
      .toArray()
    const now = new Date().toISOString()
    for (const s of srcSections) {
      const id = await db.sections.add({
        ...copyOf(s),
        branchId: targetBranchId,
        sourceSectionId: s.id,
        createdAt: now,
        updatedAt: now
      })
      sections.set(s.id, id)
    }
    for (const sub of srcSubs) {
      const sectionId = sections.get(sub.sectionId as Id)
      if (sectionId == null) continue
      const id = await db.subsections.add({
        ...copyOf(sub),
        sectionId,
        branchId: targetBranchId,
        sourceSubsectionId: sub.id,
        createdAt: now,
        updatedAt: now
      })
      subsections.set(sub.id, id)
    }
  })
  await copyKnowledge(projectId, sourceBranchId, targetBranchId, subsections)
  return { sections, subsections }
}

/**
 * The branch starts knowing what its source knew: each copied scene gets its
 * source's digest and entity states, and the source's chapter and volume
 * rollups are copied under the new branch. Without this a fresh what-if branch
 * had no summaries, facts or timeline until the whole book was read again.
 */
async function copyKnowledge(
  projectId: Id,
  sourceBranchId: Id,
  targetBranchId: Id,
  subsections: Map<Id, Id>
) {
  const source = (await db.branches.get(sourceBranchId)) as Row | undefined
  const sourceIsMain = source?.name === 'main'
  const fromSource = (row: Row) =>
    row.branchId == null ? sourceIsMain : String(row.branchId) === String(sourceBranchId)
  const bySource = new Map([...subsections].map(([from, to]) => [String(from), to]))
  const now = new Date().toISOString()
  await db.transaction(
    'rw',
    [db.sceneDigests, db.entityStates, db.chapterDigests, db.volumeDigests],
    async () => {
      const digests: Row[] = await db.sceneDigests.where('projectId').equals(projectId).toArray()
      for (const d of digests) {
        const to = bySource.get(String(d.subsectionId))
        if (to != null)
          await db.sceneDigests.add({ ...copyOf(d), subsectionId: to, updatedAt: now })
      }
      const states: Row[] = await db.entityStates.where('projectId').equals(projectId).toArray()
      const copies = states
        .filter((st) => bySource.has(String(st.sceneId)))
        .map((st) => ({ ...copyOf(st), sceneId: String(bySource.get(String(st.sceneId))) }))
      if (copies.length) await db.entityStates.bulkAdd(copies)
      for (const table of [db.chapterDigests, db.volumeDigests]) {
        const rows: Row[] = await table.where('projectId').equals(projectId).toArray()
        for (const row of rows.filter(fromSource)) {
          await table.add({ ...copyOf(row), branchId: targetBranchId, updatedAt: now })
        }
      }
    }
  )
}

export async function ensureMainBranch(projectId: any) {
  const existing = await db.branches.where({ projectId, name: 'main' }).first()
  if (existing) return existing
  return createBranch(projectId, 'main')
}
