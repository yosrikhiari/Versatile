import { db as _db } from './db-core'

const db = _db as any

export async function getBranches(projectId: any) {
  return db.branches.where({ projectId }).toArray()
}

export async function getBranch(id: any) {
  return db.branches.get(id)
}

export async function createBranch(projectId: any, name: any, sourceBranchId: any = null, opts: any = {}) {
  console.log('[DEBUG] db.createBranch | projectId:', projectId, '| name:', name, '| sourceBranchId:', sourceBranchId)
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
  console.log('[DEBUG] db.createBranch result:', result)
  return result
}

export async function updateBranch(id: any, data: any) {
  const updates = { ...data, updatedAt: new Date().toISOString() }
  await db.branches.update(id, updates)
  return db.branches.get(id)
}

export async function deleteBranch(id: any) {
  await db.branches.delete(id)
}

export async function ensureMainBranch(projectId: any) {
  const existing = await db.branches
    .where({ projectId, name: 'main' })
    .first()
  if (existing) return existing
  return createBranch(projectId, 'main')
}
