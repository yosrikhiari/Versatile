<template>
  <div class="benchmark-dashboard p-6 overflow-y-auto h-full space-y-8">
    <div
      v-if="!reportData"
      class="flex flex-col items-center justify-center h-full text-text-secondary"
    >
      <div class="text-6xl mb-4"><Icon name="bar-chart" /></div>
      <p class="text-lg">No benchmark reports loaded</p>
      <p class="text-sm mt-2">Run a benchmark task suite to see results here</p>
    </div>

    <template v-if="reportData">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-xl font-semibold text-text-primary">{{ reportData.reportName }}</h2>
          <p class="text-sm text-text-secondary mt-1">
            {{ reportData.taskSuite }} · {{ formatDate(reportData.timestamp) }}
          </p>
        </div>
        <div class="flex gap-4 text-sm text-text-secondary">
          <span>{{ reportData.taskCount }} tests</span>
          <span>{{ reportData.passCount }} passed</span>
          <span v-if="reportData.failCount > 0" class="text-red-400"
            >{{ reportData.failCount }} failed</span
          >
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-bg-secondary rounded-lg p-5 space-y-4">
          <h3 class="text-sm font-medium text-text-secondary uppercase tracking-wider">
            Score Rankings
          </h3>
          <div
            v-for="prov in sortedProviders"
            :key="prov.id"
            class="flex items-center justify-between py-2 border-b border-border-primary last:border-0"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-6 h-6 rounded-full bg-accent-primary/10 flex items-center justify-center text-xs font-bold text-accent-primary"
              >
                {{ sortedProviders.indexOf(prov) + 1 }}
              </div>
              <span class="text-sm font-medium text-text-primary">{{
                providerLabels[prov.id]
              }}</span>
            </div>
            <div class="text-right">
              <div class="text-sm font-bold text-text-primary">
                {{ aggregates[prov.id]?.avgScore?.toFixed(1) ?? '—' }}
              </div>
              <div class="text-xs text-text-secondary">avg score</div>
            </div>
          </div>
          <div
            v-if="sortedProviders.length === 0"
            class="text-sm text-text-secondary text-center py-4"
          >
            No provider data available
          </div>
        </div>

        <div class="bg-bg-secondary rounded-lg p-5 space-y-4">
          <h3 class="text-sm font-medium text-text-secondary uppercase tracking-wider">
            Cost Efficiency
          </h3>
          <div
            v-for="prov in sortedProvidersByCost"
            :key="prov.id"
            class="flex items-center justify-between py-2 border-b border-border-primary last:border-0"
          >
            <div class="flex items-center gap-3 flex-1">
              <span class="text-sm font-medium text-text-primary w-32 truncate">{{
                providerLabels[prov.id]
              }}</span>
              <div class="flex-1 bg-bg-tertiary rounded-full h-2 overflow-hidden">
                <div :class="costBarClass(prov)" :style="{ width: costBarWidth(prov) }"></div>
              </div>
            </div>
            <div class="text-right ml-4">
              <div class="text-sm font-bold text-text-primary">
                ${{ aggregates[prov.id]?.estimatedTotalCost?.toFixed(4) ?? '—' }}
              </div>
              <div class="text-xs text-text-secondary">total cost</div>
            </div>
          </div>
          <div
            v-if="sortedProvidersByCost.length === 0"
            class="text-sm text-text-secondary text-center py-4"
          >
            No cost data available
          </div>
        </div>
      </div>

      <div class="bg-bg-secondary rounded-lg p-5 space-y-4">
        <h3 class="text-sm font-medium text-text-secondary uppercase tracking-wider">
          Reliability &amp; Performance
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <div
            v-for="prov in sortedProviders"
            :key="prov.id"
            class="bg-bg-tertiary rounded-lg p-4 text-center"
          >
            <div class="text-sm font-medium text-text-primary mb-2">
              {{ providerLabels[prov.id] }}
            </div>
            <div class="text-2xl font-bold text-text-primary">
              {{ aggregates[prov.id]?.avgScore?.toFixed(1) ?? '—' }}
            </div>
            <div class="text-xs text-text-secondary">avg score /10</div>
            <div class="mt-2 flex justify-center gap-3 text-xs text-text-secondary">
              <span>{{ formatPct(aggregates[prov.id]?.reliability) }} reliability</span>
              <span class="text-text-secondary">·</span>
              <span>{{
                aggregates[prov.id]?.avgLatencyMs ? aggregates[prov.id].avgLatencyMs + 'ms' : '—'
              }}</span>
            </div>
            <div :class="reliabilityColor(aggregates[prov.id]?.reliability)" class="text-xs mt-1">
              {{ aggregates[prov.id]?.status === 'ok' ? 'Healthy' : 'Errors detected' }}
            </div>
          </div>
          <div
            v-if="sortedProviders.length === 0"
            class="col-span-full text-sm text-text-secondary text-center py-4"
          >
            No performance data available
          </div>
        </div>
      </div>

      <div v-if="taskTypes.length > 0" class="bg-bg-secondary rounded-lg p-5 space-y-4">
        <h3 class="text-sm font-medium text-text-secondary uppercase tracking-wider">
          Task Type Breakdown
        </h3>
        <div v-for="taskType in taskTypes" :key="taskType" class="mb-4">
          <h4 class="text-sm font-medium text-text-primary mb-2">{{ taskType }}</h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <div
              v-for="prov in sortedProviders"
              :key="prov.id"
              class="bg-bg-primary rounded-lg p-3 text-center"
            >
              <div class="text-xs font-medium text-text-secondary mb-1">
                {{ providerLabels[prov.id] }}
              </div>
              <div class="text-lg font-bold text-text-primary">
                {{ taskTypeBreakdown[taskType]?.[prov.id]?.avgScore?.toFixed(1) ?? '—' }}
              </div>
              <div class="flex justify-center gap-2 text-xs text-text-secondary mt-1">
                <span>{{ formatPct(taskTypeBreakdown[taskType]?.[prov.id]?.reliability) }}</span>
                <span>{{
                  taskTypeBreakdown[taskType]?.[prov.id]?.avgLatencyMs
                    ? taskTypeBreakdown[taskType]?.[prov.id]?.avgLatencyMs + 'ms'
                    : '—'
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-bg-secondary rounded-lg p-5 space-y-4">
        <h3 class="text-sm font-medium text-text-secondary uppercase tracking-wider">
          Per-Test Results
        </h3>
        <div v-if="testRows.length > 0" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border-primary">
                <th class="text-left py-2 pr-4 text-text-secondary font-medium">Test</th>
                <th
                  v-for="prov in sortedProviders"
                  :key="prov.id"
                  class="text-center px-2 py-2 text-text-secondary font-medium"
                >
                  {{ providerLabels[prov.id] }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="test in testRows"
                :key="test.testId"
                class="border-b border-border-primary/50"
              >
                <td class="py-2 pr-4 text-text-primary">{{ test.label }}</td>
                <td v-for="prov in sortedProviders" :key="prov.id" class="text-center px-2 py-2">
                  <div v-if="test.providers[prov.id]" class="text-text-primary">
                    {{ test.providers[prov.id].score?.toFixed(1) ?? '—' }}
                  </div>
                  <div v-else class="text-text-secondary">—</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="text-sm text-text-secondary text-center py-4">
          No per-test results for this report.
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'

const reportData = ref(null)

onMounted(async () => {
  try {
    const { data } = await import('virtual:active-report')
    if (data?.report) {
      reportData.value = data.report
    }
  } catch {
    reportData.value = null
  }
})

const providers = computed(() => reportData.value?.providers ?? [])
const providerLabels = computed(() => {
  const map = {}
  for (const p of providers.value) map[p.id] = p.label
  return map
})

const aggregates = computed(() => reportData.value?.aggregates ?? {})
const comparisonMatrix = computed(() => reportData.value?.comparisonMatrix ?? [])
const rankings = computed(() => reportData.value?.rankings ?? {})

const taskTypeBreakdown = computed(() => reportData.value?.taskTypeBreakdown?.breakdown ?? {})
const taskTypes = computed(() => reportData.value?.taskTypeBreakdown?.taskTypes ?? [])

const hasMultiProvider = computed(() => providers.value.length > 1)

const sortedProviders = computed(() => {
  return [...providers.value].sort((a, b) => {
    const sa = aggregates[a.id]?.avgScore ?? 0
    const sb = aggregates[b.id]?.avgScore ?? 0
    return sb - sa
  })
})

const sortedProvidersByCost = computed(() => {
  return [...providers.value].sort((a, b) => {
    const ca = aggregates[a.id]?.estimatedTotalCost ?? 0
    const cb = aggregates[b.id]?.estimatedTotalCost ?? 0
    return ca - cb
  })
})

const maxCost = computed(() => {
  return Math.max(...providers.value.map((p) => aggregates[p.id]?.estimatedTotalCost ?? 0), 0.01)
})

function costBarWidth(prov) {
  const cost = aggregates[prov.id]?.estimatedTotalCost ?? 0
  return ((cost / maxCost.value) * 100).toFixed(1) + '%'
}

function costBarClass(prov) {
  const cost = aggregates[prov.id]?.estimatedTotalCost ?? 0
  if (cost === 0) return 'h-full rounded-full bg-emerald-500'
  if (cost / maxCost.value < 0.2) return 'h-full rounded-full bg-emerald-500'
  if (cost / maxCost.value < 0.5) return 'h-full rounded-full bg-amber-500'
  return 'h-full rounded-full bg-red-500'
}

const scoreBuckets = computed(() => {
  const allScores = []
  comparisonMatrix.value.forEach((test) => {
    providers.value.forEach((prov) => {
      const score = test[prov.id]?.score
      if (score != null) allScores.push(score)
    })
  })
  return allScores
})

const testRows = computed(() => {
  return comparisonMatrix.value.map((test) => {
    const provData = {}
    providers.value.forEach((prov) => {
      if (test[prov.id] != null) provData[prov.id] = test[prov.id]
    })
    return {
      testId: test.testId,
      label:
        test.testName ||
        test.testId?.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ||
        'Unknown Test',
      providers: provData
    }
  })
})

function formatPct(v) {
  if (v == null) return '—'
  return v.toFixed(0) + '%'
}

function reliabilityColor(v) {
  if (v == null) return 'text-text-primary'
  if (v >= 95) return 'text-emerald-400'
  if (v >= 80) return 'text-amber-400'
  return 'text-red-400'
}

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>
