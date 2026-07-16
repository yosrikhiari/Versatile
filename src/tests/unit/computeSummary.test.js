import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAiGenerate = vi.fn()
vi.mock('@/composables/useAiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args)
}))
vi.mock('@/config/ai', () => ({
  FEATURES: { STORY_GENERATION: 'story_generation' }
}))

let computeSummary
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  ;({ computeSummary } = await import('@/composables/generation/utils'))
})

const PROSE = 'The harbor lights went out one by one. She counted them as they died.'

describe('computeSummary', () => {
  it('uses the writer’s summary WITHOUT an extra LLM call', async () => {
    // The point of the change. This was an unconditional aiGenerate — a whole
    // round-trip with a 3000-char prompt, asking the model to summarize prose it
    // had just written. At one per scene that is ~30 calls on a 30-scene volume.
    const result = await computeSummary(PROSE, { summary: 'She watches the harbor go dark.' })

    expect(result).toBe('She watches the harbor go dark.')
    expect(mockAiGenerate).not.toHaveBeenCalled()
  })

  it('falls back to an LLM call when the writer omitted the summary', async () => {
    mockAiGenerate.mockResolvedValue('A generated summary.')
    const result = await computeSummary(PROSE, { keyFacts: [] })

    expect(result).toBe('A generated summary.')
    expect(mockAiGenerate).toHaveBeenCalledTimes(1)
  })

  it('falls back when no structured output is passed at all', async () => {
    // Callers without structured output keep the old behaviour.
    mockAiGenerate.mockResolvedValue('A generated summary.')
    const result = await computeSummary(PROSE)

    expect(result).toBe('A generated summary.')
    expect(mockAiGenerate).toHaveBeenCalledTimes(1)
  })

  it('ignores a blank or non-string summary and falls back', async () => {
    mockAiGenerate.mockResolvedValue('A generated summary.')

    expect(await computeSummary(PROSE, { summary: '   ' })).toBe('A generated summary.')
    expect(await computeSummary(PROSE, { summary: '' })).toBe('A generated summary.')
    expect(await computeSummary(PROSE, { summary: null })).toBe('A generated summary.')
    expect(await computeSummary(PROSE, { summary: 42 })).toBe('A generated summary.')
    expect(mockAiGenerate).toHaveBeenCalledTimes(4)
  })

  it('cleans the writer’s summary the same way it cleans a generated one', async () => {
    const result = await computeSummary(PROSE, { summary: '"Summary: She leaves."' })
    expect(result).toBe('She leaves.')
    expect(mockAiGenerate).not.toHaveBeenCalled()
  })

  it('strips the prefix and quotes in either nesting order', async () => {
    // Models emit both `Summary: "X"` and `"Summary: X"`. The original stripped
    // the prefix first and quotes second, so the latter left `Summary: X`
    // stranded in the chapter log.
    mockAiGenerate.mockResolvedValueOnce('Summary: "She leaves."')
    expect(await computeSummary(PROSE)).toBe('She leaves.')

    mockAiGenerate.mockResolvedValueOnce('"She leaves."')
    expect(await computeSummary(PROSE)).toBe('She leaves.')

    mockAiGenerate.mockResolvedValueOnce('She leaves.')
    expect(await computeSummary(PROSE)).toBe('She leaves.')
  })

  it('degrades to a prose slice when the LLM call fails', async () => {
    mockAiGenerate.mockRejectedValue(new Error('Ollama down'))
    const result = await computeSummary(PROSE)

    expect(result).toContain('The harbor lights')
    expect(result.endsWith('...')).toBe(true)
  })

  it('does not fall back to the LLM when a summary exists, even if aiGenerate would fail', async () => {
    // A broken backend must not cost us a summary we already have.
    mockAiGenerate.mockRejectedValue(new Error('Ollama down'))
    const result = await computeSummary(PROSE, { summary: 'She watches.' })

    expect(result).toBe('She watches.')
    expect(mockAiGenerate).not.toHaveBeenCalled()
  })

  it('tolerates empty prose on the fallback path', async () => {
    mockAiGenerate.mockRejectedValue(new Error('Ollama down'))
    await expect(computeSummary('')).resolves.toBe('...')
  })
})
