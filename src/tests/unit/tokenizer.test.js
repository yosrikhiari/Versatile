import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  countTokens,
  encodingFor,
  heuristicTokens,
  isExact,
  preloadTokenizer,
  resetTokenizerForTests,
  setActiveModel
} from '@/services/ai/tokenizer'
import { resetCalibration } from '@/services/ai/tokenCalibration'

beforeEach(() => {
  resetTokenizerForTests()
  resetCalibration()
})

afterEach(() => {
  resetTokenizerForTests()
  resetCalibration()
})

describe('encodingFor', () => {
  it('maps OpenAI o200k models to o200k_base', () => {
    expect(encodingFor('gpt-4o')).toBe('o200k_base')
    expect(encodingFor('gpt-4o-mini')).toBe('o200k_base')
    expect(encodingFor('openai/gpt-oss-120b')).toBe('o200k_base')
    expect(encodingFor('o3-mini')).toBe('o200k_base')
  })

  it('maps older OpenAI models to cl100k_base', () => {
    expect(encodingFor('gpt-4')).toBe('cl100k_base')
    expect(encodingFor('gpt-4-turbo')).toBe('cl100k_base')
    expect(encodingFor('gpt-3.5-turbo')).toBe('cl100k_base')
  })

  it('falls back to cl100k_base as a proxy for non-OpenAI models', () => {
    // We cannot ship Anthropic's or Google's tables. cl100k is a structural
    // stand-in and tokenCalibration corrects the residual offset.
    expect(encodingFor('claude-sonnet-4-5')).toBe('cl100k_base')
    expect(encodingFor('gemini-2.5-pro')).toBe('cl100k_base')
    expect(encodingFor('llama-3.3-70b-versatile')).toBe('cl100k_base')
    expect(encodingFor('')).toBe('cl100k_base')
  })
})

describe('countTokens before any tokenizer is loaded', () => {
  it('uses the character heuristic', () => {
    expect(isExact()).toBe(false)
    expect(countTokens('a'.repeat(400), 'prose')).toBe(100)
    expect(countTokens('x'.repeat(260), 'json')).toBe(100)
  })

  it('returns 0 for empty or missing text', () => {
    expect(countTokens('')).toBe(0)
    expect(countTokens(null)).toBe(0)
    expect(countTokens(undefined)).toBe(0)
  })
})

describe('countTokens after preload', () => {
  it('reports exact counts', async () => {
    const ok = await preloadTokenizer('gpt-4o')
    expect(ok).toBe(true)
    expect(isExact('gpt-4o')).toBe(true)

    // "Hello world, this is a test." is 8 tokens under o200k_base.
    expect(countTokens('Hello world, this is a test.')).toBe(8)
  })

  it('beats the 4:1 guess on text the guess is worst at', async () => {
    await preloadTokenizer('gpt-4o')
    // Dense JSON: the prose ratio badly under-counts it.
    const json = JSON.stringify({ characters: [{ name: 'Alice', role: 'protagonist' }] })
    const exact = countTokens(json, 'prose')
    const guess = heuristicTokens(json, 'prose')
    expect(exact).toBeGreaterThan(guess)
  })

  it('keeps prose within a few percent, where the guess was already decent', async () => {
    await preloadTokenizer('gpt-4o')
    const prose =
      'The rain had stopped by the time she reached the harbour, and the boats ' +
      'sat still against a sky the colour of wet slate. She counted them twice.'
    const exact = countTokens(prose, 'prose')
    const guess = heuristicTokens(prose, 'prose')
    expect(Math.abs(exact - guess) / exact).toBeLessThan(0.25)
  })

  it('is stable across repeated calls', async () => {
    await preloadTokenizer('gpt-4o')
    const text = 'Consistency matters here. '.repeat(50)
    expect(countTokens(text)).toBe(countTokens(text))
  })

  it('honours the active model set by preload', async () => {
    await preloadTokenizer('claude-sonnet-4-5')
    expect(isExact()).toBe(true)
    expect(isExact('claude-sonnet-4-5')).toBe(true)
    // gpt-4o needs o200k, which was never loaded.
    expect(isExact('gpt-4o')).toBe(false)
  })

  it('falls back to the heuristic for a model whose encoding is not loaded', async () => {
    await preloadTokenizer('claude-sonnet-4-5')
    setActiveModel('gpt-4o')
    expect(countTokens('a'.repeat(400), 'prose')).toBe(100)
  })
})
