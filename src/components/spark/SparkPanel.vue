<script setup>
import { ref, computed } from 'vue'
import { useSparkStore } from '../../stores/sparkStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useProjectStore } from '../../stores/projectStore'
import { isUsingOpenAI, saveOpenAIKey as saveKeyFromOllama } from '../../composables/useOllama'
import SparkPromptCard from './SparkPromptCard.vue'
import BlueprintResult from './BlueprintResult.vue'
import IdeaInput from './IdeaInput.vue'
import ChapterContextSelector from '../shared/ChapterContextSelector.vue'
import BaseIcon from '../shared/BaseIcon.vue'

const sparkStore = useSparkStore()
const storyBibleStore = useStoryBibleStore()
const projectStore = useProjectStore()

const contextSelectorRef = ref(null)

const activeTab = ref('prompt')
const promptType = ref('seed')
const idea = ref('')
const tone = ref('tense')
const targetLength = ref('full')
const currentPrompt = ref('')
const showOpenAISettings = ref(false)
const openaiKeyInput = ref('')
const historyOpen = ref(false)

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
    currentPrompt.value = await sparkStore.generatePrompt(type, characterNames, context)
  } catch (error) {
    console.error('Failed to generate prompt:', error)
  }
}

async function generateBlueprint() {
  const characterNames = storyBibleStore.getCharacterNames()
  const context = await getManuscriptContext()
  try {
    await sparkStore.generateBlueprintAction(idea.value, tone.value, characterNames, targetLength.value, context)
  } catch (error) {
    console.error('Failed to generate blueprint:', error)
  }
}

async function generateChapter() {
  const characterNames = storyBibleStore.getCharacterNames()
  try {
    await sparkStore.generateChapterStreamingAction(idea.value, tone.value, characterNames, targetLength.value)
  } catch (error) {
    console.error('Failed to generate chapter:', error)
  }
}

