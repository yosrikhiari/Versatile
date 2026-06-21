<script setup>
import { ref, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { ollamaGenerate, ollamaEmbeddings, cosineSimilarity } from '../../services/ollamaService'
import ErrorBoundary from '../shared/ErrorBoundary.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import { useAsyncError } from '../../composables/useAsyncError'
const { onAsyncError } = useAsyncError()

const props = defineProps({
  show: Boolean
})

const emit = defineEmits(['close'])

const projectStore = useProjectStore()

const localName = ref('')
const localGenre = ref('')
const localSynopsis = ref('')
const isSaving = ref(false)
const isGeneratingSynopsis = ref(false)
const isEnhancingSynopsis = ref(false)

watch(() => props.show, (show) => {
  if (show) {
    localName.value = projectStore.currentProjectName
    localGenre.value = projectStore.currentCategory
    localSynopsis.value = projectStore.currentDescription
  }
})

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
    
    const finalScore = avgScore + (hasDialogue * 0.1) + (hasAction * 0.05) + lengthBonus
    
    reranked.push({ chunk, score: finalScore })
  }
  
  reranked.sort((a, b) => b.score - a.score)
  return reranked.slice(0, topN).map(r => r.chunk)
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
  const candidates = scored.slice(0, initialCandidates).map(s => s.chunk)
  
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

    const response = await ollamaGenerate(userPrompt, 'You are a skilled editor and story analyst who writes compelling synopses.')
    localSynopsis.value = response.trim()
  } catch (e) {
    console.error('Failed to generate synopsis:', e.message || e)
    onAsyncError(e)
    localSynopsis.value = 'Failed to generate synopsis. Please try again or check Ollama connection.'
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

    const response = await ollamaGenerate(userPrompt, 'You are a professional editor who improves synopses while preserving the original content.')
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
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
        @click="handleOverlayClick"
      >
        <ErrorBoundary
          fallback-title="Settings Error"
          fallback-description="Failed to load project settings. Try reopening the modal."
        >
        <div class="glass-modal rounded-xl shadow-warm-lg w-full max-w-lg mx-4 overflow-hidden animate-scale-in">
          <div class="flex items-center justify-between px-5 py-4 border-b border-border-subtle/50">
            <div class="flex items-center gap-2">
              <BaseIcon name="settings" :size="18" class="text-accent" />
              <h2 class="font-medium text-text-primary font-display tracking-wide">Project Settings</h2>
            </div>
            <button
              class="p-1.5 text-text-hint/50 hover:text-text-primary rounded-lg hover:bg-accent-glass transition-all duration-150 btn-ghost"
              @click="$emit('close')"
            >
              <BaseIcon name="x" :size="18" />
            </button>
          </div>

          <div class="p-5 space-y-5">
            <div>
              <label class="block text-sm font-medium text-text-primary mb-2">
                Project Name
              </label>
              <input
                v-model="localName"
                type="text"
                class="w-full px-3 py-2 bg-bg-tertiary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                placeholder="My novel"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-text-primary mb-2">
                Genre
              </label>
              <textarea
                v-model="localGenre"
                rows="2"
                class="w-full px-3 py-2 bg-bg-tertiary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none placeholder:text-text-hint"
                placeholder="e.g. Fantasy, Adventure, Mystery..."
              ></textarea>
              <p class="mt-1 text-xs text-text-hint">Separate multiple genres with commas.</p>
            </div>

            <div>
              <div class="flex items-center justify-between mb-2">
                <label class="block text-sm font-medium text-text-primary">
                  Synopsis
                </label>
                <div class="flex items-center gap-1.5">
                  <button
                    :disabled="isGeneratingSynopsis || isEnhancingSynopsis || !localSynopsis?.trim()"
                    class="flex items-center gap-1.5 px-2 py-1 text-xs bg-accent/10 text-accent rounded hover:bg-accent/20 transition-colors disabled:opacity-50"
                    @click="handleEnhanceSynopsis"
                  >
                    <BaseIcon v-if="isEnhancingSynopsis" name="loader" :size="12" class="animate-spin" />
                    <BaseIcon v-else name="wand-2" :size="12" />
                    {{ isEnhancingSynopsis ? 'Enhancing...' : 'Enhance' }}
                  </button>
                  <button
                    v-if="projectStore.documentContent?.length > 100"
                    :disabled="isGeneratingSynopsis || isEnhancingSynopsis"
                    class="flex items-center gap-1.5 px-2 py-1 text-xs bg-bg-secondary text-text-secondary rounded hover:bg-surface-hover transition-colors disabled:opacity-50"
                    @click="handleGenerateSynopsis"
                  >
                    <BaseIcon v-if="isGeneratingSynopsis" name="loader" :size="12" class="animate-spin" />
                    <BaseIcon v-else name="sparkles" :size="12" />
                    {{ isGeneratingSynopsis ? 'Generating...' : 'From manuscript' }}
                  </button>
                </div>
              </div>
              <textarea
                v-model="localSynopsis"
                rows="5"
                class="w-full px-3 py-2 bg-bg-tertiary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none placeholder:text-text-hint"
                placeholder="A brief summary of your story..."
              ></textarea>
              <p class="mt-1.5 text-xs text-text-hint">
                This helps AI understand your story's context for suggestions.
              </p>
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 px-5 py-4 bg-bg-tertiary/30 border-t border-border-subtle/30">
            <button
              class="px-4 py-2 text-sm text-text-secondary hover:text-text-primary font-ui transition-colors"
              @click="$emit('close')"
            >
              Cancel
            </button>
            <button
              :disabled="!localName.trim() || isSaving"
              class="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 font-ui flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
