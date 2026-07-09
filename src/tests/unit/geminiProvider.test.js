import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Gemini provider', () => {
  beforeEach(() => {
    vi.resetModules()
    global.fetch = vi.fn()
  })

  it('generate throws without API key', async () => {
    const { generate } = await import('../../services/providers/gemini')
    await expect(generate('p', 's', 'gemini-pro', {})).rejects.toThrow('API key not configured')
  })

  it('generate returns content on success', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'Hello' }] } }] })
    })
    const { generate } = await import('../../services/providers/gemini')
    const result = await generate('test', 'sys', 'gemini-pro', { apiKey: 'gk-test' })
    expect(result).toBe('Hello')
  })

  it('generate throws on API error', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: { message: 'Forbidden' } })
    })
    const { generate } = await import('../../services/providers/gemini')
    await expect(generate('test', 'sys', 'gemini-pro', { apiKey: 'gk-test' })).rejects.toThrow(
      'Forbidden'
    )
  })

  it('generate throws with status when no error body', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('parse fail'))
    })
    const { generate } = await import('../../services/providers/gemini')
    await expect(generate('test', 'sys', 'gemini-pro', { apiKey: 'gk-test' })).rejects.toThrow(
      'Gemini error: 500'
    )
  })

  it('testConnection returns true on success', async () => {
    global.fetch.mockResolvedValue({ ok: true })
    const { testConnection } = await import('../../services/providers/gemini')
    expect(await testConnection('gk-test')).toBe(true)
  })

  it('testConnection returns false on failure', async () => {
    global.fetch.mockResolvedValue({ ok: false })
    const { testConnection } = await import('../../services/providers/gemini')
    expect(await testConnection('gk-test')).toBe(false)
  })

  it('testConnection returns false on network error', async () => {
    global.fetch.mockRejectedValue(new Error('fail'))
    const { testConnection } = await import('../../services/providers/gemini')
    expect(await testConnection('gk-test')).toBe(false)
  })
})
