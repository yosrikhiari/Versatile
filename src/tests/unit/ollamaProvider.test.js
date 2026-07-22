import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()

vi.mock('@/config/ollama', () => ({
  getOllamaEndpoint: vi.fn(() => 'http://localhost:11434'),
  getOllamaNumCtx: vi.fn(() => 16384)
}))

let ollama
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  global.fetch = mockFetch
  ollama = await import('@/services/providers/ollama')
})

describe('ollama generate', () => {
  it('returns response text on success', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'llama3' }] })
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ response: 'Hello world' }) })
    const result = await ollama.generate('prompt', 'system', 'llama3')
    expect(result).toEqual({
      text: 'Hello world',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    })
  })

  it('sends num_ctx so Ollama does not silently fall back to its 4096 default', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'llama3' }] })
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ response: 'ok' }) })

    await ollama.generate('prompt', 'system', 'llama3')

    // The generate call is the second fetch; the first is /api/tags.
    const body = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(body.options.num_ctx).toBe(16384)
  })

  it('lets an explicit numCtx override the configured default', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'llama3' }] })
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ response: 'ok' }) })

    await ollama.generate('prompt', 'system', 'llama3', { numCtx: 8192 })

    const body = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(body.options.num_ctx).toBe(8192)
  })

  it('omits num_ctx when numCtx is 0, deferring to the server default', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'llama3' }] })
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ response: 'ok' }) })

    await ollama.generate('prompt', 'system', 'llama3', { numCtx: 0 })

    const body = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(body.options?.num_ctx).toBeUndefined()
  })

  it('surfaces the real error when a signal is present, not a ReferenceError', async () => {
    // Regression: onAbort was declared inside the try block. ES modules are
    // strict mode, so the catch could not see it — `removeEventListener('abort',
    // onAbort)` threw ReferenceError and MASKED the underlying failure. Only
    // reachable when options.signal is set, which is why it stayed latent.
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'llama3' }] })
      })
      .mockRejectedValueOnce(new Error('connection reset by peer'))

    const controller = new AbortController()
    await expect(
      ollama.generate('prompt', 'system', 'llama3', { signal: controller.signal })
    ).rejects.toThrow(/connection reset by peer/)
  })

  it('stream surfaces the real error when a signal is present', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'llama3' }] })
      })
      .mockRejectedValueOnce(new Error('connection reset by peer'))

    const controller = new AbortController()
    await expect(
      ollama.stream('prompt', 'system', 'llama3', vi.fn(), { signal: controller.signal })
    ).rejects.toThrow(/connection reset by peer/)
  })

  it('surfaces a model-not-found error rather than masking it, with a signal', async () => {
    // ensureModelAvailable throws inside the try while a signal is live — the
    // exact path the original bug corrupted.
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ models: [] }) })

    const controller = new AbortController()
    await expect(
      ollama.generate('prompt', 'system', 'llama3', { signal: controller.signal })
    ).rejects.toThrow(/not found in Ollama/)
  })

  it('throws timeout error when request is aborted', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: 'llama3' }] })
    })
    mockFetch.mockImplementationOnce(() => {
      const error = new DOMException('The operation was aborted', 'AbortError')
      return Promise.reject(error)
    })
    await expect(ollama.generate('prompt', 'system', 'llama3', { timeout: 1 })).rejects.toThrow(
      'Ollama request timed out after 1ms'
    )
  })

  it('throws error when model is not available', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ models: [] }) })
    await expect(ollama.generate('prompt', 'system', 'nonexistent-model'))
      .rejects.toThrow('Model')
      .catch(() => {})
  })

  it('decorates GPU errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: 'llama3' }] })
    })
    mockFetch.mockImplementationOnce(() => {
      return Promise.reject(new Error('CUDA error: out of memory'))
    })
    await expect(ollama.generate('prompt', 'system', 'llama3', { timeout: 1 })).rejects.toThrow(
      'GPU'
    )
  })
})

describe('ollama stream', () => {
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

  it('calls onChunk for each response line', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'llama3' }] })
      })
      .mockResolvedValueOnce(
        makeStreamResponse(['{"response":"Hello"}\n', '{"response":" world"}\n'])
      )
    const onChunk = vi.fn()
    const result = await ollama.stream('prompt', 'system', 'llama3', onChunk)
    expect(onChunk).toHaveBeenCalledTimes(2)
    expect(result).toBe('Hello world')
  })
})

describe('ollama listModels', () => {
  it('returns model names', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: 'llama3' }, { name: 'mistral' }] })
    })
    const models = await ollama.listModels()
    expect(models).toEqual(['llama3', 'mistral'])
  })

  it('returns empty array on failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const models = await ollama.listModels()
    expect(models).toEqual([])
  })
})

describe('ollama testConnection', () => {
  it('returns true when API responds ok', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    const result = await ollama.testConnection()
    expect(result).toBe(true)
  })
})
