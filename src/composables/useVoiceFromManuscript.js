/**
 * useVoiceFromManuscript Composable
 *
 * Owns all logic for extracting voice profiles from manuscript text.
 * Handles both initial extraction and supplementary sample merging.
 *
 * Deliberately lives in composables (not store) to:
 * - Avoid circular Pinia dependencies (has access to both manuscriptStore and storyBibleStore)
 * - Keep business logic separate from state mutations
 * - Own the merge logic entirely
 */

import { analyzeVoiceProfile } from '@/services/generation/voiceAnalyzer'
import { useManuscriptStore } from '@/stores/manuscriptStore'
import { useStoryBibleStore } from '@/stores/storyBibleStore'
import { useNotifications } from '@/composables/useNotifications'

export const useVoiceFromManuscript = () => {
  const manuscriptStore = useManuscriptStore()
  const storyBibleStore = useStoryBibleStore()
  const { addToast } = useNotifications()

  /**
   * Extract voice profile from current manuscript
   * @returns {Promise<Object|null>} Extracted profile or null if too short
   */
  const extractVoiceProfile = async () => {
    try {
      const manuscript = manuscriptStore.getFullText()

      if (!manuscript || manuscript.length === 0) {
        addToast(
          'No manuscript text found. Write some prose to extract your voice profile.',
          'info'
        )
        return null
      }

      const profile = analyzeVoiceProfile([manuscript])

      if (!profile) {
        addToast(
          'Manuscript too short for voice extraction (minimum 500 words). Keep writing to build your profile.',
          'warning'
        )
        return null
      }

      // Record manuscript size for later validation
      profile.manuscriptSizeAtExtraction = manuscript.length

      // Save to store
      storyBibleStore.setVoiceProfile(profile)

      addToast(
        `Voice profile extracted from ${profile.metadata.totalWords} words (confidence: ${(profile.metadata.confidence * 100).toFixed(0)}%)`,
        'success'
      )

      return profile
    } catch (error) {
      console.error('Error extracting voice profile:', error)
      addToast('Failed to extract voice profile. Check console for details.', 'error')
      return null
    }
  }

  /**
   * Add supplementary text sample and merge with manuscript
   * This logic lives here (not in store) to avoid store-calling-store
   * @param {string} sampleText - Additional text to merge into profile
   * @returns {Promise<Object|null>} Updated merged profile
   */
  const addSupplementarySample = async (sampleText) => {
    try {
      if (!sampleText || sampleText.trim().length === 0) {
        addToast('Sample text is empty. Please provide text to merge.', 'warning')
        return null
      }

      const manuscript = manuscriptStore.getFullText()

      if (!manuscript) {
        addToast('No manuscript text found. Add text to your manuscript first.', 'warning')
        return null
      }

      // Combine manuscript + supplementary sample
      const allSamples = [manuscript, sampleText]
      const mergedProfile = analyzeVoiceProfile(allSamples)

      if (!mergedProfile) {
        addToast('Combined text too short for profile (minimum 500 words).', 'warning')
        return null
      }

      // Preserve extraction metadata
      mergedProfile.manuscriptSizeAtExtraction =
        storyBibleStore.voiceProfile?.manuscriptSizeAtExtraction || manuscript.length

      // Increment merge counter
      mergedProfile.supplementaryMergeCount =
        (storyBibleStore.voiceProfile?.supplementaryMergeCount || 0) + 1

      // Save to store
      storyBibleStore.setVoiceProfile(mergedProfile)

      addToast(
        `Profile updated (merge #${mergedProfile.supplementaryMergeCount}). New confidence: ${(mergedProfile.metadata.confidence * 100).toFixed(0)}%`,
        'success'
      )

      return mergedProfile
    } catch (error) {
      console.error('Error merging supplementary sample:', error)
      addToast('Failed to merge sample. Check console for details.', 'error')
      return null
    }
  }

  /**
   * Refresh profile from current manuscript state
   * Respects the locked flag - only refreshes if unlocked
   * @returns {Promise<Object|null>}
   */
  const refreshVoiceProfile = async () => {
    try {
      const voiceState = storyBibleStore.voiceProfile

      if (voiceState?.locked) {
        addToast('Voice profile is locked. Unlock to refresh from manuscript.', 'info')
        return null
      }

      return await extractVoiceProfile()
    } catch (error) {
      console.error('Error refreshing voice profile:', error)
      addToast('Failed to refresh voice profile.', 'error')
      return null
    }
  }

  /**
   * Check if manuscript has grown significantly since profile was locked
   * Returns warning message or null if no warning
   * @returns {string|null}
   */
  const getLockedProfileWarning = () => {
    const voiceState = storyBibleStore.voiceProfile

    if (!voiceState?.locked || !voiceState?.profile) {
      return null
    }

    const lockedSize = voiceState.manuscriptSizeAtExtraction
    const currentSize = manuscriptStore.getFullText().length

    if (!lockedSize || !currentSize) {
      return null
    }

    const growthMultiple = currentSize / lockedSize

    // Warn if manuscript >3x size of locked profile
    if (growthMultiple > 3) {
      return `Profile locked when manuscript was ~${Math.round(lockedSize / 200)} paragraphs, now ~${Math.round(currentSize / 200)} paragraphs (${growthMultiple.toFixed(1)}x larger). Profile may no longer represent your voice accurately.`
    }

    return null
  }

  /**
   * Get current voice profile from store
   * @returns {Object|null}
   */
  const getVoiceProfile = () => {
    return storyBibleStore.voiceProfile?.profile || null
  }

  /**
   * Check if voice profile has been extracted
   * @returns {boolean}
   */
  const hasVoiceProfile = () => {
    return storyBibleStore.voiceProfile?.isExtracted === true
  }

  /**
   * Get confidence score of current profile (0-1)
   * @returns {number}
   */
  const getVoiceConfidence = () => {
    return storyBibleStore.voiceProfile?.profile?.metadata?.confidence || 0
  }

  /**
   * Get word count of manuscript when profile was locked
   * @returns {number|null}
   */
  const getLockedManuscriptSize = () => {
    return storyBibleStore.voiceProfile?.manuscriptSizeAtExtraction || null
  }

  /**
   * Toggle lock state of voice profile
   * @returns {boolean} New lock state
   */
  const toggleProfileLock = () => {
    storyBibleStore.lockVoiceProfile()
    const newState = storyBibleStore.voiceProfile?.locked || false
    addToast(
      newState
        ? 'Voice profile locked. Refresh disabled.'
        : 'Voice profile unlocked. Auto-refresh enabled.',
      'info'
    )
    return newState
  }

  return {
    extractVoiceProfile,
    addSupplementarySample,
    refreshVoiceProfile,
    getLockedProfileWarning,
    getVoiceProfile,
    hasVoiceProfile,
    getVoiceConfidence,
    getLockedManuscriptSize,
    toggleProfileLock
  }
}

export default {
  useVoiceFromManuscript
}
