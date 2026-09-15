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

const SIGNAL_LABELS = { accepted: 'kept', partial: 'partly kept', rejected: 'discarded' }
function signalLabel(signal) {
  return SIGNAL_LABELS[signal] || signal
}

function signalBadge(signal) {
  return signal === 'accepted'
    ? 'text-accent'
    : signal === 'partial'
      ? 'text-warning'
      : signal === 'rejected'
        ? 'text-danger'
        : 'text-text-hint'
}
</script>

<template>
  <div class="relative">
    <button
      class="flex items-center gap-1 px-2 py-1 text-label rounded font-ui transition-colors whitespace-nowrap"
      :class="
        expanded
          ? 'bg-surface-hover text-accent'
          : 'text-text-hint hover:text-text-secondary hover:bg-surface-hover'
      "
      title="What the AI reads from your project before it writes"
      :aria-expanded="expanded"
      aria-haspopup="true"
      @click="toggle"
    >
      <BaseIcon name="layers" :size="12" />
      <span v-if="preview">AI context · {{ sourceCount() }}</span>
      <span v-else>AI context</span>
    </button>
    <div
      v-if="expanded"
      class="absolute right-0 top-full mt-1 w-80 bg-bg-secondary border border-border-subtle rounded-lg z-50 p-3 max-h-96 overflow-y-auto"
      @click.stop
    >
      <div v-if="loading" class="text-label text-text-hint font-ui">Loading...</div>
      <div v-else-if="preview" class="space-y-1.5">
        <div class="label-micro text-text-hint">What the AI sees</div>
        <div class="text-label text-text-hint font-ui">{{ preview.sourceDescription }}</div>
        <div
          v-for="(line, i) in preview.previewLines"
          :key="i"
          class="flex items-start gap-1.5 text-label"
        >
          <span class="text-text-hint shrink-0 mt-0.5">•</span>
          <span class="text-text-secondary">
            <span v-if="line.signal" :class="signalBadge(line.signal)">{{
              signalLabel(line.signal)
            }}</span>
            {{ line.summary }}
          </span>
        </div>
        <details class="mt-1">
          <summary
            class="text-label text-text-hint cursor-pointer hover:text-text-secondary font-ui"
          >
            Full context text
          </summary>
          <pre
            class="mt-1 p-2 bg-bg-tertiary rounded text-label text-text-hint whitespace-pre-wrap max-h-24 overflow-y-auto"
            >{{ preview.contextText || '(empty)' }}</pre>
        </details>
      </div>
      <div v-else class="text-label text-text-hint font-ui">
        Nothing yet — the AI reads your recent sessions, story bible and manuscript once they exist.
      </div>
    </div>
  </div>
</template>
