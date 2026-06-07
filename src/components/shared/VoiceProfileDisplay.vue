<template>
  <div class="voice-profile-display">
    <!-- Header -->
    <div class="profile-header">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Writing Voice Profile</h3>
      <div class="header-actions">
        <button
          v-if="profile && !isLocked"
          @click="handleRefresh"
          class="btn-secondary text-sm"
          :disabled="isRefreshing"
        >
          {{ isRefreshing ? 'Refreshing...' : 'Refresh from Manuscript' }}
        </button>
        <button
          @click="toggleLock"
          class="btn-secondary text-sm"
        >
          {{ isLocked ? '🔒 Locked' : '🔓 Unlocked' }}
        </button>
      </div>
    </div>

    <!-- Profile Not Extracted -->
    <div v-if="!profile" class="empty-state">
      <div class="empty-icon">📝</div>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Voice profile not extracted yet. Write at least 500 words in your manuscript to generate a profile.
      </p>
      <button @click="handleExtract" class="btn-primary text-sm mt-4">
        Extract Profile
      </button>
    </div>

    <!-- Profile Exists -->
    <div v-else class="profile-content">
      <!-- Growth Warning -->
      <div v-if="growthWarning" class="growth-warning">
        <span class="warning-icon">⚠️</span>
        <div class="warning-text">
          <p class="font-medium text-sm">Profile Size Mismatch</p>
          <p class="text-xs text-gray-600 dark:text-gray-400">
            {{ growthWarning }}
          </p>
        </div>
      </div>

      <!-- Metadata -->
      <div class="metadata-row">
        <div class="metadata-item">
          <span class="label">Confidence</span>
          <div class="confidence-bar">
            <div
              class="confidence-fill"
              :style="{ width: (profile.metadata.confidence * 100) + '%' }"
            ></div>
          </div>
          <span class="value">{{ (profile.metadata.confidence * 100).toFixed(0) }}%</span>
        </div>
        <div class="metadata-item">
          <span class="label">Sample Size</span>
          <span class="value">{{ profile.metadata.totalSentences }} sentences</span>
        </div>
        <div class="metadata-item">
          <span class="label">Consistency</span>
          <span class="value">{{ (profile.metadata.consistency * 100).toFixed(0) }}%</span>
        </div>
      </div>

      <!-- Vocabulary Stats -->
      <div class="metric-card">
        <h4 class="metric-title">📚 Vocabulary</h4>
        <div class="metric-grid">
          <div class="stat">
            <span class="label">Unique Words</span>
            <span class="value">{{ profile.vocabulary.uniqueWords }}</span>
          </div>
          <div class="stat">
            <span class="label">Unique Ratio</span>
            <span class="value">{{ (profile.vocabulary.uniqueWordRatio * 100).toFixed(1) }}%</span>
          </div>
          <div class="stat">
            <span class="label">Avg Word Length</span>
            <span class="value">{{ profile.vocabulary.averageWordLength.toFixed(1) }} chars</span>
          </div>
          <div class="stat">
            <span class="label">Total Words</span>
            <span class="value">{{ profile.vocabulary.totalWords }}</span>
          </div>
        </div>
        <div v-if="profile.vocabulary.mostCommonWords.length" class="common-words">
          <span class="label">Top Words:</span>
          <div class="word-list">
            <span v-for="word in profile.vocabulary.mostCommonWords.slice(0, 10)" :key="word" class="word-tag">
              {{ word }}
            </span>
          </div>
        </div>
      </div>

      <!-- Sentence Structure -->
      <div class="metric-card">
        <h4 class="metric-title">📊 Sentence Structure</h4>
        <div class="metric-grid">
          <div class="stat">
            <span class="label">Avg Sentence Length</span>
            <span class="value">{{ profile.sentenceStructure.averageSentenceLength.toFixed(1) }} words</span>
          </div>
          <div class="stat">
            <span class="label">Dialogue Ratio</span>
            <span class="value">{{ (profile.sentenceStructure.dialogueRatio * 100).toFixed(0) }}%</span>
          </div>
          <div class="stat">
            <span class="label">Has Dialogue</span>
            <span class="value">{{ profile.sentenceStructure.hasDialogue ? '✓ Yes' : '✗ No' }}</span>
          </div>
        </div>
        <div v-if="profile.sentenceStructure.sentenceLengthDistribution" class="distribution">
          <span class="label">Sentence Length Distribution:</span>
          <div class="dist-bars">
            <div
              v-for="dist in profile.sentenceStructure.sentenceLengthDistribution"
              :key="dist.range"
              class="dist-bar"
            >
              <span class="dist-range">{{ dist.range }}</span>
              <div class="bar-container">
                <div class="bar-fill" :style="{ width: (dist.percentage * 100) + '%' }"></div>
              </div>
              <span class="dist-pct">{{ (dist.percentage * 100).toFixed(0) }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Punctuation -->
      <div class="metric-card">
        <h4 class="metric-title">✏️ Punctuation Frequency</h4>
        <div class="metric-grid">
          <div class="stat">
            <span class="label">Ellipsis</span>
            <span class="value">{{ (profile.punctuation.ellipsisFrequency * 100).toFixed(1) }}%</span>
          </div>
          <div class="stat">
            <span class="label">Dashes</span>
            <span class="value">{{ (profile.punctuation.dashFrequency * 100).toFixed(1) }}%</span>
          </div>
          <div class="stat">
            <span class="label">Exclamation</span>
            <span class="value">{{ (profile.punctuation.exclamationFrequency * 100).toFixed(1) }}%</span>
          </div>
          <div class="stat">
            <span class="label">Semicolon</span>
            <span class="value">{{ (profile.punctuation.semicolonFrequency * 100).toFixed(1) }}%</span>
          </div>
          <div class="stat">
            <span class="label">Comma</span>
            <span class="value">{{ (profile.punctuation.commaFrequency * 100).toFixed(1) }}%</span>
          </div>
        </div>
      </div>

      <!-- Pacing -->
      <div class="metric-card">
        <h4 class="metric-title">⚡ Pacing & Paragraphs</h4>
        <div class="metric-grid">
          <div class="stat">
            <span class="label">Avg Paragraph Length</span>
            <span class="value">{{ profile.pacing.averageParagraphLength.toFixed(0) }} words</span>
          </div>
          <div class="stat">
            <span class="label">Avg Line Breaks</span>
            <span class="value">{{ profile.pacing.averageLineBreaks.toFixed(1) }}</span>
          </div>
        </div>
      </div>

      <!-- Last Updated -->
      <div class="profile-footer">
        <span class="text-xs text-gray-500 dark:text-gray-400">
          Last updated: {{ formatDate(storyBibleStore.voiceProfile.lastUpdated) }}
        </span>
        <span v-if="storyBibleStore.voiceProfile.supplementaryMergeCount" class="text-xs text-gray-500 dark:text-gray-400">
          • {{ storyBibleStore.voiceProfile.supplementaryMergeCount }} supplementary sample(s) merged
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useStoryBibleStore } from '@/stores/storyBibleStore'
import { useVoiceFromManuscript } from '@/composables/useVoiceFromManuscript'
import { useManuscriptStore } from '@/stores/manuscriptStore'
import { useNotifications } from '@/composables/useNotifications'