function insertIntoFlow(text) {
  projectStore.updateContent(projectStore.manuscriptContent + '\n\n' + text)
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
  if (tab !== 'chapter') {
    sparkStore.currentChapter = null
  }
  if (tab !== 'blueprint') {
    sparkStore.currentBlueprint = null
  }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="px-4 pt-4 pb-3 border-b border-border-subtle">
      <div class="flex items-center justify-between">
        <span class="font-spark text-accent tracking-wide">Spark</span>
      </div>
      <div class="flex mt-3 gap-1">
        <button
          @click="switchTab('prompt')"
          :class="[
            'flex-1 py-2 text-xs font-medium transition-colors rounded-md focus:outline-none focus:ring-2 focus:ring-accent',
            activeTab === 'prompt' 
              ? 'bg-accent/10 text-accent' 
              : 'text-text-hint hover:text-text-secondary hover:bg-surface-hover'
          ]"
        >
          Prompt
        </button>
        <button
          @click="switchTab('blueprint')"
          :class="[
            'flex-1 py-2 text-xs font-medium transition-colors rounded-md focus:outline-none focus:ring-2 focus:ring-accent',
            activeTab === 'blueprint' 
              ? 'bg-accent/10 text-accent' 
              : 'text-text-hint hover:text-text-secondary hover:bg-surface-hover'
          ]"
        >
          Blueprint
        </button>
        <button
          @click="switchTab('chapter')"
          :class="[
            'flex-1 py-2 text-xs font-medium transition-colors rounded-md focus:outline-none focus:ring-2 focus:ring-accent',
            activeTab === 'chapter' 
              ? 'bg-accent/10 text-accent' 
              : 'text-text-hint hover:text-text-secondary hover:bg-surface-hover'
          ]"
        >
          Chapter
        </button>
        <button
          @click="switchTab('history')"
          :class="[
            'flex-1 py-2 text-xs font-medium transition-colors rounded-md focus:outline-none focus:ring-2 focus:ring-accent',
            activeTab === 'history' 
              ? 'bg-accent/10 text-accent' 
              : 'text-text-hint hover:text-text-secondary hover:bg-surface-hover'
          ]"
        >
          History
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <div v-if="activeTab === 'prompt'" class="space-y-4">
        <div>
          <label class="block text-[11px] uppercase tracking-widest text-text-hint font-ui mb-2">Prompt Type</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="type in promptTypes"
              :key="type.value"
              @click="sparkStore.selectedPromptType = type.value"
              :class="[
                'px-3 py-1.5 text-xs rounded-md transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent',
                sparkStore.selectedPromptType === type.value
                  ? 'bg-accent text-white'
                  : 'bg-bg-tertiary text-text-hint hover:text-text-secondary hover:bg-surface-hover'
              ]"
            >
              {{ type.label }}
            </button>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            id="relateToProject"
            v-model="sparkStore.relateToProject"
            class="w-4 h-4 rounded accent-accent"
          />
          <label for="relateToProject" class="text-sm text-text-secondary font-ui">
            Relate to my project
          </label>
        </div>

        <ChapterContextSelector ref="contextSelectorRef" panel-id="spark" />

        <button
          @click="generatePrompt"
          @keydown.enter="generatePrompt"
          :disabled="sparkStore.isGenerating"
              class="w-full py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-ui focus:outline-none focus:ring-2 focus:ring-accent"
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

        <SparkPromptCard
          v-if="currentPrompt"
          :prompt="currentPrompt"
          @insert="insertIntoFlow"
          @regenerate="generatePrompt"
        />

        <div v-if="!currentPrompt && !sparkStore.isGenerating" class="text-center py-8">
          <p class="text-sm italic text-text-hint font-body">Select a type and generate to get a writing prompt</p>
        </div>
      </div>

      <div v-if="activeTab === 'blueprint'" class="space-y-4">
        <IdeaInput
          v-model:idea="idea"
          v-model:tone="tone"
          v-model:targetLength="targetLength"
        />

        <ChapterContextSelector ref="contextSelectorRef" panel-id="spark-blueprint" />

        <button
          @click="generateBlueprint"
          @keydown.enter="generateBlueprint"
          :disabled="sparkStore.isGenerating || !idea"
              class="w-full py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-ui focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <span v-if="sparkStore.isGenerating" class="flex items-center justify-center gap-2">
            <BaseIcon name="loader-2" :size="16" class="animate-spin" />
            Generating...
          </span>
          <span v-else>Generate Blueprint</span>
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

        <div v-if="!sparkStore.currentBlueprint && !sparkStore.isGenerating && !sparkStore.error" class="text-center py-8">
          <p class="text-sm italic text-text-hint font-body">Describe your chapter idea and generate a structural blueprint</p>
        </div>
      </div>

      <div v-if="activeTab === 'chapter'" class="space-y-4">
        <IdeaInput
          v-model:idea="idea"
          v-model:tone="tone"
          v-model:targetLength="targetLength"
        />

        <button
          @click="generateChapter"
          @keydown.enter="generateChapter"
          :disabled="sparkStore.isGenerating || !idea"
              class="w-full py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-ui focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <span v-if="sparkStore.isGenerating" class="flex items-center justify-center gap-2">
            <BaseIcon name="loader-2" :size="16" class="animate-spin" />
            Generating...
          </span>
          <span v-else>Write Chapter</span>
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
              @click="insertIntoFlow(sparkStore.currentChapter)"
              class="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent/90 font-ui focus:outline-none focus:ring-2 focus:ring-accent"
            >
              Insert
            </button>
          </div>
          <div class="text-sm text-text-primary whitespace-pre-wrap max-h-64 overflow-y-auto font-body">
            {{ sparkStore.currentChapter }}
          </div>
        </div>

        <div v-if="!sparkStore.currentChapter && !sparkStore.currentStreamingChapter && !sparkStore.isGenerating && !sparkStore.error" class="text-center py-8">
          <p class="text-sm italic text-text-hint font-body">Describe your chapter idea and generate full prose</p>
        </div>
      </div>

      <div v-if="activeTab === 'history'">
        <button
          @click="historyOpen = !historyOpen"
          class="w-full flex items-center justify-between py-2 text-[11px] uppercase tracking-widest text-text-hint font-ui hover:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent rounded"
        >
          <span>History ({{ sparkStore.history.length }})</span>
          <span>{{ historyOpen ? '▼' : '▶' }}</span>
        </button>

        <div v-if="historyOpen" class="mt-3 space-y-3">
          <div v-if="sparkStore.history.length === 0" class="text-center py-8">
            <p class="text-sm italic text-text-hint font-body">Generated prompts and blueprints will appear here</p>
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
              @click="insertIntoFlow(item.prompt)"
              class="mt-2 text-xs text-accent hover:text-accent-hover font-ui focus:outline-none focus:ring-2 focus:ring-accent rounded"
            >
              Insert
            </button>
          </div>
          <button
            v-if="sparkStore.history.length > 0"
            @click="clearHistory"
            class="w-full py-1.5 text-xs text-text-hint hover:text-danger transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent rounded"
          >
            Clear history
          </button>
        </div>
      </div>
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
            @click="saveOpenAIKeyLocal"
            :disabled="!openaiKeyInput.trim()"
            class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 disabled:opacity-50 font-ui"
          >
            Save Key
          </button>
          <button
            @click="showOpenAISettings = false"
            class="px-4 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover font-ui"
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
