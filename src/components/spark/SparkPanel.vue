<script setup>
import { ref, inject } from 'vue'
import { useSparkStore } from '../../stores/sparkStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useProjectStore } from '../../stores/projectStore'
import { saveOpenAIKey as saveKeyFromOllama, useCompactConversation } from '../../composables/useOllama'
import { useContextRetrieval } from '../../composables/useContextRetrieval'
import { useAsyncError } from '../../composables/useAsyncError'
const { onAsyncError } = useAsyncError()

import SparkPromptCard from './SparkPromptCard.vue'
import BlueprintResult from './BlueprintResult.vue'
import IdeaInput from './IdeaInput.vue'
import ErrorBoundary from '../shared/ErrorBoundary.vue'
import ChapterContextSelector from '../shared/ChapterContextSelector.vue'
import BaseIcon from '../shared/BaseIcon.vue'

defineProps({
  embedded: Boolean
})
const emit = defineEmits(['useAsContext'])

const sparkStore = useSparkStore()
const storyBibleStore = useStoryBibleStore()
const projectStore = useProjectStore()
const injectedInsert = inject('insertAtCursor', null)
const { dryRun } = useContextRetrieval()

const contextSelectorRef = ref(null)

const activeTab = ref('blueprint')
const idea = ref('')
const tone = ref('tense')
const targetLength = ref('full')
const currentPrompt = ref('')
const showOpenAISettings = ref(false)
const openaiKeyInput = ref('')
const showContextPreview = ref(false)
const contextPreview = ref(null)
const contextPreviewLoading = ref(false)
const compactConversationId = ref('spark_default')

const {
  compactConversation,
  isCompacting: compactIsCompacting,
  addTurn
} = useCompactConversation()

async function handleCompact() {
  const result = await compactConversation(compactConversationId.value)
  if (result.compacted) {
    addTurn(compactConversationId.value, 'system', `Conversation compacted: ${result.summarizedCount} previous turns summarized into 1.`)
  }
}

async function toggleContextPreview() {
  showContextPreview.value = !showContextPreview.value
  if (showContextPreview.value && !contextPreview.value) {
    contextPreviewLoading.value = true
    try {
      contextPreview.value = await dryRun(projectStore.currentProjectId)
    } finally {
      contextPreviewLoading.value = false
    }
  }
}

const promptTypes = [
  { value: 'seed', label: 'Story Seed' },
  { value: 'scenario', label: 'Character Scenario' },
  { value: 'whatif', label: 'What If' },
  { value: 'obstacle', label: 'Obstacle' }
]

async function getManuscriptContext() {
  if (contextSelectorRef.value) {
    return await contextSelectorRef.value.getContext()
  }
  return null
}

async function generatePrompt() {
  const characterNames = storyBibleStore.getCharacterNames()
  const type = sparkStore.selectedPromptType
  const context = await getManuscriptContext()
  try {
    addTurn(compactConversationId.value, 'user', `Generate a ${type} writing prompt`)
    currentPrompt.value = await sparkStore.generatePrompt(type, characterNames, context)
    addTurn(compactConversationId.value, 'assistant', currentPrompt.value)
  } catch (error) {
      console.error('Failed to generate prompt:', error)
      onAsyncError(error)
    }
}

async function generateOutline() {
  const characterNames = storyBibleStore.getCharacterNames()
  const context = await getManuscriptContext()
  try {
    addTurn(compactConversationId.value, 'user', `Generate outline for: ${idea.value} (tone: ${tone.value})`)
    await sparkStore.generateOutlineAction(idea.value, tone.value, characterNames, targetLength.value, context)
    addTurn(compactConversationId.value, 'assistant', `Outline generated: ${sparkStore.currentOutline?.title || 'Untitled'}`)
  } catch (error) {
      console.error('Failed to generate outline:', error)
      onAsyncError(error)
    }
}

async function generateContent() {
  const characterNames = storyBibleStore.getCharacterNames()
  try {
    addTurn(compactConversationId.value, 'user', `Write content: ${idea.value} (tone: ${tone.value}, length: ${targetLength.value})`)
    await sparkStore.generateContentStreamingAction(idea.value, tone.value, characterNames, targetLength.value)
    addTurn(compactConversationId.value, 'assistant', `Content generated (${sparkStore.currentContent?.length || 0} chars)`)
  } catch (error) {
      console.error('Failed to generate content:', error)
      onAsyncError(error)
    }
}

