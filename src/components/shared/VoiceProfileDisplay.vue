<template>
  <div class="voice-profile-display">
    <!-- Header -->
    <div class="profile-header">
      <h3 class="text-lg font-semibold text-text-primary">Writing Voice Profile</h3>
      <div class="header-actions">
        <button
          v-if="profile && !isLocked"
          class="btn-secondary text-sm"
          :disabled="isRefreshing"
          @click="handleRefresh"
        >
          {{ isRefreshing ? 'Refreshing...' : 'Refresh from Manuscript' }}
        </button>
        <button class="btn-secondary text-sm" @click="toggleLock">
          {{ isLocked ? '🔒 Locked' : '🔓 Unlocked' }}
        </button>
      </div>
    </div>

    <!-- Profile Not Extracted -->
    <div v-if="!profile" class="empty-state">
      <div class="empty-icon">📝</div>
      <p class="text-sm text-text-secondary">
        Voice profile not extracted yet. Write at least 500 words in your manuscript to generate a
        profile.
      </p>
      <button class="btn-primary text-sm mt-4" @click="handleExtract">Extract Profile</button>
    </div>

    <!-- Profile Exists -->
    <div v-else class="profile-content">
      <!-- Growth Warning -->
      <div v-if="growthWarning" class="growth-warning">
        <span class="warning-icon">⚠️</span>
        <div class="warning-text">
          <p class="font-medium text-sm">Profile Size Mismatch</p>
          <p class="text-xs text-text-secondary">
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
              :style="{ width: profile.metadata.confidence * 100 + '%' }"
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
            <span
              v-for="word in profile.vocabulary.mostCommonWords.slice(0, 10)"
              :key="word"
              class="word-tag"
            >
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
            <span class="value"
              >{{ profile.sentenceStructure.averageSentenceLength.toFixed(1) }} words</span
            >
          </div>
          <div class="stat">
            <span class="label">Dialogue Ratio</span>
            <span class="value"
              >{{ (profile.sentenceStructure.dialogueRatio * 100).toFixed(0) }}%</span
            >
          </div>
          <div class="stat">
            <span class="label">Has Dialogue</span>
            <span class="value">{{
              profile.sentenceStructure.hasDialogue ? '✓ Yes' : '✗ No'
            }}</span>
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
                <div class="bar-fill" :style="{ width: dist.percentage * 100 + '%' }"></div>
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
            <span class="value"
              >{{ (profile.punctuation.ellipsisFrequency * 100).toFixed(1) }}%</span
            >
          </div>
          <div class="stat">
            <span class="label">Dashes</span>
            <span class="value">{{ (profile.punctuation.dashFrequency * 100).toFixed(1) }}%</span>
          </div>
          <div class="stat">
            <span class="label">Exclamation</span>
            <span class="value"
              >{{ (profile.punctuation.exclamationFrequency * 100).toFixed(1) }}%</span
            >
          </div>
          <div class="stat">
            <span class="label">Semicolon</span>
            <span class="value"
              >{{ (profile.punctuation.semicolonFrequency * 100).toFixed(1) }}%</span
            >
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
        <span class="text-xs text-text-hint">
          Last updated: {{ formatDate(storyBibleStore.voiceProfile.lastUpdated) }}
        </span>
        <span
          v-if="storyBibleStore.voiceProfile.supplementaryMergeCount"
          class="text-xs text-text-hint"
        >
          • {{ storyBibleStore.voiceProfile.supplementaryMergeCount }} supplementary sample(s)
          merged
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

.btn-primary,
.btn-secondary {
  @apply px-3 py-2 rounded-lg font-medium transition;
}

.btn-primary {
  @apply bg-accent text-bg-primary hover:bg-accent-hover disabled:opacity-50;
}

.btn-secondary {
  @apply bg-surface-hover text-text-secondary hover:bg-bg-tertiary disabled:opacity-50;
}

.empty-state {
  @apply text-center py-8 bg-bg-tertiary rounded-lg;
}

.empty-icon {
  @apply text-4xl mb-2;
}

.growth-warning {
  @apply flex gap-3 p-3 bg-bg-tertiary border border-border-subtle rounded-lg;
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
  @apply text-xs font-medium text-text-secondary;
}

.metadata-item .value {
  @apply text-sm font-semibold text-text-primary;
}

.confidence-bar {
  @apply h-2 bg-bg-tertiary rounded-full overflow-hidden;
}

.confidence-fill {
  @apply h-full bg-success transition-all duration-300;
}

.metric-card {
  @apply bg-bg-tertiary p-4 rounded-lg space-y-3;
}

.metric-title {
  @apply font-semibold text-text-primary text-sm;
}

.metric-grid {
  @apply grid grid-cols-2 sm:grid-cols-4 gap-3;
}

.stat {
  @apply flex flex-col gap-1;
}

.stat .label {
  @apply text-xs font-medium text-text-secondary;
}

.stat .value {
  @apply text-sm font-semibold text-accent;
}

.common-words {
  @apply flex flex-col gap-2;
}

.common-words .label {
  @apply text-xs font-medium text-text-secondary;
}

.word-list {
  @apply flex flex-wrap gap-2;
}

.word-tag {
  @apply inline-block px-2 py-1 bg-bg-secondary text-accent text-xs rounded-full;
}

.distribution {
  @apply flex flex-col gap-2;
}

.distribution .label {
  @apply text-xs font-medium text-text-secondary;
}

.dist-bars {
  @apply space-y-2;
}

.dist-bar {
  @apply flex items-center gap-2 text-xs;
}

.dist-range {
  @apply w-12 flex-shrink-0 font-medium text-text-secondary;
}

.bar-container {
  @apply flex-1 h-6 bg-bg-tertiary rounded overflow-hidden;
}

.bar-fill {
  @apply h-full bg-accent transition-all duration-300;
}

.dist-pct {
  @apply w-12 text-right text-text-hint;
}

.profile-footer {
  @apply flex flex-wrap gap-2 text-xs text-text-hint pt-2 border-t border-border-subtle;
}
</style>