const storyBibleStore = useStoryBibleStore()
const manuscriptStore = useManuscriptStore()
const { addToast } = useNotifications()
const { extractVoiceProfile, refreshVoiceProfile, toggleProfileLock } = useVoiceFromManuscript()

const isRefreshing = ref(false)

const profile = computed(() => storyBibleStore.voiceProfile.profile)
const isLocked = computed(() => storyBibleStore.voiceProfile.locked)

const growthWarning = computed(() => {
  if (!profile.value || !isLocked.value) return null

  const current = manuscriptStore.getFullText().length
  const extracted = storyBibleStore.voiceProfile.manuscriptSizeAtExtraction

  if (!extracted || current <= extracted * 3) return null

  const ratio = (current / extracted).toFixed(1)
  return `Profile locked when manuscript was ${(extracted / 1000).toFixed(1)}K characters, now ${(current / 1000).toFixed(1)}K characters (${ratio}x growth). Consider refreshing.`
})

async function handleExtract() {
  try {
    isRefreshing.value = true
    await extractVoiceProfile()
      addToast('Voice profile extracted from manuscript', 'success')
    } catch (error) {
      console.error('Error extracting profile:', error)
      addToast('Failed to extract voice profile', 'error')
  } finally {
    isRefreshing.value = false
  }
}

