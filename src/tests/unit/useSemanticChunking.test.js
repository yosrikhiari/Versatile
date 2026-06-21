import { describe, it, expect } from 'vitest'
import { splitSentences, computeChunksForSentences, mergeSmallChunks } from '@/composables/useSemanticChunking'

describe('splitSentences', () => {
  it('returns empty array for empty input', async () => {
    expect(await splitSentences('')).toEqual([])
    expect(await splitSentences(null)).toEqual([])
    expect(await splitSentences(undefined)).toEqual([])
  })

  it('splits simple sentences', async () => {
    const result = await splitSentences('Hello world. How are you?')
    expect(result).toHaveLength(2)
    expect(result[0]).toBe('Hello world.')
    expect(result[1]).toBe('How are you?')
  })

  it('handles abbreviations without splitting', async () => {
    const result = await splitSentences('Dr. Smith went home. He was tired.')
    expect(result).toHaveLength(2)
    expect(result[0]).toBe('Dr. Smith went home.')
  })

  it('handles newlines as separators', async () => {
    const result = await splitSentences('Line one.\nLine two.\n\nLine three.')
    expect(result).toHaveLength(3)
  })

  it('handles exclamation and question marks', async () => {
    const result = await splitSentences('Stop! Are you ok? Yes.')
    expect(result).toHaveLength(3)
  })
})

describe('computeChunksForSentences', () => {
  it('returns single chunk for 0-1 sentences', async () => {
    expect(await computeChunksForSentences(['hello'], [[1]], 0.5)).toEqual([
      { sentences: ['hello'], startIdx: 0, endIdx: 0 }
    ])
  })

  it('splits at low similarity points', async () => {
    const sentences = ['First.', 'Second.', 'Third.']
    const embeddings = [[1, 0], [1, 0.1], [0, 1]]
    const result = await computeChunksForSentences(sentences, embeddings, 0.5)
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('handles missing embeddings', async () => {
    const result = await computeChunksForSentences(['A.', 'B.'], [null, [1]], 0.5)
    expect(result.length).toBeGreaterThanOrEqual(1)
  })
})

describe('mergeSmallChunks', () => {
  it('returns input for single chunk', async () => {
    const chunks = [{ sentences: ['a'], startIdx: 0, endIdx: 0 }]
    expect(await mergeSmallChunks(chunks, 2)).toEqual(chunks)
  })

  it('merges small chunks into adjacent ones', async () => {
    const chunks = [
      { sentences: ['a.', 'b.'], startIdx: 0, endIdx: 1 },
      { sentences: ['c.'], startIdx: 2, endIdx: 2 },
      { sentences: ['d.', 'e.'], startIdx: 3, endIdx: 4 }
    ]
    const result = await mergeSmallChunks(chunks, 2)
    expect(result).toHaveLength(2)
    expect(result[0].sentences).toHaveLength(2)
    expect(result[1].sentences).toHaveLength(3)
  })

  it('merges last small chunk into previous', async () => {
    const chunks = [
      { sentences: ['a.', 'b.'], startIdx: 0, endIdx: 1 },
      { sentences: ['c.'], startIdx: 2, endIdx: 2 }
    ]
    const result = await mergeSmallChunks(chunks, 2)
    expect(result).toHaveLength(1)
    expect(result[0].sentences).toHaveLength(3)
  })
})
