<script setup>
import { ref, watch, computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { ollamaGenerate, ollamaEmbeddings, cosineSimilarity } from '../../services/ollamaService'
import { getDailyGoal, setDailyGoal } from '../../services/dbService'
import ErrorBoundary from '../shared/ErrorBoundary.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import { useAsyncError } from '../../composables/useAsyncError'
const { onAsyncError } = useAsyncError()

const props = defineProps({
  show: Boolean
})

const emit = defineEmits(['close', 'open-ai-settings'])

const projectStore = useProjectStore()
const settingsStore = useSettingsStore()

/**
 * Which model answers for this project, stated where people look for it.
 *
 * Provider choice is global — it belongs to this machine and its keys, not to
 * one story — so it is deliberately NOT editable here. But "am I running
 * locally?" is the first thing you want to know when opening a project's
 * settings, and having to remember it lives in a different modal is how a run
 * silently went to a provider the user had never configured. Read-only status
 * plus a way through: one source of truth, no second place to set it.
 */
const aiSummary = computed(() => {
  if (settingsStore.localOnly) {
    return `Local only — ${settingsStore.ollamaModel || 'Ollama'}`
  }
  return `${settingsStore.aiProvider} (hosted)`
})

function openAiSettings() {
  emit('open-ai-settings')
  emit('close')
}

const localName = ref('')
const localGenre = ref('')
const localSynopsis = ref('')
const localPromptOverrides = ref({ writer: '', critic: '', revisor: '', director: '' })
const isSaving = ref(false)
const isGeneratingSynopsis = ref(false)
const isEnhancingSynopsis = ref(false)
const activeTab = ref('general')
// The daily word goal is stored per project (`getDailyGoal(projectId)`), so it
// belongs with the project's own settings. It used to be the sole occupant of a
// tab in the *global* Settings modal — which both made that tab collapse to a
// single input and left a dead end: the goal bar in the header opens THIS modal,
// which had no goal in it.
const localDailyGoal = ref(500)

watch(
  () => props.show,
  async (show) => {
    if (show) {
      localName.value = projectStore.currentProjectName
      localGenre.value = projectStore.currentCategory
      localSynopsis.value = projectStore.currentDescription
      localPromptOverrides.value = { ...projectStore.promptOverrides }
      activeTab.value = 'general'
      localDailyGoal.value = projectStore.dailyGoal || 500
      if (projectStore.currentProjectId) {
        try {
          const existing = await getDailyGoal(projectStore.currentProjectId)
          if (existing?.goalWords) localDailyGoal.value = existing.goalWords
        } catch (e) {
          console.warn('[ProjectSettingsModal] failed to read daily goal:', e)
        }
      }
    }
  }
)

function chunkText(text, chunkSize = 1000, overlap = 100) {
  const chunks = []
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]

  let currentChunk = ''
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim())
      currentChunk = currentChunk.slice(-overlap) + sentence
    } else {
      currentChunk += sentence
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }
  return chunks
}

async function rerankChunks(chunks, query, topN = 3) {
  const aspectQueries = [
    'main plot story arc narrative',
    'character protagonist antagonist',
    'conflict tension stakes',
    'emotional moments turning point'
  ]

  const reranked = []

  for (const chunk of chunks) {
    const scores = []

    for (const aspect of aspectQueries) {
      try {
        const aspectEmb = await ollamaEmbeddings(aspect)
        const chunkEmb = await ollamaEmbeddings(chunk)
        const similarity = cosineSimilarity(aspectEmb, chunkEmb)
        scores.push(similarity)
      } catch {
        scores.push(0)
      }
    }

    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length

    const hasDialogue = chunk.includes('"') || chunk.includes("'") ? 1 : 0
    const hasAction = /\b(ran|walked|looked|saw|heard|felt|thought)\b/i.test(chunk) ? 0.5 : 0
    const lengthBonus = Math.min(chunk.length / 500, 1) * 0.2

    const finalScore = avgScore + hasDialogue * 0.1 + hasAction * 0.05 + lengthBonus

    reranked.push({ chunk, score: finalScore })
  }

  reranked.sort((a, b) => b.score - a.score)
  return reranked.slice(0, topN).map((r) => r.chunk)
}