function insertIntoFlow(text) {
  if (injectedInsert) {
    injectedInsert(text)
  } else {
    // Fallback: append to document content if inject is unavailable
    projectStore.updateContent(projectStore.documentContent + '\n\n' + text)
  }
}

function saveOpenAIKeyLocal() {
  if (openaiKeyInput.value.trim()) {
    saveKeyFromOllama(openaiKeyInput.value.trim())
    sparkStore.testConnection()
    showOpenAISettings.value = false
    openaiKeyInput.value = ''
  }
}

function clearHistory() {
  if (projectStore.currentProjectId) {
    sparkStore.clearHistoryData(projectStore.currentProjectId)
  }
}

function switchTab(tab) {
  activeTab.value = tab
  if (tab !== 'freewrite') {
    sparkStore.currentContent = null
  }
  if (tab !== 'blueprint') {
    sparkStore.currentOutline = null
  }
}
</script>

<template>
  <ErrorBoundary
    fallback-title="Spark Panel Error"
    fallback-description="Failed to render the Spark panel. Try refreshing the page."
  >
  <div :class="embedded ? 'flex flex-col min-h-0' : 'h-full flex flex-col'">
    <div class="px-5 pt-5 pb-4 border-b border-border-subtle/30 flex-shrink-0 bg-bg-secondary/10">
      <div class="flex items-center justify-between mb-4">
        <div class="flex gap-6">
          <button
class="font-spark text-lg transition-colors duration-300 tracking-wide focus:outline-none" 
                  :class="['blueprint', 'freewrite'].includes(activeTab) ? 'text-accent' : 'text-text-hint hover:text-text-secondary'"
                  @click="switchTab('blueprint')">
            ~ Develop Idea ~
          </button>
          <button
class="font-spark text-lg transition-colors duration-300 tracking-wide focus:outline-none" 
                  :class="activeTab === 'prompt' ? 'text-accent' : 'text-text-hint hover:text-text-secondary'"
                  @click="switchTab('prompt')">
            ~ Get Prompts ~
          </button>
        </div>
        <div class="flex gap-3 items-center">
          <button
            v-if="!compactIsCompacting && !embedded"
            class="px-2 py-1 text-2xs bg-bg-tertiary text-text-hint hover:text-text-secondary hover:bg-surface-hover rounded font-ui"
            title="Compact conversation"
            @click="handleCompact"
          >
            Compact
          </button>
          <button
