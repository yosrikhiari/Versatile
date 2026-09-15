<script setup>
import { onMounted } from 'vue'
import { useBetaReader } from '../../composables/betareader/useBetaReader'
import BetaResultItem from './BetaResultItem.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import BasePanelHeader from '../ui/BasePanelHeader.vue'
import BaseCheckbox from '../ui/BaseCheckbox.vue'

const emit = defineEmits(['navigate'])

const {
  results,
  isScanning,
  lastScan,
  noScenes,
  counts,
  resultsBySeverity,
  summary,
  currentPhase,
  progress,
  cloudRunOptIn,
  cloudTier,
  cloudAvailable,
  cloudDisclosure,
  scan,
  clearResults
} = useBetaReader()

const GROUPS = [
  { key: 'errors', label: 'Errors', icon: 'alert-circle', tone: 'text-danger' },
  { key: 'warnings', label: 'Warnings', icon: 'alert-triangle', tone: 'text-warning' },
  { key: 'info', label: 'Notes', icon: 'info', tone: 'text-text-hint' }
]

onMounted(() => {
  if (results.value.length === 0) {
    scan()
  }
})

function handleReScan() {
  clearResults()
  scan()
}

function handleResultAction(action) {
  emit('navigate', action)
}

function countsLabel() {
  const c = counts.value || {}
  const parts = []
  if (c.errors) parts.push(`${c.errors} error${c.errors > 1 ? 's' : ''}`)
  if (c.warnings) parts.push(`${c.warnings} warning${c.warnings > 1 ? 's' : ''}`)
  if (c.info) parts.push(`${c.info} note${c.info > 1 ? 's' : ''}`)
  return parts.join(' · ')
}
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <BasePanelHeader title="Beta Reader" icon="eye" :meta="isScanning ? '' : countsLabel()">
      <template #actions>
        <BaseButton
          variant="soft"
          size="sm"
          icon="refresh-cw"
          :loading="isScanning"
          :disabled="isScanning"
          @click="handleReScan"
        >
          {{ results.length > 0 ? 'Reread' : 'Read' }}
        </BaseButton>
      </template>
    </BasePanelHeader>

    <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      <div
        v-if="cloudAvailable && cloudTier === 'cloud-on-demand'"
        class="px-4 py-3 border-b border-border-subtle"
      >
        <BaseCheckbox
          v-model="cloudRunOptIn"
          :disabled="isScanning"
          label="Use cloud AI for contradiction detection"
        />
        <p v-if="cloudDisclosure" class="mt-1.5 font-ui text-xs text-text-hint leading-4">
          {{ cloudDisclosure.warning }} About {{ cloudDisclosure.estimatedTokens }} tokens (~${{
            cloudDisclosure.estimatedCostUsd.toFixed(4)
          }}) via {{ cloudDisclosure.provider }} ({{ cloudDisclosure.model }}).
        </p>
      </div>

      <!-- Reading -->
      <div v-if="isScanning" class="px-4 py-5" role="status" aria-live="polite">
        <div class="flex items-center gap-2 font-ui text-xs text-text-hint">
          <BaseIcon name="loader-2" :size="14" class="animate-spin text-accent" />
          {{ currentPhase || 'Reading…' }}
        </div>
        <div class="mt-3 h-1 rounded-full bg-bg-tertiary overflow-hidden">
          <div
            class="h-full rounded-full bg-accent transition-[width] duration-300"
            :style="{ width: progress + '%' }"
          />
        </div>
      </div>

      <template v-else-if="results.length > 0 || summary">
        <!-- The reader's overall impression, then the findings behind it. The
             summary used to replace the list; now it introduces it. -->
        <p
          v-if="summary"
          class="px-4 py-4 font-ui text-sm text-text-secondary leading-6 border-b border-border-subtle text-pretty"
        >
          {{ summary }}
        </p>

        <section
          v-for="(group, gi) in GROUPS.filter((g) => resultsBySeverity[g.key]?.length)"
          :key="group.key"
          :class="['px-4 py-4', gi === 0 ? '' : 'border-t border-border-subtle']"
        >
          <h3 class="flex items-center gap-1.5 label-micro text-text-hint mb-2">
            <BaseIcon :name="group.icon" :size="12" :class="group.tone" />
            {{ group.label }}
            <span class="tabular-nums">· {{ resultsBySeverity[group.key].length }}</span>
          </h3>
          <ul class="-mx-1 divide-y divide-border-subtle">
            <BetaResultItem
              v-for="item in resultsBySeverity[group.key]"
              :key="item.id"
              :result="item"
              @action="handleResultAction"
            />
          </ul>
        </section>
      </template>

      <div v-else class="px-4 py-10 text-center">
        <BaseIcon
          :name="lastScan ? 'check-circle' : 'eye'"
          :size="24"
          class="mx-auto mb-3"
          :class="lastScan ? 'text-success' : 'text-text-hint'"
        />
        <p class="font-ui text-sm text-text-primary">
          {{ noScenes ? 'Nothing to read yet' : lastScan ? 'Reads clean' : 'Not read yet' }}
        </p>
        <p class="mt-1 font-ui text-xs text-text-hint leading-5 max-w-[32ch] mx-auto text-pretty">
          <template v-if="noScenes">
            Beta Reader reads subsections that contain prose — split a section into subsections in
            <span class="text-text-secondary">Sections</span> and it will pick them up.
          </template>
          <template v-else-if="!lastScan">Read when you have prose to test.</template>
          <template v-else>No narrative issues found in the current draft.</template>
        </p>
      </div>
    </div>
  </div>
</template>
