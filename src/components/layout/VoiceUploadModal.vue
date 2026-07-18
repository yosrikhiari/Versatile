<template>
  <div v-if="isOpen" class="voice-upload-modal">
    <!-- Backdrop -->
    <div class="modal-backdrop" @click="close"></div>

    <!-- Modal -->
    <ErrorBoundary
      fallback-title="Voice Upload Error"
      fallback-description="Failed to load the voice upload modal. Try closing and reopening it."
    >
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="text-xl font-bold text-text-primary">Upload Sample Text</h2>
          <button class="close-btn" @click="close">✕</button>
        </div>

        <div class="modal-body">
          <p class="text-sm text-text-secondary mb-4">
            Paste additional text samples to refine your voice profile. The profile will merge this
            sample with your existing manuscript analysis.
          </p>

          <!-- Textarea -->
          <div class="form-group">
            <label for="sample-text" class="label">Sample Text</label>
            <textarea
              id="sample-text"
              v-model="sampleText"
              placeholder="Paste your sample text here (min 100 words recommended)..."
              class="textarea"
              rows="8"
              @input="updatePreview"
            ></textarea>
            <span class="text-xs text-text-hint mt-1">
              {{ sampleText.split(/\s+/).length }} words
            </span>
          </div>

          <!-- Preview Section -->
          <div v-if="mergedProfile" class="preview-section">
            <h3 class="text-sm font-semibold text-text-primary mb-3">
              Merged Profile Preview
            </h3>

            <div class="preview-grid">
              <div class="preview-stat">
                <span class="label">Avg Sentence Length</span>
                <span class="old-value">{{
                  (currentProfile?.sentenceStructure?.averageSentenceLength || 0).toFixed(1)
                }}</span>
                <span class="arrow">→</span>
                <span class="new-value">{{
                  mergedProfile.sentenceStructure.averageSentenceLength.toFixed(1)
                }}</span>
              </div>

              <div class="preview-stat">
                <span class="label">Dialogue Ratio</span>
                <span class="old-value"
                  >{{
                    ((currentProfile?.sentenceStructure?.dialogueRatio || 0) * 100).toFixed(0)
                  }}%</span
                >
                <span class="arrow">→</span>
                <span class="new-value"
                  >{{ (mergedProfile.sentenceStructure.dialogueRatio * 100).toFixed(0) }}%</span
                >
              </div>

              <div class="preview-stat">
                <span class="label">Unique Word Ratio</span>
                <span class="old-value"
                  >{{
                    ((currentProfile?.vocabulary?.uniqueWordRatio || 0) * 100).toFixed(1)
                  }}%</span
                >
                <span class="arrow">→</span>
                <span class="new-value"
                  >{{ (mergedProfile.vocabulary.uniqueWordRatio * 100).toFixed(1) }}%</span
                >
              </div>

              <div class="preview-stat">
                <span class="label">Confidence</span>
                <span class="old-value"
                  >{{ ((currentProfile?.metadata?.confidence || 0) * 100).toFixed(0) }}%</span
                >
                <span class="arrow">→</span>
                <span class="new-value"
                  >{{ (mergedProfile.metadata.confidence * 100).toFixed(0) }}%</span
                >
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer">
          <button class="btn-secondary" @click="close">Cancel</button>
          <button
            :disabled="!sampleText.trim() || isProcessing || sampleText.split(/\s+/).length < 50"
            class="btn-primary"
            @click="handleMerge"
          >
            {{ isProcessing ? 'Merging...' : 'Merge with Profile' }}
          </button>
        </div>
      </div>
    </ErrorBoundary>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import ErrorBoundary from '../shared/ErrorBoundary.vue'
import { useAsyncError } from '../../composables/useAsyncError'
const { onAsyncError } = useAsyncError()
import { analyzeVoiceProfile } from '@/services/generation/voiceAnalyzer'
import { useVoiceFromManuscript } from '@/composables/useVoiceFromManuscript'
import { useStoryBibleStore } from '@/stores/storyBibleStore'
import { useManuscriptStore } from '@/stores/manuscriptStore'
import { useNotifications } from '@/composables/useNotifications'

defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

const storyBibleStore = useStoryBibleStore()
const manuscriptStore = useManuscriptStore()
const { addSupplementarySample } = useVoiceFromManuscript()
const { addToast } = useNotifications()

const sampleText = ref('')
const mergedProfile = ref(null)
const isProcessing = ref(false)

const currentProfile = computed(() => storyBibleStore.voiceProfile.profile)

function close() {
  sampleText.value = ''
  mergedProfile.value = null
  emit('close')
}

function updatePreview() {
  if (sampleText.value.trim().length < 100) {
    mergedProfile.value = null
    return
  }

  try {
    const manuscript = manuscriptStore.getFullText()
    const allSamples = [manuscript, sampleText.value]
    mergedProfile.value = analyzeVoiceProfile(allSamples)
  } catch (error) {
    console.error('Error updating preview:', error)
    onAsyncError(error)
    mergedProfile.value = null
  }
}

async function handleMerge() {
  if (!sampleText.value.trim() || sampleText.value.split(/\s+/).length < 50) {
    addToast('Please provide at least 50 words of sample text', 'warning')
    return
  }

  try {
    isProcessing.value = true
    await addSupplementarySample(sampleText.value)
    addToast('Voice profile merged with supplementary sample', 'success')
    close()
  } catch (error) {
    console.error('Error merging profile:', error)
    onAsyncError(error)
    addToast('Failed to merge voice profile', 'error')
  } finally {
    isProcessing.value = false
  }
}
</script>

<style scoped>
.voice-upload-modal {
  @apply fixed inset-0 z-50 flex items-center justify-center;
}

.modal-backdrop {
  @apply absolute inset-0 bg-black/50;
}

.modal-content {
  @apply relative bg-bg-secondary border border-border-subtle rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto;
}

.modal-header {
  @apply flex justify-between items-center p-4 border-b border-border-subtle;
}

.close-btn {
  @apply text-2xl font-bold text-text-hint hover:text-text-primary transition;
}

.modal-body {
  @apply p-4 space-y-4;
}

.form-group {
  @apply flex flex-col gap-2;
}

.label {
  @apply text-sm font-medium text-text-secondary;
}

.textarea {
  @apply w-full px-3 py-2 border border-border-subtle rounded-lg
    bg-bg-tertiary text-text-primary
    focus:outline-none focus:ring-2 focus:ring-accent
    resize-none font-mono text-sm;
}

.preview-section {
  @apply bg-bg-tertiary border border-border-subtle p-3 rounded-lg;
}

.preview-grid {
  @apply grid grid-cols-1 sm:grid-cols-2 gap-3;
}

.preview-stat {
  @apply flex flex-col gap-1 text-xs;
}

.preview-stat .label {
  @apply font-medium text-text-secondary;
}

.preview-stat .old-value {
  @apply text-text-hint line-through;
}

.preview-stat .arrow {
  @apply text-accent font-bold;
}

.preview-stat .new-value {
  @apply font-semibold text-accent;
}

.modal-footer {
  @apply flex gap-3 p-4 border-t border-border-subtle;
}

.btn-primary,
.btn-secondary {
  @apply px-4 py-2 rounded-lg font-medium transition flex-1;
}

.btn-primary {
  @apply bg-accent text-bg-primary hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed;
}

.btn-secondary {
  @apply bg-surface-hover text-text-secondary hover:bg-bg-tertiary;
}
</style>
