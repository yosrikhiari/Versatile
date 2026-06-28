<script setup>
import { ref, provide, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useFlowSession } from '../composables/useFlowSession'
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts'
import { useAppInitialization } from '../composables/useAppInitialization'
import { useExportImport } from '../composables/useExportImport'
import AppShell from '../components/layout/AppShell.vue'
import SettingsModal from '../components/layout/SettingsModal.vue'
import WelcomeOnboarding from '../components/layout/WelcomeOnboarding.vue'
import NotificationHost from '../components/shared/NotificationHost.vue'
import FlowEditor from '../components/flow/FlowEditor.vue'
import PolishDrawer from '../components/polish/PolishDrawer.vue'
import StoryBiblePanel from '../components/storybible/StoryBiblePanel.vue'
import RevisePanel from '../components/revise/RevisePanel.vue'
import BaseIcon from '../components/shared/BaseIcon.vue'
import StoryCanvas from '../components/manuscript/StoryCanvas.vue'
import SceneOutline from '../components/manuscript/SceneOutline.vue'
import ChapterManager from '../components/manuscript/ChapterManager.vue'
import StoryNetwork from '../components/storybible/StoryNetwork.vue'
import TimelineView from '../components/manuscript/TimelineView.vue'
import SearchOverlay from '../components/manuscript/SearchOverlay.vue'
import ArchiveDrawer from '../components/layout/ArchiveDrawer.vue'
import ResearchPanel from '../components/research/ResearchPanel.vue'
import StoryGeneratorPanel from '../components/story/StoryGeneratorPanel.vue'
import VoiceLabPanel from '../components/voice-lab/VoiceLabPanel.vue'
import StoryShapePanel from '../components/storyshape/StoryShapePanel.vue'
import ActivityToast from '../components/shared/ActivityToast.vue'
import ActivityDrawer from '../components/shared/ActivityDrawer.vue'
import AuthModal from '../components/auth/AuthModal.vue'

const route = useRoute()
const timer = useFlowSession()

const showSettingsModal = ref(false)
const showShortcutsModal = ref(false)
const showOnboarding = ref(false)
const showAuthModal = ref(false)
const polishDrawerRef = ref(null)
const flowEditorRef = ref(null)
const appShell = ref(null)
const showSearchOverlay = ref(false)
const focusMode = ref(false)

provide('insertAtCursor', (text) => {
  flowEditorRef.value?.insertAtCursor(text)
})

const { ollamaAvailable, modelNotFound, showModelBanner, hasLoaded, initializeApp, checkModelAvailability, onOnboardingComplete, onOnboardingSkip } = useAppInitialization()
const { importStatus, showImportModal, handleExport, handleExportPDF, handleExportEpub, handleImport } = useExportImport()

useKeyboardShortcuts({
  onSearchClose: () => { showSearchOverlay.value = false },
  onToggleShortcuts: () => { showShortcutsModal.value = !showShortcutsModal.value },
  onExport: () => { showSearchOverlay.value = true },
  onImport: handleImport,
  onSave: handleExport,
  onToggleFocusMode: () => { focusMode.value = !focusMode.value },
  onToggleFlow: (running) => { running ? timer.startSession(20) : timer.endSession() },
  timerIsRunning: timer.isRunning.value,
  onToggleSpark: () => appShell.value?.toggleSpark(),
  onToggleStoryGenerator: () => appShell.value?.toggleStoryGenerator(),
  onTogglePolish: () => appShell.value?.togglePolish(),
  onToggleStoryBible: () => appShell.value?.toggleStoryBible(),
  onToggleRevise: () => appShell.value?.toggleRevise(),
  onToggleCanvas: () => appShell.value?.toggleCanvas(),
  onToggleOutline: () => appShell.value?.toggleOutline(),
  onToggleChapters: () => appShell.value?.toggleChapters(),
  onToggleNetwork: () => appShell.value?.toggleNetwork(),
  onToggleTimeline: () => appShell.value?.toggleTimeline(),
  onToggleArchive: () => appShell.value?.toggleArchive(),
  onCloseModal: () => { showShortcutsModal.value = false },
  appShell: appShell.value
})

