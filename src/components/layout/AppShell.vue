<script setup>
import { ref, computed, onMounted } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useSparkStore } from '../../stores/sparkStore'
import { usePolishStore } from '../../stores/polishStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { getAllProjects } from '../../services/dbService'
import ModeButton from './ModeButton.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import GoalProgressBar from '../shared/GoalProgressBar.vue'
import ProjectSettingsModal from './ProjectSettingsModal.vue'
import RecapBanner from './RecapBanner.vue'
import ContextStatusIndicator from './ContextStatusIndicator.vue'

const projectStore = useProjectStore()
const sparkStore = useSparkStore()
const polishStore = usePolishStore()
const storyBibleStore = useStoryBibleStore()

const sparkOpen = ref(false)
const polishOpen = ref(false)
const storyBibleOpen = ref(false)
const reviseOpen = ref(false)
const canvasOpen = ref(false)
const outlineOpen = ref(false)
const chaptersOpen = ref(false)
const networkOpen = ref(false)
const timelineOpen = ref(false)
const archiveOpen = ref(false)
const focusMode = ref(false)
const flowMode = ref(false)
const showProjectSettings = ref(false)
const showProjectDropdown = ref(false)
const projects = ref([])
const isCreatingProject = ref(false)
const newProjectName = ref('')

const showCoreLoop = ref(true)
const coreLoopSeen = ref({ write: false, analyze: false, build: false })

const emit = defineEmits(['start-flow', 'end-flow', 'export', 'import', 'export-pdf', 'open-settings', 'complete-onboarding'])

const wordCount = computed(() => projectStore.wordCount)
const projectName = computed(() => projectStore.currentProjectName)

onMounted(() => {
  const saved = localStorage.getItem('versatile_core_loop_seen')
  if (saved) {
    coreLoopSeen.value = JSON.parse(saved)
    if (coreLoopSeen.value.write && coreLoopSeen.value.analyze && coreLoopSeen.value.build) {
      showCoreLoop.value = false
    }
  }
})

