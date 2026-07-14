import { describe, it, expect } from 'vitest'
import {
  validateVoiceProfile,
  createEmptyVoiceProfile,
  createEmptyVoiceProfileState
} from '../../services/generation/voiceProfileSchema'

describe('createEmptyVoiceProfile', () => {
  it('returns a valid empty profile', () => {
    const profile = createEmptyVoiceProfile()
    expect(profile.vocabulary.totalWords).toBe(0)
    expect(profile.sentenceStructure.sentences).toEqual([])
    expect(profile.punctuation.ellipsisFrequency).toBe('0')
    expect(profile.pacing.averageParagraphLength).toBe(0)
    expect(profile.metadata.confidence).toBe(0)
  })
})

describe('createEmptyVoiceProfileState', () => {
  it('returns correct initial state', () => {
    const state = createEmptyVoiceProfileState()
    expect(state.isExtracted).toBe(false)
    expect(state.profile).toBeNull()
    expect(state.locked).toBe(false)
    expect(state.supplementaryMergeCount).toBe(0)
  })
})

describe('validateVoiceProfile', () => {
  it('rejects null', () => {
    const result = validateVoiceProfile(null)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Profile is null or undefined')
  })

  it('rejects undefined', () => {
    const result = validateVoiceProfile(undefined)
    expect(result.valid).toBe(false)
  })

  it('rejects profile missing required sections', () => {
    const result = validateVoiceProfile({})
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing vocabulary metrics')
    expect(result.errors).toContain('Missing sentenceStructure metrics')
    expect(result.errors).toContain('Missing punctuation metrics')
    expect(result.errors).toContain('Missing pacing metrics')
    expect(result.errors).toContain('Missing metadata metrics')
  })

  it('validates vocabulary types', () => {
    const profile = createEmptyVoiceProfile()
    profile.vocabulary = {
      totalWords: 'bad',
      uniqueWords: 'bad',
      mostCommonWords: 'bad',
      wordFrequency: 'bad'
    }
    const result = validateVoiceProfile(profile)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('vocabulary.totalWords must be number')
    expect(result.errors).toContain('vocabulary.mostCommonWords must be array')
    expect(result.errors).toContain('vocabulary.wordFrequency must be object')
  })

  it('validates sentenceStructure', () => {
    const profile = createEmptyVoiceProfile()
    profile.sentenceStructure = {
      sentences: 'bad',
      lengths: 'bad',
      averageSentenceLength: 'bad',
      sentenceLengthDistribution: [],
      hasDialogue: 'bad'
    }
    const result = validateVoiceProfile(profile)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('sentenceStructure.sentences must be array')
    expect(result.errors).toContain('sentenceStructure.averageSentenceLength must be number')
    expect(result.errors).toContain('sentenceStructure.hasDialogue must be boolean')
  })

  it('validates sentenceLengthDistribution length', () => {
    const profile = createEmptyVoiceProfile()
    profile.sentenceStructure.sentenceLengthDistribution = [1, 2, 3]
    const result = validateVoiceProfile(profile)
    expect(result.errors).toContain(
      'sentenceStructure.sentenceLengthDistribution must have 4 buckets'
    )
  })

  it('validates punctuation types (accepts number or numeric string)', () => {
    const profile = createEmptyVoiceProfile()
    profile.punctuation = {
      ellipsisFrequency: 0.5, // number — valid (this is what the analyzer emits)
      dashFrequency: true, // invalid
      exclamationFrequency: null, // invalid
      semicolonFrequency: 'abc', // non-numeric string — invalid
      commaFrequency: '0.5' // numeric string — valid
    }
    const result = validateVoiceProfile(profile)
    expect(result.valid).toBe(false)
    expect(result.errors).not.toContain('punctuation.ellipsisFrequency must be a number')
    expect(result.errors).not.toContain('punctuation.commaFrequency must be a number')
    expect(result.errors).toContain('punctuation.dashFrequency must be a number')
    expect(result.errors).toContain('punctuation.exclamationFrequency must be a number')
    expect(result.errors).toContain('punctuation.semicolonFrequency must be a number')
  })

  it('validates pacing types', () => {
    const profile = createEmptyVoiceProfile()
    profile.pacing = { averageParagraphLength: 'bad', paragraphLengthDistribution: [1, 2, 3] }
    const result = validateVoiceProfile(profile)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('pacing.averageParagraphLength must be number')
    expect(result.errors).toContain('pacing.paragraphLengthDistribution must have 4 buckets')
  })

  it('validates metadata types', () => {
    const profile = createEmptyVoiceProfile()
    profile.metadata = {
      totalCharacters: 'bad',
      totalWords: 'bad',
      totalSentences: 'bad',
      confidence: 1.5
    }
    const result = validateVoiceProfile(profile)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('metadata.totalCharacters must be number')
    expect(result.errors).toContain('metadata.confidence must be number between 0-1')
  })

  it('passes valid profile with required array lengths', () => {
    const profile = createEmptyVoiceProfile()
    profile.sentenceStructure.sentenceLengthDistribution = [
      { range: '1-10', percentage: '0.5' },
      { range: '11-20', percentage: '0.3' },
      { range: '21-30', percentage: '0.15' },
      { range: '31+', percentage: '0.05' }
    ]
    profile.pacing.paragraphLengthDistribution = [
      { range: '1-50', percentage: '0.5' },
      { range: '51-150', percentage: '0.3' },
      { range: '151-300', percentage: '0.15' },
      { range: '301+', percentage: '0.05' }
    ]
    const result = validateVoiceProfile(profile)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('passes valid profile with non-default values', () => {
    const profile = createEmptyVoiceProfile()
    profile.sentenceStructure.sentenceLengthDistribution = [{}, {}, {}, {}]
    profile.pacing.paragraphLengthDistribution = [{}, {}, {}, {}]
    profile.vocabulary.totalWords = 1000
    profile.metadata.confidence = 0.85
    const result = validateVoiceProfile(profile)
    expect(result.valid).toBe(true)
  })
})
