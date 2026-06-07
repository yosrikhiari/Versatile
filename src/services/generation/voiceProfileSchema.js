/**
 * Voice Profile Data Model Schema
 *
 * Defines the structure of voice profiles stored in Pinia store and IndexedDB.
 * This schema is used for validation and documentation purposes.
 */

/**
 * @typedef {Object} VocabularyMetrics
 * @property {number} totalWords - Total words in sample
 * @property {number} uniqueWords - Count of unique words
 * @property {string} uniqueWordRatio - Ratio of unique to total (0-1 as string)
 * @property {number} averageWordLength - Mean word length in characters
 * @property {string[]} mostCommonWords - Top 10 most common non-stopwords
 * @property {Object.<string, number>} wordFrequency - Word -> count mapping
 */

/**
 * @typedef {Object} SentenceMetric
 * @property {string} range - Bucket range (e.g., "1-10", "11-20")
 * @property {string} percentage - Percentage as decimal string (0-1)
 */

/**
 * @typedef {Object} SentenceStructureMetrics
 * @property {string[]} sentences - Array of sentences extracted
 * @property {number[]} lengths - Word count per sentence
 * @property {number} averageSentenceLength - Mean sentence length
 * @property {SentenceMetric[]} sentenceLengthDistribution - 4 buckets
 * @property {number} dialogueRatio - Dialogue sentences as decimal (0-1)
 * @property {boolean} hasDialogue - True if any dialogue detected
 */

/**
 * @typedef {Object} PunctuationMetrics
 * @property {string} ellipsisFrequency - Frequency per sentence (0-1)
 * @property {string} dashFrequency - Frequency per sentence (0-1)
 * @property {string} exclamationFrequency - Frequency per sentence (0-1)
 * @property {string} semicolonFrequency - Frequency per sentence (0-1)
 * @property {string} commaFrequency - Frequency per sentence (0-1)
 */

/**
 * @typedef {Object} PacingMetric
 * @property {string} range - Bucket range (e.g., "1-50", "51-150")
 * @property {string} percentage - Percentage as decimal string (0-1)
 */

/**
 * @typedef {Object} PacingMetrics
 * @property {number} averageParagraphLength - Mean paragraph word count
 * @property {PacingMetric[]} paragraphLengthDistribution - 4 buckets
 * @property {number} averageLineBreaks - Mean line breaks per paragraph
 */

/**
 * @typedef {Object} MetadataMetrics
 * @property {number} totalCharacters - Character count including whitespace
 * @property {number} totalWords - Total word count
 * @property {number} totalSentences - Sentence count
 * @property {number} sampleSize - Equivalent to totalWords
 * @property {string} consistency - Sentence length variance score (0-1)
 * @property {number} confidence - Confidence in profile (0-1, based on sample size)
 */

/**
 * @typedef {Object} VoiceProfile
 * @property {VocabularyMetrics} vocabulary
 * @property {SentenceStructureMetrics} sentenceStructure
 * @property {PunctuationMetrics} punctuation
 * @property {PacingMetrics} pacing
 * @property {MetadataMetrics} metadata
 * @property {?number} manuscriptSizeAtExtraction - Words in manuscript when locked
 * @property {?number} supplementaryMergeCount - How many times merged with samples
 */

/**
 * @typedef {Object} VoiceProfileState
 * @property {boolean} isExtracted - Whether profile exists
 * @property {?VoiceProfile} profile - Actual profile data (null if not extracted)
 * @property {?number} manuscriptSizeAtExtraction - Size when locked
 * @property {?Date} lastUpdated - When profile was last generated
 * @property {boolean} locked - Whether auto-refresh is disabled
 * @property {number} supplementaryMergeCount - Merge count
 */

