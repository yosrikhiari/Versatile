import { db } from './db-core'

export async function getBranches(projectId) {
  return db.branches.where({ projectId }).toArray()
}

export async function getBranch(id) {
  return db.branches.get(id)
}

export async function createBranch(projectId, name, sourceBranchId = null, opts = {}) {
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
  return db.branches.get(id)
}

export async function updateBranch(id, data) {
  const updates = { ...data, updatedAt: new Date().toISOString() }
  await db.branches.update(id, updates)
  return db.branches.get(id)
}

export async function deleteBranch(id) {
  await db.branches.delete(id)
}

export async function ensureMainBranch(projectId) {
  const existing = await db.branches
    .where({ projectId, name: 'main' })
    .first()
  if (existing) return existing
  return createBranch(projectId, 'main')
}
