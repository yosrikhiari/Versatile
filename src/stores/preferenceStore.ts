import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as dbPrefs from '../services/db-preferences'

export type PairwisePreference = dbPrefs.DraftPreference

export const usePreferenceStore = defineStore('preferences', () => {
  const preferences = ref<PairwisePreference[]>([])

  const totalCount = computed(() => preferences.value.length)

  const sceneIds = computed(() => {
    const ids = new Set(preferences.value.map((p) => p.sceneId))
    return [...ids]
  })

  function getPreferencesForScene(sceneId: string) {
    return preferences.value.filter((p) => p.sceneId === sceneId)
  }

  function getWinCounts() {
    const wins: Record<string, number> = {}
    const losses: Record<string, number> = {}
    for (const p of preferences.value) {
      wins[p.winnerId] = (wins[p.winnerId] || 0) + 1
      losses[p.loserId] = (losses[p.loserId] || 0) + 1
    }
    return { wins, losses }
  }

  function getModelWinRates() {
    const modelWins: Record<string, { wins: number; losses: number; winRate: number }> = {}
    for (const p of preferences.value) {
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

  function getPreferenceWeight(provider: string, model: string | null) {
    const rates = getModelWinRates()
    const key = `${provider}/${model || 'default'}`
    const entry = rates[key]
    if (!entry) return 1.0
    const total = entry.wins + entry.losses
    if (total < 2) return 1.0
    const weight = entry.winRate / 0.5
    return Math.min(Math.max(weight, 0.5), 1.5)
  }

  async function addPreference(pref: PairwisePreference) {
    const saved = await dbPrefs.savePreference(pref)
    preferences.value.unshift({ ...pref, id: saved })
  }

  async function loadPreferences(projectId: string) {
    const loaded = await dbPrefs.getPreferencesByProject(projectId)
    preferences.value = loaded
  }

  async function clearAll(projectId: string) {
    await dbPrefs.deletePreferencesByProject(projectId)
    preferences.value = []
  }

  return {
    preferences,
    totalCount,
    sceneIds,
    getPreferencesForScene,
    getWinCounts,
    getModelWinRates,
    getPreferenceWeight,
    addPreference,
    loadPreferences,
    clearAll
  }
})