/**
 * Validates a voice profile object against the schema
 * @param {Object} profile - Object to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export const validateVoiceProfile = (profile) => {
  const errors = [];

  if (!profile) {
    return { valid: false, errors: ['Profile is null or undefined'] };
  }

  // Check top-level structure
  if (!profile.vocabulary) errors.push('Missing vocabulary metrics');
  if (!profile.sentenceStructure) errors.push('Missing sentenceStructure metrics');
  if (!profile.punctuation) errors.push('Missing punctuation metrics');
  if (!profile.pacing) errors.push('Missing pacing metrics');
  if (!profile.metadata) errors.push('Missing metadata metrics');

  // Validate vocabulary
  if (profile.vocabulary) {
    if (typeof profile.vocabulary.totalWords !== 'number')
      errors.push('vocabulary.totalWords must be number');
    if (typeof profile.vocabulary.uniqueWords !== 'number')
      errors.push('vocabulary.uniqueWords must be number');
    if (!Array.isArray(profile.vocabulary.mostCommonWords))
      errors.push('vocabulary.mostCommonWords must be array');
    if (typeof profile.vocabulary.wordFrequency !== 'object')
      errors.push('vocabulary.wordFrequency must be object');
  }

  // Validate sentence structure
  if (profile.sentenceStructure) {
    if (!Array.isArray(profile.sentenceStructure.sentences))
      errors.push('sentenceStructure.sentences must be array');
    if (!Array.isArray(profile.sentenceStructure.lengths))
      errors.push('sentenceStructure.lengths must be array');
    if (typeof profile.sentenceStructure.averageSentenceLength !== 'number')
      errors.push('sentenceStructure.averageSentenceLength must be number');
    if (profile.sentenceStructure.sentenceLengthDistribution.length !== 4)
      errors.push('sentenceStructure.sentenceLengthDistribution must have 4 buckets');
    if (typeof profile.sentenceStructure.hasDialogue !== 'boolean')
      errors.push('sentenceStructure.hasDialogue must be boolean');
  }

  // Validate punctuation
  if (profile.punctuation) {
    const punctKeys = ['ellipsisFrequency', 'dashFrequency', 'exclamationFrequency', 'semicolonFrequency', 'commaFrequency'];
    punctKeys.forEach(key => {
      if (typeof profile.punctuation[key] !== 'string' || isNaN(parseFloat(profile.punctuation[key]))) {
        errors.push(`punctuation.${key} must be numeric string`);
      }
    });
  }

  // Validate pacing
  if (profile.pacing) {
    if (typeof profile.pacing.averageParagraphLength !== 'number')
      errors.push('pacing.averageParagraphLength must be number');
    if (profile.pacing.paragraphLengthDistribution.length !== 4)
      errors.push('pacing.paragraphLengthDistribution must have 4 buckets');
  }

  // Validate metadata
  if (profile.metadata) {
    if (typeof profile.metadata.totalCharacters !== 'number')
      errors.push('metadata.totalCharacters must be number');
    if (typeof profile.metadata.totalWords !== 'number')
      errors.push('metadata.totalWords must be number');
    if (typeof profile.metadata.totalSentences !== 'number')
      errors.push('metadata.totalSentences must be number');
    if (typeof profile.metadata.confidence !== 'number' || profile.metadata.confidence < 0 || profile.metadata.confidence > 1)
      errors.push('metadata.confidence must be number between 0-1');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Creates an empty/template voice profile
 */
export const createEmptyVoiceProfile = () => ({
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
    ellipsisFrequency: '0',
    dashFrequency: '0',
    exclamationFrequency: '0',
    semicolonFrequency: '0',
    commaFrequency: '0'
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
    consistency: '0',
    confidence: 0
  }
});

/**
 * Creates an empty voice profile state for Pinia store
 */
export const createEmptyVoiceProfileState = () => ({
  isExtracted: false,
  profile: null,
  manuscriptSizeAtExtraction: null,
  lastUpdated: null,
  locked: false,
  supplementaryMergeCount: 0
});

export default {
  validateVoiceProfile,
  createEmptyVoiceProfile,
  createEmptyVoiceProfileState
};
