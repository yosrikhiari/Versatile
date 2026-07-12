<template>
  <div class="space-y-3">
    <!-- Loading state -->
    <div v-if="loading" class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-6 text-center">
      <p class="text-sm text-text-secondary font-ui">Loading benchmark report...</p>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-6 text-center">
      <BaseIcon name="alert-triangle" :size="20" class="mx-auto text-red-400 mb-2" />
      <p class="text-sm text-text-secondary font-ui">{{ error }}</p>
    </div>

    <!-- Empty state -->
    <div v-else-if="!reportData" class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-6 text-center">
      <BaseIcon name="bar-chart" :size="24" class="mx-auto text-text-hint mb-2" />
      <p class="text-sm text-text-secondary font-ui">No benchmark data available</p>
      <p class="text-xs text-text-hint mt-1">Run the model benchmarking pipeline to see results.</p>
    </div>

    <template v-if="reportData">
      <!-- Timestamp -->
      <div class="text-2xs text-text-hint font-ui px-1">
        {{ formatDate(reportData.timestamp) }}
      </div>

      <!-- Provider Summary Cards -->
      <div class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3">
        <h4 class="text-11px uppercase tracking-wider text-text-hint font-ui mb-2">Provider Summary</h4>
        <div class="grid grid-cols-1 gap-2">
          <div v-for="prov in sortedProviders" :key="prov" class="rounded-lg bg-bg-secondary/40 border border-border-subtle p-2.5">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold text-text-primary font-ui capitalize">{{ prov }}</span>
              <span class="text-2xs text-text-hint font-ui">{{ formatCost(aggregates[prov]?.estimatedTotalCost) }}</span>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center">
              <div>
                <p class="text-sm font-bold text-text-primary font-ui">{{ formatLatency(aggregates[prov]?.avgLatencyMs) }}</p>
                <p class="text-2xs text-text-hint font-ui">Latency</p>
              </div>
              <div>
                <p class="text-sm font-bold font-ui" :class="scoreColor(aggregates[prov]?.avgScore)">{{ formatScore(aggregates[prov]?.avgScore) }}</p>
                <p class="text-2xs text-text-hint font-ui">Score</p>
              </div>
              <div>
                <p class="text-sm font-bold font-ui" :class="reliabilityColor(aggregates[prov]?.reliability)">{{ formatPct(aggregates[prov]?.reliability) }}</p>
                <p class="text-2xs text-text-hint font-ui">Reliability</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Cost Breakdown -->
      <div v-if="hasMultiProvider" class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3">
        <h4 class="text-11px uppercase tracking-wider text-text-hint font-ui mb-2">Cost Comparison</h4>
        <div class="space-y-1.5">
          <div v-for="prov in sortedProvidersByCost" :key="prov" class="flex items-center gap-2 text-xs">
            <span class="font-ui text-text-primary w-20 truncate shrink-0 capitalize">{{ prov }}</span>
            <div class="flex-1 h-2.5 rounded-full bg-bg-tertiary overflow-hidden">
              <div
                class="h-full rounded-full"
                :class="costBarClass(prov)"
                :style="{ width: costBarWidth(prov) + '%' }"
              ></div>
            </div>
            <span class="font-ui text-text-secondary w-16 text-right">{{ formatCost(aggregates[prov]?.estimatedTotalCost) }}</span>
          </div>
        </div>
      </div>

      <!-- Score Distribution -->
      <div class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3">
        <h4 class="text-11px uppercase tracking-wider text-text-hint font-ui mb-2">Score Distribution</h4>
        <div v-if="scoreBuckets.length > 0" class="space-y-1">
          <div v-for="bucket in scoreBuckets" :key="bucket.label" class="flex items-center gap-2 text-xs">
            <span class="font-ui text-text-hint w-16 shrink-0">{{ bucket.label }}</span>
            <div class="flex-1 h-3 rounded-full bg-bg-tertiary overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="bucket.barClass"
                :style="{ width: bucket.pct + '%' }"
              ></div>
            </div>
            <span class="font-ui text-text-secondary w-8 text-right">{{ bucket.count }}</span>
          </div>
        </div>
        <p v-else class="text-xs text-text-hint font-ui text-center py-1">No scores to display</p>
      </div>

      <!-- Per-Test Results -->
      <div class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3">
        <h4 class="text-11px uppercase tracking-wider text-text-hint font-ui mb-2">Test Results</h4>
        <div class="space-y-2">
          <div v-for="test in testRows" :key="test.testId" class="rounded-lg bg-bg-secondary/40 border border-border-subtle p-2.5">
            <div class="text-xs font-bold text-text-primary font-ui mb-1.5">{{ test.label }}</div>
            <div class="space-y-1">
              <div v-for="(result, prov) in test.providers" :key="prov" class="flex items-center gap-2 text-2xs">
                <span class="font-ui text-text-hint w-16 shrink-0 capitalize">{{ prov }}</span>
                <span class="font-ui text-text-primary w-12 text-right">{{ result.latencyMs ? (result.latencyMs / 1000).toFixed(1) + 's' : '—' }}</span>
                <span class="font-ui w-10 text-right" :class="scoreColor(result.score)">{{ result.score != null ? result.score.toFixed(1) : '—' }}</span>
                <span class="font-ui text-text-secondary w-14 text-right">{{ result.wordCount ?? '—' }}w</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

