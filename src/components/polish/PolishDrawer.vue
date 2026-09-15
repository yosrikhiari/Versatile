<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePolishStore } from '../../stores/polishStore'
import { useProjectStore } from '../../stores/projectStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useCompactConversation } from '../../composables/useOllama'
import { PROVIDER_LABELS, FEATURES } from '../../config/ai'
import PolishAnalysisArea from './PolishAnalysisArea.vue'
import PolishLensBar from './PolishLensBar.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import BaseButton from '../ui/BaseButton.vue'
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
    <div class="flex items-center gap-3 px-4 py-2 border-b border-border-subtle">
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
      <span class="flex-1"></span>
      <span
        class="hidden md:block font-ui text-xs text-text-hint truncate max-w-[160px]"
        :title="polishModelLabel"
        >{{ polishModelLabel }}</span
      >
      <BaseButton
        variant="ghost"
        size="sm"
        icon="minimize-2"
        :loading="compactIsCompacting"
        :disabled="compactIsCompacting"
        title="Compact conversation"
        @click="handleCompactPolish"
      >
        Compact
      </BaseButton>
      <BaseButton
        variant="primary"
        size="sm"
        icon="sparkles"
        :loading="polishStore.isAnalyzing"
        :disabled="polishStore.isAnalyzing || polishStore.selectedParagraphIndex === null"
        :title="
          polishStore.selectedParagraphIndex === null
            ? 'Select a paragraph in the editor first'
            : 'Analyze the selected paragraph'
        "
        @click="analyzeNow"
      >
        Analyze
      </BaseButton>
      <button
        type="button"
        class="rounded p-1 text-text-hint transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        :aria-expanded="expanded"
        :aria-label="expanded ? 'Shrink drawer' : 'Expand drawer'"
        @click="expanded = !expanded"
      >
        <BaseIcon :name="expanded ? 'chevron-down' : 'chevron-up'" :size="14" />
      </button>
    </div>

    <div class="flex-1 flex min-h-0 overflow-hidden">
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

      <aside class="w-64 shrink-0 hidden md:block px-4 py-3 overflow-y-auto scrollbar-thin">
        <SnippetsDrawer :snippets="polishStore.snippets" />
      </aside>
    </div>
  </div>
</template>
