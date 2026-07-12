<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '../../stores/projectStore'
import { getAllProjects } from '../../services/dbService'
import SidebarNav from './SidebarNav.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import GoalProgressBar from '../shared/GoalProgressBar.vue'
import ProjectSettingsModal from './ProjectSettingsModal.vue'
import RecapBanner from './RecapBanner.vue'
import ContextStatusIndicator from './ContextStatusIndicator.vue'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { useLocalStorage } from '../../composables/useLocalStorage'
import { useAuthStore } from '../../stores/authStore'

const projectStore = useProjectStore()

const activePanelName = ref(null)
const flowMode = ref(false)
const sidebarOpen = ref(false)
const showProjectSettings = ref(false)
const showProjectDropdown = ref(false)
const projects = ref([])

const showRevise = ref(false)
const showCoreLoop = ref(true)
const coreLoopSeen = useLocalStorage(STORAGE_KEYS.CORE_LOOP_SEEN, {
  write: false,
  analyze: false,
  build: false
})

defineProps({
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
  'open-settings',
  'open-auth',
  'complete-onboarding',
  'create-project'
])

const authStore = useAuthStore()
const router = useRouter()

const wordCount = computed(() => projectStore.wordCount)
const projectName = computed(() => projectStore.currentProjectName)

onMounted(() => {
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
  await projectStore.loadProject(projectId)
  await loadProjects()
}

function handleCreateProjectClick() {
  showProjectDropdown.value = false
  emit('create-project')
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

function toggleBenchmarks() {
  activePanelName.value = activePanelName.value === 'benchmarks' ? null : 'benchmarks'
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

function toggleSpark() {
  toggleStoryGenerator()
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
    benchmarks: toggleBenchmarks,
    'voice-lab': toggleVoiceLab,
    'story-shape': toggleStoryShape,
    consistency: toggleConsistency,
    'beta-reader': toggleBetaReader
  }
  map[name]?.()
}

defineExpose({
  toggleSpark,
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
  toggleBenchmarks
})

onMounted(async () => {
  await loadProjects()
})
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <header
      class="h-12 glass flex items-center justify-between px-3 shrink-0 z-10 border-b border-border-subtle/60"
    >
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
          style="background: rgba(var(--vers-accent-primary-rgb), 0.12)"
          @click="toggleFlow"
        >
          <BaseIcon name="play" :size="10" />
          Flow
        </span>

        <div class="relative">
          <button
            class="hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded-lg px-2 py-1 text-sm flex items-center gap-1.5 transition-all duration-150 btn-ghost"
            title="Switch project"
            @click="showProjectDropdown = !showProjectDropdown"
          >
            {{ projectName || 'Untitled Project' }}
            <BaseIcon name="chevron-down" :size="14" class="opacity-60" />
          </button>
          <Transition name="spring-scale">
            <div
              v-if="showProjectDropdown"
              class="absolute left-0 top-full mt-1 liquid-glass rounded-lg shadow-warm-md py-1 z-50 min-w-[220px]"
              @click.stop
            >
              <button
                class="w-full text-left px-3 py-2 text-sm text-accent hover:bg-accent-glass flex items-center gap-2 transition-colors duration-150"
                @click="handleCreateProjectClick"
              >
                <BaseIcon name="plus" :size="14" />
                Create new project
              </button>
              <button
                v-for="project in projects"
                :key="project.id"
                :class="[
                  'w-full text-left px-3 py-2 text-sm hover:bg-accent-glass transition-colors duration-150',
                  project.id === projectStore.currentProjectId
                    ? 'text-accent font-medium'
                    : 'text-text-secondary'
                ]"
                @click="switchProject(project.id)"
              >
                {{ project.name }}
              </button>
              <hr class="my-1 border-border-subtle/30 mx-2" />
              <!-- prettier-ignore -->
              <button
                class="w-full text-left px-3 py-2 text-sm text-text-hint hover:bg-accent-glass flex items-center gap-2 transition-colors duration-150"
                @click="closeProjectDropdownAndOpen('settings')"
              >
                <BaseIcon name="settings" :size="14" />
                Project Settings
              </button>
            </div>
          </Transition>
        </div>

        <div class="hidden sm:flex items-center gap-3 text-2xs text-text-hint/70">
          <span class="tabular-nums font-ui">{{ wordCount.toLocaleString() }} words</span>
          <span
            v-if="projectStore.currentStreak > 0"
            class="text-orange-400/80 flex items-center gap-1"
          >
            <BaseIcon name="flame" :size="11" class="text-orange-400" />
            {{ projectStore.currentStreak }}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-1.5">
        <ContextStatusIndicator />
        <span
          v-if="projectStore.lastSaved"
          class="text-2xs text-text-hint/60 flex items-center gap-1 mr-1"
        >
          <BaseIcon name="check" :size="9" class="text-success/70" />
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

      <div class="flex-1 flex overflow-hidden">
        <Transition name="panel-left" mode="out-in">
          <aside
            v-if="activePanelName === 'story-generator' && !flowMode && !focusMode"
            key="story-generator"
            class="w-[500px] max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
          >
            <slot name="story-generator"></slot>
          </aside>
          <aside
            v-else-if="activePanelName === 'story-bible' && !flowMode && !focusMode"
            key="story-bible"
            class="w-[600px] max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0"
          >
            <slot name="story-bible"></slot>
          </aside>
          <aside
            v-else-if="activePanelName === 'canvas' && !flowMode && !focusMode"
            key="canvas"
            class="w-[400px] max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0"
          >
            <slot name="canvas"></slot>
          </aside>
          <aside
            v-else-if="activePanelName === 'outline' && !flowMode && !focusMode"
            key="outline"
            class="w-[350px] max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0"
          >
            <slot name="outline"></slot>
          </aside>
          <aside
            v-else-if="activePanelName === 'sections' && !flowMode && !focusMode"
            key="sections"
            class="w-[320px] max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0"
          >
            <slot name="sections"></slot>
          </aside>
          <aside
            v-else-if="activePanelName === 'network' && !flowMode && !focusMode"
            key="network"
            class="w-[900px] max-w-[95vw] xl:max-w-[900px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0"
          >
            <slot name="network"></slot>
          </aside>
          <aside
            v-else-if="activePanelName === 'timeline' && !flowMode && !focusMode"
            key="timeline"
            class="w-[600px] max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0"
          >
            <slot name="timeline"></slot>
          </aside>
          <aside
            v-else-if="activePanelName === 'voice-lab' && !flowMode && !focusMode"
            key="voice-lab"
            class="w-[420px] max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
          >
            <slot name="voice-lab"></slot>
          </aside>
          <aside
            v-else-if="activePanelName === 'story-shape' && !flowMode && !focusMode"
            key="story-shape"
            class="w-[380px] max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
          >
            <slot name="story-shape"></slot>
          </aside>
          <aside
            v-else-if="activePanelName === 'consistency' && !flowMode && !focusMode"
            key="consistency"
            class="w-[380px] max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
          >
            <slot name="consistency"></slot>
          </aside>
          <aside
            v-else-if="activePanelName === 'beta-reader' && !flowMode && !focusMode"
            key="beta-reader"
            class="w-[380px] max-w-[95vw] bg-bg-secondary border-r border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
          >
            <slot name="beta-reader"></slot>
          </aside>
        </Transition>

        <main class="flex-1 flex flex-col overflow-hidden">
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

        <Transition name="panel-right" mode="out-in">
          <aside
            v-if="activePanelName === 'archive' && !flowMode && !focusMode"
            key="archive"
            class="w-[320px] max-w-[95vw] bg-bg-secondary border-l border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
          >
            <slot name="archive"></slot>
          </aside>
          <aside
            v-else-if="activePanelName === 'research' && !flowMode && !focusMode"
            key="research"
            class="w-[360px] max-w-[95vw] bg-bg-secondary border-l border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
          >
            <slot name="research"></slot>
          </aside>
          <aside
            v-else-if="activePanelName === 'benchmarks' && !flowMode && !focusMode"
            key="benchmarks"
            class="w-[420px] max-w-[95vw] bg-bg-secondary border-l border-border-subtle overflow-y-auto shrink-0 scrollbar-thin"
          >
            <slot name="benchmarks"></slot>
          </aside>
        </Transition>
      </div>
    </div>

    <ProjectSettingsModal :show="showProjectSettings" @close="showProjectSettings = false" />
  </div>
</template>
