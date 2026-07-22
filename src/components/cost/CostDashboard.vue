<template>
  <div class="space-y-3 p-3">
    <!-- Summary Stats Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <div class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3 text-center">
        <p class="text-lg font-bold text-text-primary font-ui tabular-nums">
          ${{ sessionTotal.toFixed(4) }}
        </p>
        <p class="text-2xs text-text-hint font-ui">Session Cost</p>
      </div>
      <div class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3 text-center">
        <p class="text-lg font-bold text-text-primary font-ui tabular-nums">
          {{ totalTokens.toLocaleString() }}
        </p>
        <p class="text-2xs text-text-hint font-ui">Total Tokens</p>
      </div>
      <div class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3 text-center">
        <p class="text-lg font-bold text-text-primary font-ui tabular-nums">
          {{ totalCalls }}
        </p>
        <p class="text-2xs text-text-hint font-ui">API Calls</p>
      </div>
    </div>

    <!-- Breakdown by Model -->
    <div
      v-if="modelBreakdown.length > 0"
      class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3"
    >
      <h4 class="text-11px uppercase tracking-wider text-text-hint font-ui mb-2">By Model</h4>
      <div class="space-y-1.5">
        <div v-for="m in modelBreakdown" :key="m.name" class="flex items-center gap-2 text-xs">
          <span class="font-ui text-text-primary w-28 truncate shrink-0">{{ m.name }}</span>
          <div class="flex-1 h-2 rounded-full bg-bg-tertiary overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="m.barClass"
              :style="{ width: m.barWidth + '%' }"
            ></div>
          </div>
          <span class="font-ui text-text-hint w-16 text-right shrink-0 tabular-nums"
            >${{ (m.totalCost || 0).toFixed(4) }}</span
          >
          <span class="font-ui text-text-hint w-10 text-right shrink-0 tabular-nums">{{ m.count }}</span>
        </div>
      </div>
    </div>

    <!-- Breakdown by Provider -->
    <div
      v-if="providerBreakdown.length > 0"
      class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3"
    >
      <h4 class="text-11px uppercase tracking-wider text-text-hint font-ui mb-2">By Provider</h4>
      <div class="space-y-1.5">
        <div v-for="p in providerBreakdown" :key="p.name" class="flex items-center gap-2 text-xs">
          <span class="font-ui text-text-primary w-28 truncate shrink-0">{{ p.name }}</span>
          <div class="flex-1 h-2 rounded-full bg-bg-tertiary overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="p.barClass"
              :style="{ width: p.barWidth + '%' }"
            ></div>
          </div>
          <span class="font-ui text-text-hint w-16 text-right shrink-0 tabular-nums"
            >${{ (p.totalCost || 0).toFixed(4) }}</span
          >
          <span class="font-ui text-text-hint w-10 text-right shrink-0 tabular-nums">{{ p.count }}</span>
        </div>
      </div>
    </div>

    <!-- Recent Log -->
    <div
      v-if="recentLog.length > 0"
      class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3"
    >
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-11px uppercase tracking-wider text-text-hint font-ui">Recent Calls</h4>
        <button
          class="text-2xs text-text-hint hover:text-danger flex items-center gap-1 transition-colors"
          @click="store.clearSession()"
        >
          <BaseIcon name="trash-2" :size="11" />
          Clear
        </button>
      </div>
      <div class="space-y-1 max-h-[240px] overflow-y-auto scrollbar-thin">
        <div
          v-for="entry in recentLog"
          :key="entry.id"
          class="flex items-center gap-2 text-2xs font-ui py-1 px-1.5 rounded hover:bg-surface-hover transition-colors"
        >
          <span class="text-text-hint w-14 shrink-0 tabular-nums">{{ formatTime(entry.timestamp) }}</span>
          <span class="text-text-primary w-20 truncate shrink-0">{{ entry.model || '—' }}</span>
          <span class="text-text-hint w-16 truncate shrink-0">{{ entry.provider || '—' }}</span>
          <span class="text-text-secondary flex-1 truncate">{{ entry.label || '' }}</span>
          <span class="text-text-primary tabular-nums shrink-0">${{ (entry.cost || 0).toFixed(4) }}</span>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="totalCalls === 0"
      class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-6 text-center"
    >
      <BaseIcon name="dollar-sign" :size="24" class="mx-auto text-text-hint mb-2" />
      <p class="text-sm text-text-secondary font-ui">No cost data yet</p>
      <p class="text-xs text-text-hint mt-1">
        Cost tracking will appear as AI calls are made.
      </p>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'
import { useCostTrackingStore } from '../../stores/costTrackingStore'

export default {
  name: 'CostDashboard',
  components: { BaseIcon },
  setup() {
    const store = useCostTrackingStore()

    const sessionTotal = computed(() => store.sessionTotal)
    const totalTokens = computed(() => store.totalTokens)
    const totalCalls = computed(() => store.sessionLog.length)

    const maxModelCost = computed(() => {
      const vals = Object.values(store.breakdownByModel)
      return vals.length ? Math.max(...vals.map((m) => m.totalCost)) : 1
    })

    const modelBreakdown = computed(() => {
      const max = maxModelCost.value
      return Object.entries(store.breakdownByModel).map(([name, data]) => {
        const pct = max > 0 ? (data.totalCost / max) * 100 : 0
        const barClass =
          pct >= 80 ? 'bg-danger' : pct >= 50 ? 'bg-warning' : 'bg-accent'
        return { name, ...data, barWidth: pct, barClass }
      })
    })

    const maxProviderCost = computed(() => {
      const vals = Object.values(store.breakdownByProvider)
      return vals.length ? Math.max(...vals.map((p) => p.totalCost)) : 1
    })

    const providerBreakdown = computed(() => {
      const max = maxProviderCost.value
      return Object.entries(store.breakdownByProvider).map(([name, data]) => {
        const pct = max > 0 ? (data.totalCost / max) * 100 : 0
        const barClass =
          pct >= 80 ? 'bg-danger' : pct >= 50 ? 'bg-warning' : 'bg-accent'
        return { name, ...data, barWidth: pct, barClass }
      })
    })

    const recentLog = computed(() => {
      return [...store.sessionLog].reverse().slice(0, 50)
    })

    function formatTime(ts) {
      if (!ts) return '—'
      const d = new Date(ts)
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      return `${hh}:${mm}`
    }

    return {
      store,
      sessionTotal,
      totalTokens,
      totalCalls,
      modelBreakdown,
      providerBreakdown,
      recentLog,
      formatTime
    }
  }
}
</script>
