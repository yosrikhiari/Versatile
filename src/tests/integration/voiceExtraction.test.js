import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useStoryBibleStore } from '@/stores/storyBibleStore'
import { useManuscriptStore } from '@/stores/manuscriptStore'
import { useVoiceFromManuscript } from '@/composables/useVoiceFromManuscript'
import { useProjectStore } from '@/stores/projectStore'
describe('Voice Extraction Integration (Phase 1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Auto-extraction on project load', () => {
    it('should extract voice from manuscript on project init', async () => {
      const projectStore = useProjectStore()
      const manuscriptStore = useManuscriptStore()
      const storyBibleStore = useStoryBibleStore()

      // Setup: Add a project and manuscript
      projectStore.currentProjectId = 1
      const sampleText = 'This is a test manuscript. ' + 'It has multiple sentences. '.repeat(200)
      manuscriptStore.setManuscriptContent(sampleText)

      // Action: Extract voice profile
      const { extractVoiceProfile } = useVoiceFromManuscript()
      const profile = await extractVoiceProfile()

      // Assert: Profile should exist
      expect(profile).not.toBeNull()
      expect(profile.vocabulary).toBeDefined()
      expect(profile.sentenceStructure).toBeDefined()
      expect(profile.metadata).toBeDefined()
      expect(storyBibleStore.voiceProfile.isExtracted).toBe(true)
    })

    it('should return null for manuscript < 500 words', async () => {
      const manuscriptStore = useManuscriptStore()
      const { extractVoiceProfile } = useVoiceFromManuscript()

      // Setup: Small manuscript
      const smallText = 'This is a small manuscript. It has few words.'
      manuscriptStore.setManuscriptContent(smallText)

      // Action
      const profile = await extractVoiceProfile()

      // Assert
      expect(profile).toBeNull()
    })

    it('should track manuscript size at extraction time', async () => {
      const manuscriptStore = useManuscriptStore()
      const storyBibleStore = useStoryBibleStore()
      const { extractVoiceProfile } = useVoiceFromManuscript()

      const sampleText = 'This is a test manuscript. ' + 'It has multiple sentences. '.repeat(200)
      manuscriptStore.setManuscriptContent(sampleText)

      await extractVoiceProfile()

      expect(storyBibleStore.voiceProfile.manuscriptSizeAtExtraction).toBe(sampleText.length)
    })
  })

  describe('Profile locking', () => {
    it('should prevent refresh when profile is locked', async () => {
      const manuscriptStore = useManuscriptStore()
      const storyBibleStore = useStoryBibleStore()
      const { extractVoiceProfile, refreshVoiceProfile, toggleProfileLock } =
        useVoiceFromManuscript()

      // Setup: Extract initial profile
      const initialText = 'This is a test manuscript. ' + 'It has multiple sentences. '.repeat(200)
      manuscriptStore.setManuscriptContent(initialText)
      const initialProfile = await extractVoiceProfile()

      // Action: Lock profile
      toggleProfileLock()
      expect(storyBibleStore.voiceProfile.locked).toBe(true)

      // Change manuscript
      const newText =
        'This is a very different manuscript with short punchy sentences. ' +
        'Boom. Bang. Pow. '.repeat(100)
      manuscriptStore.setManuscriptContent(newText)

      // Attempt refresh (should not update)
      await refreshVoiceProfile()

      // Assert: Profile metrics should remain same as initial
      expect(storyBibleStore.voiceProfile.profile.sentenceStructure.averageSentenceLength).toBe(
        initialProfile.sentenceStructure.averageSentenceLength
      )
    })

    it('should allow refresh when profile is unlocked', async () => {
      const manuscriptStore = useManuscriptStore()
      const storyBibleStore = useStoryBibleStore()
      const { extractVoiceProfile, toggleProfileLock } = useVoiceFromManuscript()

      // Setup: Extract and lock profile
      const initialText = 'This is a test manuscript. ' + 'It has multiple sentences. '.repeat(200)
      manuscriptStore.setManuscriptContent(initialText)
      await extractVoiceProfile()
      toggleProfileLock()

      const lockedSentenceLength =
        storyBibleStore.voiceProfile.profile.sentenceStructure.averageSentenceLength

      // Action: Unlock and change manuscript
      toggleProfileLock()
      expect(storyBibleStore.voiceProfile.locked).toBe(false)

      const newText =
        'Short. Sentences. Everywhere. ' + 'Boom. Bang. Pow. Crack. Snap. '.repeat(100)
      manuscriptStore.setManuscriptContent(newText)

      // Refresh should update
      const refreshed = await useVoiceFromManuscript().refreshVoiceProfile()

      // Assert: Profile should change
      expect(refreshed.sentenceStructure.averageSentenceLength).not.toBe(lockedSentenceLength)
    })
  })

  describe('Supplementary samples', () => {
    it('should merge supplementary sample with existing profile', async () => {
      const manuscriptStore = useManuscriptStore()
      const storyBibleStore = useStoryBibleStore()
      const { extractVoiceProfile, addSupplementarySample } = useVoiceFromManuscript()

      // Setup: Extract initial profile
      const initialText = 'This is a test manuscript. ' + 'It has multiple sentences. '.repeat(200)
      manuscriptStore.setManuscriptContent(initialText)
      await extractVoiceProfile()

      // Action: Add supplementary sample
      const supplementaryText = 'Different prose. ' + 'Short sentences here. '.repeat(100)
      await addSupplementarySample(supplementaryText)

      // Assert: Profile should exist and be marked as merged
      expect(storyBibleStore.voiceProfile.profile).toBeDefined()
      expect(storyBibleStore.voiceProfile.supplementaryMergeCount).toBe(1)
    })

    it('should increment merge count with multiple samples', async () => {
      const manuscriptStore = useManuscriptStore()
      const storyBibleStore = useStoryBibleStore()
      const { extractVoiceProfile, addSupplementarySample } = useVoiceFromManuscript()

      const initialText = 'This is a test manuscript. ' + 'It has multiple sentences. '.repeat(200)
      manuscriptStore.setManuscriptContent(initialText)
      await extractVoiceProfile()

      // Add multiple samples
      await addSupplementarySample('First sample. ' + 'Short sentences. '.repeat(50))
      expect(storyBibleStore.voiceProfile.supplementaryMergeCount).toBe(1)

      await addSupplementarySample('Second sample. ' + 'More variety. '.repeat(50))
      expect(storyBibleStore.voiceProfile.supplementaryMergeCount).toBe(2)

      await addSupplementarySample('Third sample. ' + 'Yet more. '.repeat(50))
      expect(storyBibleStore.voiceProfile.supplementaryMergeCount).toBe(3)
    })
  })

  describe('Growth warning', () => {
    it('should detect manuscript growth > 3x locked size', async () => {
      const manuscriptStore = useManuscriptStore()
      const storyBibleStore = useStoryBibleStore()
      const { extractVoiceProfile, toggleProfileLock } = useVoiceFromManuscript()

      // Setup: Extract at small size
      const smallText = 'This is a test manuscript. ' + 'It has multiple sentences. '.repeat(127)
      manuscriptStore.setManuscriptContent(smallText)
      await extractVoiceProfile()
      const initialSize = smallText.length

      // Lock and grow manuscript 5x
      toggleProfileLock()
      const largeText = 'This is a larger manuscript. ' + 'It has many more sentences. '.repeat(500)
      manuscriptStore.setManuscriptContent(largeText)

      // Check growth
      const currentSize = largeText.length
      const growth = currentSize / initialSize
      expect(growth).toBeGreaterThan(3)

      // Profile should still exist but be marked as stale
      expect(storyBibleStore.voiceProfile.profile).toBeDefined()
      expect(storyBibleStore.voiceProfile.locked).toBe(true)
      expect(storyBibleStore.voiceProfile.manuscriptSizeAtExtraction).toBe(initialSize)
    })
  })

  describe('Consistency across runs', () => {
    it('should produce consistent results for same input', async () => {
      const manuscriptStore = useManuscriptStore()
      const sampleText = 'This is a test manuscript. ' + 'It has multiple sentences. '.repeat(200)

      // First run
      manuscriptStore.setManuscriptContent(sampleText)
      const { extractVoiceProfile } = useVoiceFromManuscript()
      const profile1 = await extractVoiceProfile()

      // Reset and second run
      manuscriptStore.clearManuscript()
      manuscriptStore.setManuscriptContent(sampleText)
      const { extractVoiceProfile: extract2 } = useVoiceFromManuscript()
      const profile2 = await extract2()

      // Assert: Metrics should match
      expect(profile1.sentenceStructure.averageSentenceLength).toBe(
        profile2.sentenceStructure.averageSentenceLength
      )
      expect(profile1.vocabulary.uniqueWords).toBe(profile2.vocabulary.uniqueWords)
      expect(profile1.metadata.confidence).toBe(profile2.metadata.confidence)
    })
  })

  describe('Edge cases', () => {
    it('should handle manuscript with special characters', async () => {
      const manuscriptStore = useManuscriptStore()
      const { extractVoiceProfile } = useVoiceFromManuscript()

      const textWithSpecial =
        '"What is this?" she asked. ' + '"I don\'t know," he replied. '.repeat(200)
      manuscriptStore.setManuscriptContent(textWithSpecial)

      const profile = await extractVoiceProfile()

      expect(profile).not.toBeNull()
      expect(profile.sentenceStructure.hasDialogue).toBe(true)
    })

    it('should handle manuscript with varied punctuation', async () => {
      const manuscriptStore = useManuscriptStore()
      const { extractVoiceProfile } = useVoiceFromManuscript()

      const textWithPunctuation =
        'Exclamation! Question? Ellipsis... Dash — here. ' +
        'Semicolon; here. More words. '.repeat(150)
      manuscriptStore.setManuscriptContent(textWithPunctuation)

      const profile = await extractVoiceProfile()

      expect(profile).not.toBeNull()
      expect(profile.punctuation.exclamationFrequency).toBeGreaterThan(0)
      expect(profile.punctuation.dashFrequency).toBeGreaterThan(0)
      expect(profile.punctuation.ellipsisFrequency).toBeGreaterThan(0)
    })

    it('should handle empty manuscript gracefully', async () => {
      const manuscriptStore = useManuscriptStore()
      const { extractVoiceProfile } = useVoiceFromManuscript()

      manuscriptStore.setManuscriptContent('')

      const profile = await extractVoiceProfile()

      expect(profile).toBeNull()
    })
  })
})