async function findRelevantChunks(content, topN = 3) {
  const chunks = chunkText(content, 800, 50)

  const query = 'main plot characters conflict story stakes resolution'
  const queryEmb = await ollamaEmbeddings(query)

  const initialCandidates = Math.min(10, chunks.length)
  const scored = []

  for (const chunk of chunks) {
    try {
      const chunkEmb = await ollamaEmbeddings(chunk)
      const similarity = cosineSimilarity(queryEmb, chunkEmb)
      scored.push({ chunk, similarity })
    } catch {
      scored.push({ chunk, similarity: 0 })
    }
  }

  scored.sort((a, b) => b.similarity - a.similarity)
  const candidates = scored.slice(0, initialCandidates).map((s) => s.chunk)

  const rerankedChunks = await rerankChunks(candidates, query, topN)

  return rerankedChunks
}

async function handleGenerateSynopsis() {
  const documentContent = projectStore.documentContent

  if (!documentContent || documentContent.trim().length < 100) {
    return
  }

  isGeneratingSynopsis.value = true

  try {
    const relevantChunks = await findRelevantChunks(documentContent, 3)

    const contextText = relevantChunks.join('\n\n')

    const userPrompt = `Based on these manuscript excerpts, write a compelling 2-3 paragraph synopsis that summarizes the main plot, key characters, and central conflict.

Excerpts:
"""
${contextText}
"""

Write a clear, engaging synopsis that could hook a reader or serve as a blurb.`

    const response = await ollamaGenerate(
      userPrompt,
      'You are a skilled editor and story analyst who writes compelling synopses.'
    )
    localSynopsis.value = response.trim()
  } catch (e) {
    console.error('Failed to generate synopsis:', e.message || e)
    onAsyncError(e)
    localSynopsis.value =
      'Failed to generate synopsis. Please try again or check Ollama connection.'
  } finally {
    isGeneratingSynopsis.value = false
  }
}

async function handleEnhanceSynopsis() {
  const currentSynopsis = localSynopsis.value?.trim()
  const documentContent = projectStore.documentContent

  if (!currentSynopsis || currentSynopsis.length < 10) {
    return
  }

  isEnhancingSynopsis.value = true

  try {
    let contextText = ''
    if (documentContent && documentContent.trim().length >= 100) {
      const relevantChunks = await findRelevantChunks(documentContent, 2)
      contextText = relevantChunks.join('\n\n')
    }

    const contextSection = contextText
      ? `\n\nManuscript excerpts for additional context:\n"""\n${contextText}\n"""`
      : ''

    const userPrompt = `You are improving an existing story synopsis. Keep all the core elements and key details intact, but make the writing more compelling, polished, and engaging.

Current synopsis:
"""
${currentSynopsis}
"""${contextSection}

Improve this synopsis by:
1. Enhancing the prose to be more vivid and engaging
2. Improving the flow and structure
3. Keeping all existing plot points, characters, and setting details intact
4. Making it sound professional and hook-like

Return ONLY the improved synopsis text, no preamble or explanation.`

    const response = await ollamaGenerate(
      userPrompt,
      'You are a professional editor who improves synopses while preserving the original content.'
    )
    localSynopsis.value = response.trim()
  } catch (e) {
    console.error('Failed to enhance synopsis:', e.message || e)
    onAsyncError(e)
  } finally {
    isEnhancingSynopsis.value = false
  }
}

async function handleSave() {
  if (!localName.value.trim()) return

  isSaving.value = true
  try {
    await projectStore.updateProjectInfo({
      name: localName.value.trim(),
      category: localGenre.value,
      description: localSynopsis.value.trim()
    })
    await projectStore.savePromptOverrides(localPromptOverrides.value)

    const goal = parseInt(localDailyGoal.value, 10)
    if (projectStore.currentProjectId && goal > 0) {
      await setDailyGoal(projectStore.currentProjectId, goal)
      projectStore.setDailyGoal(goal)
    }

    emit('close')
  } catch (e) {
    console.error('Failed to save project settings:', e)
    onAsyncError(e)
  } finally {
    isSaving.value = false
  }
}

