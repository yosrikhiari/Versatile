import { ref } from 'vue'
import { stripHtml } from '../utils/html'

const TENSION_KEYWORDS = {
  high: [
    'suddenly', 'explosion', 'scream', 'fight', 'attack', 'chase', 'gun', 'knife',
    'blood', 'death', 'kill', 'running', 'desperate', 'danger', 'threat',
    'crash', 'shatter', 'blast', 'pound', 'racing', 'frantic', 'terrified',
    'horror', 'violence', 'struggle', 'collapse', 'pursuit'
  ],
  medium: [
    'argue', 'confront', 'tension', 'anxious', 'worry', 'fear', 'dark',
    'whisper', 'shadow', 'follow', 'watch', 'hide', 'secret', 'threaten',
    'pressure', 'nervous', 'risk', 'dangerous', 'uneasy', 'suspense'
  ],
  low: [
    'walk', 'think', 'remember', 'quiet', 'calm', 'peaceful', 'gentle',
    'soft', 'warm', 'slow', 'rest', 'breathe', 'reflect', 'wait'
  ]
}

const EMOTION_KEYWORDS = {
  joy: ['happy', 'smile', 'laugh', 'joy', 'delight', 'content', 'warm', 'hope', 'excited', 'celebrate', 'peace', 'grateful', 'love', 'tender', 'wonder'],
  sadness: ['cry', 'tear', 'sad', 'grief', 'lonely', 'mourn', 'hurt', 'pain', 'sorrow', 'despair', 'melancholy', 'loss', 'heartbreak', 'regret', 'nostalgia'],
  anger: ['angry', 'fury', 'rage', 'frustrate', 'enrage', 'bitter', 'hate', 'resent', 'irritate', 'fume', 'seethe', 'outrage', 'hostile', 'contempt'],
  fear: ['fear', 'terrified', 'panic', 'dread', 'horror', 'paralyze', 'frighten', 'alarm', 'shudder', 'cower', 'tremble', 'threat', 'menace'],
  surprise: ['shock', 'surprise', 'stun', 'astonish', 'amaze', 'startle', 'gasp', 'wonder', 'marvel', 'unexpected', 'incredible', 'reveal', 'discover']
}

const BEAT_PATTERNS = [
  { label: 'Inciting Incident', markers: ['once upon a time', 'it began', 'everything changed', 'that was when', 'the day', 'it started'] },
  { label: 'Rising Action', markers: ['meanwhile', 'but then', 'however', 'as the days', 'soon', 'gradually'] },
  { label: 'Midpoint', markers: ['everything was different now', 'the truth was', 'in that moment', 'halfway', 'turning point'] },
  { label: 'Crisis / Dark Moment', markers: ['all seemed lost', 'nothing could', 'the worst', 'despair', 'there was no hope', 'everything fell apart'] },
  { label: 'Climax', markers: ['finally', 'at last', 'the moment had come', 'now or never', 'this was it', 'the final'] },
  { label: 'Resolution', markers: ['afterward', 'from that day', 'in the end', 'looking back', 'years later', 'never again'] }
]

function countKeywordHits(text, keywords) {
  const lower = text.toLowerCase()
  return keywords.reduce((sum, kw) => sum + ((lower.match(new RegExp('\\b' + kw + '\\w*\\b', 'gi')) || []).length), 0)
}

function computeSentenceScores(text) {
  const sentences = text.split(/(?<=[.!?])\s+/g).filter(s => s.trim().length > 0)
  return sentences.map(sentence => {
    const high = countKeywordHits(sentence, TENSION_KEYWORDS.high) * 3
    const medium = countKeywordHits(sentence, TENSION_KEYWORDS.medium) * 2
    const low = countKeywordHits(sentence, TENSION_KEYWORDS.low) * 0.5
    const rawScore = high + medium + low
    return Math.min(rawScore, 10)
  })
}

