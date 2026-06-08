import { describe, it, expect, vi } from 'vitest'

vi.mock('../../services/aiService', () => ({
  aiGenerate: vi.fn()
}))

vi.mock('../../composables/generation/utils', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    retryWithBackoff: vi.fn((fn) => fn()),
    sanitizeJsonResponse: vi.fn(),
    normalizeField: vi.fn((parsed, key) => parsed[key] || ''),
    wrapApiError: vi.fn()
  }
})

describe('executeGeneration', () => {
  const schema = {
    type: 'character',
    promptKeys: ['name', 'role'],
    modelKeys: ['name', 'role']
  }

  it('returns built entity on success', async () => {
    const { sanitizeJsonResponse } = await import('../../composables/generation/utils')
    sanitizeJsonResponse.mockReturnValue({ name: 'John', role: 'Hero' })

    const { executeGeneration } = await import('../../composables/generation/pipeline/modelRunner')
    const result = await executeGeneration({ userPrompt: 'test', systemPrompt: 'test sys', schema })
    expect(result).toEqual({ name: 'John', role: 'Hero' })
  })

  it('throws on invalid JSON response', async () => {
    const { sanitizeJsonResponse } = await import('../../composables/generation/utils')
    sanitizeJsonResponse.mockReturnValue(null)

    const { executeGeneration } = await import('../../composables/generation/pipeline/modelRunner')
    await expect(executeGeneration({ userPrompt: 'test', systemPrompt: 'test sys', schema }))
      .rejects.toThrow('Invalid JSON')
  })

  it('throws on empty parsed response', async () => {
    const { sanitizeJsonResponse } = await import('../../composables/generation/utils')
    sanitizeJsonResponse.mockReturnValue({})

    const { executeGeneration } = await import('../../composables/generation/pipeline/modelRunner')
    await expect(executeGeneration({ userPrompt: 'test', systemPrompt: 'test sys', schema }))
      .rejects.toThrow('Invalid JSON')
  })
})
