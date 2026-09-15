<script setup>
import { ref, inject } from 'vue'
import { useSparkStore } from '../../stores/sparkStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useProjectStore } from '../../stores/projectStore'
import {
  saveOpenAIKey as saveKeyFromOllama,
  useCompactConversation
} from '../../composables/useOllama'
import { useContextRetrieval } from '../../composables/useContextRetrieval'
import { useAsyncError } from '../../composables/useAsyncError'
const { onAsyncError } = useAsyncError()

import SparkPromptCard from './SparkPromptCard.vue'
import BlueprintResult from './BlueprintResult.vue'
import IdeaInput from './IdeaInput.vue'
import ErrorBoundary from '../shared/ErrorBoundary.vue'
import SectionContextSelector from '../shared/SectionContextSelector.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import BaseSection from '../ui/BaseSection.vue'
import BaseSegmented from '../ui/BaseSegmented.vue'
import BaseSwitch from '../ui/BaseSwitch.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseAlert from '../ui/BaseAlert.vue'
import Modal from '../shared/Modal.vue'

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

const { compactConversation, isCompacting: compactIsCompacting, addTurn } = useCompactConversation()

async function handleCompact() {
  const result = await compactConversation(compactConversationId.value)
  if (result.compacted) {
    addTurn(
      compactConversationId.value,
      'system',
      `Conversation compacted: ${result.summarizedCount} previous turns summarized into 1.`
    )
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
    addTurn(
      compactConversationId.value,
      'user',
      `Generate outline for: ${idea.value} (tone: ${tone.value})`
    )
    await sparkStore.generateOutlineAction(
      idea.value,
      tone.value,
      characterNames,
      targetLength.value,
      context
    )
    addTurn(
      compactConversationId.value,
      'assistant',
      `Outline generated: ${sparkStore.currentOutline?.title || 'Untitled'}`
    )
  } catch (error) {
    console.error('Failed to generate outline:', error)
    onAsyncError(error)
  }
}

