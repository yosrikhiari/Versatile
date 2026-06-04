<script setup>
import { ref, computed, onMounted } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { usePolishStore } from '../../stores/polishStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { getAllProjects } from '../../services/dbService'
import ModeButton from './ModeButton.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import GoalProgressBar from '../shared/GoalProgressBar.vue'
import ProjectSettingsModal from './ProjectSettingsModal.vue'
import RecapBanner from './RecapBanner.vue'
import ContextStatusIndicator from './ContextStatusIndicator.vue'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { useLocalStorage } from '../../composables/useLocalStorage'

const projectStore = useProjectStore()
const polishStore = usePolishStore()
const storyBibleStore = useStoryBibleStore()
const activePanelName = ref(null)
const focusMode = ref(false)
const flowMode = ref(false)
const showProjectSettings = ref(false)
const showProjectDropdown = ref(false)
const projects = ref([])
const isCreatingProject = ref(false)
const newProjectName = ref('')

const showCoreLoop = ref(true)
const coreLoopSeen = useLocalStorage(STORAGE_KEYS.CORE_LOOP_SEEN, { write: false, analyze: false, build: false })

const emit = defineEmits(['start-flow', 'end-flow', 'export', 'import', 'export-pdf', 'open-settings', 'complete-onboarding', 'create-project'])

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
  projects.value = await getAllProjects()
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

function toggleStoryBible() {
  if (activePanelName.value !== 'story-bible') {
    activePanelName.value = 'story-bible'
    markCoreLoop('build')
  } else {
    activePanelName.value = null
  }
}

function toggleRevise() {
  activePanelName.value = activePanelName.value === 'revise' ? null : 'revise'
}

function toggleCanvas() {
  activePanelName.value = activePanelName.value === 'canvas' ? null : 'canvas'
}

function toggleOutline() {
  activePanelName.value = activePanelName.value === 'outline' ? null : 'outline'
}

function toggleChapters() {
  activePanelName.value = activePanelName.value === 'chapters' ? null : 'chapters'
}

function toggleNetwork() {
  activePanelName.value = activePanelName.value === 'network' ? null : 'network'
}

function toggleTimeline() {
  activePanelName.value = activePanelName.value === 'timeline' ? null : 'timeline'
}

