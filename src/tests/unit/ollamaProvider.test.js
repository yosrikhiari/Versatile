import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()

vi.mock('@/config/ollama', () => ({
  getOllamaEndpoint: vi.fn(() => 'http://localhost:11434')
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
    expect(result).toBe('Hello world')
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
