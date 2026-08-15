<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '../../stores/projectStore'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { getAllProjects } from '../../services/dbService'
import SidebarNav from './SidebarNav.vue'
import EditorBreadcrumb from './EditorBreadcrumb.vue'
import CommandPalette from './CommandPalette.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import GoalProgressBar from '../shared/GoalProgressBar.vue'
import ProjectSettingsModal from './ProjectSettingsModal.vue'
import BranchManagerModal from './BranchManagerModal.vue'
import RecapBanner from './RecapBanner.vue'
import ContextStatusIndicator from './ContextStatusIndicator.vue'
import GuardrailIndicator from '../../guardrails/reporting/components/GuardrailIndicator.vue'
import NetworkStatusBadge from '../shared/NetworkStatusBadge.vue'
import BranchSwitcher from '../workspace/BranchSwitcher.vue'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { useLocalStorage } from '../../utils/useLocalStorage'
import { useAuthStore } from '../../stores/authStore'
import { useBranchStore } from '../../stores/branchStore'
import { useTheme } from '../../composables/useTheme'

import { CREATIVE_WORKSPACE_TYPES } from '../../config/workspace'

const projectStore = useProjectStore()

const activePanelName = ref(null)
const flowMode = ref(false)
const sidebarOpen = ref(false)
const mainContentRef = ref(null)

// Skip-to-content: move keyboard focus into the editor region, bypassing nav.
function focusMain() {
  mainContentRef.value?.focus()
}
const showProjectSettings = ref(false)
const showBranchManager = ref(false)
const showProjectDropdown = ref(false)
const projects = ref([])

const showRevise = ref(false)
const showCoreLoop = ref(true)
const coreLoopSeen = useLocalStorage(STORAGE_KEYS.CORE_LOOP_SEEN, {
  write: false,
  analyze: false,
  build: false
})

const props = defineProps({
  focusMode: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'start-flow',
  'end-flow',
  'export',
  'import',
  'export-pdf',
  'export-rtf',
  'open-settings',
  'open-auth',
  'complete-onboarding',
  'create-project'
])

const authStore = useAuthStore()
const branchStore = useBranchStore()
const router = useRouter()

const isNarrativeWorkspace = computed(() =>
  CREATIVE_WORKSPACE_TYPES.includes(projectStore.activeWorkspaceType)
)

const wordCount = computed(() => projectStore.wordCount)
const projectName = computed(() => projectStore.currentProjectName)

const { isDark: isThemeDark, initTheme, toggleTheme } = useTheme()

// ── Command palette ────────────────────────────────────────────────────────
const showCommandPalette = ref(false)

/**
 * Global actions the palette offers alongside the panels. Panels come from the
 * shared nav definition; these are the things that have no sidebar entry.
 */
const paletteActions = computed(() => [
  {
    id: 'toggle-theme',
    label: isThemeDark.value ? 'Switch to light mode' : 'Switch to dark mode',
    icon: isThemeDark.value ? 'sun' : 'moon'
  },
  { id: 'export', label: 'Export project', icon: 'upload', hint: 'Ctrl+S' },
  { id: 'export-pdf', label: 'Export to PDF', icon: 'file-text' },
  {
    id: 'export-rtf',
    label: 'Export manuscript (RTF)',
    icon: 'file-text',
    keywords: ['word', 'docx', 'scrivener', 'manuscript']
  },
  { id: 'import', label: 'Import project', icon: 'download', hint: 'Ctrl+I' },
  { id: 'project-settings', label: 'Project settings', icon: 'settings' },
  { id: 'all-projects', label: 'All projects', icon: 'layout-grid', keywords: ['workspace'] }
])

const PALETTE_ACTIONS = {
  'toggle-theme': () => toggleTheme(),
  export: () => emit('export'),
  'export-pdf': () => emit('export-pdf'),
  'export-rtf': () => emit('export-rtf'),
  import: () => emit('import'),
  'project-settings': () => {
    showProjectSettings.value = true
  },
  'all-projects': () => router.push('/workspace')
}

