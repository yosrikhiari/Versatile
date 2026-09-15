<script setup>
import { onMounted } from 'vue'
import { useConsistencyChecker } from '../../composables/useConsistencyChecker'
import ConsistencyResultItem from './ConsistencyResultItem.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import BasePanelHeader from '../ui/BasePanelHeader.vue'

const emit = defineEmits(['navigate'])

const { results, isScanning, lastScan, counts, resultsBySeverity, scan, clearResults } =
  useConsistencyChecker()

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

function handleRecheck() {
  clearResults()
  scan()
}

function handleResultAction(action) {
  emit('navigate', action)
}

function summary() {
  const parts = []
  if (counts.value.errors)
    parts.push(`${counts.value.errors} error${counts.value.errors > 1 ? 's' : ''}`)
  if (counts.value.warnings)
    parts.push(`${counts.value.warnings} warning${counts.value.warnings > 1 ? 's' : ''}`)
  if (counts.value.info) parts.push(`${counts.value.info} note${counts.value.info > 1 ? 's' : ''}`)
  return parts.join(' · ')
}
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <BasePanelHeader title="Consistency" icon="clipboard-check" :meta="isScanning ? '' : summary()">
      <template #actions>
        <BaseButton
          variant="soft"
          size="sm"
          icon="refresh-cw"
          :loading="isScanning"
          :disabled="isScanning"
          @click="handleRecheck"
        >
          {{ results.length > 0 ? 'Recheck' : 'Scan' }}
        </BaseButton>
      </template>
    </BasePanelHeader>

    <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      <div
        v-if="isScanning"
        class="flex items-center gap-2 px-4 py-6 font-ui text-xs text-text-hint"
        role="status"
      >
        <BaseIcon name="loader-2" :size="14" class="animate-spin text-accent" />
        Checking the story bible, manuscript and graph against each other…
      </div>

      <template v-else-if="results.length > 0">
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
            <ConsistencyResultItem
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
          name="check-circle"
          :size="24"
          class="mx-auto mb-3"
          :class="lastScan ? 'text-success' : 'text-text-hint'"
        />
        <p class="font-ui text-sm text-text-primary">
          {{ lastScan ? 'Everything lines up' : 'Not checked yet' }}
        </p>
        <p class="mt-1 font-ui text-xs text-text-hint leading-5 max-w-[30ch] mx-auto text-pretty">
          {{
            lastScan
              ? 'Story bible, manuscript and story graph agree with each other.'
              : 'Scan to compare the story bible, manuscript and story graph.'
          }}
        </p>
      </div>
    </div>
  </div>
</template>
