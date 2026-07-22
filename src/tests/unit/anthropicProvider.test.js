import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Anthropic provider', () => {
  beforeEach(() => {
    vi.resetModules()
    global.fetch = vi.fn()
  })

  it('generate throws without API key', async () => {
    const { generate } = await import('../../services/providers/anthropic')
    await expect(generate('p', 's', 'claude-3', {})).rejects.toThrow('API key not configured')
  })

  it('generate returns content on success', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: 'Hello' }] })
    })
    const { generate } = await import('../../services/providers/anthropic')
    const result = await generate('test', 'sys', 'claude-3', { apiKey: 'sk-test' })
    expect(result).toEqual({ text: 'Hello', usage: null })
  })

  it('generate throws on API error', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: 'Invalid key' } })
    })
    const { generate } = await import('../../services/providers/anthropic')
    await expect(generate('test', 'sys', 'claude-3', { apiKey: 'sk-test' })).rejects.toThrow(
      'Invalid key'
    )
  })

  it('generate throws with status when no error body', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('parse fail'))
    })
    const { generate } = await import('../../services/providers/anthropic')
    await expect(generate('test', 'sys', 'claude-3', { apiKey: 'sk-test' })).rejects.toThrow(
      'Anthropic error: 500'
    )
  })

  it('testConnection returns true on success', async () => {
    global.fetch.mockResolvedValue({ ok: true })
    const { testConnection } = await import('../../services/providers/anthropic')
    expect(await testConnection('sk-test')).toBe(true)
  })

  it('testConnection returns false on failure', async () => {
    global.fetch.mockResolvedValue({ ok: false })
    const { testConnection } = await import('../../services/providers/anthropic')
    expect(await testConnection('sk-test')).toBe(false)
  })

  it('testConnection returns false on network error', async () => {
    global.fetch.mockRejectedValue(new Error('fail'))
    const { testConnection } = await import('../../services/providers/anthropic')
    expect(await testConnection('sk-test')).toBe(false)
  })
})
