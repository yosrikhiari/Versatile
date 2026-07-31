import { db as _db } from './db-core'
const db = _db as any

export interface DraftPreference {
  id?: number
  winnerId: string
  loserId: string
  sceneId: string
  projectId: string
  timestamp: string
  modelContext?: {
    winnerProvider: string
    winnerModel: string
    loserProvider: string
    loserModel: string
  }
}

export async function savePreference(pref: DraftPreference) {
  return db.evalPreferences.add({ ...pref, timestamp: pref.timestamp || new Date().toISOString() })
}

export async function getPreferencesByProject(projectId: string) {
  return db.evalPreferences.where('projectId').equals(projectId).reverse().sortBy('timestamp')
}

export async function getPreferencesByScene(projectId: string, sceneId: string) {
  return db.evalPreferences
    .where('[projectId+sceneId]')
    .equals([projectId, sceneId])
    .reverse()
    .toArray()
}

export async function getAllPreferences() {
  return db.evalPreferences.reverse().sortBy('timestamp')
}

export async function getWinCounts(projectId: string) {
  const all = await db.evalPreferences.where('projectId').equals(projectId).toArray()
  const wins: Record<string, number> = {}
  const losses: Record<string, number> = {}
  for (const p of all) {
    wins[p.winnerId] = (wins[p.winnerId] || 0) + 1
    losses[p.loserId] = (losses[p.loserId] || 0) + 1
  }
  return { wins, losses }
}

export async function getModelWinRates(projectId: string) {
  const all = await db.evalPreferences.where('projectId').equals(projectId).toArray()
  // `winRate` is part of the returned shape — this is `getModelWinRates`. The
  // record was typed as `{ wins, losses }` only, so the field the function
  // exists to produce was a type error on the way out. Matches the shape
  // stores/preferenceStore.ts already declares for its in-memory equivalent.
  const modelWins: Record<string, { wins: number; losses: number; winRate: number }> = {}
  for (const p of all) {
    if (p.modelContext) {
      const wKey = `${p.modelContext.winnerProvider}/${p.modelContext.winnerModel}`
      if (!modelWins[wKey]) modelWins[wKey] = { wins: 0, losses: 0, winRate: 0 }
      modelWins[wKey].wins++

      const lKey = `${p.modelContext.loserProvider}/${p.modelContext.loserModel}`
      if (!modelWins[lKey]) modelWins[lKey] = { wins: 0, losses: 0, winRate: 0 }
      modelWins[lKey].losses++
    }
  }
  for (const key of Object.keys(modelWins)) {
    const total = modelWins[key].wins + modelWins[key].losses
    modelWins[key].winRate = total > 0 ? modelWins[key].wins / total : 0.5
  }
  return modelWins
}

export async function deletePreferencesByProject(projectId: string) {
  return db.evalPreferences.where('projectId').equals(projectId).delete()
}
