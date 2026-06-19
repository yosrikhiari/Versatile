<script setup>
import { ref } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useContextRetrieval } from '../../composables/useContextRetrieval'
import BaseIcon from '../shared/BaseIcon.vue'

const projectStore = useProjectStore()
const { dryRun } = useContextRetrieval()

const preview = ref(null)
const expanded = ref(false)
const loading = ref(false)

async function toggle() {
  expanded.value = !expanded.value
  if (expanded.value && !preview.value) {
    loading.value = true
    try {
      preview.value = await dryRun(projectStore.currentProjectId)
    } finally {
      loading.value = false
    }
  }
}

const sourceCount = () => preview.value?.previewLines?.length || 0

function signalBadge(signal) {
  return signal === 'accepted' ? 'text-accent' :
    signal === 'partial' ? 'text-amber-400' :
    signal === 'rejected' ? 'text-red-400' :
    'text-text-hint'
}
</script>

<template>
  <div class="relative">
    <button
      class="flex items-center gap-1 px-2 py-1 text-2xs rounded font-ui transition-colors"
      :class="expanded ? 'bg-accent/10 text-accent' : 'text-text-hint hover:text-text-secondary hover:bg-surface-hover'"
      title="Context status"
      @click="toggle"
    >
      <BaseIcon name="layers" :size="12" />
      <span v-if="preview">Ctx: {{ sourceCount() }}</span>
      <span v-else>Context</span>
    </button>
    <div
      v-if="expanded"
      class="absolute right-0 top-full mt-1 w-80 bg-bg-secondary border border-border-subtle rounded-lg shadow-lg z-50 p-3 max-h-96 overflow-y-auto"
      @click.stop
    >
      <div v-if="loading" class="text-xs text-text-hint font-ui">Loading...</div>
      <div v-else-if="preview" class="space-y-1.5">
        <div class="text-2xs uppercase tracking-wider text-text-hint font-ui">{{ preview.sourceDescription }}</div>
        <div v-for="(line, i) in preview.previewLines" :key="i" class="flex items-start gap-1.5 text-xs">
          <span class="text-text-hint shrink-0 mt-0.5">•</span>
          <span class="text-text-secondary">
            <span v-if="line.signal" :class="signalBadge(line.signal)">[{{ line.signal }}]</span>
            {{ line.summary }}
          </span>
        </div>
        <details class="mt-1">
          <summary class="text-2xs text-text-hint cursor-pointer hover:text-text-secondary font-ui">Full context text</summary>
          <pre class="mt-1 p-2 bg-bg-tertiary rounded text-2xs text-text-hint whitespace-pre-wrap max-h-24 overflow-y-auto font-body">{{ preview.contextText || '(empty)' }}</pre>
        </details>
      </div>
      <div v-else class="text-xs text-text-hint font-ui">No context available</div>
    </div>
  </div>
</template>