async function generateContent() {
  const characterNames = storyBibleStore.getCharacterNames()
  try {
    addTurn(
      compactConversationId.value,
      'user',
      `Write content: ${idea.value} (tone: ${tone.value}, length: ${targetLength.value})`
    )
    await sparkStore.generateContentStreamingAction(
      idea.value,
      tone.value,
      characterNames,
      targetLength.value
    )
    addTurn(
      compactConversationId.value,
      'assistant',
      `Content generated (${sparkStore.currentContent?.length || 0} chars)`
    )
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
      <!-- Standalone panel header. Embedded in Story Tools the host owns the
           title and tabs, so only the context control shows. -->
      <div
        class="px-4 pt-4 pb-3 border-b border-border-subtle shrink-0 flex items-start justify-between gap-3"
      >
        <div class="min-w-0 flex-1">
          <h3 v-if="!embedded" class="font-ui text-sm font-semibold text-text-primary mb-2">
            Spark
          </h3>
          <SectionContextSelector ref="contextSelectorRef" panel-id="spark-global" />
        </div>
        <BaseButton
          v-if="!compactIsCompacting && !embedded"
          variant="ghost"
          size="sm"
          icon="minimize-2"
          title="Compact conversation"
          @click="handleCompact"
        >
          Compact
        </BaseButton>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <!-- ── Spark a prompt ─────────────────────────────────────────── -->
        <BaseSection
          first
          title="Spark a prompt"
          description="A seed, a scenario, a what-if or an obstacle — one paragraph from the model to write against."
        >
          <div class="space-y-3">
            <BaseSegmented
              v-model="sparkStore.selectedPromptType"
              :options="promptTypes"
              size="sm"
              block
              aria-label="Prompt type"
            />

            <div class="flex items-center justify-between gap-3">
              <BaseSwitch
                v-model="sparkStore.relateToProject"
                size="sm"
                label="Relate to my project"
              />
              <BaseButton
                variant="primary"
                size="md"
                icon="sparkles"
                :loading="sparkStore.isGenerating"
                :disabled="sparkStore.isGenerating"
                @click="generatePrompt"
              >
                {{ sparkStore.isGenerating ? 'Generating' : 'Generate' }}
              </BaseButton>
            </div>

            <div
              v-if="sparkStore.isGenerating"
              class="rounded-lg p-4 space-y-2.5 animate-pulse bg-surface-hover"
              aria-hidden="true"
            >
              <div class="h-3 bg-bg-tertiary rounded w-3/4"></div>
              <div class="h-3 bg-bg-tertiary rounded w-full"></div>
              <div class="h-3 bg-bg-tertiary rounded w-5/6"></div>
            </div>

            <BaseAlert v-if="sparkStore.error" variant="danger">{{ sparkStore.error }}</BaseAlert>

            <SparkPromptCard
              v-if="currentPrompt"
              :prompt="currentPrompt"
              @insert="insertIntoFlow"
              @regenerate="generatePrompt"
            />

            <p
              v-if="!currentPrompt && !sparkStore.isGenerating && !sparkStore.error"
              class="font-ui text-xs text-text-hint leading-5"
            >
              Nothing yet. A prompt you like can go straight into the editor, or become the seed for
              a whole chapter with
              <span class="text-text-secondary">Use as context</span>.
            </p>
          </div>
        </BaseSection>

        <!-- ── Develop an idea ────────────────────────────────────────── -->
        <BaseSection
          title="Develop an idea"
          description="Write a line, pick its register and length. Spark drafts a blueprint you can expand into prose or hand to the generator."
        >
          <div class="space-y-4">
            <IdeaInput
              v-model:idea="idea"
              v-model:tone="tone"
              v-model:target-length="targetLength"
            />

            <BaseAlert v-if="sparkStore.error" variant="danger">{{ sparkStore.error }}</BaseAlert>

            <div
              v-if="!sparkStore.currentBlueprint && !sparkStore.isGenerating"
              class="flex justify-end"
            >
              <BaseButton
                variant="primary"
                size="md"
                icon="wand-2"
                :disabled="!idea"
                @click="generateOutline"
              >
                Draft blueprint
              </BaseButton>
            </div>

            <div
              v-if="
                sparkStore.isGenerating &&
                !sparkStore.currentBlueprint &&
                !sparkStore.currentStreamingChapter
              "
              class="flex items-center gap-2 py-3 font-ui text-xs text-text-hint"
            >
              <BaseIcon name="loader-2" :size="14" class="animate-spin text-accent" />
              Drafting the blueprint…
            </div>

            <!-- Step 2: The Blueprint -->
            <div
              v-if="sparkStore.currentBlueprint"
              class="space-y-4 pt-4 border-t border-border-subtle"
            >
              <BlueprintResult :blueprint="sparkStore.currentBlueprint" @insert="insertIntoFlow" />

              <div
                v-if="
                  !sparkStore.currentChapter &&
                  !sparkStore.currentStreamingChapter &&
                  !sparkStore.isGenerating
                "
                class="flex justify-end gap-2"
              >
                <BaseButton variant="secondary" size="md" @click="generateContent">
                  Expand to draft
                </BaseButton>
                <BaseButton variant="primary" size="md" @click="emit('useAsContext')">
                  Use as context
                </BaseButton>
              </div>
            </div>

            <!-- Step 3: The Draft -->
            <div
              v-if="sparkStore.currentChapter || sparkStore.currentStreamingChapter"
              class="space-y-4 pt-4 border-t border-border-subtle"
            >
              <div
                v-if="sparkStore.isGenerating"
                class="flex items-center gap-2 font-ui text-xs text-text-hint"
              >
                <BaseIcon name="loader-2" :size="12" class="animate-spin text-accent" /> Drafting…
              </div>
              <div
                class="font-manuscript text-sm text-text-primary whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto scrollbar-thin pr-1"
              >
                {{ sparkStore.currentStreamingChapter || sparkStore.currentChapter }}
              </div>

              <div
                v-if="sparkStore.currentChapter && !sparkStore.isGenerating"
                class="flex justify-end gap-2"
              >
                <BaseButton
                  variant="secondary"
                  size="md"
                  @click="insertIntoFlow(sparkStore.currentChapter)"
                >
                  Insert into editor
                </BaseButton>
                <BaseButton variant="primary" size="md" @click="emit('useAsContext')">
                  Use as context
                </BaseButton>
              </div>
            </div>
          </div>
        </BaseSection>

        <!-- ── History ────────────────────────────────────────────────── -->
        <BaseSection
          title="History"
          :meta="sparkStore.history.length ? `${sparkStore.history.length} saved` : ''"
          dense
        >
          <template v-if="sparkStore.history.length > 0" #actions>
            <BaseButton variant="ghost" size="sm" @click="clearHistory">Clear all</BaseButton>
          </template>

          <p v-if="sparkStore.history.length === 0" class="font-ui text-xs text-text-hint">
            Prompts, blueprints and drafts you generate are kept here.
          </p>

          <ul v-else class="divide-y divide-border-subtle -mx-1">
            <li
              v-for="(item, index) in sparkStore.history"
              :key="index"
              class="group flex items-start gap-3 px-1 py-2.5"
            >
              <span class="label-micro text-text-hint w-16 shrink-0 pt-0.5 truncate">
                {{ item.type }}
              </span>
              <p class="flex-1 min-w-0 font-ui text-sm text-text-secondary line-clamp-2">
                {{ item.prompt }}
              </p>
              <BaseButton
                v-if="item.prompt"
                variant="ghost"
                size="sm"
                icon="corner-down-left"
                title="Insert into editor"
                custom-class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0"
                @click="insertIntoFlow(item.prompt)"
              >
                Insert
              </BaseButton>
            </li>
          </ul>
        </BaseSection>

        <!-- ── Context preview (diagnostic) ───────────────────────────── -->
        <div class="px-4 py-3 border-t border-border-subtle">
          <button
            type="button"
            class="flex items-center gap-1.5 label-micro text-text-hint hover:text-text-secondary transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
            :aria-expanded="showContextPreview"
            @click="toggleContextPreview"
          >
            <BaseIcon
              name="chevron-right"
              :size="12"
              class="transition-transform duration-150"
              :class="showContextPreview ? 'rotate-90' : ''"
            />
            What the AI reads
          </button>
          <div v-if="showContextPreview" class="mt-2">
            <div v-if="contextPreviewLoading" class="font-ui text-xs text-text-hint">Loading…</div>
            <div v-else-if="contextPreview" class="space-y-1">
              <div class="font-ui text-xs text-text-hint">
                {{ contextPreview.sourceDescription }}
              </div>
              <div
                v-for="(line, i) in contextPreview.previewLines"
                :key="i"
                class="flex items-start gap-1.5 text-xs"
              >
                <span class="text-text-hint shrink-0 mt-0.5">•</span>
                <span class="text-text-secondary">
                  <span
                    v-if="line.signal"
                    :class="line.signal === 'accepted' ? 'text-accent' : 'text-text-hint'"
                    >{{ line.signal === 'accepted' ? 'kept' : line.signal }} ·</span
                  >
                  {{ line.summary }}
                </span>
              </div>
              <details class="mt-1">
                <summary
                  class="font-ui text-2xs text-text-hint cursor-pointer hover:text-text-secondary"
                >
                  Full context text
                </summary>
                <pre
                  class="mt-1 p-2 bg-bg-tertiary rounded text-2xs text-text-hint whitespace-pre-wrap max-h-32 overflow-y-auto"
                  >{{ contextPreview.contextText || '(empty)' }}</pre
                >
              </details>
            </div>
            <div v-else class="font-ui text-xs text-text-hint">
              No context loaded for this project
            </div>
          </div>
        </div>
      </div>

      <Modal
        :show="showOpenAISettings"
        aria-label="Configure AI provider"
        @close="showOpenAISettings = false"
      >
        <div class="p-6">
          <h3 class="font-ui text-base font-semibold text-text-primary mb-1">
            Configure AI provider
          </h3>
          <p class="font-ui text-sm text-text-secondary mb-4">
            Ollama is unavailable. Enter an OpenAI API key to use GPT as a fallback.
          </p>
          <input
            v-model="openaiKeyInput"
            type="password"
            placeholder="sk-…"
            autofocus
            class="w-full px-3 py-2 border border-border-subtle rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-accent/50 bg-bg-secondary text-text-primary font-ui"
            @keyup.enter="saveOpenAIKeyLocal"
          />
          <div class="flex justify-end gap-2">
            <BaseButton variant="secondary" size="md" @click="showOpenAISettings = false"
              >Cancel</BaseButton
            >
            <BaseButton
              variant="primary"
              size="md"
              :disabled="!openaiKeyInput.trim()"
              @click="saveOpenAIKeyLocal"
            >
              Save key
            </BaseButton>
          </div>
          <p class="font-ui text-xs text-text-hint mt-3">
            Your API key is stored locally and never sent anywhere except OpenAI.
          </p>
        </div>
      </Modal>
    </div>
  </ErrorBoundary>
</template>
