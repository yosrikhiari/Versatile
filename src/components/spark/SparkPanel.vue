<script setup>
import { ref, computed } from 'vue'
import { useSparkStore } from '../../stores/sparkStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useProjectStore } from '../../stores/projectStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { saveOpenAIKey as saveKeyFromOllama, useCompactConversation } from '../../composables/useOllama'
import { useContextRetrieval } from '../../composables/useContextRetrieval'
import { PROVIDER_LABELS, FEATURES } from '../../config/ai'
import SparkPromptCard from './SparkPromptCard.vue'
import BlueprintResult from './BlueprintResult.vue'
import IdeaInput from './IdeaInput.vue'
import ChapterContextSelector from '../shared/ChapterContextSelector.vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  embedded: Boolean
})

const sparkStore = useSparkStore()
const storyBibleStore = useStoryBibleStore()
const projectStore = useProjectStore()
const settingsStore = useSettingsStore()
const { dryRun } = useContextRetrieval()

const sparkModelLabel = computed(() => {
  const provider = settingsStore.resolveFeatureProvider(FEATURES.SPARK)
  const model = settingsStore.resolveFeatureModel(FEATURES.SPARK)
  const label = PROVIDER_LABELS[provider] || provider
  return model ? `${label} · ${model}` : label
})

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
  shouldSuggestCompact,
  isCompacting: compactIsCompacting,
  startConversation,
  addTurn,
  clearConversation
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
  }
}