function handleOverlayClick(event) {
  if (event.target === event.currentTarget) {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
        @click="handleOverlayClick"
      >
        <ErrorBoundary
          fallback-title="Settings Error"
          fallback-description="Failed to load project settings. Try reopening the modal."
        >
          <!--
            Capped to the viewport, with the body as the only scrolling region.
            Without the cap the panel grew to fit its content: the Prompts tab's
            four textareas made it taller than the window, so the footer — and
            with it Save Changes — was pushed off-screen entirely and the tab
            could not be completed at all.
          -->
          <div
            class="glass-modal rounded-xl shadow-warm-lg w-full max-w-lg mx-4 max-h-[90vh] flex flex-col overflow-hidden animate-scale-in"
          >
            <div
              class="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border-subtle"
            >
              <div class="flex items-center gap-2">
                <BaseIcon name="settings" :size="18" class="text-accent" />
                <h2 class="font-medium text-text-primary font-ui tracking-wide">
                  Project Settings
                </h2>
              </div>
              <button
                class="p-1.5 text-text-hint hover:text-text-primary rounded-lg hover:bg-surface-hover transition-all duration-150 btn-ghost"
                @click="$emit('close')"
              >
                <BaseIcon name="x" :size="18" />
              </button>
            </div>

            <div class="shrink-0 flex border-b border-border-subtle px-5">
              <button
                class="px-4 py-3 text-sm font-ui border-b-2 transition-colors"
                :class="
                  activeTab === 'general'
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                "
                @click="activeTab = 'general'"
              >
                General
              </button>
              <button
                class="px-4 py-3 text-sm font-ui border-b-2 transition-colors"
                :class="
                  activeTab === 'prompts'
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                "
                @click="activeTab = 'prompts'"
              >
                Prompts
              </button>
            </div>

            <div
              v-if="activeTab === 'general'"
              class="flex-1 min-h-0 overflow-y-auto p-5 space-y-5"
            >
              <!-- Where the AI for this project runs. Status, not a control. -->
              <button
                class="w-full flex items-center gap-2 px-3 py-2 text-left border border-border-subtle rounded-lg hover:bg-surface-hover transition-colors focus:outline-none focus:ring-1 focus:ring-accent"
                @click="openAiSettings"
              >
                <BaseIcon
                  :name="settingsStore.localOnly ? 'hard-drive' : 'cloud'"
                  :size="15"
                  class="text-accent shrink-0"
                />
                <span class="min-w-0 flex-1">
                  <span class="block text-xs text-text-primary">AI provider · {{ aiSummary }}</span>
                  <span class="block text-2xs text-text-hint">
                    Set for all projects — open AI settings to change it
                  </span>
                </span>
                <BaseIcon name="chevron-right" :size="14" class="text-text-hint shrink-0" />
              </button>

              <div>
                <label class="block text-sm font-medium text-text-primary mb-2">
                  Project Name
                </label>
                <input
                  v-model="localName"
                  type="text"
                  class="w-full px-3 py-2 bg-bg-tertiary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="My novel"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-text-primary mb-2"> Genre </label>
                <textarea
                  v-model="localGenre"
                  rows="2"
                  class="w-full px-3 py-2 bg-bg-tertiary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent resize-none placeholder:text-text-hint"
                  placeholder="e.g. Fantasy, Adventure, Mystery..."
                ></textarea>
                <p class="mt-1 text-xs text-text-hint">Separate multiple genres with commas.</p>
              </div>

              <!--
                Moved here from the global Settings modal, where it was the only
                thing on its own tab. The goal is stored per project, and the
                progress bar in the header already opens this modal — so this is
                where someone looking for it actually arrives.
              -->
              <div>
                <label for="daily-goal" class="block text-sm font-medium text-text-primary mb-2">
                  Daily Word Goal
                </label>
                <input
                  id="daily-goal"
                  v-model.number="localDailyGoal"
                  type="number"
                  min="1"
                  step="50"
                  class="w-full px-3 py-2 bg-bg-tertiary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <p class="mt-1 text-xs text-text-hint">
                  Drives the progress bar in the toolbar and your writing streak.
                </p>
              </div>

              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="block text-sm font-medium text-text-primary"> Synopsis </label>
                  <div class="flex items-center gap-1.5">
                    <button
                      :disabled="
                        isGeneratingSynopsis || isEnhancingSynopsis || !localSynopsis?.trim()
                      "
                      class="flex items-center gap-1.5 px-2 py-1 text-xs bg-surface-hover text-accent rounded hover:bg-bg-secondary transition-colors disabled:opacity-50"
                      @click="handleEnhanceSynopsis"
                    >
                      <BaseIcon
                        v-if="isEnhancingSynopsis"
                        name="loader"
                        :size="12"
                        class="animate-spin"
                      />
                      <BaseIcon v-else name="wand-2" :size="12" />
                      {{ isEnhancingSynopsis ? 'Enhancing...' : 'Enhance' }}
                    </button>
                    <button
                      v-if="projectStore.documentContent?.length > 100"
                      :disabled="isGeneratingSynopsis || isEnhancingSynopsis"
                      class="flex items-center gap-1.5 px-2 py-1 text-xs bg-bg-secondary text-text-secondary rounded hover:bg-surface-hover transition-colors disabled:opacity-50"
                      @click="handleGenerateSynopsis"
                    >
                      <BaseIcon
                        v-if="isGeneratingSynopsis"
                        name="loader"
                        :size="12"
                        class="animate-spin"
                      />
                      <BaseIcon v-else name="sparkles" :size="12" />
                      {{ isGeneratingSynopsis ? 'Generating...' : 'From manuscript' }}
                    </button>
                  </div>
                </div>
                <textarea
                  v-model="localSynopsis"
                  rows="5"
                  class="w-full px-3 py-2 bg-bg-tertiary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent resize-none placeholder:text-text-hint"
                  placeholder="A brief summary of your story..."
                ></textarea>
                <p class="mt-1.5 text-xs text-text-hint">
                  This helps AI understand your story's context for suggestions.
                </p>
              </div>
            </div>

            <div v-else class="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
              <div v-for="role in ['writer', 'critic', 'revisor', 'director']" :key="role">
                <label class="block text-sm font-medium text-text-primary mb-2 capitalize">
                  {{ role }} Prompt
                  <button
                    class="ml-2 text-xs text-text-hint hover:text-accent transition-colors"
                    title="Reset to default"
                    @click="localPromptOverrides[role] = ''"
                  >
                    (reset)
                  </button>
                </label>
                <textarea
                  v-model="localPromptOverrides[role]"
                  rows="6"
                  class="w-full px-3 py-2 bg-bg-tertiary border border-border-subtle rounded-lg text-sm font-mono text-text-primary focus:outline-none focus:ring-2 focus:ring-accent resize-none placeholder:text-text-hint"
                  placeholder="Leave empty to use the workspace default prompt for this role."
                ></textarea>
              </div>
              <p class="text-xs text-text-hint">
                Custom prompts override the default system prompt for each AI role. Leave a field
                empty to use the workspace-type default.
              </p>
            </div>

            <div
              class="shrink-0 flex items-center justify-end gap-3 px-5 py-4 bg-bg-tertiary border-t border-border-subtle"
            >
              <button
                class="px-4 py-2 text-sm text-text-secondary hover:text-text-primary font-ui transition-colors"
                @click="$emit('close')"
              >
                Cancel
              </button>
              <button
                :disabled="!localName.trim() || isSaving"
                class="px-4 py-2 text-sm btn-primary rounded-lg font-ui flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                @click="handleSave"
              >
                {{ isSaving ? 'Saving...' : 'Save Changes' }}
              </button>
            </div>
          </div>
        </ErrorBoundary>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from > div,
.modal-leave-to > div {
  transform: scale(0.95);
}
</style>
