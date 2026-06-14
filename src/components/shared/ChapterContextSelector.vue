<script setup>
import { ref, watch, computed } from 'vue'
import { useManuscriptContext } from '../../composables/useManuscriptContext'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { useLocalStorage } from '../../composables/useLocalStorage'
import BaseIcon from '../shared/BaseIcon.vue'

defineProps({
  panelId: {
    type: String,
    default: 'default'
  }
})

const { getSectionContext, getSectionCount, MAX_CONTEXT_CHARS } = useManuscriptContext()

const selectedSelector = useLocalStorage(STORAGE_KEYS.CHAPTER_CONTEXT, 'current')
const specificChapters = ref('')
const showSpecificInput = ref(false)

watch(selectedSelector, (val) => {
  showSpecificInput.value = val.startsWith('chapters:')
})

watch(specificChapters, (val) => {
  if (val.trim()) {
    const chapters = val.split(',').map(n => n.trim()).filter(n => n)
    if (chapters.length > 0) {
      selectedSelector.value = `chapters:${chapters.join(',')}`
    }
  }
})

const options = computed(() => {
  const chapterCount = getSectionCount()
  const opts = [
    { value: 'current', label: 'Current chapter' }
  ]
  
  if (chapterCount >= 3) {
    opts.push({ value: 'last:3', label: 'Last 3 chapters' })
  }
  
  if (chapterCount >= 5) {
    opts.push({ value: 'last:5', label: 'Last 5 chapters' })
  }
  
  if (chapterCount >= 10) {
    opts.push({ value: 'last:10', label: 'Last 10 chapters' })
  }
  
  if (chapterCount > 1) {
    opts.push({ value: 'all', label: 'From the beginning' })
  }
  
  opts.push({ value: 'specific', label: 'Specific chapters...' })
  opts.push({ value: 'none', label: 'None' })
  
  return opts
})

const currentSelector = computed(() => {
  if (selectedSelector.value === 'specific') {
    return 'none'
  }
  return selectedSelector.value
})

const contextPreview = ref(null)

watch(currentSelector, async (val) => {
  if (val === 'none') {
    contextPreview.value = null
    return
  }
  
  const result = await getSectionContext(val, 'spark')
  if (!result.contextText) {
    contextPreview.value = null
    return
  }
  
  const chapterLabel = result.sectionTitles.length === 1 
    ? result.sectionTitles[0]
    : `${result.sectionTitles.length} chapters`
  
  contextPreview.value = {
    label: chapterLabel,
    chars: result.totalChars,
    truncated: result.truncated
  }
}, { immediate: true })

async function getContext() {
  if (currentSelector.value === 'none') {
    return null
  }
  return await getSectionContext(currentSelector.value, 'spark')
}

defineExpose({
  getContext,
  selectedSelector: currentSelector
})
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <span class="text-xs text-text-hint">Context:</span>
      <select
        v-model="selectedSelector"
        class="flex-1 px-2 py-1.5 text-xs bg-bg-tertiary border border-border-subtle rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
      >
        <option v-for="opt in options" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>
    
    <div v-if="selectedSelector === 'specific'" class="pl-16">
      <input
        v-model="specificChapters"
        type="text"
        placeholder="e.g. 3, 5, 8"
        class="w-full px-2 py-1.5 text-xs bg-bg-tertiary border border-border-subtle rounded text-text-primary placeholder:text-text-hint focus:outline-none focus:ring-1 focus:ring-accent/50"
      />
      <p class="mt-1 text-[10px] text-text-hint">Enter chapter numbers, separated by commas</p>
    </div>
    
    <div v-if="contextPreview" class="pl-16 flex items-center gap-1.5 text-[10px] text-text-hint">
      <BaseIcon name="file-text" :size="10" />
      <span>{{ contextPreview.label }}</span>
      <span class="text-text-muted">({{ contextPreview.chars }}/{{ MAX_CONTEXT_CHARS }} chars)</span>
      <span v-if="contextPreview.truncated" class="text-amber-500">truncated</span>
    </div>
  </div>
</template>
