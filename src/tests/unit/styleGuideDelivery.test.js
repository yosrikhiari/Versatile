import { describe, it, expect } from 'vitest'
import { renderExtractedVoiceGuide } from '@/composables/useStoryDocuments'

// useStoryWriter builds its voice instruction with extractDoc(bible, 'Style
// Guide'), which slices from that heading to the next `#`. A measured-voice
// block under its own `## Author Voice` heading was therefore cut out of the one
// place voice matters most. This reproduces that slice and proves the lines
// survive it.
function extractDoc(docString, heading) {
  if (!docString) return ''
  const regex = new RegExp(`#+\\s*${heading}[\\s\\S]*?(?=\n#|$)`, 'i')
  const match = docString.match(regex)
  return match ? match[0].trim() : ''
}

const profile = {
  sentenceStructure: {
    averageSentenceLength: 9.8,
    sentenceLengthDistribution: [{ range: '1-10', percentage: '0.538' }],
    dialogueRatio: 0.231
  },
  punctuation: { dashFrequency: 0.14 },
  pacing: { averageParagraphLength: 21 },
  metadata: { confidence: 0.7, totalWords: 800 }
}

describe('measured voice reaches the writer', () => {
  const measured = renderExtractedVoiceGuide({ isExtracted: true, profile })

  it('renders no heading of its own, so it cannot be sliced away', () => {
    expect(measured.some((l) => l.trimStart().startsWith('#'))).toBe(false)
  })

  it('survives the writer’s Style Guide extraction', () => {
    const doc = ['## Style Guide', ...measured, 'Inferred from recent prose:', '- POV: third'].join(
      '\n'
    )
    const bible = `# Characters\nKael\n\n${doc}\n\n# Relationships\nKael — Mira`
    const extracted = extractDoc(bible, 'Style Guide')

    expect(extracted).toContain('10 words on average')
    expect(extracted).toContain('Dialogue: 23% of sentences')
    expect(extracted).toContain('em-dash')
    expect(extracted).toContain('70% confidence')
    // And stops before the next section, as the writer expects.
    expect(extracted).not.toContain('Kael — Mira')
  })

  it('keeps the inferred detail in the same section', () => {
    const doc = ['## Style Guide', ...measured, 'Inferred from recent prose:', '- POV: third'].join(
      '\n'
    )
    expect(extractDoc(doc, 'Style Guide')).toContain('POV: third')
  })
})
