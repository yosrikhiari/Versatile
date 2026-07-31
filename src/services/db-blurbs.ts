import { toRaw } from 'vue'
import { db as _db } from './db-core'
import { guardStorageWrite } from '../guardrails/integration/storageGuardrails'

const db = _db as any

export async function getBlurbsByProject(projectId: string) {
  try {
    const results = await db.projectBlurbs.where('projectId').equals(projectId).reverse().toArray()
    return results
  } catch (err) {
    console.error('[db-blurbs] getBlurbsByProject error:', err)
    return []
  }
}

export async function saveBlurb(entry: any) {
  try {
    const plain = JSON.parse(JSON.stringify(toRaw(entry)))
    guardStorageWrite('projectBlurbs', plain, { entryPoint: 'db-blurbs.saveBlurb' })
    const id = await db.projectBlurbs.add(plain)
    return id
  } catch (err) {
    console.error('[db-blurbs] saveBlurb error:', err)
    return null
  }
}

export async function deleteBlurb(id: string) {
  try {
    await db.projectBlurbs.delete(id)
    return true
  } catch (err) {
    console.error('[db-blurbs] deleteBlurb error:', err)
    return false
  }
}

export async function deleteBlurbsByProject(projectId: string) {
  try {
    await db.projectBlurbs.where('projectId').equals(projectId).delete()
  } catch (err) {
    console.error('[db-blurbs] deleteBlurbsByProject error:', err)
  }
}
