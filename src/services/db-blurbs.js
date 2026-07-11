import { db, deepPlain } from './db-core'

export async function getBlurbsByProject(projectId) {
  try {
    const results = await db.projectBlurbs.where('projectId').equals(projectId).reverse().toArray()
    return results
  } catch (err) {
    console.error('[db-blurbs] getBlurbsByProject error:', err)
    return []
  }
}

export async function saveBlurb(entry) {
  try {
    const plain = deepPlain(entry)
    const id = await db.projectBlurbs.add(plain)
    return id
  } catch (err) {
    console.error('[db-blurbs] saveBlurb error:', err)
    return null
  }
}

export async function deleteBlurb(id) {
  try {
    await db.projectBlurbs.delete(id)
    return true
  } catch (err) {
    console.error('[db-blurbs] deleteBlurb error:', err)
    return false
  }
}

export async function deleteBlurbsByProject(projectId) {
  try {
    await db.projectBlurbs.where('projectId').equals(projectId).delete()
  } catch (err) {
    console.error('[db-blurbs] deleteBlurbsByProject error:', err)
  }
}