function insertIntoFlow(text) {
  projectStore.updateContent(projectStore.documentContent + '\n\n' + text)
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
  <div :class="embedded ? 'flex flex-col min-h-0' : 'h-full flex flex-col'">
    <div class="px-4 pt-4 pb-3 border-b border-border-subtle flex-shrink-0">
      <template v-if="!embedded">
        <div class="flex items-center justify-between">
          <span class="font-spark text-accent tracking-wide">Spark</span>
          <span class="text-[10px] text-text-hint font-ui truncate max-w-[180px]" :title="sparkModelLabel">{{ sparkModelLabel }}</span>
        </div>
      </template>

      <!-- Pipeline hint shown in embedded (brainstorm) mode -->
      <template v-if="embedded">
        <div class="flex items-center gap-2 py-1 mb-1">
          <span class="text-[10px] text-text-hint font-ui">Brainstorm here</span>
          <BaseIcon name="arrow-right" :size="10" class="text-text-hint" />
          <span class="text-[10px] text-accent font-ui font-semibold">Use as Generator Context</span>
          <BaseIcon name="arrow-right" :size="10" class="text-text-hint" />
          <span class="text-[10px] text-text-hint font-ui">Chapter / Volume</span>
        </div>
      </template>

      <div class="flex mt-2 gap-1">
        <button
          :class="[
            'flex-1 py-2 text-xs font-medium transition-colors rounded-md focus:outline-none focus:ring-2 focus:ring-accent',
            activeTab === 'prompt'
              ? 'bg-accent/10 text-accent'
              : 'text-text-hint hover:text-text-secondary hover:bg-surface-hover'
          ]"
          @click="switchTab('prompt')"
          title="Generate a writing prompt to spark ideas"
        >
          Prompt
        </button>
        <button
          :class="[
            'flex-1 py-2 text-xs font-medium transition-colors rounded-md focus:outline-none focus:ring-2 focus:ring-accent',
            activeTab === 'blueprint'
              ? 'bg-accent/10 text-accent'
              : 'text-text-hint hover:text-text-secondary hover:bg-surface-hover'
          ]"
          @click="switchTab('blueprint')"
          title="Turn your idea into a structured scene blueprint (beats, hooks, notes)"
        >
          Blueprint
        </button>
        <button
          :class="[
            'flex-1 py-2 text-xs font-medium transition-colors rounded-md focus:outline-none focus:ring-2 focus:ring-accent',
            activeTab === 'freewrite'
              ? 'bg-accent/10 text-accent'
              : 'text-text-hint hover:text-text-secondary hover:bg-surface-hover'
          ]"
          @click="switchTab('freewrite')"
          title="Generate full prose from your idea — a quick draft to react to"
        >
          Freewrite
        </button>
        <button
          :class="[
            'flex-1 py-2 text-xs font-medium transition-colors rounded-md focus:outline-none focus:ring-2 focus:ring-accent',
            activeTab === 'history'
              ? 'bg-accent/10 text-accent'
              : 'text-text-hint hover:text-text-secondary hover:bg-surface-hover'
          ]"
          @click="switchTab('history')"
          title="Your past Spark generations"
        >
          History
        </button>
      </div>
      <div v-if="!embedded" class="flex items-center justify-end mt-2 gap-1">
        <button
          v-if="compactIsCompacting"
          class="px-2 py-1 text-[10px] bg-bg-tertiary text-text-hint rounded font-ui"
          disabled
        >
          Compacting...
        </button>
        <button
          v-else
          class="px-2 py-1 text-[10px] bg-bg-tertiary text-text-hint hover:text-text-secondary hover:bg-surface-hover rounded font-ui"
          title="Compact conversation — summarizes earlier exchanges to keep context fresh"
          @click="handleCompact"
        >
          Compact
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 scrollbar-thin">
      <div v-if="activeTab === 'prompt'" class="space-y-4">
        <div>
          <label class="block text-[11px] uppercase tracking-widest text-text-hint font-ui mb-2">Prompt Type</label>
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
          <label for="relateToProject" class="text-sm text-text-secondary font-ui">
            Relate to my project
          </label>
        </div>

        <ChapterContextSelector ref="contextSelectorRef" panel-id="spark" />

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

      <div v-if="activeTab === 'blueprint'" class="space-y-4">
        <div class="rounded-lg bg-accent/5 border border-accent/15 px-3 py-2">
          <p class="text-[11px] text-text-hint font-ui leading-relaxed">
            Describe your scene idea and get a structured blueprint with beats, a sensory anchor, and a dialogue hook.
            Then use <span class="text-accent font-semibold">Use as Generator Context</span> to write the full chapter.
          </p>
        </div>
        <IdeaInput
          v-model:idea="idea"
          v-model:tone="tone"
          v-model:target-length="targetLength"
        />

        <ChapterContextSelector ref="contextSelectorRef" panel-id="spark-blueprint" />

        <button
          :disabled="sparkStore.isGenerating || !idea"
          class="w-full py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-ui focus:outline-none focus:ring-2 focus:ring-accent"
          @click="generateOutline"
               @keydown.enter="generateOutline"
        >
          <span v-if="sparkStore.isGenerating" class="flex items-center justify-center gap-2">
            <BaseIcon name="loader-2" :size="16" class="animate-spin" />
            Generating...
          </span>
           <span v-else>Generate Outline</span>
        </button>

        <div v-if="sparkStore.isGenerating" class="rounded-lg p-4 space-y-4 animate-pulse bg-surface-hover">
          <div class="h-5 bg-bg-tertiary rounded w-1/2"></div>
          <div class="space-y-2">
            <div class="h-4 bg-bg-tertiary rounded w-full"></div>
            <div class="h-4 bg-bg-tertiary rounded w-3/4"></div>
          </div>
          <div class="h-20 bg-bg-tertiary rounded"></div>
        </div>

        <div v-if="sparkStore.error" class="p-3 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger font-ui">
          {{ sparkStore.error }}
        </div>

        <BlueprintResult
          v-if="sparkStore.currentBlueprint"
          :blueprint="sparkStore.currentBlueprint"
          @insert="insertIntoFlow"
        />

        <div v-if="!sparkStore.currentBlueprint && !sparkStore.isGenerating && !sparkStore.error" class="text-center py-8 space-y-2">
          <BaseIcon name="map" :size="24" class="mx-auto text-text-hint" />
          <p class="text-sm text-text-hint font-body">Describe your scene and generate a blueprint.</p>
          <p class="text-xs text-text-hint font-ui opacity-70">Beats, hooks, and notes — everything the generator needs.</p>
        </div>
      </div>

      <div v-if="activeTab === 'freewrite'" class="space-y-4">
        <div class="rounded-lg bg-accent/5 border border-accent/15 px-3 py-2">
          <p class="text-[11px] text-text-hint font-ui leading-relaxed">
            Write a quick draft to react to. Once generated, use
            <span class="text-accent font-semibold">Use as Generator Context</span>
            below to feed it into the Chapter or Volume generator.
          </p>
        </div>
        <IdeaInput
          v-model:idea="idea"
          v-model:tone="tone"
          v-model:target-length="targetLength"
        />

        <button
          :disabled="sparkStore.isGenerating || !idea"
          class="w-full py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-ui focus:outline-none focus:ring-2 focus:ring-accent"
          @click="generateContent"
               @keydown.enter="generateContent"
        >
          <span v-if="sparkStore.isGenerating" class="flex items-center justify-center gap-2">
            <BaseIcon name="loader-2" :size="16" class="animate-spin" />
            Generating...
          </span>
           <span v-else>Write Content</span>
        </button>

        <div v-if="sparkStore.isGenerating" class="rounded-lg p-4 space-y-3 bg-bg-tertiary border border-border-subtle">
          <div class="flex items-center gap-2 text-sm text-text-secondary font-ui">
            <BaseIcon name="loader-2" :size="16" class="animate-spin text-accent" />
            Writing...
          </div>
          <div class="text-sm text-text-primary whitespace-pre-wrap max-h-96 overflow-y-auto font-body">
            {{ sparkStore.currentStreamingChapter }}<BaseIcon name="loader-2" :size="12" class="animate-spin inline ml-1" />
          </div>
        </div>

        <div v-if="sparkStore.error" class="p-3 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger font-ui">
          {{ sparkStore.error }}
        </div>

        <div v-if="sparkStore.currentChapter && !sparkStore.isGenerating" class="rounded-lg p-4 space-y-3 bg-bg-tertiary border border-border-subtle">
          <div class="flex justify-between items-start">
            <h3 class="font-semibold text-text-primary font-body">Generated Chapter</h3>
            <button
              class="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent/90 font-ui focus:outline-none focus:ring-2 focus:ring-accent"
              @click="insertIntoFlow(sparkStore.currentChapter)"
            >
              Insert
            </button>
          </div>
          <div class="text-sm text-text-primary whitespace-pre-wrap max-h-64 overflow-y-auto font-body">
            {{ sparkStore.currentChapter }}
          </div>
        </div>

        <div v-if="!sparkStore.currentChapter && !sparkStore.currentStreamingChapter && !sparkStore.isGenerating && !sparkStore.error" class="text-center py-8 space-y-2">
          <BaseIcon name="pencil-line" :size="24" class="mx-auto text-text-hint" />
          <p class="text-sm text-text-hint font-body">Describe your scene and generate quick prose.</p>
          <p class="text-xs text-text-hint font-ui opacity-70">React to it, then send it to the generator as context.</p>
        </div>
      </div>

      <div v-if="activeTab === 'history'" class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-[11px] uppercase tracking-widest text-text-hint font-ui">{{ sparkStore.history.length }} saved</span>
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
          <div class="text-[10px] uppercase tracking-wider text-text-hint font-ui mb-1">{{ item.type }}</div>
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
          class="py-1.5 text-[10px] uppercase tracking-widest text-text-hint font-ui cursor-pointer hover:text-text-secondary"
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
            <summary class="text-[10px] text-text-hint cursor-pointer hover:text-text-secondary">Full context text</summary>
            <pre class="mt-1 p-2 bg-bg-tertiary rounded text-[10px] text-text-hint whitespace-pre-wrap max-h-32 overflow-y-auto">{{ contextPreview.contextText || '(empty)' }}</pre>
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
</template>
