import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'versatile-cost-logs'
const MAX_LOG_SIZE = 500

interface CostLogEntry {
  id: number
  timestamp: number
  model?: string
  provider?: string
  /** Which AI feature incurred the cost (FEATURES.*). */
  feature?: string
  /** Pipeline phase (e.g. 'story-generation', 'polish-analysis', 'spark'). */
  phase?: string
  cost: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

interface BreakdownEntry {
  count: number
  totalCost: number
  totalTokens: number
}

interface StringMap<T> {
  [key: string]: T
}

function loadPersistedLogs(): CostLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

let nextId = 1

export const useCostTrackingStore = defineStore('costTracking', () => {
  const sessionLog = ref(loadPersistedLogs())

  if (sessionLog.value.length > 0) {
    nextId = Math.max(...sessionLog.value.map((e: CostLogEntry) => e.id)) + 1
  }

  function persist() {
    try {
      const trimmed = sessionLog.value.slice(-MAX_LOG_SIZE)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    } catch {
    }
  }

  function logCost(entry: Omit<CostLogEntry, 'id' | 'timestamp'>) {
    sessionLog.value.push({ id: nextId++, timestamp: Date.now(), ...entry })
    persist()
  }

  const sessionTotal = computed(() =>
    sessionLog.value.reduce((sum: number, e: CostLogEntry) => sum + e.cost, 0)
  )

  const totalPromptTokens = computed(() =>
    sessionLog.value.reduce((sum: number, e: CostLogEntry) => sum + (e.promptTokens || 0), 0)
  )

  const totalCompletionTokens = computed(() =>
    sessionLog.value.reduce((sum: number, e: CostLogEntry) => sum + (e.completionTokens || 0), 0)
  )

  const totalTokens = computed(() => totalPromptTokens.value + totalCompletionTokens.value)

  const breakdownByModel = computed(() => {
    const map: StringMap<BreakdownEntry> = {}
    for (const e of sessionLog.value) {
      const key = e.model || 'unknown'
      if (!map[key]) map[key] = { count: 0, totalCost: 0, totalTokens: 0 }
      map[key].count++
      map[key].totalCost += e.cost
      map[key].totalTokens += (e.totalTokens || 0)
    }
    return map
  })

  const breakdownByProvider = computed(() => {
    const map: StringMap<BreakdownEntry> = {}
    for (const e of sessionLog.value) {
      const key = e.provider || 'unknown'
      if (!map[key]) map[key] = { count: 0, totalCost: 0, totalTokens: 0 }
      map[key].count++
      map[key].totalCost += e.cost
      map[key].totalTokens += (e.totalTokens || 0)
    }
    return map
  })

  const breakdownByFeature = computed(() => {
    const map: StringMap<BreakdownEntry> = {}
    for (const e of sessionLog.value) {
      const key = e.feature || 'unknown'
      if (!map[key]) map[key] = { count: 0, totalCost: 0, totalTokens: 0 }
      map[key].count++
      map[key].totalCost += e.cost
      map[key].totalTokens += (e.totalTokens || 0)
    }
    return map
  })

  const breakdownByPhase = computed(() => {
    const map: StringMap<BreakdownEntry> = {}
    for (const e of sessionLog.value) {
      const key = e.phase || 'unknown'
      if (!map[key]) map[key] = { count: 0, totalCost: 0, totalTokens: 0 }
      map[key].count++
      map[key].totalCost += e.cost
      map[key].totalTokens += (e.totalTokens || 0)
    }
    return map
  })

  function displayCostBreakdown() {
    console.table({
      'Total Cost': `$${sessionTotal.value.toFixed(6)}`,
      'By Model': Object.fromEntries(
        Object.entries(breakdownByModel.value).map(([k, v]) => [k, `$${v.totalCost.toFixed(6)} (${v.count} calls)`])
      ),
      'By Provider': Object.fromEntries(
        Object.entries(breakdownByProvider.value).map(([k, v]) => [k, `$${v.totalCost.toFixed(6)} (${v.count} calls)`])
      ),
      'By Feature': Object.fromEntries(
        Object.entries(breakdownByFeature.value).map(([k, v]) => [k, `$${v.totalCost.toFixed(6)} (${v.count} calls)`])
      ),
      'By Phase': Object.fromEntries(
        Object.entries(breakdownByPhase.value).map(([k, v]) => [k, `$${v.totalCost.toFixed(6)} (${v.count} calls)`])
      )
    })
  }

  function clearSession() {
    sessionLog.value = []
    localStorage.removeItem(STORAGE_KEY)
  }

  return {
    sessionLog,
    logCost,
    sessionTotal,
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    breakdownByModel,
    breakdownByProvider,
    breakdownByFeature,
    breakdownByPhase,
    displayCostBreakdown,
    clearSession
  }
})
