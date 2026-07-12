<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-11px uppercase tracking-wider text-text-hint font-ui">
        Score Trends
      </h3>
      <div class="flex items-center gap-2">
        <select
          v-model="selectedDimension"
          class="text-2xs bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="__overall">Overall</option>
          <option
            v-for="dim in availableDimensions"
            :key="dim.value"
            :value="dim.value"
          >
            {{ dim.label }}
          </option>
        </select>
        <button
          class="text-2xs text-accent font-ui hover:text-accent/80 transition-colors"
          @click="$emit('close')"
        >
          Close
        </button>
      </div>
    </div>

    <div v-if="!hasData" class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-6 text-center">
      <BaseIcon name="bar-chart" :size="24" class="mx-auto text-text-hint mb-2" />
      <p class="text-sm text-text-secondary font-ui">Not enough data for trends</p>
      <p class="text-xs text-text-hint mt-1">
        Need at least 2 evaluations across time to show a trend.
      </p>
    </div>

    <div v-else class="space-y-4">
      <div class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3">
        <Chart
          :type="chartType"
          :data="chartData"
          :options="chartOptions"
          :height="250"
        />
      </div>

      <div
        v-if="selectedDimension === '__overall' && trendDirection"
        class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3"
      >
        <h4 class="text-11px uppercase tracking-wider text-text-hint font-ui mb-2">
          Trend Analysis
        </h4>
        <span
          class="inline-flex items-center gap-1 text-xs font-ui"
          :class="trendDirection.color"
        >
          <BaseIcon :name="trendDirection.icon" :size="12" />
          {{ trendDirection.label }}
        </span>
      </div>

      <div
        v-if="selectedDimension === '__overall' && dimensionMiniCharts.length > 0"
        class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3"
      >
        <h4 class="text-11px uppercase tracking-wider text-text-hint font-ui mb-2">
          Per-Dimension Trends
        </h4>
        <div class="grid grid-cols-2 gap-3">
          <div
            v-for="dm in dimensionMiniCharts"
            :key="dm.name"
            class="bg-bg-secondary/40 rounded p-2"
          >
            <p class="text-2xs text-text-hint font-ui mb-1">{{ dm.label }}</p>
            <Chart
              type="line"
              :data="dm.chartData"
              :options="dm.chartOptions"
              :height="80"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { Chart, registerables } from 'chart.js'
import { Chart as ChartComponent } from 'vue-chartjs'
import BaseIcon from '../shared/BaseIcon.vue'
import { getDimensionsForWorkspace } from '../../config/evalDimensions'
import { getEvalResultsByProject } from '../../services/db-evals'

Chart.register(...registerables)

const LINE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4']
const DIM_COLORS = {
  continuity: '#6366f1',
  voice: '#22c55e',
  emotional_goal: '#f59e0b',
  show_tell: '#ef4444',
  pacing: '#a855f7',
  clarity: '#06b6d4',
  ambiguity: '#f97316',
  liability: '#14b8a6'
}

