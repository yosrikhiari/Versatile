<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePolishStore } from '../../stores/polishStore'
import { useProjectStore } from '../../stores/projectStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useCompactConversation } from '../../composables/useOllama'
import { PROVIDER_LABELS, FEATURES } from '../../config/ai'
import PolishAnalysisArea from './PolishAnalysisArea.vue'
import PolishLensBar from './PolishLensBar.vue'
import SnippetsDrawer from './SnippetsDrawer.vue'

const polishStore = usePolishStore()
const projectStore = useProjectStore()
const settingsStore = useSettingsStore()

const polishModelLabel = computed(() => {
  const provider = settingsStore.resolveFeatureProvider(FEATURES.POLISH)
  const model = settingsStore.resolveFeatureModel(FEATURES.POLISH)
  const label = PROVIDER_LABELS[provider] || provider
  return model ? `${label} · ${model}` : label
})

const expanded = ref(false)

const { compactConversation, isCompacting: compactIsCompacting, addTurn } = useCompactConversation()
const compactCallId = 'polish_main'

async function handleCompactPolish() {
  addTurn(compactCallId, 'user', 'User requested Polish analysis')
  const result = await compactConversation(compactCallId)
  if (result.compacted) {
    addTurn(
      compactCallId,
      'system',
      `Conversation compacted: ${result.summarizedCount} previous turns summarized`
    )
  }
}

onMounted(() => {
  polishStore.setProjectStore(projectStore)
})

onUnmounted(() => {
  polishStore.destroy()
})

const lensIssueCounts = computed(() => {
  const typeMap = {
    weakVerbs: 'weak_verb',
    repetition: 'repetition',
    pacing: 'pacing',
    clarity: 'unclear_references'
  }
  const counts = {}
  for (const [key, type] of Object.entries(typeMap)) {
    counts[key] = polishStore.annotations.filter(
      (a) => a.type === type && a.status === 'pending'
    ).length
  }
  return counts
})

function handleParagraphClick(text, index) {
  polishStore.selectParagraph(text, index)
}

async function analyzeNow() {
  if (
    polishStore.selectedParagraphText &&
    polishStore.selectedParagraphIndex !== null &&
    projectStore.currentProjectId
  ) {
    addTurn(
      compactCallId,
      'user',
      `Analyze paragraph ${polishStore.selectedParagraphIndex} (${polishStore.selectedParagraphText.slice(0, 80)}...)`
    )
    await polishStore.analyzeNow(
      polishStore.selectedParagraphText,
      polishStore.selectedParagraphIndex,
      projectStore.currentProjectId
    )
    const pendingCount = polishStore.annotations.filter(
      (a) => a.paragraphIndex === polishStore.selectedParagraphIndex && a.status === 'pending'
    ).length
    addTurn(compactCallId, 'assistant', `Analysis complete: ${pendingCount} issues found`)
  }
}

defineExpose({
  handleParagraphClick
})
</script>

<template>
  <div
    :class="[
      'flex flex-col h-full transition-[height] duration-200 ease-out motion-reduce:transition-none',
      expanded ? 'h-[50vh]' : 'h-[320px]'
    ]"
  >
    <div class="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
      <PolishLensBar
        :active-lenses="polishStore.activeLenses"
        :lens-issue-counts="lensIssueCounts"
        @toggle="
          (key) =>
            polishStore.setActiveLenses({
              ...polishStore.activeLenses,
              [key]: !polishStore.activeLenses[key]
            })
        "
      />
      <div class="flex items-center gap-2">
        <span
          class="text-2xs text-text-hint font-ui truncate max-w-[140px]"
          :title="polishModelLabel"
          >{{ polishModelLabel }}</span
        >
        <button
          v-if="polishStore.selectedParagraphIndex !== null"
          :disabled="polishStore.isAnalyzing"
          class="px-2 py-1 text-xs btn-primary rounded disabled:opacity-50 disabled:cursor-not-allowed font-ui focus:outline-none focus:ring-2 focus:ring-accent"
          title="Analyze selected paragraph"
          @click="analyzeNow"
        >
          {{ polishStore.isAnalyzing ? '...' : 'Analyze' }}
        </button>
        <button
          v-else
          disabled
          class="px-2 py-1 text-xs bg-bg-tertiary text-text-hint rounded cursor-not-allowed font-ui opacity-60"
          title="Select a paragraph in the editor first"
        >
          Analyze
        </button>
        <button
          v-if="compactIsCompacting"
          class="px-2 py-1 text-xs bg-bg-tertiary text-text-hint rounded font-ui"
          disabled
        >
          Compact...
        </button>
        <button
          v-else
          class="text-text-hint hover:text-text-secondary text-xs font-ui px-1"
          title="Compact conversation"
          @click="handleCompactPolish"
        >
          Compact
        </button>
        <button
          class="text-text-hint hover:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent rounded px-1"
          :aria-expanded="expanded"
          aria-label="Toggle compact view"
          @click="expanded = !expanded"
        >
          {{ expanded ? '▼' : '▲' }}
        </button>
      </div>
    </div>

    <div class="flex-1 flex overflow-hidden">
      <PolishAnalysisArea
        :is-analyzing="polishStore.isAnalyzing"
        :selected-paragraph-index="polishStore.selectedParagraphIndex"
        :annotations="polishStore.annotations"
        :error="polishStore.error"
        :project-id="projectStore.currentProjectId"
        @accept="
          (id) => polishStore.acceptAnnotation(id, projectStore.currentProjectId, projectStore)
        "
        @reject="(id) => polishStore.rejectAnnotation(id, projectStore.currentProjectId)"
        @flag="(id) => polishStore.flagForLater(id, projectStore.currentProjectId)"
      />

      <div class="flex-[2] p-4 overflow-y-auto">
        <SnippetsDrawer :snippets="polishStore.snippets" />
      </div>
    </div>
  </div>
</template>