function toggleArchive() {
  activePanelName.value = activePanelName.value === 'archive' ? null : 'archive'
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

function exitFlow() {
  if (flowMode.value) {
    emit('end-flow')
    flowMode.value = false
  }
}

function activateFlow() {
  markCoreLoop('write')
  closeAllPanels()
}

onMounted(async () => {
  await loadProjects()
})
</script>

<template>
  <div class="h-full flex flex-col">
    <header class="h-14 glass flex items-center justify-between px-4 shrink-0 z-10 border-b border-border-subtle/60">
      <div class="flex items-center">
        <h1 class="text-xl font-semibold text-accent">Versatile</h1>
        <nav v-if="showCoreLoop && !flowMode" class="ml-6 flex items-center gap-3 text-xs text-text-hint/50 tracking-[0.08em] uppercase">
          <button class="hover:text-accent transition-all duration-150 btn-ghost" @click="activateFlow(); flowMode = true">Write</button>
          <span class="text-text-hint/30">·</span>
          <button class="hover:text-accent transition-all duration-150 btn-ghost" @click="togglePolish">Analyze</button>
          <span class="text-text-hint/30">·</span>
          <button class="hover:text-accent transition-all duration-150 btn-ghost" @click="toggleStoryBible">Build</button>
        </nav>
      </div>

      <div class="flex items-center gap-2">
        <ModeButton 
          :label="projectStore.terminology.generatorLabel" 
          :active="activePanelName === 'story-generator'" 
          shortcut="1"
          @click="toggleStoryGenerator" 
        />
        <ModeButton 
          label="Flow" 
          :active="flowMode" 
          :is-running="flowMode"
          shortcut="f"
          @click="toggleFlow" 
        />
        <ModeButton 
          label="Polish" 
          :active="activePanelName === 'polish'" 
          shortcut="2"
          @click="togglePolish" 
        />
        <ModeButton 
          :label="projectStore.terminology.bible" 
          :active="activePanelName === 'story-bible'" 
          shortcut="3"
          @click="toggleStoryBible" 
        />
        <ModeButton 
          label="Canvas" 
          :active="activePanelName === 'canvas'" 
          shortcut="5"
          @click="toggleCanvas" 
        />
        <ModeButton 
          label="Outline" 
          :active="activePanelName === 'outline'" 
          shortcut="6"
          @click="toggleOutline" 
        />
        <ModeButton 
          :label="projectStore.terminology.sections" 
          :active="activePanelName === 'chapters'" 
          shortcut="7"
          @click="toggleChapters" 
        />
        <button
          v-if="projectStore.activeWorkspaceType === 'creative'"
          :class="[
            'p-2 rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent btn-elevated',
            activePanelName === 'network'
              ? 'bg-accent text-bg-primary shadow-warm-sm' 
              : 'bg-bg-tertiary text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          ]"
          title="Network (8)"
          @click="toggleNetwork"
        >
          <BaseIcon name="network" :size="18" />
        </button>
        <button 
          v-if="projectStore.activeWorkspaceType === 'creative'"
          :class="[
            'p-2 rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent btn-elevated',
            activePanelName === 'timeline'
              ? 'bg-accent text-bg-primary shadow-warm-sm' 
              : 'bg-bg-tertiary text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          ]"
          title="Timeline (t)"
          @click="toggleTimeline"
        >
          <BaseIcon name="clock" :size="18" />
        </button>
        <button
          :class="[
            'p-2 rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent btn-elevated',
            activePanelName === 'archive'
              ? 'bg-accent text-bg-primary shadow-warm-sm'
              : 'bg-bg-tertiary text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          ]"
          title="Archive"
          @click="toggleArchive"
        >
          <BaseIcon name="archive" :size="18" />
        </button>
      </div>

      <div class="flex items-center gap-3 text-sm text-text-secondary">
        <ContextStatusIndicator />
        <button class="hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded-lg p-1.5 btn-ghost transition-all duration-150" title="Export project (Ctrl+S)" @click="emit('export')" @keydown.enter="emit('export')">
          <BaseIcon name="upload" :size="18" />
        </button>
        <button class="hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded-lg p-1.5 btn-ghost transition-all duration-150" title="Export to PDF" @click="emit('export-pdf')">
          <BaseIcon name="file-text" :size="18" />
        </button>
        <button class="hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded-lg p-1.5 btn-ghost transition-all duration-150" title="Import project (Ctrl+I)" @click="emit('import')" @keydown.enter="emit('import')">
          <BaseIcon name="download" :size="18" />
        </button>
        <div class="flex items-center gap-2">
          <div class="relative">
            <button 
              v-if="projectName" 
              class="hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded-lg px-2 py-1 text-sm flex items-center gap-1.5 transition-all duration-150 btn-ghost"
              title="Switch project"
              @click="showProjectDropdown = !showProjectDropdown"
            >
              {{ projectName }}
              <BaseIcon name="chevron-down" :size="14" class="opacity-60" />
            </button>
            <div 
              v-if="showProjectDropdown"
              class="absolute right-0 top-full mt-1 glass-panel rounded-lg shadow-warm-md py-1 z-50 min-w-[220px] animate-scale-in"
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
                  project.id === projectStore.currentProjectId ? 'text-accent font-medium' : 'text-text-secondary'
                ]"
                @click="switchProject(project.id)"
              >
                {{ project.name }}
              </button>
              <hr class="my-1 border-border-subtle/30 mx-2" />
              <button 
                class="w-full text-left px-3 py-2 text-sm text-text-hint hover:bg-accent-glass flex items-center gap-2 transition-colors duration-150"
                @click="showProjectDropdown = false; showProjectSettings = true"
              >
                <BaseIcon name="settings" :size="14" />
                Project Settings
              </button>
            </div>
          </div>
        </div>
        <span v-if="projectStore.lastSaved" class="text-[10px] text-text-hint/60 flex items-center gap-1">
          <BaseIcon name="check" :size="10" class="text-success/70" />
          Saved
        </span>
        <span 
          v-if="projectStore.currentStreak > 0"
          class="text-[10px] text-orange-400/80 flex items-center gap-1 cursor-help group"
          :title="`${projectStore.currentStreak} day streak — keep it up!`"
        >
          <BaseIcon name="flame" :size="14" class="text-orange-400" />
          <span>{{ projectStore.currentStreak }}</span>
        </span>
        <GoalProgressBar 
          :current-words="projectStore.dailyWordCount" 
          :goal-words="projectStore.dailyGoal"
          @open-settings="showProjectSettings = true"
        />
        <span class="tabular-nums font-ui text-text-hint/70">{{ wordCount.toLocaleString() }} words</span>
      </div>
    </header>

    <RecapBanner />

    <div class="flex-1 flex overflow-hidden">
      <aside 
        v-if="activePanelName === 'story-generator' && !flowMode" 
        class="w-[500px] bg-bg-secondary border-r border-border-subtle overflow-y-auto shrink-0 transition-all duration-200 panel-enter-active scrollbar-thin"
      >
        <slot name="story-generator"></slot>
      </aside>

      <aside 
        v-if="activePanelName === 'story-bible' && !flowMode" 
        class="w-[600px] bg-bg-secondary border-r border-border-subtle overflow-y-auto shrink-0 transition-all duration-200 panel-enter-active scrollbar-thin"
      >
        <slot name="story-bible"></slot>
      </aside>

      <aside 
        v-if="activePanelName === 'canvas' && !flowMode" 
        class="w-[400px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0 transition-all duration-200 panel-enter-active"
      >
        <slot name="canvas"></slot>
      </aside>

      <aside 
        v-if="activePanelName === 'outline' && !flowMode" 
        class="w-[350px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0 transition-all duration-200 panel-enter-active"
      >
        <slot name="outline"></slot>
      </aside>

      <aside 
        v-if="activePanelName === 'chapters' && !flowMode" 
        class="w-[320px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0 transition-all duration-200 panel-enter-active"
      >
        <slot name="chapters"></slot>
      </aside>

      <aside 
        v-if="activePanelName === 'network' && !flowMode" 
        class="w-[900px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0 transition-all duration-200 panel-enter-active"
      >
        <slot name="network"></slot>
      </aside>

      <aside 
        v-if="activePanelName === 'timeline' && !flowMode" 
        class="w-[600px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0 transition-all duration-200 panel-enter-active"
      >
        <slot name="timeline"></slot>
      </aside>

      <main class="flex-1 flex flex-col overflow-hidden">
        <div class="flex-1 overflow-hidden">
          <slot name="editor"></slot>
        </div>
        <div 
          v-if="activePanelName === 'polish' && !flowMode" 
          class="h-[320px] bg-bg-secondary border-t border-border-subtle overflow-hidden transition-all duration-200"
        >
          <slot name="polish"></slot>
        </div>
        <div 
          v-if="activePanelName === 'revise' && !flowMode" 
          class="flex-1 overflow-hidden transition-all duration-200"
        >
          <slot name="revise"></slot>
        </div>
      </main>

      <aside 
        v-if="activePanelName === 'archive' && !flowMode" 
        class="w-[320px] bg-bg-secondary border-l border-border-subtle overflow-y-auto shrink-0 transition-all duration-200 panel-enter-active scrollbar-thin"
      >
        <slot name="archive"></slot>
      </aside>
    </div>

    <ProjectSettingsModal
      :show="showProjectSettings"
      @close="showProjectSettings = false"
    />
  </div>
</template>
