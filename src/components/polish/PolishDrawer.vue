<script setup>
import { ref, computed, onMounted } from 'vue'
import { usePolishStore } from '../../stores/polishStore'
import { useProjectStore } from '../../stores/projectStore'
import PolishAnnotation from './PolishAnnotation.vue'
import SnippetsDrawer from './SnippetsDrawer.vue'
import BaseIcon from '../shared/BaseIcon.vue'

const polishStore = usePolishStore()
const projectStore = useProjectStore()

const expanded = ref(false)

onMounted(() => {
  polishStore.setProjectStore(projectStore)
})

const lensOptions = [
  { key: 'weakVerbs', label: 'Weak Verbs' },
  { key: 'repetition', label: 'Repetition' },
  { key: 'pacing', label: 'Pacing' },
  { key: 'antecedents', label: 'Antecedents' }
]

const currentAnnotations = computed(() => {
  if (polishStore.selectedParagraphIndex === null) return []
  return polishStore.annotations.filter(
    a => a.paragraphIndex === polishStore.selectedParagraphIndex && a.status === 'pending'
  )
})

const lensIssueCounts = computed(() => {
  const counts = {}
  for (const lens of lensOptions) {
    const typeMap = {
      weakVerbs: 'weak_verb',
      repetition: 'repetition',
      pacing: 'pacing',
      antecedents: 'antecedent'
    }
    const type = typeMap[lens.key]
    counts[lens.key] = polishStore.annotations.filter(
      a => a.type === type && a.status === 'pending'
    ).length
  }
  return counts
})

const overallNote = computed(() => {
  if (currentAnnotations.value.length > 0) {
    return currentAnnotations.value[0].overallNote
  }
  return null
})

function toggleLens(key) {
  const lenses = { ...polishStore.activeLenses }
  lenses[key] = !lenses[key]
  polishStore.setActiveLenses(lenses)
}

function handleParagraphClick(text, index) {
  polishStore.selectParagraph(text, index)
}

async function analyzeNow() {
  if (polishStore.selectedParagraphText && polishStore.selectedParagraphIndex !== null && projectStore.currentProjectId) {
    await polishStore.analyzeNow(polishStore.selectedParagraphText, polishStore.selectedParagraphIndex, projectStore.currentProjectId)
  }
}

async function acceptAnnotation(id) {
  if (projectStore.currentProjectId) {
    await polishStore.acceptAnnotation(id, projectStore.currentProjectId, projectStore)
  }
}

async function rejectAnnotation(id) {
  if (projectStore.currentProjectId) {
    await polishStore.rejectAnnotation(id, projectStore.currentProjectId)
  }
}

async function flagAnnotation(id) {
  if (projectStore.currentProjectId) {
    await polishStore.flagForLater(id, projectStore.currentProjectId)
  }
}

defineExpose({
  handleParagraphClick
})
</script>

<template>
  <div 
    :class="[
      'flex flex-col h-full',
      expanded ? 'h-[50vh]' : 'h-[320px]'
    ]"
  >
    <div class="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
      <div class="flex gap-2">
        <button
          v-for="lens in lensOptions"
          :key="lens.key"
          @click="toggleLens(lens.key)"
            :class="[
              'px-2 py-1 text-xs rounded-full transition-colors font-ui relative focus:outline-none focus:ring-2 focus:ring-accent',
              polishStore.activeLenses[lens.key]
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-hint hover:text-text-secondary hover:bg-surface-hover'
            ]"
        >
          {{ lens.label }}
          <span v-if="lensIssueCounts[lens.key] > 0 && polishStore.activeLenses[lens.key]" class="ml-1 opacity-75">
            {{ lensIssueCounts[lens.key] }}
          </span>
        </button>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="polishStore.selectedParagraphIndex !== null"
          @click="analyzeNow"
          :disabled="polishStore.isAnalyzing"
          class="px-2 py-1 text-xs bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed font-ui focus:outline-none focus:ring-2 focus:ring-accent"
          title="Analyze selected paragraph"
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
          @click="expanded = !expanded"
          class="text-text-hint hover:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent rounded px-1"
        >
          {{ expanded ? '▼' : '▲' }}
        </button>
      </div>
    </div>

    <div class="flex-1 flex overflow-hidden">
      <div class="flex-[3] p-4 overflow-y-auto border-r border-border-subtle">
        <div v-if="polishStore.selectedParagraphIndex === null" class="text-center py-8">
          <p class="text-sm italic text-text-hint font-body">Click any paragraph in the editor to analyze it</p>
        </div>
        
        <div v-else-if="polishStore.isAnalyzing" class="flex flex-col items-center justify-center py-8 gap-4">
          <div class="flex items-center gap-2 text-text-secondary">
            <BaseIcon name="loader-2" :size="16" class="animate-spin" />
            <span>Analyzing...</span>
          </div>
          <div class="w-full max-w-sm space-y-2">
            <div class="h-3 bg-surface-hover rounded w-3/4 animate-pulse"></div>
            <div class="h-3 bg-surface-hover rounded w-full animate-pulse"></div>
            <div class="h-3 bg-surface-hover rounded w-5/6 animate-pulse"></div>
          </div>
        </div>
        
        <div v-else-if="currentAnnotations.length === 0 && !polishStore.error" class="text-center py-8">
          <p class="text-sm italic text-text-hint font-body">No issues found — this paragraph looks clean</p>
        </div>
        
        <div v-else-if="polishStore.error" class="p-3 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger font-ui">
          {{ polishStore.error }}
        </div>
        
        <div v-else class="space-y-4">
          <div v-if="overallNote" class="bg-accent-muted/30 border-l-2 border-accent rounded-r-lg p-3 text-sm text-text-secondary italic font-body">
            {{ overallNote }}
          </div>
          
          <PolishAnnotation
            v-for="annotation in currentAnnotations"
            :key="annotation.id"
            :annotation="annotation"
            @accept="acceptAnnotation"
            @reject="rejectAnnotation"
            @flag="flagAnnotation"
          />
        </div>
      </div>
      
      <div class="flex-[2] p-4 overflow-y-auto">
        <SnippetsDrawer :snippets="polishStore.snippets" />
      </div>
    </div>
  </div>
</template>
