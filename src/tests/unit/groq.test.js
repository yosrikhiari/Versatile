import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()

vi.mock('../../config/ai', () => ({
  PROVIDER_BASE_URLS: { groq: 'https://api.groq.com' },
  PROVIDERS: { GROQ: 'groq' }
}))

let groq
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  global.fetch = mockFetch
  groq = await import('@/services/providers/groq')
})

function makeStreamResponse(chunks) {
  const reader = {
    read: vi.fn()
  }
  let idx = 0
  reader.read.mockImplementation(() => {
    if (idx < chunks.length) {
      const chunk = chunks[idx]
      idx++
      return Promise.resolve({ done: false, value: new TextEncoder().encode(chunk) })
    }
    return Promise.resolve({ done: true, value: undefined })
  })
  return { body: { getReader: () => reader }, ok: true }
}

describe('groq generate', () => {
  it('throws if no API key provided', async () => {
    await expect(groq.generate('prompt', 'system', 'mixtral', {})).rejects.toThrow('Groq API key not configured')
  })

  it('returns content on successful response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'Hello world' } }] })
    })
    const result = await groq.generate('prompt', 'system', 'mixtral', { apiKey: 'key' })
    expect(result).toBe('Hello world')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: 'Unauthorized' } })
    })
    await expect(groq.generate('prompt', 'system', 'mixtral', { apiKey: 'bad' })).rejects.toThrow('Unauthorized')
  })

  it('uses generic error when error body is not parseable', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('parse fail'))
    })
    await expect(groq.generate('prompt', 'system', 'mixtral', { apiKey: 'key' })).rejects.toThrow('Groq error: 500')
  })

  it('throws timeout error when request is aborted', async () => {
    mockFetch.mockImplementation(() => {
      const error = new DOMException('The operation was aborted', 'AbortError')
      return Promise.reject(error)
    })
    await expect(groq.generate('prompt', 'system', 'mixtral', { apiKey: 'key', timeout: 1 })).rejects.toThrow('Groq request timed out after 1ms')
  })

  it('re-throws non-timeout errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    await expect(groq.generate('prompt', 'system', 'mixtral', { apiKey: 'key' })).rejects.toThrow('Network error')
  })

  it('returns empty string when content is missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: {} }] })
    })
    const result = await groq.generate('prompt', 'system', 'mixtral', { apiKey: 'key' })
    expect(result).toBe('')
  })
})

describe('groq stream', () => {
  it('throws if no API key provided', async () => {
    await expect(groq.stream('prompt', 'system', 'mixtral', vi.fn(), {})).rejects.toThrow('Groq API key not configured')
  })

  it('calls onChunk for each delta', async () => {
    const streamData = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n',
      'data: [DONE]\n'
    ]
    mockFetch.mockResolvedValue(makeStreamResponse(streamData))
    const onChunk = vi.fn()
    const result = await groq.stream('prompt', 'system', 'mixtral', onChunk, { apiKey: 'key' })
    expect(onChunk).toHaveBeenCalledTimes(2)
    expect(onChunk).toHaveBeenNthCalledWith(1, 'Hello', 'Hello')
    expect(onChunk).toHaveBeenNthCalledWith(2, ' world', 'Hello world')
    expect(result).toBe('Hello world')
  })

  it('handles multiple lines per chunk', async () => {
    const streamData = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\ndata: {"choices":[{"delta":{"content":" world"}}]}\n'
    ]
    mockFetch.mockResolvedValue(makeStreamResponse(streamData))
    const onChunk = vi.fn()
    const result = await groq.stream('prompt', 'system', 'mixtral', onChunk, { apiKey: 'key' })
    expect(onChunk).toHaveBeenCalledTimes(2)
    expect(result).toBe('Hello world')
  })

  it('skips non-data lines', async () => {
    const streamData = [
      ': keepalive\n',
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n'
    ]
    mockFetch.mockResolvedValue(makeStreamResponse(streamData))
    const result = await groq.stream('prompt', 'system', 'mixtral', vi.fn(), { apiKey: 'key' })
    expect(result).toBe('Hi')
  })

  it('throws timeout error', async () => {
    mockFetch.mockImplementation(() => {
      const error = new DOMException('The operation was aborted', 'AbortError')
      return Promise.reject(error)
    })
    await expect(groq.stream('prompt', 'system', 'mixtral', vi.fn(), { apiKey: 'key', timeout: 1 })).rejects.toThrow('Groq stream timed out after 1ms')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429, json: () => Promise.resolve({ error: { message: 'Rate limited' } }) })
    await expect(groq.stream('prompt', 'system', 'mixtral', vi.fn(), { apiKey: 'key' })).rejects.toThrow('Rate limited')
  })
})

describe('groq testConnection', () => {
  it('returns true when API responds ok', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    const result = await groq.testConnection('key')
    expect(result).toBe(true)
  })

  it('returns false when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const result = await groq.testConnection('key')
    expect(result).toBe(false)
  })
})
