/**
 * Voice Analyzer Service
 *
 * Extracts statistical style patterns from prose text.
 * Text-based metrics ONLY (no LLM classification).
 *
 * Measurable metrics:
 * - Vocabulary: word frequency, length distribution, unique word ratio
 * - Sentence structure: length distribution, dialogue ratio
 * - Punctuation: frequency of special characters
 * - Pacing: paragraph length, line breaks
 * - Metadata: sample size, consistency score
 */

const MINIMUM_TEXT_LENGTH = 500; // words
const MINIMUM_SENTENCES = 10;

/**
 * Analyze one or more text samples and extract voice profile metrics
 * @param {string[]} textSamples - Array of text samples to analyze
 * @returns {Object} Voice profile object with all metrics
 */
export const analyzeVoiceProfile = (textSamples) => {
  if (!textSamples || textSamples.length === 0) {
    return null;
  }

  // Combine all samples
  const combinedText = textSamples.join('\n\n');

  // Check minimum text length
  const wordCount = countWords(combinedText);
  if (wordCount < MINIMUM_TEXT_LENGTH) {
    return null;
  }

  // Extract metrics
  const vocabulary = extractVocabularyMetrics(combinedText);
  const sentenceStructure = extractSentenceStructure(combinedText);
  const punctuation = extractPunctuationMetrics(combinedText);
  const pacing = extractPacingMetrics(combinedText);

  // Calculate confidence based on sample size
  const confidence = calculateConfidence(wordCount, sentenceStructure.sentences.length);

  return {
    vocabulary,
    sentenceStructure,
    punctuation,
    pacing,
    metadata: {
      totalCharacters: combinedText.length,
      totalWords: wordCount,
      totalSentences: sentenceStructure.sentences.length,
      sampleSize: wordCount,
      consistency: calculateConsistency(sentenceStructure.lengths),
      confidence
    }
  };
};

/**
 * Extract vocabulary-related metrics
 */
const extractVocabularyMetrics = (text) => {
  const words = tokenizeWords(text);
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));

  // Calculate word length distribution
  const wordLengths = words.map(w => w.length);
  const avgWordLength = wordLengths.length > 0 
    ? (wordLengths.reduce((a, b) => a + b, 0) / wordLengths.length).toFixed(2)
    : 0;

  // Find most common words (excluding common articles/prepositions)
  const wordFreq = {};
  words.forEach(word => {
    const lower = word.toLowerCase();
    if (!isCommonStopword(lower)) {
      wordFreq[lower] = (wordFreq[lower] || 0) + 1;
    }
  });

  const mostCommonWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  return {
    totalWords: words.length,
    uniqueWords: uniqueWords.size,
    uniqueWordRatio: (uniqueWords.size / words.length).toFixed(3),
    averageWordLength: parseFloat(avgWordLength),
    mostCommonWords,
    wordFrequency: wordFreq
  };
};

/**
 * Extract sentence structure metrics
 */