function runPaletteAction(id) {
  PALETTE_ACTIONS[id]?.()
}

function onGlobalKeydown(event) {
  // Ctrl/⌘-K anywhere, including from inside the manuscript.
  if (event.key?.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    showCommandPalette.value = !showCommandPalette.value
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
  initTheme()
  if (coreLoopSeen.value.write && coreLoopSeen.value.analyze && coreLoopSeen.value.build) {
    showCoreLoop.value = false
  }
})

function markCoreLoop(mode) {
  if (!coreLoopSeen.value[mode]) {
    // Re-assign object to trigger customRef setter properly
    coreLoopSeen.value = {
      ...coreLoopSeen.value,
      [mode]: true
    }

    if (coreLoopSeen.value.write && coreLoopSeen.value.analyze && coreLoopSeen.value.build) {
      showCoreLoop.value = false
    }
  }
}

async function loadProjects() {
  projects.value = await getAllProjects(authStore.localUser?.id || null)
}

/**
 * Re-reads the project list every time the menu opens.
 *
 * `loadProjects()` otherwise runs only in `onMounted`, so a project created
 * after this shell mounted — from onboarding, or from the workspace in the same
 * session — never appeared in the switcher until a full reload.
 */
function goToWorkspace() {
  showProjectDropdown.value = false
  router.push('/workspace')
}

async function toggleProjectDropdown() {
  const opening = !showProjectDropdown.value
  showProjectDropdown.value = opening
  if (opening) await loadProjects()
}

function handleAuthClick() {
  if (authStore.localUser) {
    authStore.logout()
    router.push('/login')
  } else if (authStore.user) {
    authStore.logout()
  } else {
    emit('open-auth')
  }
}

async function switchProject(projectId) {
  showProjectDropdown.value = false
  if (projectId === projectStore.currentProjectId) return

  // Navigate rather than loading in place. This used to swap the store's
  // project while leaving the URL on the previous one, so a refresh silently
  // took the writer back to the project they had just left. The route change
  // remounts EditorView, whose `onMounted` does the loading.
  await router.push(`/editor/${projectId}`)
}

function handleCreateProjectClick() {
  showProjectDropdown.value = false
  emit('create-project')
}

function handleBranchSwitch() {
  const mn = useManuscriptStore()
  mn.loadManuscript(projectStore.currentProjectId)
}

function closeAllPanels() {
  activePanelName.value = null
}

function toggleStoryGenerator() {
  activePanelName.value = activePanelName.value === 'story-generator' ? null : 'story-generator'
}

function togglePolish() {
  if (activePanelName.value !== 'polish') {
    activePanelName.value = 'polish'
    markCoreLoop('analyze')
  } else {
    activePanelName.value = null
  }
}

function toggleStoryBible(force) {
  if (force || activePanelName.value !== 'story-bible') {
    activePanelName.value = 'story-bible'
    if (!force) markCoreLoop('build')
  } else {
    activePanelName.value = null
  }
}

function toggleCanvas() {
  activePanelName.value = activePanelName.value === 'canvas' ? null : 'canvas'
}

function toggleOutline() {
  activePanelName.value = activePanelName.value === 'outline' ? null : 'outline'
}

function toggleSections(force) {
  if (force || activePanelName.value !== 'sections') {
    activePanelName.value = 'sections'
  } else {
    activePanelName.value = null
  }
}

function toggleNetwork(force) {
  if (force || activePanelName.value !== 'network') {
    activePanelName.value = 'network'
  } else {
    activePanelName.value = null
  }
}

function toggleTimeline() {
  activePanelName.value = activePanelName.value === 'timeline' ? null : 'timeline'
}

function toggleArchive() {
  activePanelName.value = activePanelName.value === 'archive' ? null : 'archive'
}

function toggleResearch() {
  activePanelName.value = activePanelName.value === 'research' ? null : 'research'
}

function toggleVoiceLab() {
  activePanelName.value = activePanelName.value === 'voice-lab' ? null : 'voice-lab'
}

