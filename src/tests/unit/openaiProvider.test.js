import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('OpenAI provider', () => {
  beforeEach(() => {
    vi.resetModules()
    global.fetch = vi.fn()
  })

  it('generate throws without API key', async () => {
    const { generate } = await import('../../services/providers/openai')
    await expect(generate('prompt', 'system', 'gpt-4', {})).rejects.toThrow(
      'API key not configured'
    )
  })

  it('generate returns content on success', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Hello' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      })
    })
    const { generate } = await import('../../services/providers/openai')
    const result = await generate('test', 'sys', 'gpt-4', { apiKey: 'sk-test' })
    expect(result).toEqual({
      text: 'Hello',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('generate throws on API error', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: 'Invalid key' } })
    })
    const { generate } = await import('../../services/providers/openai')
    await expect(generate('test', 'sys', 'gpt-4', { apiKey: 'sk-test' })).rejects.toThrow(
      'Invalid key'
    )
  })

  it('generate throws with status message when no error body', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('parse fail'))
    })
    const { generate } = await import('../../services/providers/openai')
    await expect(generate('test', 'sys', 'gpt-4', { apiKey: 'sk-test' })).rejects.toThrow(
      'OpenAI error: 500'
    )
  })

  it('testConnection returns true on success', async () => {
    global.fetch.mockResolvedValue({ ok: true })
    const { testConnection } = await import('../../services/providers/openai')
    const result = await testConnection('sk-test')
    expect(result).toBe(true)
  })

  it('testConnection returns false on failure', async () => {
    global.fetch.mockResolvedValue({ ok: false })
    const { testConnection } = await import('../../services/providers/openai')
    const result = await testConnection('sk-test')
    expect(result).toBe(false)
  })

  it('testConnection returns false on network error', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'))
    const { testConnection } = await import('../../services/providers/openai')
    const result = await testConnection('sk-test')
    expect(result).toBe(false)
  })
})
