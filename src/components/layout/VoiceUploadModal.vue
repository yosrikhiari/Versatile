<template>
  <div v-if="isOpen" class="voice-upload-modal">
    <!-- Backdrop -->
    <div class="modal-backdrop" @click="close"></div>

    <!-- Modal -->
    <div class="modal-content">
      <div class="modal-header">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">Upload Sample Text</h2>
        <button class="close-btn" @click="close">✕</button>
      </div>

      <div class="modal-body">
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Paste additional text samples to refine your voice profile. The profile will merge this sample with your existing manuscript analysis.
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
          <span class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {{ sampleText.split(/\s+/).length }} words
          </span>
        </div>

        <!-- Preview Section -->
        <div v-if="mergedProfile" class="preview-section">
          <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">Merged Profile Preview</h3>

          <div class="preview-grid">
            <div class="preview-stat">
              <span class="label">Avg Sentence Length</span>
              <span class="old-value">{{ (currentProfile?.sentenceStructure?.averageSentenceLength || 0).toFixed(1) }}</span>
              <span class="arrow">→</span>
              <span class="new-value">{{ mergedProfile.sentenceStructure.averageSentenceLength.toFixed(1) }}</span>
            </div>

            <div class="preview-stat">
              <span class="label">Dialogue Ratio</span>
              <span class="old-value">{{ ((currentProfile?.sentenceStructure?.dialogueRatio || 0) * 100).toFixed(0) }}%</span>
              <span class="arrow">→</span>
              <span class="new-value">{{ (mergedProfile.sentenceStructure.dialogueRatio * 100).toFixed(0) }}%</span>
            </div>

            <div class="preview-stat">
              <span class="label">Unique Word Ratio</span>
              <span class="old-value">{{ ((currentProfile?.vocabulary?.uniqueWordRatio || 0) * 100).toFixed(1) }}%</span>
              <span class="arrow">→</span>
              <span class="new-value">{{ (mergedProfile.vocabulary.uniqueWordRatio * 100).toFixed(1) }}%</span>
            </div>

            <div class="preview-stat">
              <span class="label">Confidence</span>
              <span class="old-value">{{ ((currentProfile?.metadata?.confidence || 0) * 100).toFixed(0) }}%</span>
              <span class="arrow">→</span>
              <span class="new-value">{{ (mergedProfile.metadata.confidence * 100).toFixed(0) }}%</span>
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
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
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
  @apply relative bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto;
}

.modal-header {
  @apply flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700;
}

.close-btn {
  @apply text-2xl font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition;
}

.modal-body {
  @apply p-4 space-y-4;
}

.form-group {
  @apply flex flex-col gap-2;
}

.label {
  @apply text-sm font-medium text-gray-700 dark:text-gray-300;
}

.textarea {
  @apply w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
    bg-white dark:bg-gray-800 text-gray-900 dark:text-white
    focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400
    resize-none font-mono text-sm;
}

.preview-section {
  @apply bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 p-3 rounded-lg;
}

.preview-grid {
  @apply grid grid-cols-1 sm:grid-cols-2 gap-3;
}

.preview-stat {
  @apply flex flex-col gap-1 text-xs;
}

.preview-stat .label {
  @apply font-medium text-gray-700 dark:text-gray-300;
}

.preview-stat .old-value {
  @apply text-gray-600 dark:text-gray-400 line-through;
}

.preview-stat .arrow {
  @apply text-indigo-600 dark:text-indigo-400 font-bold;
}

.preview-stat .new-value {
  @apply font-semibold text-indigo-700 dark:text-indigo-300;
}

.modal-footer {
  @apply flex gap-3 p-4 border-t border-gray-200 dark:border-gray-700;
}

.btn-primary, .btn-secondary {
  @apply px-4 py-2 rounded-lg font-medium transition flex-1;
}

.btn-primary {
  @apply bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed;
}

.btn-secondary {
  @apply bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white
    hover:bg-gray-300 dark:hover:bg-gray-600;
}
</style>