function toggleStoryShape() {
  activePanelName.value = activePanelName.value === 'story-shape' ? null : 'story-shape'
}

function toggleConsistency() {
  activePanelName.value = activePanelName.value === 'consistency' ? null : 'consistency'
}

function toggleBetaReader() {
  activePanelName.value = activePanelName.value === 'beta-reader' ? null : 'beta-reader'
}

function toggleCostDashboard() {
  activePanelName.value = activePanelName.value === 'cost-dashboard' ? null : 'cost-dashboard'
}

function toggleSpark() {
  toggleStoryGenerator()
}

function toggleWhatIf() {
  activePanelName.value = activePanelName.value === 'whatif' ? null : 'whatif'
}

function toggleRevise() {
  activePanelName.value = activePanelName.value === 'revise' ? null : 'revise'
}

function toggleFlow() {
  markCoreLoop('write')
  if (flowMode.value) {
    emit('end-flow')
  } else {
    emit('start-flow')
  }
  flowMode.value = !flowMode.value
}

function closeProjectDropdownAndOpen(target) {
  showProjectDropdown.value = false
  if (target === 'settings') showProjectSettings.value = true
}

function handleSidebarNav(name) {
  if (name === 'settings') {
    showProjectSettings.value = true
    return
  }
  flowMode.value = false
  const map = {
    'story-generator': toggleStoryGenerator,
    polish: togglePolish,
    'story-bible': toggleStoryBible,
    canvas: toggleCanvas,
    outline: toggleOutline,
    sections: toggleSections,
    network: toggleNetwork,
    timeline: toggleTimeline,
    archive: toggleArchive,
    research: toggleResearch,
    'voice-lab': toggleVoiceLab,
    'story-shape': toggleStoryShape,
    consistency: toggleConsistency,
    'beta-reader': toggleBetaReader,
    whatif: toggleWhatIf,
    'cost-dashboard': toggleCostDashboard
  }
  map[name]?.()
}

defineExpose({
  toggleSpark,
  toggleWhatIf,
  toggleRevise,
  toggleStoryGenerator,
  togglePolish,
  toggleStoryBible,
  toggleCanvas,
  toggleOutline,
  toggleSections,
  toggleNetwork,
  toggleResearch,
  toggleVoiceLab,
  toggleStoryShape,
  toggleConsistency,
  toggleBetaReader,
  toggleCostDashboard
})

onMounted(async () => {
  await loadProjects()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})