export default {
  name: 'EvalTrends',
  components: { Chart: ChartComponent, BaseIcon },
  props: {
    projectId: { type: String, required: true },
    workspaceType: { type: String, default: 'creative' }
  },
  emits: ['close'],
  setup(props) {
    const rawResults = ref([])
    const selectedDimension = ref('__overall')
    const isLoading = ref(true)

    const availableDimensions = computed(() => {
      const dims = getDimensionsForWorkspace(props.workspaceType)
      return Object.entries(dims).map(([key, cfg]) => ({
        value: key,
        label: cfg.label || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      }))
    })

    const _sceneLabels = computed(() => {
      const seen = new Set()
      return rawResults.value
        .filter((r) => {
          if (seen.has(r.sceneId)) return false
          seen.add(r.sceneId)
          return true
        })
        .map((r) => `S${r.sceneId?.slice?.(0, 4) || r.sceneId}` || '?')
    })

    const overallScores = computed(() => {
      return rawResults.value.map((r) => r.score).filter((s) => s != null)
    })

    const dimData = computed(() => {
      const map = {}
      for (const dim of availableDimensions.value) {
        map[dim.value] = []
      }
      for (const r of rawResults.value) {
        if (r.dimensionScores) {
          for (const [key, val] of Object.entries(r.dimensionScores)) {
            if (map[key] && val != null) {
              map[key].push(val)
            }
          }
        }
      }
      return map
    })

    const hasData = computed(() => {
      if (selectedDimension.value === '__overall') return overallScores.value.length >= 2
      return (dimData.value[selectedDimension.value]?.length || 0) >= 2
    })

    const chartType = computed(() => 'line')

    const chartData = computed(() => {
      if (selectedDimension.value === '__overall') {
        return {
          labels: rawResults.value.map((r) => {
            const d = new Date(r.timestamp)
            return `${d.getMonth() + 1}/${d.getDate()}`
          }),
          datasets: [
            {
              label: 'Overall Score',
              data: overallScores.value,
              borderColor: LINE_COLORS[0],
              backgroundColor: LINE_COLORS[0] + '20',
              borderWidth: 2,
              pointRadius: 3,
              pointBackgroundColor: overallScores.value.map((s) =>
                s >= 7 ? '#22c55e' : s >= 5 ? '#f59e0b' : '#ef4444'
              ),
              fill: true,
              tension: 0.3
            }
          ]
        }
      }
      const dimScores = dimData.value[selectedDimension.value] || []
      return {
        labels: rawResults.value.map((r) => {
          const d = new Date(r.timestamp)
          return `${d.getMonth() + 1}/${d.getDate()}`
        }),
        datasets: [
          {
            label: availableDimensions.value.find((d) => d.value === selectedDimension.value)
              ?.label || selectedDimension.value,
            data: dimScores,
            borderColor: DIM_COLORS[selectedDimension.value] || LINE_COLORS[1],
            backgroundColor: (DIM_COLORS[selectedDimension.value] || LINE_COLORS[1]) + '20',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: dimScores.map((s) =>
              s >= 7 ? '#22c55e' : s >= 5 ? '#f59e0b' : '#ef4444'
            ),
            fill: true,
            tension: 0.3
          }
        ]
      }
    })

    const chartOptions = computed(() => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          min: 0,
          max: 10,
          ticks: {
            stepSize: 2,
            color: '#6b7280',
            font: { size: 10 }
          },
          grid: { color: '#374151' }
        },
        x: {
          ticks: {
            color: '#6b7280',
            font: { size: 10 },
            maxRotation: 45
          },
          grid: { display: false }
        }
      }
    }))

    const trendDirection = computed(() => {
      const scores = overallScores.value
      if (scores.length < 3) return null
      const half = Math.floor(scores.length / 2)
      const firstHalf = scores.slice(0, half).reduce((a, b) => a + b, 0) / half
      const secondHalf = scores.slice(-half).reduce((a, b) => a + b, 0) / half
      const diff = secondHalf - firstHalf
      if (diff > 0.5) return { label: `Improving (+${diff.toFixed(1)})`, icon: 'trending-up', color: 'text-emerald-400' }
      if (diff < -0.5) return { label: `Declining (${diff.toFixed(1)})`, icon: 'trending-down', color: 'text-red-400' }
      return { label: `Stable (${diff.toFixed(1)})`, icon: 'minus', color: 'text-text-hint' }
    })

    const dimensionMiniCharts = computed(() => {
      if (selectedDimension.value !== '__overall') return []
      return availableDimensions.value
        .filter((dim) => (dimData.value[dim.value]?.length || 0) >= 2)
        .slice(0, 6)
        .map((dim) => {
          const scores = dimData.value[dim.value]
          return {
            name: dim.value,
            label: dim.label,
            chartData: {
              labels: rawResults.value.map((r) => {
                const d = new Date(r.timestamp)
                return `${d.getMonth() + 1}/${d.getDate()}`
              }),
              datasets: [
                {
                  data: scores,
                  borderColor: DIM_COLORS[dim.value] || LINE_COLORS[1],
                  borderWidth: 1.5,
                  pointRadius: 2,
                  fill: false,
                  tension: 0.3
                }
              ]
            },
            chartOptions: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { min: 0, max: 10, display: false },
                x: { display: false }
              }
            }
          }
        })
    })

    onMounted(async () => {
      isLoading.value = true
      rawResults.value = await getEvalResultsByProject(props.projectId)
      isLoading.value = false
    })

    return {
      selectedDimension,
      availableDimensions,
      hasData,
      chartType,
      chartData,
      chartOptions,
      trendDirection,
      dimensionMiniCharts
    }
  }
}
</script>