function computeDialogueRatio(text) {
  const lines = text.split('\n').filter(l => l.trim().length > 0)
  if (lines.length === 0) return 0
  const dialogueLines = lines.filter(l => {
    const t = l.trim()
    return t.startsWith('"') || t.startsWith('\u2018') || t.startsWith('\u201c') ||
      t.match(/^[A-Z][a-z]+:\s*["\u2018\u201c]/)
  }).length
  return dialogueLines / lines.length
}

function computePacingGradient(words, sentences) {
  if (sentences === 0) return 1
  const wordsPerSentence = words / sentences
  return Math.min(wordsPerSentence / 25, 3)
}

function computeEmotionScores(text) {
  const lower = text.toLowerCase()
  return Object.entries(EMOTION_KEYWORDS).map(([emotion, keywords]) => ({
    emotion,
    score: countKeywordHits(lower, keywords)
  })).filter(e => e.score > 0)
}

function computeStructuralBeats(text) {
  const lower = text.toLowerCase()
  const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0)
  const total = paragraphs.length
  if (total === 0) return BEAT_PATTERNS.map(b => ({ ...b, confidence: 0 }))

  return BEAT_PATTERNS.map(beat => {
    let confidence = 0
    for (const marker of beat.markers) {
      const count = (lower.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
      if (count > 0) confidence += count * 15
    }
    return { ...beat, confidence: Math.min(confidence, 100) }
  })
}

export function useHeuristicAnalyzer() {
  const lastResult = ref(null)

  function analyzeScene(text) {
    const cleanText = stripHtml(text || '')
    if (cleanText.trim().length === 0) return null

    const wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length
    const sentences = cleanText.split(/(?<=[.!?])\s+/g).filter(s => s.trim().length > 0)
    const sentenceCount = sentences.length

    const tensionPulse = computeSentenceScores(cleanText)
    const dialogueRatio = computeDialogueRatio(cleanText)
    const pacingGradient = computePacingGradient(wordCount, sentenceCount)
    const emotionScores = computeEmotionScores(cleanText)
    const structuralBeats = computeStructuralBeats(cleanText)

    const totalTension = tensionPulse.reduce((a, b) => a + b, 0)
    const avgTension = tensionPulse.length > 0 ? totalTension / tensionPulse.length : 0
    const maxTension = tensionPulse.length > 0 ? Math.max(...tensionPulse) : 0

    const rhythmFingerprint = dialogueRatio > 0.5 ? 'dialogue-heavy' : dialogueRatio > 0.2 ? 'balanced' : 'narration-heavy'

    const wordBasedScores = []
    const step = Math.max(Math.floor(wordCount / 20), 1)
    const words = cleanText.split(/\s+/).filter(w => w.length > 0)
    for (let i = 0; i < words.length; i += step) {
      const chunk = words.slice(i, i + step).join(' ')
      const high = countKeywordHits(chunk, TENSION_KEYWORDS.high) * 3
      const medium = countKeywordHits(chunk, TENSION_KEYWORDS.medium) * 2
      wordBasedScores.push(Math.min(high + medium, 10))
    }

    const result = {
      tensionPulse,
      wordBasedTension: wordBasedScores,
      metrics: {
        avgTension: Math.round(avgTension * 100) / 100,
        maxTension,
        totalTension,
        sentenceCount,
        wordCount,
        dialogueRatio: Math.round(dialogueRatio * 100) / 100,
        rhythmFingerprint,
        pacingGradient: Math.round(pacingGradient * 100) / 100,
        dominantEmotion: emotionScores.length > 0
          ? emotionScores.sort((a, b) => b.score - a.score)[0]
          : null,
        emotionBreakdown: emotionScores,
        structuralBeats,
        overallTensionLevel: maxTension >= 8 ? 'high' : maxTension >= 4 ? 'medium' : 'low'
      }
    }

    lastResult.value = result
    return result
  }

  return { analyzeScene, lastResult }
}