watch(
  () => projectStore.currentProjectId,
  (pid) => {
    if (pid) branchStore.initForProject(pid)
  }
)
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <a href="#main-content" class="skip-to-content" @click.prevent="focusMain"> Skip to content </a>
    <header class="h-12 glass flex items-center justify-between px-3 shrink-0 z-10">
      <div class="flex items-center gap-2">
        <button
          class="md:hidden grid place-items-center w-9 h-9 -ml-1 rounded-lg text-text-hint hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
          title="Open menu"
          @click="sidebarOpen = true"
        >
          <BaseIcon name="menu" :size="18" />
        </button>
        <span
          v-if="flowMode"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-semibold text-accent cursor-pointer transition-all duration-150"
          style="background: rgb(var(--vers-accent-primary-rgb) / 0.12)"
          @click="toggleFlow"
        >
          <BaseIcon name="play" :size="10" />
          Flow
        </span>

        <div class="relative">
          <button
            class="hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded-lg px-2 py-1 text-sm flex items-center gap-1.5 transition-all duration-150 btn-ghost"
            title="Switch project"
            @click="toggleProjectDropdown"
          >
            {{ projectName || 'Untitled Project' }}
            <BaseIcon name="chevron-down" :size="14" class="opacity-60" />
          </button>
          <Transition name="anim-scale">
            <div
              v-if="showProjectDropdown"
              class="absolute left-0 top-full mt-1 bg-bg-secondary border border-border-subtle rounded-lg shadow-warm-md py-1 z-50 min-w-[220px]"
              @click.stop
            >
              <button
                class="w-full text-left px-3 py-2 text-sm text-accent hover:bg-surface-hover flex items-center gap-2 transition-colors duration-150"
                @click="handleCreateProjectClick"
              >
                <BaseIcon name="plus" :size="14" />
                Create new project
              </button>
              <button
                v-for="project in projects"
                :key="project.id"
                :class="[
                  'w-full text-left px-3 py-2 text-sm hover:bg-surface-hover transition-colors duration-150',
                  project.id === projectStore.currentProjectId
                    ? 'text-accent font-medium'
                    : 'text-text-secondary'
                ]"
                @click="switchProject(project.id)"
              >
                {{ project.name }}
              </button>
              <hr class="my-1 border-border-subtle mx-2" />
              <!--
                The only route back to the project index used to be buried in
                the account popover at the bottom of the sidebar. This menu is
                where someone already goes when they want a different project,
                so the way out belongs here.
              -->
              <button
                class="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover flex items-center gap-2 transition-colors duration-150"
                @click="goToWorkspace"
              >
                <BaseIcon name="layout-grid" :size="14" />
                All projects
              </button>
              <!-- prettier-ignore -->
              <button
                class="w-full text-left px-3 py-2 text-sm text-text-hint hover:bg-surface-hover flex items-center gap-2 transition-colors duration-150"
                @click="closeProjectDropdownAndOpen('settings')"
              >
                <BaseIcon name="settings" :size="14" />
                Project Settings
              </button>
            </div>
          </Transition>
        </div>

        <!-- The switcher above names the project; this continues the trail into
             the chapter and scene actually being edited. -->
        <EditorBreadcrumb :include-project="false" class="hidden md:flex" />

        <div class="hidden sm:flex items-center gap-3 text-2xs text-text-hint">
          <span class="tabular-nums font-ui">{{ wordCount.toLocaleString() }} words</span>
          <span v-if="projectStore.currentStreak > 0" class="text-warning flex items-center gap-1">
            <BaseIcon name="flame" :size="11" class="text-warning" />
            {{ projectStore.currentStreak }}
          </span>
        </div>

        <BranchSwitcher
          v-if="projectStore.currentProjectId"
          class="ml-2"
          @switch="handleBranchSwitch"
          @open-manager="showBranchManager = true"
        />
      </div>

      <div class="flex items-center gap-1.5">
        <!-- The shortcut only helps if something tells you it exists. -->
        <button
          class="hidden md:flex items-center gap-1.5 rounded-lg border border-border-subtle px-2 py-1 text-text-hint transition-colors duration-150 hover:border-border-strong hover:text-text-secondary"
          title="Search panels and actions (Ctrl+K)"
          @click="showCommandPalette = true"
        >
          <BaseIcon name="search" :size="13" />
          <kbd class="font-ui text-xs">Ctrl K</kbd>
        </button>
        <NetworkStatusBadge />
        <ContextStatusIndicator />
        <GuardrailIndicator />
        <button
          class="hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded-lg p-1.5 btn-ghost transition-all duration-150 active:scale-[0.97]"
          :title="isThemeDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleTheme"
        >
          <BaseIcon :name="isThemeDark ? 'sun' : 'moon'" :size="16" />
        </button>
        <span
          v-if="projectStore.lastSaved"
          class="text-2xs text-text-hint flex items-center gap-1 mr-1"
        >
          <BaseIcon name="check" :size="9" class="text-success" />
          Saved
        </span>
        <GoalProgressBar
          :current-words="projectStore.dailyWordCount"
          :goal-words="projectStore.dailyGoal"
          @open-settings="showProjectSettings = true"
        />
        <button
          class="hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded-lg p-1.5 btn-ghost transition-all duration-150 active:scale-[0.97]"
          title="Export project (Ctrl+S)"
          @click="emit('export')"
          @keydown.enter="emit('export')"
        >
          <BaseIcon name="upload" :size="16" />
        </button>
        <button
          class="hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded-lg p-1.5 btn-ghost transition-all duration-150 active:scale-[0.97]"
          title="Export to PDF"
          @click="emit('export-pdf')"
        >
          <BaseIcon name="file-text" :size="16" />
        </button>
        <button
          class="hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded-lg p-1.5 btn-ghost transition-all duration-150 active:scale-[0.97]"
          title="Export manuscript (RTF — opens in Word, Docs, Scrivener)"
          @click="emit('export-rtf')"
        >
          <BaseIcon name="book-open" :size="16" />
        </button>
        <button
          class="hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded-lg p-1.5 btn-ghost transition-all duration-150 active:scale-[0.97]"
          title="Import project (Ctrl+I)"
          @click="emit('import')"
          @keydown.enter="emit('import')"
        >
          <BaseIcon name="download" :size="16" />
        </button>
        <button
          class="hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded-lg p-1.5 btn-ghost transition-all duration-150 active:scale-[0.97]"
          :title="
            authStore.localUser
              ? `Signed in as ${authStore.localUser.displayName || authStore.localUser.username}`
              : authStore.isAuthenticated
                ? `Signed in as ${authStore.user?.username || 'user'}`
                : 'Sign in to sync'
          "
          @click="handleAuthClick()"
        >
          <BaseIcon :name="authStore.isAuthenticated ? 'log-in' : 'user'" :size="16" />
        </button>
      </div>
    </header>

    <RecapBanner />

    <div class="flex-1 flex overflow-hidden">
      <SidebarNav
        v-show="!focusMode"
        :active-panel="activePanelName"
        :mobile-open="sidebarOpen"
        @navigate="handleSidebarNav"
        @close="sidebarOpen = false"
      />

      <div class="flex-1 flex overflow-hidden relative">
        <!-- panel-left -->
        <aside
          v-if="activePanelName === 'story-generator' && !flowMode && !focusMode"
          key="story-generator"
          class="tool-panel w-full md:w-[500px] md:max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
        >
          <slot name="story-generator"></slot>
        </aside>
        <aside
          v-else-if="activePanelName === 'story-bible' && !flowMode && !focusMode"
          key="story-bible"
          class="tool-panel w-full md:w-[600px] md:max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0"
        >
          <slot name="story-bible"></slot>
        </aside>
        <aside
          v-else-if="activePanelName === 'canvas' && !flowMode && !focusMode"
          key="canvas"
          class="tool-panel w-full md:w-[400px] md:max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0"
        >
          <slot name="canvas"></slot>
        </aside>
        <aside
          v-else-if="activePanelName === 'outline' && !flowMode && !focusMode"
          key="outline"
          class="tool-panel w-full md:w-[350px] md:max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0"
        >
          <slot name="outline"></slot>
        </aside>
        <aside
          v-else-if="activePanelName === 'sections' && !flowMode && !focusMode"
          key="sections"
          class="tool-panel w-full md:w-[320px] md:max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0"
        >
          <slot name="sections"></slot>
        </aside>
        <aside
          v-else-if="activePanelName === 'network' && !flowMode && !focusMode"
          key="network"
          class="tool-panel w-full md:w-[900px] md:max-w-[95vw] xl:max-w-[900px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0"
        >
          <slot name="network"></slot>
        </aside>
        <aside
          v-else-if="activePanelName === 'timeline' && !flowMode && !focusMode"
          key="timeline"
          class="tool-panel w-full md:w-[600px] md:max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0"
        >
          <slot name="timeline"></slot>
        </aside>
        <aside
          v-else-if="activePanelName === 'voice-lab' && !flowMode && !focusMode"
          key="voice-lab"
          class="tool-panel w-full md:w-[420px] md:max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
        >
          <slot name="voice-lab"></slot>
        </aside>
        <aside
          v-else-if="activePanelName === 'whatif' && !flowMode && !focusMode"
          key="whatif"
          class="tool-panel w-full md:w-[380px] md:max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
        >
          <slot name="whatif"></slot>
        </aside>
        <aside
          v-else-if="activePanelName === 'story-shape' && !flowMode && !focusMode"
          key="story-shape"
          class="tool-panel w-full md:w-[380px] md:max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
        >
          <slot name="story-shape"></slot>
        </aside>
        <aside
          v-else-if="activePanelName === 'consistency' && !flowMode && !focusMode"
          key="consistency"
          class="tool-panel w-full md:w-[380px] md:max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
        >
          <slot name="consistency"></slot>
        </aside>
        <aside
          v-else-if="activePanelName === 'beta-reader' && !flowMode && !focusMode"
          key="beta-reader"
          class="tool-panel w-full md:w-[380px] md:max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
        >
          <slot name="beta-reader"></slot>
        </aside>
        <aside
          v-else-if="activePanelName === 'cost-dashboard' && !flowMode && !focusMode"
          key="cost-dashboard"
          class="tool-panel w-full md:w-[380px] md:max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
        >
          <slot name="cost-dashboard"></slot>
        </aside>
        <!-- /panel-left -->

        <main
          id="main-content"
          ref="mainContentRef"
          tabindex="-1"
          aria-label="Manuscript editor"
          class="flex-1 flex flex-col overflow-hidden focus:outline-none"
        >
          <div class="flex-1 overflow-hidden">
            <slot name="editor"></slot>
          </div>
          <Transition name="panel-bottom">
            <div
              v-if="showRevise && !focusMode"
              class="bg-bg-secondary border-t border-border-subtle overflow-y-auto scrollbar-thin"
            >
              <slot name="revise"></slot>
            </div>
          </Transition>
          <div
            v-if="activePanelName === 'revise' && !flowMode && !focusMode"
            class="flex-1 overflow-hidden transition-all duration-200"
          >
            <slot name="revise"></slot>
          </div>
        </main>

        <!-- panel-right -->
        <aside
          v-if="activePanelName === 'archive' && !flowMode && !focusMode"
          key="archive"
          class="tool-panel w-full md:w-[320px] md:max-w-[95vw] bg-bg-secondary border-l border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
        >
          <slot name="archive"></slot>
        </aside>
        <aside
          v-else-if="activePanelName === 'research' && !flowMode && !focusMode"
          key="research"
          class="tool-panel w-full md:w-[360px] md:max-w-[95vw] bg-bg-secondary border-l border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
        >
          <slot name="research"></slot>
        </aside>
        <!-- /panel-right -->
      </div>
    </div>

    <ProjectSettingsModal
      :show="showProjectSettings"
      @close="showProjectSettings = false"
      @open-ai-settings="emit('open-settings')"
    />
    <BranchManagerModal :show="showBranchManager" @close="showBranchManager = false" />

    <CommandPalette
      v-model:open="showCommandPalette"
      :actions="paletteActions"
      @navigate="handleSidebarNav"
      @action="runPaletteAction"
    />
  </div>
</template>

<style scoped>
/* Adaptive tool panels (M-4.1): on phones a panel overlays the editor full-screen
   instead of squeezing it in a flex row; from md up it sits inline at its fixed
   width. `shrink-0` on the aside keeps the desktop width from collapsing. */
@media (max-width: 767px) {
  .tool-panel {
    position: absolute;
    inset: 0;
    z-index: 30;
    width: 100% !important;
    max-width: 100% !important;
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.5);
  }
}

/* Skip-to-content link: off-screen until keyboard-focused, then pinned top-left. */
.skip-to-content {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 100;
  transform: translateY(-120%);
  padding: 0.5rem 1rem;
  margin: 0.5rem;
  border-radius: 8px;
  background: var(--vers-accent-primary);
  color: var(--vers-text-on-accent);
  font-family: var(--vers-font-ui, inherit);
  font-size: 0.8125rem;
  font-weight: 600;
  text-decoration: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  transition: transform 0.15s ease;
}
.skip-to-content:focus {
  transform: translateY(0);
  outline: 2px solid var(--vers-text-on-accent);
  outline-offset: 2px;
}
</style>
