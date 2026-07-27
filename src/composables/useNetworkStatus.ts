import { ref, computed, onMounted, onUnmounted } from 'vue'
import { isOnline, syncStatus } from '../services/sync-engine'
import { SYNC_ENTITIES } from '../services/sync-mapper'
import { db } from '../services/db-core'

/**
 * useNetworkStatus — reactive online/offline + pending-sync visibility (M-4.3).
 *
 * Wraps the sync engine's `isOnline` ref and `syncStatus` reactive, and adds a
 * live count of records still waiting to sync (`syncStatus` field starts with
 * "pending"). The count is polled on an interval and refreshed on demand so the
 * header badge stays current without wiring into every write path.
 */

const SYNC_TABLES = SYNC_ENTITIES.map((e) => e.table)

// Shared singleton state so multiple consumers see one count.
const pendingCount = ref(0)
let pollTimer: ReturnType<typeof setInterval> | null = null
let refCount = 0

async function refreshPendingCount() {
  if (!db?.isOpen?.()) return
  try {
    let total = 0
    for (const table of SYNC_TABLES) {
      const t = db.table?.(table)
      if (!t) continue
      // Records dirtied locally carry syncStatus 'pending-create' | 'pending-update'.
      const n = await t.where('syncStatus').startsWith('pending').count()
      total += n
    }
    pendingCount.value = total
  } catch {
    // Table may lack a syncStatus index or db may be mid-migration — leave stale.
  }
}

export function useNetworkStatus({ pollMs = 8000 } = {}) {
  onMounted(() => {
    refCount++
    if (!pollTimer) {
      refreshPendingCount()
      pollTimer = setInterval(refreshPendingCount, pollMs)
    }
  })

  onUnmounted(() => {
    refCount--
    if (refCount <= 0 && pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
      refCount = 0
    }
  })

  const state = computed(() => {
    if (!isOnline.value) return 'offline'
    return syncStatus.state // 'idle' | 'syncing' | 'error' | 'offline'
  })

  const hasPending = computed(() => pendingCount.value > 0)

  return {
    isOnline,
    syncStatus,
    state,
    pendingCount,
    hasPending,
    refreshPendingCount
  }
}
