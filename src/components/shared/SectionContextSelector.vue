<script setup>
import { ref, watch, computed } from 'vue'
import { useManuscriptContext } from '../../composables/useManuscriptContext'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { useLocalStorage } from '../../utils/useLocalStorage'
import BaseIcon from '../shared/BaseIcon.vue'

defineProps({
  panelId: {
    type: String,
    default: 'default'
  }
})

const { getSectionContext, getSectionCount } = useManuscriptContext()

const selectedSelector = useLocalStorage(STORAGE_KEYS.CHAPTER_CONTEXT, 'current')
const specificSections = ref('')
const showSpecificInput = ref(false)

watch(selectedSelector, (val) => {
  showSpecificInput.value = val.startsWith('chapters:')
})

watch(specificSections, (val) => {
  if (val.trim()) {
    const sections = val
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n)
    if (sections.length > 0) {
      selectedSelector.value = `chapters:${sections.join(',')}`
    }
  }
})

const options = computed(() => {
  const sectionCount = getSectionCount()
  const opts = [{ value: 'current', label: 'Current section' }]

  if (sectionCount >= 3) {
    opts.push({ value: 'last:3', label: 'Last 3 sections' })
  }

  if (sectionCount >= 5) {
    opts.push({ value: 'last:5', label: 'Last 5 sections' })
  }

  if (sectionCount >= 10) {
    opts.push({ value: 'last:10', label: 'Last 10 sections' })
  }

  if (sectionCount > 1) {
    opts.push({ value: 'all', label: 'From the beginning' })
  }

  opts.push({ value: 'specific', label: 'Specific sections...' })
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

watch(
  currentSelector,
  async (val) => {
    if (val === 'none') {
      contextPreview.value = null
      return
    }

    const result = await getSectionContext(val, 'spark')
    if (!result.contextText) {
      contextPreview.value = null
      return
    }

    const sectionLabel =
      result.sectionTitles.length === 1
        ? result.sectionTitles[0]
        : `${result.sectionTitles.length} sections`

    contextPreview.value = {
      label: sectionLabel,
      chars: result.totalChars,
      budgetChars: result.budgetChars,
      truncated: result.truncated
    }
  },
  { immediate: true }
)

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
  <!-- One line: what the AI reads, as a quiet control rather than a form field.
       The select is borderless with its own chevron so it reads as a choice,
       not an input; the budget preview sits under it in the hint colour. -->
  <div class="space-y-1.5">
    <div class="flex items-center gap-2 min-w-0">
      <span class="label-micro text-text-hint shrink-0">Context</span>
      <label class="relative inline-flex items-center min-w-0">
        <select
          v-model="selectedSelector"
          aria-label="Which part of the manuscript the AI reads"
          class="appearance-none bg-transparent pl-2 pr-6 py-1 rounded-md font-ui text-xs text-text-primary border border-transparent hover:border-border-subtle hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer max-w-[14rem] truncate transition-colors duration-150"
        >
          <option v-for="opt in options" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <BaseIcon
          name="chevron-down"
          :size="12"
          class="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-text-hint"
        />
      </label>
    </div>

    <div v-if="selectedSelector === 'specific'" class="flex items-center gap-2">
      <input
        v-model="specificSections"
        type="text"
        placeholder="e.g. 3, 5, 8"
        aria-label="Section numbers, comma separated"
        class="w-32 px-2 py-1 font-ui text-xs bg-bg-tertiary border border-border-subtle rounded-md text-text-primary placeholder:text-text-hint focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <span class="font-ui text-2xs text-text-hint">section numbers, comma separated</span>
    </div>

    <p
      v-if="contextPreview"
      class="flex items-center gap-1.5 font-ui text-2xs text-text-hint tabular-nums"
    >
      <BaseIcon name="file-text" :size="10" class="shrink-0" />
      <span class="truncate">{{ contextPreview.label }}</span>
      <span class="shrink-0"
        >· {{ contextPreview.chars.toLocaleString() }} /
        {{ contextPreview.budgetChars.toLocaleString() }} chars</span
      >
      <span v-if="contextPreview.truncated" class="text-warning shrink-0">· truncated</span>
    </p>
  </div>
</template>