async function handleRefresh() {
  try {
    isRefreshing.value = true
    await refreshVoiceProfile()
      addToast('Voice profile refreshed', 'success')
    } catch (error) {
      console.error('Error refreshing profile:', error)
      addToast('Failed to refresh voice profile', 'error')
  } finally {
    isRefreshing.value = false
  }
}

function toggleLock() {
  toggleProfileLock()
}

function formatDate(date) {
  if (!date) return 'Never'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
.voice-profile-display {
  @apply space-y-4;
}

.profile-header {
  @apply flex justify-between items-center;
}

.header-actions {
  @apply flex gap-2;
}

.btn-primary, .btn-secondary {
  @apply px-3 py-2 rounded-lg font-medium transition;
}

.btn-primary {
  @apply bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50;
}

.btn-secondary {
  @apply bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50;
}

.empty-state {
  @apply text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg;
}

.empty-icon {
  @apply text-4xl mb-2;
}

.growth-warning {
  @apply flex gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg;
}

.warning-icon {
  @apply text-lg flex-shrink-0;
}

.warning-text {
  @apply text-left;
}

.metadata-row {
  @apply grid grid-cols-3 gap-4;
}

.metadata-item {
  @apply flex flex-col gap-1;
}

.metadata-item .label {
  @apply text-xs font-medium text-gray-600 dark:text-gray-400;
}

.metadata-item .value {
  @apply text-sm font-semibold text-gray-900 dark:text-white;
}

.confidence-bar {
  @apply h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden;
}

.confidence-fill {
  @apply h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-300;
}

.metric-card {
  @apply bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-3;
}

.metric-title {
  @apply font-semibold text-gray-900 dark:text-white text-sm;
}

.metric-grid {
  @apply grid grid-cols-2 sm:grid-cols-4 gap-3;
}

.stat {
  @apply flex flex-col gap-1;
}

.stat .label {
  @apply text-xs font-medium text-gray-600 dark:text-gray-400;
}

.stat .value {
  @apply text-sm font-semibold text-indigo-600 dark:text-indigo-400;
}

.common-words {
  @apply flex flex-col gap-2;
}

.common-words .label {
  @apply text-xs font-medium text-gray-600 dark:text-gray-400;
}

.word-list {
  @apply flex flex-wrap gap-2;
}

.word-tag {
  @apply inline-block px-2 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 text-xs rounded-full;
}

.distribution {
  @apply flex flex-col gap-2;
}

.distribution .label {
  @apply text-xs font-medium text-gray-600 dark:text-gray-400;
}

.dist-bars {
  @apply space-y-2;
}

.dist-bar {
  @apply flex items-center gap-2 text-xs;
}

.dist-range {
  @apply w-12 flex-shrink-0 font-medium text-gray-700 dark:text-gray-300;
}

.bar-container {
  @apply flex-1 h-6 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden;
}

.bar-fill {
  @apply h-full bg-indigo-500 transition-all duration-300;
}

.dist-pct {
  @apply w-12 text-right text-gray-600 dark:text-gray-400;
}

.profile-footer {
  @apply flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700;
}
</style>
