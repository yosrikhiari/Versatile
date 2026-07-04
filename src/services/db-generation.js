import { db, deepPlain } from './db-core'

// Persistence for one-click generation runs. Stores a lightweight, JSON-plain
// checkpoint (the plan + progress markers, NOT prose — prose already lives in
// subsections) so an interrupted unattended draft can be detected and resumed.
// One row per project (projectId is a unique index).

export async function saveGenRun(projectId, state) {
  if (!projectId) return null
  try {
    const plainState = deepPlain(state)
    const existing = await db.genRuns.where('projectId').equals(projectId).first()
    if (existing) {
      await db.genRuns.update(existing.id, { updatedAt: Date.now(), state: plainState })
      return existing.id
    }
    return await db.genRuns.add({ projectId, updatedAt: Date.now(), state: plainState })
  } catch (error) {
    // Checkpointing is best-effort — never let it break the generation run
    console.warn('Failed to save generation checkpoint:', error)
    return null
  }
}

export async function getGenRun(projectId) {
  if (!projectId) return null
  try {
    return await db.genRuns.where('projectId').equals(projectId).first()
  } catch (error) {
    console.error('Failed to read generation checkpoint:', error)
    return null
  }
}

export async function clearGenRun(projectId) {
  if (!projectId) return
  try {
    const rows = await db.genRuns.where('projectId').equals(projectId).toArray()
    if (rows.length) await db.genRuns.bulkDelete(rows.map((r) => r.id))
  } catch (error) {
    console.warn('Failed to clear generation checkpoint:', error)
  }
}