class="transition-colors duration-300 focus:outline-none" 
                  :class="activeTab === 'history' ? 'text-accent' : 'text-text-hint hover:text-text-secondary'"
                  title="History" 
                  @click="switchTab('history')">
            <BaseIcon name="clock" :size="16" />
          </button>
        </div>
      </div>

      <!-- Context Selector always near top -->
      <div v-if="['blueprint', 'freewrite', 'prompt'].includes(activeTab)">
        <ChapterContextSelector ref="contextSelectorRef" panel-id="spark-global" />
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 scrollbar-thin">
      <div v-if="activeTab === 'prompt'" class="space-y-4">
        <div>
          <label class="block text-11px uppercase tracking-widest text-text-hint font-ui mb-2">Prompt Type</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="type in promptTypes"
              :key="type.value"
              :class="[
                'px-3 py-1.5 text-xs rounded-md transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent',
                sparkStore.selectedPromptType === type.value
                  ? 'bg-accent text-white'
                  : 'bg-bg-tertiary text-text-hint hover:text-text-secondary hover:bg-surface-hover'
              ]"
              @click="sparkStore.selectedPromptType = type.value"
            >
              {{ type.label }}
            </button>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <input
            id="relateToProject"
            v-model="sparkStore.relateToProject"
            type="checkbox"
            class="w-4 h-4 rounded accent-accent"
          />
          <label for="relateToProject" class="text-sm text-text-secondary font-ui cursor-pointer select-none">
            Relate to my project
          </label>
        </div>

        <button
          :disabled="sparkStore.isGenerating"
          class="w-full py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-ui focus:outline-none focus:ring-2 focus:ring-accent"
          @click="generatePrompt"
              @keydown.enter="generatePrompt"
        >
          <span v-if="sparkStore.isGenerating" class="flex items-center justify-center gap-2">
            <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Generating...
          </span>
          <span v-else>Generate</span>
        </button>

        <div v-if="sparkStore.isGenerating" class="rounded-lg p-4 space-y-3 animate-pulse bg-surface-hover">
          <div class="h-4 bg-bg-tertiary rounded w-3/4"></div>
          <div class="h-4 bg-bg-tertiary rounded w-full"></div>
          <div class="h-4 bg-bg-tertiary rounded w-5/6"></div>
        </div>

        <div v-if="sparkStore.error" class="p-3 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger font-ui">
          {{ sparkStore.error }}
        </div>

        <SparkPromptCard
          v-if="currentPrompt"
          :prompt="currentPrompt"
          @insert="insertIntoFlow"
          @regenerate="generatePrompt"
        />

        <div v-if="!currentPrompt && !sparkStore.isGenerating && !sparkStore.error" class="text-center py-8 space-y-2">
          <BaseIcon name="lightbulb" :size="24" class="mx-auto text-text-hint" />
          <p class="text-sm text-text-hint font-body">Pick a prompt type above and hit Generate.</p>
          <p class="text-xs text-text-hint font-ui opacity-70">Once you have a prompt you like, use<br><span class="text-accent">Use as Generator Context</span> to turn it into a full chapter.</p>
        </div>
      </div>

      <div v-if="['blueprint', 'freewrite'].includes(activeTab)" class="space-y-8">
        <!-- Step 1: Idea Input -->
        <IdeaInput
          v-model:idea="idea"
          v-model:tone="tone"
          v-model:target-length="targetLength"
        />

        <div v-if="sparkStore.error" class="p-3 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger font-ui">
          {{ sparkStore.error }}
        </div>

        <button
          v-if="!sparkStore.currentBlueprint && !sparkStore.isGenerating"
          :disabled="!idea"
          class="w-full py-2.5 border border-accent text-accent rounded-lg font-spark tracking-widest text-sm hover:bg-accent hover:text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          @click="generateOutline"
        >
          Draft Blueprint
        </button>

        <div v-if="sparkStore.isGenerating && !sparkStore.currentBlueprint && !sparkStore.currentStreamingChapter" class="flex items-center justify-center py-6 text-accent">
          <BaseIcon name="loader-2" :size="24" class="animate-spin" />
        </div>

        <!-- Step 2: The Blueprint -->
        <div v-if="sparkStore.currentBlueprint" class="space-y-6 pt-6 border-t border-border-subtle/20 relative">
          <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-bg-primary px-3 text-text-hint/30"><BaseIcon name="feather" :size="16" /></div>
          <BlueprintResult
            :blueprint="sparkStore.currentBlueprint"
            @insert="insertIntoFlow"
          />

          <!-- Actions if Draft hasn't started -->
          <div v-if="!sparkStore.currentChapter && !sparkStore.currentStreamingChapter && !sparkStore.isGenerating" class="flex gap-4">
            <button
              class="flex-1 py-2 border border-accent text-accent rounded-lg font-spark tracking-widest text-sm hover:bg-accent/10 transition-colors"
              @click="generateContent"
            >
              Expand to Draft
            </button>
            <button
              class="flex-1 py-2 bg-accent text-white rounded-lg font-spark tracking-widest text-sm hover:bg-accent/90 transition-colors shadow-warm-sm"
              @click="emit('useAsContext')"
            >
              Use Blueprint as Context
            </button>
          </div>
        </div>

        <!-- Step 3: The Draft -->
        <div v-if="sparkStore.currentChapter || sparkStore.currentStreamingChapter" class="space-y-6 pt-6 border-t border-border-subtle/20 relative">
          <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-bg-primary px-3 text-text-hint/30"><BaseIcon name="feather" :size="16" /></div>
          
          <div class="rounded-sm p-4 bg-bg-tertiary/50 border border-border-subtle/30 font-body text-sm text-text-primary whitespace-pre-wrap leading-relaxed relative">
            <div v-if="sparkStore.isGenerating" class="flex items-center gap-2 text-xs text-accent font-ui mb-2">
              <BaseIcon name="loader-2" :size="12" class="animate-spin" /> Drafting...
            </div>
            {{ sparkStore.currentStreamingChapter || sparkStore.currentChapter }}
          </div>

          <div v-if="sparkStore.currentChapter && !sparkStore.isGenerating" class="flex gap-4">
            <button
              class="flex-1 py-2 border border-accent text-accent rounded-lg font-spark tracking-widest text-sm hover:bg-accent/10 transition-colors"
              @click="insertIntoFlow(sparkStore.currentChapter)"
            >
              Insert to Editor
            </button>
            <button
              class="flex-1 py-2 bg-accent text-white rounded-lg font-spark tracking-widest text-sm hover:bg-accent/90 transition-colors shadow-warm-sm"
              @click="emit('useAsContext')"
            >
              Use Draft as Context
            </button>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'history'" class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-11px uppercase tracking-widest text-text-hint font-ui">{{ sparkStore.history.length }} saved</span>
          <button
            v-if="sparkStore.history.length > 0"
            class="text-xs text-text-hint hover:text-danger transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent rounded px-1"
            @click="clearHistory"
          >
            Clear all
          </button>
        </div>

        <div v-if="sparkStore.history.length === 0" class="text-center py-8 space-y-2">
          <BaseIcon name="clock" :size="24" class="mx-auto text-text-hint" />
          <p class="text-sm text-text-hint font-body">No history yet.</p>
          <p class="text-xs text-text-hint font-ui opacity-70">Prompts, blueprints, and freewrites you generate will appear here.</p>
        </div>

        <div
          v-for="(item, index) in sparkStore.history"
          :key="index"
          class="p-3 rounded-lg bg-bg-tertiary border border-border-subtle"
        >
          <div class="text-2xs uppercase tracking-wider text-text-hint font-ui mb-1">{{ item.type }}</div>
          <p class="text-sm text-text-secondary line-clamp-2 font-body">{{ item.prompt }}</p>
          <button
            v-if="item.prompt"
            class="mt-2 text-xs text-accent hover:text-accent-hover font-ui focus:outline-none focus:ring-2 focus:ring-accent rounded"
            @click="insertIntoFlow(item.prompt)"
          >
            Insert into editor
          </button>
        </div>
      </div>

      <details class="mt-2">
        <summary
          class="py-1.5 text-2xs uppercase tracking-widest text-text-hint font-ui cursor-pointer hover:text-text-secondary"
          @click.prevent="toggleContextPreview"
        >
          {{ showContextPreview ? '▼' : '▶' }} Context Preview
        </summary>
        <div v-if="contextPreviewLoading" class="mt-2 p-2 bg-bg-tertiary rounded text-xs text-text-hint">
          Loading context...
        </div>
        <div v-else-if="contextPreview" class="mt-2 space-y-1">
          <div class="text-xs text-text-hint font-ui">{{ contextPreview.sourceDescription }}</div>
          <div v-for="(line, i) in contextPreview.previewLines" :key="i" class="flex items-start gap-1.5 text-xs">
            <span class="text-text-hint shrink-0 mt-0.5">•</span>
            <span class="text-text-secondary">
              <span v-if="line.signal" :class="line.signal === 'accepted' ? 'text-accent' : 'text-text-hint'">[{{ line.signal }}]</span>
              {{ line.summary }}
            </span>
          </div>
          <details class="mt-1">
            <summary class="text-2xs text-text-hint cursor-pointer hover:text-text-secondary">Full context text</summary>
            <pre class="mt-1 p-2 bg-bg-tertiary rounded text-2xs text-text-hint whitespace-pre-wrap max-h-32 overflow-y-auto">{{ contextPreview.contextText || '(empty)' }}</pre>
          </details>
        </div>
        <div v-else class="mt-2 text-xs text-text-hint font-ui">No context loaded for this project</div>
      </details>
    </div>

    <div v-if="showOpenAISettings" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div class="bg-bg-tertiary rounded-xl shadow-xl p-6 max-w-md w-full border border-border-subtle">
        <h3 class="text-lg font-semibold text-text-primary mb-2">Configure AI Provider</h3>
        <p class="text-sm text-text-secondary mb-4">
          Ollama is unavailable. Enter an OpenAI API key to use GPT-3.5 as a fallback.
        </p>
        <input
          v-model="openaiKeyInput"
          type="password"
          placeholder="sk-..."
          class="w-full px-3 py-2 border border-border-subtle rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-accent/50 bg-bg-secondary text-text-primary font-ui"
          @keyup.enter="saveOpenAIKey"
        />
        <div class="flex gap-2">
          <button
            :disabled="!openaiKeyInput.trim()"
            class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 disabled:opacity-50 font-ui"
            @click="saveOpenAIKeyLocal"
          >
            Save Key
          </button>
          <button
            class="px-4 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover font-ui"
            @click="showOpenAISettings = false"
          >
            Cancel
          </button>
        </div>
        <p class="text-xs text-text-hint mt-3 font-ui">
          Your API key is stored locally and never sent to any server except OpenAI.
        </p>
      </div>
    </div>
  </div>
  </ErrorBoundary>
</template>
