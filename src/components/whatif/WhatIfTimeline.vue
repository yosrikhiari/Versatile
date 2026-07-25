<script setup>
import { computed } from 'vue'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  selectedSectionId: { type: String, default: null },
  selectedSubsectionId: { type: String, default: null }
})

const emit = defineEmits(['select'])

const manuscriptStore = useManuscriptStore()

const sections = computed(() => {
  return manuscriptStore.sortedSections.map((section) => {
    const subs = (manuscriptStore.subsectionsBySection[section.id] || []).sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    )
    return { ...section, subsections: subs }
  })
})

const isSelected = (subsection) =>
  subsection.id === props.selectedSubsectionId && subsection.sectionId === props.selectedSectionId

const isActive = (subsection) =>
  subsection.id === manuscriptStore.activeSubsectionId &&
  subsection.sectionId === manuscriptStore.activeSectionId

function handleSelect(subsection) {
  emit('select', { sectionId: subsection.sectionId, subsectionId: subsection.id })
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center gap-2 px-3 py-2.5 border-b border-border-subtle">
      <BaseIcon name="git-branch-plus" :size="14" class="text-text-hint shrink-0" />
      <span class="text-xs font-medium text-text-primary">Pick a divergence point</span>
    </div>

    <div class="flex-1 overflow-y-auto scrollbar-thin">
      <div v-if="!sections.length" class="text-xs text-text-hint text-center py-8">
        No sections yet
      </div>

      <div
        v-for="section in sections"
        :key="section.id"
        class="border-b border-border-subtle last:border-b-0"
      >
        <div class="flex items-center gap-2 px-3 py-2 bg-bg-secondary/30">
          <BaseIcon name="book-open" :size="12" class="text-text-hint shrink-0" />
          <span class="text-xs font-medium text-text-primary truncate flex-1">
            {{ section.title || 'Untitled Section' }}
          </span>
          <span class="text-[10px] text-text-hint">{{ section.subsections.length }} scenes</span>
        </div>

        <div
          v-for="sub in section.subsections"
          :key="sub.id"
          class="flex items-center gap-2.5 px-3 py-2 ml-1 cursor-pointer transition-colors border-t border-border-subtle/50"
          :class="
            isSelected(sub)
              ? 'bg-accent/10 border-l-2 border-l-accent'
              : 'hover:bg-surface-hover border-l-2 border-l-transparent'
          "
          @click="handleSelect(sub)"
        >
          <div
            class="w-2 h-2 rounded-full shrink-0"
            :class="
              isSelected(sub) ? 'bg-accent' : isActive(sub) ? 'bg-green-500' : 'bg-border-subtle'
            "
          />
          <span
            class="text-xs truncate flex-1 min-w-0"
            :class="
              isSelected(sub)
                ? 'text-accent font-medium'
                : isActive(sub)
                  ? 'text-text-primary font-medium'
                  : 'text-text-secondary'
            "
          >
            {{ sub.title || sub.brief?.summary || 'Untitled Scene' }}
          </span>
          <span
            v-if="isActive(sub) && !isSelected(sub)"
            class="text-[10px] text-green-500 shrink-0"
          >
            current
          </span>
          <BaseIcon
            v-if="isSelected(sub)"
            name="check-circle"
            :size="14"
            class="text-accent shrink-0"
          />
        </div>
      </div>
    </div>
  </div>
</template>