function markCoreLoop(mode) {
  if (!coreLoopSeen.value[mode]) {
    coreLoopSeen.value[mode] = true
    localStorage.setItem('versatile_core_loop_seen', JSON.stringify(coreLoopSeen.value))
    
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

async function createProject() {
  if (!newProjectName.value.trim()) return
  
  const newId = await projectStore.createNewProject(newProjectName.value.trim())
  newProjectName.value = ''
  isCreatingProject.value = false
  await loadProjects()
  await projectStore.loadProject(newId)
}

function closeAllPanels() {
  sparkOpen.value = false
  polishOpen.value = false
  storyBibleOpen.value = false
  reviseOpen.value = false
  canvasOpen.value = false
  outlineOpen.value = false
  chaptersOpen.value = false
  networkOpen.value = false
  archiveOpen.value = false
}

function toggleSpark() {
  if (sparkOpen.value) {
    sparkOpen.value = false
  } else {
    closeAllPanels()
    sparkOpen.value = true
  }
}

function togglePolish() {
  if (polishOpen.value) {
    polishOpen.value = false
  } else {
    closeAllPanels()
    polishOpen.value = true
    markCoreLoop('analyze')
  }
}

function toggleStoryBible() {
  if (storyBibleOpen.value) {
    storyBibleOpen.value = false
  } else {
    closeAllPanels()
    storyBibleOpen.value = true
    markCoreLoop('build')
  }
}

function toggleRevise() {
  if (reviseOpen.value) {
    reviseOpen.value = false
  } else {
    closeAllPanels()
    reviseOpen.value = true
  }
}

function toggleCanvas() {
  if (canvasOpen.value) {
    canvasOpen.value = false
  } else {
    closeAllPanels()
    canvasOpen.value = true
  }
}

function toggleOutline() {
  if (outlineOpen.value) {
    outlineOpen.value = false
  } else {
    closeAllPanels()
    outlineOpen.value = true
  }
}

function toggleChapters() {
  if (chaptersOpen.value) {
    chaptersOpen.value = false
  } else {
    closeAllPanels()
    chaptersOpen.value = true
  }
}

function toggleNetwork() {
  if (networkOpen.value) {
    networkOpen.value = false
  } else {
    closeAllPanels()
    networkOpen.value = true
  }
}

function toggleTimeline() {
  if (timelineOpen.value) {
    timelineOpen.value = false
  } else {
    closeAllPanels()
    timelineOpen.value = true
  }
}

function toggleArchive() {
  if (archiveOpen.value) {
    archiveOpen.value = false
  } else {
    closeAllPanels()
    archiveOpen.value = true
  }
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
    <header class="h-14 glass flex items-center justify-between px-4 shrink-0 z-10">
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
          label="Spark" 
          :active="sparkOpen" 
          shortcut="1"
          @click="toggleSpark" 
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
          :active="polishOpen" 
          shortcut="2"
          @click="togglePolish" 
        />
        <ModeButton 
          label="Story Bible" 
          :active="storyBibleOpen" 
          shortcut="3"
          @click="toggleStoryBible" 
        />
        <ModeButton 
          label="Canvas" 
          :active="canvasOpen" 
          shortcut="5"
          @click="toggleCanvas" 
        />
        <ModeButton 
          label="Outline" 
          :active="outlineOpen" 
          shortcut="6"
          @click="toggleOutline" 
        />
        <ModeButton 
          label="Chapters" 
          :active="chaptersOpen" 
          shortcut="7"
          @click="toggleChapters" 
        />
        <button
          :class="[
            'p-2 rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent btn-elevated',
            networkOpen 
              ? 'bg-accent text-bg-primary shadow-warm-sm' 
              : 'bg-bg-tertiary text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          ]"
          title="Network (8)"
          @click="toggleNetwork"
        >
          <BaseIcon name="network" :size="18" />
        </button>
        <button 
          :class="[
            'p-2 rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent btn-elevated',
            timelineOpen 
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
            archiveOpen
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
              <div v-if="isCreatingProject" class="px-3 py-2 border-b border-border-subtle/50">
                <input
                  v-model="newProjectName"
                  placeholder="Project name..."
                  class="w-full px-2.5 py-1.5 text-sm bg-bg-tertiary/50 border border-border-subtle rounded-lg text-text-primary placeholder:text-text-hint/60 focus:outline-none focus:ring-1 focus:ring-accent/50 transition-all duration-150"
                  autofocus
                  @keydown.enter="createProject"
                  @keydown.escape="isCreatingProject = false"
                />
              </div>
              <button
                v-else
                class="w-full text-left px-3 py-2 text-sm text-accent hover:bg-accent-glass flex items-center gap-2 transition-colors duration-150"
                @click="isCreatingProject = true"
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
        v-if="storyBibleOpen && !flowMode" 
        class="w-[600px] bg-bg-secondary border-r border-border-subtle overflow-y-auto shrink-0 transition-all duration-200 panel-enter-active scrollbar-thin"
      >
        <slot name="story-bible"></slot>
      </aside>

      <aside 
        v-if="canvasOpen && !flowMode" 
        class="w-[400px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0 transition-all duration-200 panel-enter-active"
      >
        <slot name="canvas"></slot>
      </aside>

      <aside 
        v-if="outlineOpen && !flowMode" 
        class="w-[350px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0 transition-all duration-200 panel-enter-active"
      >
        <slot name="outline"></slot>
      </aside>

      <aside 
        v-if="chaptersOpen && !flowMode" 
        class="w-[320px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0 transition-all duration-200 panel-enter-active"
      >
        <slot name="chapters"></slot>
      </aside>

      <aside 
        v-if="networkOpen && !flowMode" 
        class="w-[900px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0 transition-all duration-200 panel-enter-active"
      >
        <slot name="network"></slot>
      </aside>

      <aside 
        v-if="timelineOpen && !flowMode" 
        class="w-[600px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0 transition-all duration-200 panel-enter-active"
      >
        <slot name="timeline"></slot>
      </aside>

      <main class="flex-1 flex flex-col overflow-hidden">
        <div class="flex-1 overflow-hidden">
          <slot name="editor"></slot>
        </div>
        <div 
          v-if="polishOpen && !flowMode" 
          class="h-[320px] bg-bg-secondary border-t border-border-subtle overflow-hidden transition-all duration-200"
        >
          <slot name="polish"></slot>
        </div>
        <div 
          v-if="reviseOpen && !flowMode" 
          class="flex-1 overflow-hidden transition-all duration-200"
        >
          <slot name="revise"></slot>
        </div>
      </main>

      <aside 
        v-if="sparkOpen && !flowMode" 
        class="w-[320px] bg-bg-secondary border-l border-border-subtle overflow-y-auto shrink-0 transition-all duration-200 panel-enter-active scrollbar-thin"
      >
        <slot name="spark"></slot>
      </aside>

      <aside 
        v-if="archiveOpen && !flowMode" 
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
