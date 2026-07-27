export interface VocabularyMetrics {
  totalWords: number
  uniqueWords: number
  uniqueWordRatio: string
  averageWordLength: number
  mostCommonWords: string[]
  wordFrequency: Record<string, number>
}

export interface SentenceMetric {
  range: string
  percentage: string
}

export interface SentenceStructureMetrics {
  sentences: string[]
  lengths: number[]
  averageSentenceLength: number
  sentenceLengthDistribution: SentenceMetric[]
  dialogueRatio: number
  hasDialogue: boolean
}

export interface PunctuationMetrics {
  ellipsisFrequency: number
  dashFrequency: number
  exclamationFrequency: number
  semicolonFrequency: number
  commaFrequency: number
}

export interface PacingMetric {
  range: string
  percentage: string
}

export interface PacingMetrics {
  averageParagraphLength: number
  paragraphLengthDistribution: PacingMetric[]
  averageLineBreaks: number
}

export interface MetadataMetrics {
  totalCharacters: number
  totalWords: number
  totalSentences: number
  sampleSize: number
  consistency: number
  confidence: number
}

export interface VoiceProfile {
  vocabulary: VocabularyMetrics
  sentenceStructure: SentenceStructureMetrics
  punctuation: PunctuationMetrics
  pacing: PacingMetrics
  metadata: MetadataMetrics
  // Stamped on after extraction/merge (see useVoiceFromManuscript), so a freshly
  // created empty profile legitimately has neither.
  manuscriptSizeAtExtraction?: number | null
  supplementaryMergeCount?: number | null
}

export interface VoiceProfileState {
  isExtracted: boolean
  profile: VoiceProfile | null
  manuscriptSizeAtExtraction: number | null
  lastUpdated: Date | null
  locked: boolean
  supplementaryMergeCount: number
}

export const validateVoiceProfile = (profile: any): { valid: boolean; errors: string[] } => {
  const errors: string[] = []

  if (!profile) {
    return { valid: false, errors: ['Profile is null or undefined'] }
  }

  if (!profile.vocabulary) errors.push('Missing vocabulary metrics')
  if (!profile.sentenceStructure) errors.push('Missing sentenceStructure metrics')
  if (!profile.punctuation) errors.push('Missing punctuation metrics')
  if (!profile.pacing) errors.push('Missing pacing metrics')
  if (!profile.metadata) errors.push('Missing metadata metrics')

  if (profile.vocabulary) {
    if (typeof profile.vocabulary.totalWords !== 'number')
      errors.push('vocabulary.totalWords must be number')
    if (typeof profile.vocabulary.uniqueWords !== 'number')
      errors.push('vocabulary.uniqueWords must be number')
    if (!Array.isArray(profile.vocabulary.mostCommonWords))
      errors.push('vocabulary.mostCommonWords must be array')
    if (typeof profile.vocabulary.wordFrequency !== 'object')
      errors.push('vocabulary.wordFrequency must be object')
  }

  if (profile.sentenceStructure) {
    if (!Array.isArray(profile.sentenceStructure.sentences))
      errors.push('sentenceStructure.sentences must be array')
    if (!Array.isArray(profile.sentenceStructure.lengths))
      errors.push('sentenceStructure.lengths must be array')
    if (typeof profile.sentenceStructure.averageSentenceLength !== 'number')
      errors.push('sentenceStructure.averageSentenceLength must be number')
    if (profile.sentenceStructure.sentenceLengthDistribution.length !== 4)
      errors.push('sentenceStructure.sentenceLengthDistribution must have 4 buckets')
    if (typeof profile.sentenceStructure.hasDialogue !== 'boolean')
      errors.push('sentenceStructure.hasDialogue must be boolean')
  }

  if (profile.punctuation) {
    const punctKeys = [
      'ellipsisFrequency',
      'dashFrequency',
      'exclamationFrequency',
      'semicolonFrequency',
      'commaFrequency'
    ]
    punctKeys.forEach((key) => {
      const v = profile.punctuation[key]
      const ok =
        (typeof v === 'number' && Number.isFinite(v)) ||
        (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(parseFloat(v)))
      if (!ok) {
        errors.push(`punctuation.${key} must be a number`)
      }
    })
  }

  if (profile.pacing) {
    if (typeof profile.pacing.averageParagraphLength !== 'number')
      errors.push('pacing.averageParagraphLength must be number')
    if (profile.pacing.paragraphLengthDistribution.length !== 4)
      errors.push('pacing.paragraphLengthDistribution must have 4 buckets')
  }

  if (profile.metadata) {
    if (typeof profile.metadata.totalCharacters !== 'number')
      errors.push('metadata.totalCharacters must be number')
    if (typeof profile.metadata.totalWords !== 'number')
      errors.push('metadata.totalWords must be number')
    if (typeof profile.metadata.totalSentences !== 'number')
      errors.push('metadata.totalSentences must be number')
    if (
      typeof profile.metadata.confidence !== 'number' ||
      profile.metadata.confidence < 0 ||
      profile.metadata.confidence > 1
    )
      errors.push('metadata.confidence must be number between 0-1')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

export const createEmptyVoiceProfile = (): VoiceProfile => ({
  vocabulary: {
    totalWords: 0,
    uniqueWords: 0,
    uniqueWordRatio: '0',
    averageWordLength: 0,
    mostCommonWords: [],
    wordFrequency: {}
  },
  sentenceStructure: {
    sentences: [],
    lengths: [],
    averageSentenceLength: 0,
    sentenceLengthDistribution: [],
    dialogueRatio: 0,
    hasDialogue: false
  },
  punctuation: {
    ellipsisFrequency: 0,
    dashFrequency: 0,
    exclamationFrequency: 0,
    semicolonFrequency: 0,
    commaFrequency: 0
  },
  pacing: {
    averageParagraphLength: 0,
    paragraphLengthDistribution: [],
    averageLineBreaks: 0
  },
  metadata: {
    totalCharacters: 0,
    totalWords: 0,
    totalSentences: 0,
    sampleSize: 0,
    consistency: 0,
    confidence: 0
  }
})

export const createEmptyVoiceProfileState = (): VoiceProfileState => ({
  isExtracted: false,
  profile: null,
  manuscriptSizeAtExtraction: null,
  lastUpdated: null,
  locked: false,
  supplementaryMergeCount: 0
})

export default {
  validateVoiceProfile,
  createEmptyVoiceProfile,
  createEmptyVoiceProfileState
}
