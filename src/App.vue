<script setup>
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { useProjectStore } from './stores/projectStore'
import { useSparkStore } from './stores/sparkStore'
import { usePolishStore } from './stores/polishStore'
import { useStoryBibleStore } from './stores/storyBibleStore'
import { useManuscriptStore } from './stores/manuscriptStore'
import { useFlowTimer } from './composables/useFlowTimer'
import { checkOllamaConnection } from './services/ollamaService'
import { OLLAMA_MODEL } from './config/ollama'
import { exportProject, importProject } from './services/dbService'
import { exportManuscriptToPDF, exportToEpub } from './services/exportService'
import AppShell from './components/layout/AppShell.vue'
import SettingsModal from './components/layout/SettingsModal.vue'
import WelcomeOnboarding from './components/layout/WelcomeOnboarding.vue'
import Toast from './components/layout/Toast.vue'
import FlowEditor from './components/flow/FlowEditor.vue'
import SparkPanel from './components/spark/SparkPanel.vue'
import PolishDrawer from './components/polish/PolishDrawer.vue'
import StoryBiblePanel from './components/storybible/StoryBiblePanel.vue'
import RevisePanel from './components/revise/RevisePanel.vue'
import BaseIcon from './components/shared/BaseIcon.vue'
import StoryCanvas from './components/manuscript/StoryCanvas.vue'
import SceneOutline from './components/manuscript/SceneOutline.vue'
import ChapterManager from './components/manuscript/ChapterManager.vue'
import StoryNetwork from './components/storybible/StoryNetwork.vue'
import TimelineView from './components/manuscript/TimelineView.vue'
import SearchOverlay from './components/manuscript/SearchOverlay.vue'

const projectStore = useProjectStore()
const sparkStore = useSparkStore()
const polishStore = usePolishStore()
const storyBibleStore = useStoryBibleStore()
const manuscriptStore = useManuscriptStore()
const timer = useFlowTimer(projectStore)

const showSettingsModal = ref(false)
const hasLoaded = ref(false)
const showImportModal = ref(false)
const importStatus = ref('')
const showShortcutsModal = ref(false)
const showOnboarding = ref(false)
const ollamaAvailable = ref(true)
const modelNotFound = ref(false)
const showModelBanner = ref(false)
const toastMessage = ref('')
const toastKey = ref(0)

function showToast(msg) {
  toastMessage.value = msg
  toastKey.value++
}

async function checkModelAvailability() {
  try {
    const response = await fetch('/ollama/api/tags')
    if (response.ok) {
      const data = await response.json()
      const modelNames = data.models?.map(m => m.name) || []
      if (!modelNames.includes(OLLAMA_MODEL)) {
        modelNotFound.value = true
        showModelBanner.value = true
      }
    }
  } catch (e) {
    // Ollama not available
  }
}

function handleKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('.ProseMirror')) {
    if (e.key === 'Escape') {
      if (showSearchOverlay.value) {
        showSearchOverlay.value = false
      } else {
        e.target.blur()
      }
    }
    return
  }

  if (e.key === '?') {
    showShortcutsModal.value = !showShortcutsModal.value
    return
  }
  
  if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    showSearchOverlay.value = true
    return
  }
  
  if (e.key === 'F' && (e.ctrlKey || e.metaKey) && (e.shiftKey)) {
    e.preventDefault()
    focusMode.value = !focusMode.value
    return
  }
  
  if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    handleExport()
    return
  }
  
  if (e.key === 'i' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    handleImportClick()
    return
  }
  
  if (e.key === '1') {
    if (appShell.value) appShell.value.toggleSpark()
    return
  }
  
  if (e.key === '2') {
    if (appShell.value) appShell.value.togglePolish()
    return
  }
  
  if (e.key === '3') {
    if (appShell.value) appShell.value.toggleStoryBible()
    return
  }
  
  if (e.key === '4') {
    if (appShell.value) appShell.value.toggleRevise()
    return
  }
  
  if (e.key === '5') {
    if (appShell.value) appShell.value.toggleCanvas()
    return
  }
  
  if (e.key === '6') {
    if (appShell.value) appShell.value.toggleOutline()
    return
  }
  
  if (e.key === '7') {
    if (appShell.value) appShell.value.toggleChapters()
    return
  }
  
  if (e.key === '8') {
    if (appShell.value) appShell.value.toggleNetwork()
    return
  }
  
  if (e.key === 't' && !e.ctrlKey && !e.metaKey) {
    if (appShell.value) appShell.value.toggleTimeline()
    return
  }
  
  if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
    if (timer.isRunning.value) {
      timer.endSession()
    } else {
      timer.startSession(20)
    }
    return
  }

  if (e.key === 'Escape' && showShortcutsModal.value) {
    showShortcutsModal.value = false
    return
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  const ollamaOk = await checkOllamaConnection()
  ollamaAvailable.value = ollamaOk
  
  if (ollamaOk) {
    await checkModelAvailability()
  }
  
  const hasProject = await projectStore.loadLastProject()
  if (!hasProject && !isOnboardingDismissed()) {
    showOnboarding.value = true
  } else {
    if (projectStore.currentProjectId) {
      await sparkStore.loadHistory(projectStore.currentProjectId)
      await polishStore.loadAnnotations(projectStore.currentProjectId)
      await polishStore.loadSnippets(projectStore.currentProjectId)
      await storyBibleStore.loadAll(projectStore.currentProjectId)
      await manuscriptStore.loadManuscript(projectStore.currentProjectId)
      sparkStore.setProjectId(projectStore.currentProjectId)
    }
  }
  hasLoaded.value = true
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

function isOnboardingDismissed() {
  return localStorage.getItem('versatile_onboarding_v2') === 'done'
}

function handleParagraphClick(text, index) {
  if (polishDrawerRef.value) {
    polishDrawerRef.value.handleParagraphClick(text, index)
  }
}

function handleStartFlow() {
  timer.startSession(20)
}

function handleEndFlow() {
  timer.endSession()
}

async function handleExport() {
  if (!projectStore.currentProjectId) return
   
  const data = await exportProject(projectStore.currentProjectId)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${projectStore.currentProjectName || 'project'}.versatile.json`
  a.click()
  URL.revokeObjectURL(url)
  showToast('Project exported')
}

async function handleExportPDF() {
  if (!projectStore.currentProjectId) return
  await exportManuscriptToPDF(projectStore.currentProjectId, projectStore.currentProjectName)
  showToast('PDF exported')
}

function handleExportEpub() {
  if (!projectStore.currentProjectId) return
  exportToEpub(projectStore.currentProjectId, projectStore.currentProjectName)
}

function handleImportClick() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.versatile'
  input.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      importStatus.value = 'Importing...'
      showImportModal.value = true
      
      const newProjectId = await importProject(data)
      await projectStore.loadProject(newProjectId)
      
      await sparkStore.loadHistory(newProjectId)
      await polishStore.loadAnnotations(newProjectId)
      await polishStore.loadSnippets(newProjectId)
      await storyBibleStore.loadAll(newProjectId)
      sparkStore.setProjectId(newProjectId)
      
      importStatus.value = 'Import complete!'
      showToast('Project imported')
      setTimeout(() => {
        showImportModal.value = false
      }, 1500)
    } catch (err) {
      importStatus.value = 'Import failed: ' + err.message
    }
  }
  input.click()
}

async function handleOnboardingComplete() {
  localStorage.setItem('versatile_onboarding_v2', 'done')
  showOnboarding.value = false
  
  if (projectStore.currentProjectId) {
    await sparkStore.loadHistory(projectStore.currentProjectId)
    await polishStore.loadAnnotations(projectStore.currentProjectId)
    await polishStore.loadSnippets(projectStore.currentProjectId)
    await storyBibleStore.loadAll(projectStore.currentProjectId)
    await manuscriptStore.loadManuscript(projectStore.currentProjectId)
    sparkStore.setProjectId(projectStore.currentProjectId)
  }
}

function handleOnboardingSkip() {
  localStorage.setItem('versatile_onboarding_v2', 'done')
  showOnboarding.value = false
}

const polishDrawerRef = ref(null)
const flowEditorRef = ref(null)
const appShell = ref(null)
const showSearchOverlay = ref(false)
const focusMode = ref(false)
</script>

<template>
  <div class="h-screen bg-manuscript">
    <div v-if="!ollamaAvailable" class="bg-amber-950/50 border-b border-amber-800/30 px-4 py-2 text-sm text-amber-200">
      Ollama is not reachable at localhost:11434. AI features are disabled. Start your Ollama container to enable them.
    </div>

    <div v-if="showModelBanner && modelNotFound" class="bg-amber-950/50 border-b border-amber-800/30 px-4 py-2 text-sm text-amber-200 flex items-center justify-between">
      <span>AI model not found. Responses may fail — check your Ollama setup in Settings.</span>
      <button class="text-amber-200 hover:text-white" @click="showModelBanner = false">
        <BaseIcon name="x" :size="16" />
      </button>
    </div>

    <AppShell
      ref="appShell"
      @start-flow="handleStartFlow"
      @end-flow="handleEndFlow"
      @export="handleExport"
      @export-pdf="handleExportPDF"
      @export-epub="handleExportEpub"
      @import="handleImportClick"
      @open-settings="showSettingsModal = true"
    >
      <template #editor>
        <FlowEditor
          ref="flowEditorRef"
          :is-desaturated="timer.isDesaturated.value"
          :is-running="timer.isRunning.value"
          :is-nudging="timer.isNudging.value"
          :remaining="timer.remaining.value"
          :session-word-count="projectStore.sessionWordCount"
          :session-goal="projectStore.sessionGoal"
          :session-progress="projectStore.sessionProgress"
          :daily-word-count="projectStore.dailyWordCount"
          :daily-goal="projectStore.dailyGoal"
          :daily-progress="projectStore.dailyProgress"
          @keystroke="timer.handleKeystroke"
          @backspace="timer.handleBackspace"
          @paragraph-click="handleParagraphClick"
          @open-settings="showSettingsModal = true"
          @dismiss-nudge="timer.dismissNudge()"
          @exit-flow="handleEndFlow"
        />
      </template>

      <template #spark>
        <SparkPanel v-if="ollamaAvailable" />
        <div v-else class="p-4 text-center text-text-secondary">
          AI features disabled — Ollama unavailable
        </div>
      </template>

      <template #polish>
        <PolishDrawer v-if="ollamaAvailable" ref="polishDrawerRef" />
        <div v-else class="p-4 text-center text-text-secondary">
          AI features disabled — Ollama unavailable
        </div>
      </template>

      <template #story-bible>
        <StoryBiblePanel />
      </template>

      <template #revise>
        <RevisePanel />
      </template>

      <template #canvas>
        <StoryCanvas />
      </template>

      <template #outline>
        <SceneOutline />
      </template>

      <template #chapters>
        <ChapterManager />
      </template>

      <template #network>
        <StoryNetwork />
      </template>

      <template #timeline>
        <TimelineView @open-chapters="appShell?.toggleChapters()" />
      </template>
    </AppShell>

    <WelcomeOnboarding 
      :show="showOnboarding && hasLoaded" 
      @complete="handleOnboardingComplete"
      @skip="handleOnboardingSkip"
    />

    <div v-if="timer.showSessionEndModal.value" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div class="bg-bg-tertiary rounded-xl shadow-xl p-8 max-w-md text-center border border-border-subtle">
        <BaseIcon name="waves" :size="48" class="mb-4 mx-auto text-accent" />
        <h2 class="text-xl font-semibold text-text-primary mb-2">Session complete</h2>
        <p class="text-text-secondary mb-6">
          You wrote {{ timer.sessionWordCountEnd.value }} words.
        </p>
        <div class="flex gap-3">
          <button
            class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent"
            @click="timer.startNewSession(20)"
          >
            Start new session
          </button>
          <button
            class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-accent"
            @click="timer.dismissModal()"
          >
            Keep writing (no timer)
          </button>
        </div>
      </div>
    </div>

    <Toast 
      v-if="timer.showBackspaceToast.value" 
      :key="'backspace'"
      message="Keep moving — fix it later" 
      @dismiss="timer.dismissBackspaceToast()" 
    />

    <div v-if="showImportModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div class="bg-bg-tertiary rounded-xl shadow-xl p-8 max-w-md text-center border border-border-subtle">
        <p class="text-text-primary">{{ importStatus }}</p>
      </div>
    </div>

    <div v-if="showShortcutsModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showShortcutsModal = false">
      <div class="bg-bg-tertiary rounded-xl shadow-xl p-6 max-w-lg w-full border border-border-subtle">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-text-primary">Keyboard Shortcuts</h2>
          <button class="text-text-secondary hover:text-text-primary text-xl focus:outline-none focus:ring-2 focus:ring-accent rounded" @click="showShortcutsModal = false">&times;</button>
        </div>
        
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <h3 class="text-sm font-medium text-accent mb-2">Writing Tools</h3>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between"><span class="text-text-secondary">Spark (AI)</span><kbd class="px-2 py-0.5 bg-bg-secondary rounded text-xs">1</kbd></div>
                <div class="flex justify-between"><span class="text-text-secondary">Polish</span><kbd class="px-2 py-0.5 bg-bg-secondary rounded text-xs">2</kbd></div>
                <div class="flex justify-between"><span class="text-text-secondary">Story Bible</span><kbd class="px-2 py-0.5 bg-bg-secondary rounded text-xs">3</kbd></div>
                <div class="flex justify-between"><span class="text-text-secondary">Revise</span><kbd class="px-2 py-0.5 bg-bg-secondary rounded text-xs">4</kbd></div>
              </div>
            </div>
            <div>
              <h3 class="text-sm font-medium text-accent mb-2">Planning Tools</h3>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between"><span class="text-text-secondary"> Canvas</span><kbd class="px-2 py-0.5 bg-bg-secondary rounded text-xs">5</kbd></div>
                <div class="flex justify-between"><span class="text-text-secondary">Outline</span><kbd class="px-2 py-0.5 bg-bg-secondary rounded text-xs">6</kbd></div>
                <div class="flex justify-between"><span class="text-text-secondary">Chapters</span><kbd class="px-2 py-0.5 bg-bg-secondary rounded text-xs">7</kbd></div>
                <div class="flex justify-between"><span class="text-text-secondary">Network</span><kbd class="px-2 py-0.5 bg-bg-secondary rounded text-xs">8</kbd></div>
              </div>
            </div>
          </div>
          
          <div class="grid grid-cols-2 gap-4 pt-2 border-t border-border-subtle">
            <div>
              <h3 class="text-sm font-medium text-accent mb-2">Actions</h3>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between"><span class="text-text-secondary">Start/Stop Flow</span><kbd class="px-2 py-0.5 bg-bg-secondary rounded text-xs">f</kbd></div>
                <div class="flex justify-between"><span class="text-text-secondary">Export</span><kbd class="px-2 py-0.5 bg-bg-secondary rounded text-xs">Ctrl+S</kbd></div>
                <div class="flex justify-between"><span class="text-text-secondary">Import</span><kbd class="px-2 py-0.5 bg-bg-secondary rounded text-xs">Ctrl+I</kbd></div>
              </div>
            </div>
            <div>
              <h3 class="text-sm font-medium text-accent mb-2">General</h3>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between"><span class="text-text-secondary">Show shortcuts</span><kbd class="px-2 py-0.5 bg-bg-secondary rounded text-xs">?</kbd></div>
                <div class="flex justify-between"><span class="text-text-secondary">Close modal/Escape</span><kbd class="px-2 py-0.5 bg-bg-secondary rounded text-xs">Esc</kbd></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <SearchOverlay 
      v-if="showSearchOverlay" 
      :editor="flowEditorRef?.editor" 
      @close="showSearchOverlay = false" 
    />

    <SettingsModal :show="showSettingsModal" @close="showSettingsModal = false" @model-changed="checkModelAvailability" />

    <Toast v-if="toastMessage" :key="toastKey" :message="toastMessage" @dismiss="toastMessage = ''" />
  </div>
</template>
