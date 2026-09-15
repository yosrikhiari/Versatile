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
    <p class="px-4 py-3 border-b border-border-subtle font-ui text-xs text-text-hint leading-5">
      Pick the scene the story diverges from. Everything after it is what changes.
    </p>

    <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      <p v-if="!sections.length" class="px-4 py-8 text-center font-ui text-xs text-text-hint">
        No sections yet
      </p>

      <section
        v-for="section in sections"
        :key="section.id"
        class="px-4 py-3 border-b border-border-subtle last:border-b-0"
      >
        <h3 class="flex items-center justify-between gap-2 label-micro text-text-hint mb-1">
          <span class="truncate">{{ section.title || 'Untitled section' }}</span>
          <span class="shrink-0 tabular-nums">{{ section.subsections.length }}</span>
        </h3>

        <ul class="-mx-1" role="listbox" aria-label="Scenes">
          <li
            v-for="sub in section.subsections"
            :key="sub.id"
            role="option"
            :aria-selected="isSelected(sub)"
            tabindex="0"
            class="flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors duration-150 hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            :class="
              isSelected(sub)
                ? 'bg-surface-hover shadow-[inset_2px_0_0_0_rgb(var(--vers-accent-primary-rgb))]'
                : ''
            "
            @click="handleSelect(sub)"
            @keydown.enter.space.prevent="handleSelect(sub)"
          >
            <span
              class="flex-1 min-w-0 truncate font-ui text-sm"
              :class="
                isSelected(sub) || isActive(sub) ? 'text-text-primary' : 'text-text-secondary'
              "
            >
              {{ sub.title || sub.brief?.summary || 'Untitled scene' }}
            </span>
            <span v-if="isActive(sub)" class="shrink-0 font-ui text-xs text-text-hint">open</span>
            <BaseIcon v-if="isSelected(sub)" name="check" :size="14" class="text-accent shrink-0" />
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
