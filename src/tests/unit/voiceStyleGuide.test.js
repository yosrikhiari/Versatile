import { describe, it, expect } from 'vitest'
import { renderExtractedVoiceGuide } from '@/composables/useStoryDocuments'

// The Voice Lab profile is measured from the author's own manuscript. It used to
// reach two display components and nothing else, so it influenced no generated
// word. These tests hold it on the writer's channel — and hold the unit
// conversions, which the analyzer's field names actively mislead about.

const profile = (over = {}) => ({
  sentenceStructure: {
    averageSentenceLength: 9.77,
    // Named `percentage`, holds a FRACTION. Rendering it raw would tell the
    // model "54%" was "0.538%".
    sentenceLengthDistribution: [
      { range: '1-10', percentage: '0.538' },
      { range: '11-20', percentage: '0.385' },
      { range: '30+', percentage: '0.000' }
    ],
    dialogueRatio: 0.231
  },
  // Frequencies are per SENTENCE, not per 1000 words.
  punctuation: { dashFrequency: 0.14, semicolonFrequency: 0.07, ellipsisFrequency: 0 },
  pacing: { averageParagraphLength: 21.17 },
  metadata: { confidence: 0.698, totalWords: 800 },
  ...over
})

describe('renderExtractedVoiceGuide', () => {
  it('says nothing when no profile has been extracted', () => {
    expect(renderExtractedVoiceGuide(null)).toEqual([])
    expect(renderExtractedVoiceGuide({ isExtracted: false, profile: profile() })).toEqual([])
    expect(renderExtractedVoiceGuide({ isExtracted: true, profile: null })).toEqual([])
  })

  it('converts the distribution fraction into a percentage', () => {
    const out = renderExtractedVoiceGuide({ isExtracted: true, profile: profile() }).join('\n')
    expect(out).toContain('1-10 words 54%')
    expect(out).toContain('11-20 words 39%')
  })

  it('drops buckets that never occur rather than printing 0%', () => {
    const out = renderExtractedVoiceGuide({ isExtracted: true, profile: profile() }).join('\n')
    expect(out).not.toContain('30+')
  })

  it('renders punctuation as a per-sentence rate, not a raw decimal', () => {
    const out = renderExtractedVoiceGuide({ isExtracted: true, profile: profile() }).join('\n')
    expect(out).toContain('em-dash in ~1 of every 7 sentences')
    expect(out).toContain('semicolon in ~1 of every 14 sentences')
  })

  it('omits punctuation too rare to be a habit', () => {
    const out = renderExtractedVoiceGuide({ isExtracted: true, profile: profile() }).join('\n')
    expect(out).not.toContain('ellipsis')
  })

  it('reports dialogue share and confidence', () => {
    const out = renderExtractedVoiceGuide({ isExtracted: true, profile: profile() }).join('\n')
    expect(out).toContain('Dialogue: 23% of sentences')
    expect(out).toContain('70% confidence')
  })

  it('survives a partial profile without emitting broken lines', () => {
    const out = renderExtractedVoiceGuide({
      isExtracted: true,
      profile: { sentenceStructure: { averageSentenceLength: 14 }, metadata: {} }
    }).join('\n')
    expect(out).toContain('14 words on average')
    expect(out).not.toContain('NaN')
    expect(out).not.toContain('undefined')
  })

  it('emits nothing when every metric is missing', () => {
    expect(renderExtractedVoiceGuide({ isExtracted: true, profile: {} })).toEqual([])
  })
})
