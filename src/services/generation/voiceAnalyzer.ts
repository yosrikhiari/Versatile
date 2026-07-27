import type { VoiceProfile } from './voiceProfileSchema'
import { validateVoiceProfile } from './voiceProfileSchema'

const MINIMUM_TEXT_LENGTH = 500
const MINIMUM_SENTENCES = 10

export const analyzeVoiceProfile = (textSamples: string[]): VoiceProfile | null => {
  if (!textSamples || textSamples.length === 0) {
    return null
  }

  const combinedText = textSamples.join('\n\n')

  const wordCount = countWords(combinedText)
  if (wordCount < MINIMUM_TEXT_LENGTH) {
    return null
  }

  const vocabulary = extractVocabularyMetrics(combinedText)
  const sentenceStructure = extractSentenceStructure(combinedText)
  const punctuation = extractPunctuationMetrics(combinedText)
  const pacing = extractPacingMetrics(combinedText)

  const confidence = calculateConfidence(wordCount, sentenceStructure.sentences.length)

  const profile = {
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
  } as VoiceProfile

  try {
    const { valid, errors } = validateVoiceProfile(profile)
    if (!valid) {
      console.warn('[voiceAnalyzer] produced a profile that fails validation:', errors.join('; '))
    }
  } catch (e: any) {
    console.warn('[voiceAnalyzer] validation guard errored:', e?.message)
  }

  return profile
}

const extractVocabularyMetrics = (text: string) => {
  const words = tokenizeWords(text)
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()))

  const wordLengths = words.map((w) => w.length)
  const avgWordLength =
    wordLengths.length > 0
      ? (wordLengths.reduce((a, b) => a + b, 0) / wordLengths.length).toFixed(2)
      : '0'

  const wordFreq: Record<string, number> = {}
  words.forEach((word) => {
    const lower = word.toLowerCase()
    if (!isCommonStopword(lower)) {
      wordFreq[lower] = (wordFreq[lower] || 0) + 1
    }
  })

  const mostCommonWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word)

  return {
    totalWords: words.length,
    uniqueWords: uniqueWords.size,
    uniqueWordRatio: (uniqueWords.size / words.length).toFixed(3),
    averageWordLength: parseFloat(avgWordLength),
    mostCommonWords,
    wordFrequency: wordFreq
  }
}

const extractSentenceStructure = (text: string) => {
  const sentences = tokenizeSentences(text)

  if (sentences.length < MINIMUM_SENTENCES) {
    return {
      sentences: [],
      lengths: [],
      averageSentenceLength: 0,
      sentenceLengthDistribution: [],
      dialogueRatio: 0,
      hasDialogue: false
    }
  }

  const lengths = sentences.map((s) => countWords(s))
  const avgLength = (lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(2)

  const distribution = [
    { range: '1-10', count: lengths.filter((l) => l >= 1 && l <= 10).length },
    { range: '11-20', count: lengths.filter((l) => l >= 11 && l <= 20).length },
    { range: '21-30', count: lengths.filter((l) => l >= 21 && l <= 30).length },
    { range: '30+', count: lengths.filter((l) => l > 30).length }
  ]

  const distributionPercentages = distribution.map((d) => ({
    range: d.range,
    percentage: (d.count / lengths.length).toFixed(3)
  }))

  const dialogueLines = sentences.filter((s) => isDialogue(s)).length
  // Numeric per SentenceStructureMetrics.dialogueRatio — previously a toFixed()
  // string, which made the comparison below a string/number coercion.
  const dialogueRatio = Number((dialogueLines / sentences.length).toFixed(3))
  const hasDialogue = dialogueRatio > 0.05

  return {
    sentences,
    lengths,
    averageSentenceLength: parseFloat(avgLength),
    sentenceLengthDistribution: distributionPercentages,
    dialogueRatio,
    hasDialogue
  }
}

const extractPunctuationMetrics = (text: string) => {
  const ellipsisCount = (text.match(/\.\.\./g) || []).length
  const dashCount = (text.match(/[—–-]/g) || []).length
  const exclamationCount = (text.match(/!/g) || []).length
  const semicolonCount = (text.match(/;/g) || []).length
  const commaCount = (text.match(/,/g) || []).length

  const sentenceCount = text.split(/[.!?]+/).length

  return {
    ellipsisFrequency: Math.round((ellipsisCount / sentenceCount) * 1000) / 1000,
    dashFrequency: Math.round((dashCount / sentenceCount) * 1000) / 1000,
    exclamationFrequency: Math.round((exclamationCount / sentenceCount) * 1000) / 1000,
    semicolonFrequency: Math.round((semicolonCount / sentenceCount) * 1000) / 1000,
    commaFrequency: Math.round((commaCount / sentenceCount) * 1000) / 1000
  }
}

const extractPacingMetrics = (text: string) => {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0)

  const paragraphLengths = paragraphs.map((p) => countWords(p))
  const avgParagraphLength =
    paragraphLengths.length > 0
      ? (paragraphLengths.reduce((a, b) => a + b, 0) / paragraphLengths.length).toFixed(2)
      : '0'

  const distribution = [
    { range: '1-50', count: paragraphLengths.filter((l) => l >= 1 && l <= 50).length },
    { range: '51-150', count: paragraphLengths.filter((l) => l >= 51 && l <= 150).length },
    { range: '151-300', count: paragraphLengths.filter((l) => l >= 151 && l <= 300).length },
    { range: '300+', count: paragraphLengths.filter((l) => l > 300).length }
  ]

  const distributionPercentages = distribution.map((d) => ({
    range: d.range,
    percentage: (d.count / paragraphLengths.length).toFixed(3)
  }))

  const lineBreaks = paragraphs.map((p) => (p.match(/\n/g) || []).length)
  const avgLineBreaks =
    lineBreaks.length > 0
      ? (lineBreaks.reduce((a, b) => a + b, 0) / lineBreaks.length).toFixed(2)
      : '0'

  return {
    averageParagraphLength: parseFloat(avgParagraphLength),
    paragraphLengthDistribution: distributionPercentages,
    averageLineBreaks: parseFloat(avgLineBreaks)
  }
}

const calculateConfidence = (wordCount: number, sentenceCount: number): number => {
  const normalizedWords = Math.min(wordCount / 5000, 1)
  const normalizedSentences = Math.min(sentenceCount / 100, 1)

  const confidence = 0.6 + normalizedWords * 0.2 + normalizedSentences * 0.15
  return Math.min(confidence, 0.95)
}

const calculateConsistency = (lengths: number[]): number => {
  if (lengths.length < 2) return 0

  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / lengths.length
  const stdDev = Math.sqrt(variance)

  const consistency = Math.max(0, 1 - stdDev / 20)
  return parseFloat(consistency.toFixed(3))
}

const tokenizeWords = (text: string): string[] => {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0)
}

const tokenizeSentences = (text: string): string[] => {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

const countWords = (text: string): number => {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length
}

const isDialogue = (sentence: string): boolean => {
  const trimmed = sentence.trim()
  return /^["'"]/.test(trimmed) || /said|asked|replied|whispered|shouted/i.test(trimmed)
}

const isCommonStopword = (word: string): boolean => {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
    'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are',
    'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'can',
    'just', 'only', 'very', 'all', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they'
  ])
  return stopwords.has(word)
}

export default {
  analyzeVoiceProfile
}
