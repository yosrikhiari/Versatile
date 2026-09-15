<script setup>
import { computed } from 'vue'
import BasePanelHeader from '../ui/BasePanelHeader.vue'
import BaseSection from '../ui/BaseSection.vue'
import BaseButton from '../ui/BaseButton.vue'
import { useCostTrackingStore } from '../../stores/costTrackingStore'

const store = useCostTrackingStore()

const sessionTotal = computed(() => store.sessionTotal)
const totalTokens = computed(() => store.totalTokens)
const totalCalls = computed(() => store.sessionLog.length)

function breakdown(map) {
  const entries = Object.entries(map)
  const max = entries.length ? Math.max(...entries.map(([, d]) => d.totalCost)) : 1
  return entries.map(([name, data]) => {
    const pct = max > 0 ? (data.totalCost / max) * 100 : 0
    const barClass = pct >= 80 ? 'bg-danger' : pct >= 50 ? 'bg-warning' : 'bg-accent'
    return { name, ...data, barWidth: pct, barClass }
  })
}
const modelBreakdown = computed(() => breakdown(store.breakdownByModel))
const providerBreakdown = computed(() => breakdown(store.breakdownByProvider))

const recentLog = computed(() => [...store.sessionLog].reverse().slice(0, 50))

function formatTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "$0.00" for nothing; four decimals only when the amount is too small for two. */
function money(v) {
  const n = Number(v) || 0
  if (n === 0) return '$0.00'
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}

/** 321,598 → "322k": the panel is a glance, not an invoice. */
function compact(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 10_000) return `${Math.round(v / 1000)}k`
  return v.toLocaleString()
}
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <BasePanelHeader
      title="Costs"
      icon="dollar-sign"
      :meta="totalCalls ? `${totalCalls} calls` : ''"
    />

    <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      <!-- Figures, not tiles: three numbers in a row read faster than three boxes. -->
      <BaseSection
        first
        title="This session"
        description="What the AI has spent since the app opened. Local models cost nothing; cloud calls are priced per token."
      >
        <dl class="grid grid-cols-3 gap-x-4">
          <div>
            <dt class="label-micro text-text-hint mb-1">Cost</dt>
            <dd class="font-ui text-xl tabular-nums text-text-primary">
              {{ money(sessionTotal) }}
            </dd>
          </div>
          <div>
            <dt class="label-micro text-text-hint mb-1">Tokens</dt>
            <dd class="font-ui text-xl tabular-nums text-text-primary">
              {{ compact(totalTokens) }}
            </dd>
          </div>
          <div>
            <dt class="label-micro text-text-hint mb-1">Calls</dt>
            <dd class="font-ui text-xl tabular-nums text-text-primary">{{ totalCalls }}</dd>
          </div>
        </dl>
        <p v-if="totalCalls === 0" class="mt-3 font-ui text-xs text-text-hint">
          Nothing yet — figures appear as the generator, critic and tools make calls.
        </p>
      </BaseSection>

      <BaseSection v-if="modelBreakdown.length > 0" title="By model" dense>
        <div class="space-y-2">
          <div v-for="m in modelBreakdown" :key="m.name" class="flex items-center gap-2 text-xs">
            <span class="font-ui text-text-primary w-28 truncate shrink-0" :title="m.name">{{
              m.name
            }}</span>
            <div class="flex-1 h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="m.barClass"
                :style="{ width: m.barWidth + '%' }"
              ></div>
            </div>
            <span class="font-ui text-text-hint w-16 text-right shrink-0 tabular-nums">{{
              money(m.totalCost)
            }}</span>
            <span class="font-ui text-text-hint w-10 text-right shrink-0 tabular-nums">{{
              m.count
            }}</span>
          </div>
        </div>
      </BaseSection>

      <BaseSection v-if="providerBreakdown.length > 0" title="By provider" dense>
        <div class="space-y-2">
          <div v-for="p in providerBreakdown" :key="p.name" class="flex items-center gap-2 text-xs">
            <span class="font-ui text-text-primary w-28 truncate shrink-0">{{ p.name }}</span>
            <div class="flex-1 h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="p.barClass"
                :style="{ width: p.barWidth + '%' }"
              ></div>
            </div>
            <span class="font-ui text-text-hint w-16 text-right shrink-0 tabular-nums">{{
              money(p.totalCost)
            }}</span>
            <span class="font-ui text-text-hint w-10 text-right shrink-0 tabular-nums">{{
              p.count
            }}</span>
          </div>
        </div>
      </BaseSection>

      <BaseSection v-if="recentLog.length > 0" title="Recent calls" dense>
        <template #actions>
          <BaseButton variant="ghost" size="sm" icon="trash-2" @click="store.clearSession()"
            >Clear</BaseButton
          >
        </template>
        <div
          class="max-h-[240px] overflow-y-auto scrollbar-thin -mx-1 divide-y divide-border-subtle"
        >
          <div
            v-for="entry in recentLog"
            :key="entry.id"
            class="flex items-center gap-2 text-2xs font-ui py-1.5 px-1"
          >
            <span class="text-text-hint w-14 shrink-0 tabular-nums">{{
              formatTime(entry.timestamp)
            }}</span>
            <span class="text-text-primary w-24 truncate shrink-0" :title="entry.model">{{
              entry.model || '—'
            }}</span>
            <span class="text-text-hint w-14 truncate shrink-0">{{ entry.provider || '—' }}</span>
            <span class="text-text-secondary flex-1 truncate">{{ entry.label || '' }}</span>
            <span class="text-text-primary tabular-nums shrink-0">{{ money(entry.cost) }}</span>
          </div>
        </div>
      </BaseSection>
    </div>
  </div>
</template>
