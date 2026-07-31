<script setup>
import { computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'
import { useProjectStore } from '../../stores/projectStore'
import { useManuscriptStore } from '../../stores/manuscriptStore'

/**
 * Where in the manuscript the editor currently is: project › chapter › scene.
 *
 * The header previously named only the project, so a writer three scenes deep
 * had nothing on screen telling them which scene they were editing, and no way
 * up to the chapter except through the sidebar panel.
 *
 * Ancestors are buttons that climb the hierarchy; the last crumb is the current
 * location and is plain text with `aria-current`.
 */
const props = defineProps({
  /**
   * Off when the header already renders the project name as its own control —
   * the crumb trail then starts at the chapter, so the name is not shown twice.
   */
  includeProject: { type: Boolean, default: true }
})

const projectStore = useProjectStore()
const manuscriptStore = useManuscriptStore()

const projectName = computed(() => projectStore.currentProjectName || 'Untitled Project')

const sectionLabel = computed(() => {
  const section = manuscriptStore.activeSection
  if (!section) return null
  return section.title || `Section ${(section.order ?? 0) + 1}`
})

const subsectionLabel = computed(() => {
  const subsection = manuscriptStore.activeSubsection
  if (!subsection) return null
  return subsection.title || 'Untitled Subsection'
})

/**
 * Always ends with the deepest active level, so the final entry is the place
 * the writer is actually editing.
 */
const crumbs = computed(() => {
  const trail = []
  if (props.includeProject) {
    trail.push({ key: 'project', label: projectName.value, level: 'project' })
  }
  if (sectionLabel.value)
    trail.push({ key: 'section', label: sectionLabel.value, level: 'section' })
  if (subsectionLabel.value) {
    trail.push({ key: 'subsection', label: subsectionLabel.value, level: 'subsection' })
  }
  return trail
})

function goTo(level) {
  if (level === 'project') {
    manuscriptStore.setActiveSubsection(null)
    manuscriptStore.setActiveSection(null)
    return
  }
  if (level === 'section') manuscriptStore.setActiveSubsection(null)
}
</script>

<template>
  <nav
    v-if="crumbs.length"
    aria-label="Manuscript location"
    class="flex min-w-0 items-center gap-1"
  >
    <template v-for="(crumb, index) in crumbs" :key="crumb.key">
      <BaseIcon
        v-if="index > 0 || !includeProject"
        name="chevron-right"
        :size="13"
        class="shrink-0 text-text-faint"
        aria-hidden="true"
      />

      <span
        v-if="index === crumbs.length - 1"
        class="truncate font-ui text-xs text-text-primary"
        aria-current="page"
      >
        {{ crumb.label }}
      </span>
      <button
        v-else
        type="button"
        class="max-w-[12rem] truncate rounded px-1 py-0.5 font-ui text-xs text-text-hint transition-colors duration-150 hover:text-text-primary"
        @click="goTo(crumb.level)"
      >
        {{ crumb.label }}
      </button>
    </template>
  </nav>
</template>