const extractSentenceStructure = (text) => {
  const sentences = tokenizeSentences(text);
  
  if (sentences.length < MINIMUM_SENTENCES) {
    return {
      sentences: [],
      lengths: [],
      averageSentenceLength: 0,
      sentenceLengthDistribution: [],
      dialogueRatio: 0,
      hasDialogue: false
    };
  }

  // Calculate sentence lengths
  const lengths = sentences.map(s => countWords(s));
  const avgLength = (lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(2);

  // Sentence length distribution buckets
  const distribution = [
    { range: '1-10', count: lengths.filter(l => l >= 1 && l <= 10).length },
    { range: '11-20', count: lengths.filter(l => l >= 11 && l <= 20).length },
    { range: '21-30', count: lengths.filter(l => l >= 21 && l <= 30).length },
    { range: '30+', count: lengths.filter(l => l > 30).length }
  ];

  // Convert to percentages
  const distributionPercentages = distribution.map(d => ({
    range: d.range,
    percentage: (d.count / lengths.length).toFixed(3)
  }));

  // Calculate dialogue ratio
  const dialogueLines = sentences.filter(s => isDialogue(s)).length;
  const dialogueRatio = (dialogueLines / sentences.length).toFixed(3);
  const hasDialogue = dialogueRatio > 0.05;

  return {
    sentences,
    lengths,
    averageSentenceLength: parseFloat(avgLength),
    sentenceLengthDistribution: distributionPercentages,
    dialogueRatio: parseFloat(dialogueRatio),
    hasDialogue
  };
};

/**
 * Extract punctuation metrics
 */
const extractPunctuationMetrics = (text) => {
  const ellipsisCount = (text.match(/\.\.\./g) || []).length;
  const dashCount = (text.match(/[—–-]/g) || []).length;
  const exclamationCount = (text.match(/!/g) || []).length;
  const semicolonCount = (text.match(/;/g) || []).length;
  const commaCount = (text.match(/,/g) || []).length;

  const sentenceCount = text.split(/[.!?]+/).length;

  return {
    ellipsisFrequency: (ellipsisCount / sentenceCount).toFixed(3),
    dashFrequency: (dashCount / sentenceCount).toFixed(3),
    exclamationFrequency: (exclamationCount / sentenceCount).toFixed(3),
    semicolonFrequency: (semicolonCount / sentenceCount).toFixed(3),
    commaFrequency: (commaCount / sentenceCount).toFixed(3)
  };
};

/**
 * Extract pacing metrics
 */
const extractPacingMetrics = (text) => {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  
  const paragraphLengths = paragraphs.map(p => countWords(p));
  const avgParagraphLength = paragraphLengths.length > 0
    ? (paragraphLengths.reduce((a, b) => a + b, 0) / paragraphLengths.length).toFixed(2)
    : 0;

  // Paragraph length distribution
  const distribution = [
    { range: '1-50', count: paragraphLengths.filter(l => l >= 1 && l <= 50).length },
    { range: '51-150', count: paragraphLengths.filter(l => l >= 51 && l <= 150).length },
    { range: '151-300', count: paragraphLengths.filter(l => l >= 151 && l <= 300).length },
    { range: '300+', count: paragraphLengths.filter(l => l > 300).length }
  ];

  const distributionPercentages = distribution.map(d => ({
    range: d.range,
    percentage: (d.count / paragraphLengths.length).toFixed(3)
  }));

  // Line breaks per paragraph (rough pacing indicator)
  const lineBreaks = paragraphs.map(p => (p.match(/\n/g) || []).length);
  const avgLineBreaks = lineBreaks.length > 0
    ? (lineBreaks.reduce((a, b) => a + b, 0) / lineBreaks.length).toFixed(2)
    : 0;

  return {
    averageParagraphLength: parseFloat(avgParagraphLength),
    paragraphLengthDistribution: distributionPercentages,
    averageLineBreaks: parseFloat(avgLineBreaks)
  };
};

/**
 * Calculate confidence score based on sample size
 */
const calculateConfidence = (wordCount, sentenceCount) => {
  // Higher confidence with more data
  // Minimum at 500 words (0.6), maximum at 5000+ words (0.95)
  const normalizedWords = Math.min(wordCount / 5000, 1);
  const normalizedSentences = Math.min(sentenceCount / 100, 1);
  
  const confidence = 0.6 + (normalizedWords * 0.2) + (normalizedSentences * 0.15);
  return Math.min(confidence, 0.95);
};

/**
 * Calculate consistency score
 * Measures variance in sentence length (lower = more consistent)
 */
const calculateConsistency = (lengths) => {
  if (lengths.length < 2) return 0;

  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  // Normalize: lower stdDev = higher consistency
  // stdDev of 5-10 is typical, normalize to 0-1 scale
  const consistency = Math.max(0, 1 - (stdDev / 20));
  return parseFloat(consistency.toFixed(3));
};

// ============================================================================
// Tokenization and Utility Functions
// ============================================================================

const tokenizeWords = (text) => {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0);
};

const tokenizeSentences = (text) => {
  // Split on sentence boundaries: . ! ? followed by space or end
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
};

const countWords = (text) => {
  return text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0).length;
};

const isDialogue = (sentence) => {
  const trimmed = sentence.trim();
  // Dialogue typically starts with quote or ends with dialogue tag
  return /^["'"]/.test(trimmed) || /said|asked|replied|whispered|shouted/i.test(trimmed);
};

const isCommonStopword = (word) => {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'just', 'only', 'very', 'all', 'this',
    'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
  ]);
  return stopwords.has(word);
};

export default {
  analyzeVoiceProfile
};