onMounted(async () => {
  const projectId = Number(route.params.projectId)
  if (projectId) {
    const result = await initializeApp(projectId)
    if (result?.showOnboarding) {
      showOnboarding.value = true
    }
  }
})

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

function handleOpenChapters() {
  appShell.value?.toggleChapters()
}

async function handleOnboardingCompleteWrapper() {
  showOnboarding.value = false
  await onOnboardingComplete()
}

function handleOnboardingSkipWrapper() {
  showOnboarding.value = false
  onOnboardingSkip()
}
</script>

<template>
  <div class="h-screen bg-manuscript relative">
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
      :focus-mode="focusMode"
      @start-flow="handleStartFlow"
      @end-flow="handleEndFlow"
      @export="handleExport"
      @export-pdf="handleExportPDF"
      @export-epub="handleExportEpub"
      @import="handleImport"
      @open-settings="showSettingsModal = true"
      @open-auth="showAuthModal = true"
      @create-project="showOnboarding = true"
    >
      <template #editor>
        <FlowEditor
          ref="flowEditorRef"
          @paragraph-click="handleParagraphClick"
          @open-settings="showSettingsModal = true"
          @exit-flow="handleEndFlow"
        />
      </template>

      <template #story-generator>
        <StoryGeneratorPanel v-if="ollamaAvailable" @open-chapters="handleOpenChapters" />
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
        <TimelineView />
      </template>

      <template #archive>
        <ArchiveDrawer />
      </template>
      <template #research>
        <ResearchPanel />
      </template>
      <template #voice-lab>
        <VoiceLabPanel />
      </template>
      <template #story-shape>
        <StoryShapePanel />
      </template>
    </AppShell>

    <WelcomeOnboarding 
      v-if="showOnboarding && hasLoaded"
      :show="true"
      @complete="handleOnboardingCompleteWrapper"
      @skip="handleOnboardingSkipWrapper"
    />

    <div v-if="timer.showSessionEndModal.value" class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div class="glass-modal rounded-lg shadow-warm-lg p-8 max-w-md text-center animate-scale-in">
        <BaseIcon name="waves" :size="48" class="mb-4 mx-auto text-accent" />
        <h2 class="text-xl font-semibold text-text-primary mb-2">Session complete</h2>
        <p class="text-text-secondary mb-6">
          You wrote {{ timer.sessionWordCountEnd.value }} words.
        </p>
        <div class="flex gap-3">
          <button
            class="flex-1 py-2 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent"
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

    <div v-if="showImportModal" class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" @click.self="showImportModal = false">
      <div class="glass-modal rounded-lg shadow-warm-lg p-8 max-w-md text-center relative">
        <button class="absolute top-3 right-3 text-text-secondary hover:text-text-primary transition-colors" @click="showImportModal = false">
          <BaseIcon name="x" :size="16" />
        </button>
        <p class="text-text-primary">{{ importStatus }}</p>
      </div>
    </div>

    <div v-if="showShortcutsModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" @click.self="showShortcutsModal = false">
      <div class="glass-modal rounded-lg shadow-warm-lg p-6 max-w-lg w-full animate-scale-in">
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
                <div class="flex justify-between"><span class="text-text-secondary">Story Generator</span><kbd class="px-2 py-0.5 bg-bg-secondary rounded text-xs">g</kbd></div>
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

    <AuthModal :show="showAuthModal" @close="showAuthModal = false" />

    <SettingsModal :show="showSettingsModal" @close="showSettingsModal = false" @model-changed="checkModelAvailability" />

    <NotificationHost />

    <ActivityToast />
    <ActivityDrawer />
  </div>
</template>
