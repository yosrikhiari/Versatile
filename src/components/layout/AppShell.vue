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
    <header class="h-14 bg-bg-secondary border-b border-border-subtle flex items-center justify-between px-4 shrink-0">
      <div class="flex items-center">
        <h1 class="text-xl font-semibold text-accent">Versatile</h1>
        <nav v-if="showCoreLoop && !flowMode" class="ml-6 flex items-center gap-3 text-xs text-text-hint opacity-40 tracking-wide">
          <button @click="activateFlow(); flowMode = true" class="hover:text-text-primary transition-colors">Write</button>
          <span>·</span>
          <button @click="togglePolish" class="hover:text-text-primary transition-colors">Analyze</button>
          <span>·</span>
          <button @click="toggleStoryBible" class="hover:text-text-primary transition-colors">Build</button>
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
          @click="toggleNetwork"
          :class="[
            'p-2 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent',
            networkOpen 
              ? 'bg-accent text-bg-primary shadow-md' 
              : 'bg-bg-tertiary text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          ]"
          title="Network (8)"
        >
          <BaseIcon name="network" :size="18" />
        </button>
        <button 
          @click="toggleTimeline"
          :class="[
            'p-2 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent',
            timelineOpen 
              ? 'bg-accent text-bg-primary shadow-md' 
              : 'bg-bg-tertiary text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          ]"
          title="Timeline (t)"
        >
          <BaseIcon name="clock" :size="18" />
        </button>
      </div>

      <div class="flex items-center gap-4 text-sm text-text-secondary">
        <button @click="emit('export')" @keydown.enter="emit('export')" class="hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded p-1" title="Export project (Ctrl+S)">
          <BaseIcon name="upload" :size="18" />
        </button>
        <button @click="emit('export-pdf')" class="hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded p-1" title="Export to PDF">
          <BaseIcon name="file-text" :size="18" />
        </button>
        <button @click="emit('import')" @keydown.enter="emit('import')" class="hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded p-1" title="Import project (Ctrl+I)">
          <BaseIcon name="download" :size="18" />
        </button>
        <div class="flex items-center gap-2">
          <div class="relative">
            <button 
              v-if="projectName" 
              @click="showProjectDropdown = !showProjectDropdown"
              class="hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded p-1 flex items-center gap-1 transition-colors"
              title="Switch project"
            >
              {{ projectName }}
              <BaseIcon name="chevron-down" :size="14" />
            </button>
            <div 
              v-if="showProjectDropdown"
              class="absolute right-0 top-full mt-1 bg-bg-secondary border border-border-subtle rounded-md shadow-lg py-1 z-50 min-w-[200px]"
              @click.stop
            >
              <div v-if="isCreatingProject" class="px-3 py-2 border-b border-border-subtle">
                <input
                  v-model="newProjectName"
                  @keydown.enter="createProject"
                  @keydown.escape="isCreatingProject = false"
                  placeholder="Project name..."
                  class="w-full px-2 py-1.5 text-sm bg-bg-tertiary border border-border-subtle rounded text-text-primary placeholder:text-text-hint focus:outline-none focus:ring-1 focus:ring-accent/50"
                  autofocus
                />
              </div>
              <button
                v-else
                @click="isCreatingProject = true"
                class="w-full text-left px-3 py-2 text-sm text-accent hover:bg-surface-hover flex items-center gap-2"
              >
                <BaseIcon name="plus" :size="14" />
                Create new project
              </button>
              <button
                v-for="project in projects"
                :key="project.id"
                @click="switchProject(project.id)"
                :class="[
                  'w-full text-left px-3 py-2 text-sm hover:bg-surface-hover',
                  project.id === projectStore.currentProjectId ? 'text-accent font-medium' : 'text-text-secondary'
                ]"
              >
                {{ project.name }}
              </button>
              <hr class="my-1 border-border-subtle" />
              <button 
                @click="showProjectDropdown = false; showProjectSettings = true"
                class="w-full text-left px-3 py-2 text-sm text-text-hint hover:bg-surface-hover flex items-center gap-2"
              >
                <BaseIcon name="settings" :size="14" />
                Project Settings
              </button>
            </div>
          </div>
        </div>
        <span v-if="projectStore.lastSaved" class="text-[10px] text-text-muted flex items-center gap-1">
          <BaseIcon name="check" :size="10" />
          Saved
        </span>
        <span 
          v-if="projectStore.currentStreak > 0"
          class="text-[10px] text-orange-400 flex items-center gap-1 cursor-help group"
          :title="`${projectStore.currentStreak} day streak — keep it up!`"
        >
          <span>🔥</span>
          <span>{{ projectStore.currentStreak }}</span>
        </span>
        <GoalProgressBar 
          :current-words="projectStore.dailyWordCount" 
          :goal-words="projectStore.dailyGoal"
          @open-settings="showProjectSettings = true"
        />
        <span>{{ wordCount.toLocaleString() }} words</span>
      </div>
    </header>

    <RecapBanner />

    <div class="flex-1 flex overflow-hidden">
      <aside 
        v-if="storyBibleOpen && !flowMode" 
        class="w-[600px] bg-bg-secondary border-r border-border-subtle overflow-y-auto shrink-0 transition-all duration-300"
      >
        <slot name="story-bible"></slot>
      </aside>

      <aside 
        v-if="canvasOpen && !flowMode" 
        class="w-[400px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0 transition-all duration-300"
      >
        <slot name="canvas"></slot>
      </aside>

      <aside 
        v-if="outlineOpen && !flowMode" 
        class="w-[350px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0 transition-all duration-300"
      >
        <slot name="outline"></slot>
      </aside>

      <aside 
        v-if="chaptersOpen && !flowMode" 
        class="w-[320px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0 transition-all duration-300"
      >
        <slot name="chapters"></slot>
      </aside>

      <aside 
        v-if="networkOpen && !flowMode" 
        class="w-[900px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0 transition-all duration-300"
      >
        <slot name="network"></slot>
      </aside>

      <aside 
        v-if="timelineOpen && !flowMode" 
        class="w-[600px] bg-bg-secondary border-r border-border-subtle overflow-hidden shrink-0 transition-all duration-300"
      >
        <slot name="timeline"></slot>
      </aside>

      <main class="flex-1 flex flex-col overflow-hidden">
        <div class="flex-1 overflow-hidden">
          <slot name="editor"></slot>
        </div>
        <div 
          v-if="polishOpen && !flowMode" 
          class="h-[320px] bg-bg-secondary border-t border-border-subtle overflow-hidden transition-all duration-300"
        >
          <slot name="polish"></slot>
        </div>
        <div 
          v-if="reviseOpen && !flowMode" 
          class="flex-1 overflow-hidden transition-all duration-300"
        >
          <slot name="revise"></slot>
        </div>
      </main>

      <aside 
        v-if="sparkOpen && !flowMode" 
        class="w-[320px] bg-bg-secondary border-l border-border-subtle overflow-y-auto shrink-0 transition-all duration-300"
      >
        <slot name="spark"></slot>
      </aside>
    </div>

    <ProjectSettingsModal
      :show="showProjectSettings"
      @close="showProjectSettings = false"
    />
  </div>
</template>