export default {
  name: 'BenchmarkDashboard',
  components: { BaseIcon },
  props: {
    report: { type: Object, default: null },
    reportUrl: { type: String, default: '' }
  },
  setup(props) {
    const localReport = ref(null)
    const loading = ref(false)
    const error = ref(null)

    const reportData = computed(() => props.report || localReport.value)

    const providers = computed(() => reportData.value?.providers ?? [])
    const aggregates = computed(() => reportData.value?.aggregates ?? {})
    const comparisonMatrix = computed(() => reportData.value?.comparisonMatrix ?? [])

    const hasMultiProvider = computed(() => providers.value.length > 1)

    const providerColors = [
      'bg-emerald-500',
      'bg-blue-500',
      'bg-violet-500',
      'bg-amber-500',
      'bg-rose-500'
    ]

    const sortedProviders = computed(() => {
      return [...providers.value].sort((a, b) => {
        const sa = aggregates.value[a]?.avgScore ?? 0
        const sb = aggregates.value[b]?.avgScore ?? 0
        return sb - sa
      })
    })

    const sortedProvidersByCost = computed(() => {
      return [...providers.value].sort((a, b) => {
        const ca = aggregates.value[a]?.estimatedTotalCost ?? 0
        const cb = aggregates.value[b]?.estimatedTotalCost ?? 0
        return ca - cb
      })
    })

    const maxCost = computed(() => {
      return Math.max(
        ...providers.value.map((p) => aggregates.value[p]?.estimatedTotalCost ?? 0),
        0.01
      )
    })

    function costBarWidth(prov) {
      const cost = aggregates.value[prov]?.estimatedTotalCost ?? 0
      return Math.round((cost / maxCost.value) * 100)
    }

    function costBarClass(prov) {
      const cost = aggregates.value[prov]?.estimatedTotalCost ?? 0
      if (cost === 0) return 'bg-emerald-500'
      if (cost < maxCost.value * 0.5) return 'bg-emerald-500'
      return 'bg-amber-500'
    }

    const scoreBuckets = computed(() => {
      const providers = providers.value
      const allScores = []
      comparisonMatrix.value.forEach((test) => {
        providers.forEach((prov) => {
          const score = test[prov]?.score
          if (score != null) allScores.push(score)
        })
      })
      if (!allScores.length) return []

      const buckets = [
        { label: '9-10', min: 9, max: 10, count: 0, barClass: 'bg-emerald-500' },
        { label: '7-8', min: 7, max: 8.9, count: 0, barClass: 'bg-emerald-400' },
        { label: '5-6', min: 5, max: 6.9, count: 0, barClass: 'bg-amber-500' },
        { label: '3-4', min: 3, max: 4.9, count: 0, barClass: 'bg-orange-500' },
        { label: '1-2', min: 1, max: 2.9, count: 0, barClass: 'bg-red-500' }
      ]
      allScores.forEach((s) => {
        const b = buckets.find((b) => s >= b.min && s <= b.max)
        if (b) b.count++
      })
      const maxCount = Math.max(...buckets.map((b) => b.count), 1)
      return buckets
        .map((b) => ({ ...b, pct: Math.round((b.count / maxCount) * 100) }))
        .filter((b) => b.count > 0)
    })

    const testRows = computed(() => {
      return comparisonMatrix.value.map((test) => {
        const provData = {}
        providers.value.forEach((prov) => {
          if (test[prov]) provData[prov] = test[prov]
        })
        return {
          testId: test.testId,
          label: test.testId.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          providers: provData
        }
      })
    })

    function formatDate(ts) {
      if (!ts) return ''
      const d = new Date(ts)
      return d.toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    }

    function formatLatency(ms) {
      if (ms == null) return '—'
      return (ms / 1000).toFixed(1) + 's'
    }

    function formatScore(s) {
      if (s == null) return '—'
      return s.toFixed(1)
    }

    function formatCost(c) {
      if (c == null || c === 0) return 'Free'
      return '$' + c.toFixed(4)
    }

    function formatPct(v) {
      if (v == null) return '—'
      return (v * 100).toFixed(0) + '%'
    }

    function scoreColor(s) {
      if (s == null) return 'text-text-primary'
      if (s >= 7) return 'text-emerald-400'
      if (s >= 5) return 'text-amber-400'
      return 'text-red-400'
    }

    function reliabilityColor(v) {
      if (v == null) return 'text-text-primary'
      if (v >= 0.95) return 'text-emerald-400'
      if (v >= 0.8) return 'text-amber-400'
      return 'text-red-400'
    }

    async function loadReport() {
      if (props.report) return
      if (!props.reportUrl) return
      loading.value = true
      error.value = null
      try {
        const res = await fetch(props.reportUrl)
        if (!res.ok) throw new Error(`Failed to load report (${res.status})`)
        localReport.value = await res.json()
      } catch (e) {
        error.value = e.message || 'Failed to load benchmark report'
      } finally {
        loading.value = false
      }
    }

    onMounted(loadReport)

    watch(() => props.reportUrl, () => {
      if (!props.report) loadReport()
    })

    return {
      loading,
      error,
      reportData,
      providers,
      aggregates,
      comparisonMatrix,
      hasMultiProvider,
      sortedProviders,
      sortedProvidersByCost,
      costBarWidth,
      costBarClass,
      scoreBuckets,
      testRows,
      formatDate,
      formatLatency,
      formatScore,
      formatCost,
      formatPct,
      scoreColor,
      reliabilityColor
    }
  }
}
</script>
