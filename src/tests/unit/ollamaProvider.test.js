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

/** Ollama's NDJSON stream: one JSON object per line, last one carries `done`. */
function makeStreamResponse(chunks) {
  const reader = { read: vi.fn() }
  let idx = 0
  reader.read.mockImplementation(() => {
    if (idx < chunks.length) {
      const chunk = chunks[idx]
      idx++
      return Promise.resolve({ done: false, value: new TextEncoder().encode(chunk) })
    }
    return Promise.resolve({ done: true, value: undefined })
  })
  reader.cancel = vi.fn()
  return { body: { getReader: () => reader }, ok: true }
}

function mockTags(models = [{ name: 'llama3' }]) {
  return { ok: true, json: () => Promise.resolve({ models }) }
}

describe('ollama generate', () => {
  it('returns response text assembled from the stream', async () => {
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockResolvedValueOnce(
        makeStreamResponse([
          '{"response":"Hello"}\n',
          '{"response":" world"}\n',
          '{"done":true,"prompt_eval_count":10,"eval_count":2}\n'
        ])
      )
    const result = await ollama.generate('prompt', 'system', 'llama3')
    expect(result).toEqual({
      text: 'Hello world',
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 }
    })
  })

  it('streams rather than blocking, so progress is observable', async () => {
    // The whole timeout fix rests on this: a non-streaming request returns
    // nothing until it finishes, which is why a healthy slow call could not be
    // told apart from a wedged one.
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockResolvedValueOnce(makeStreamResponse(['{"response":"ok"}\n']))

    await ollama.generate('prompt', 'system', 'llama3')

    const body = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(body.stream).toBe(true)
  })

  it('reassembles a JSON object split across two network chunks', async () => {
    // Chunk boundaries do not respect line boundaries. Splitting on '\n' without
    // carrying the remainder forward drops both halves and truncates the output.
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockResolvedValueOnce(makeStreamResponse(['{"resp', 'onse":"split"}\n{"response":"-ok"}\n']))

    const result = await ollama.generate('prompt', 'system', 'llama3')
    expect(result.text).toBe('split-ok')
  })

  it('sends num_ctx so Ollama does not silently fall back to its 4096 default', async () => {
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockResolvedValueOnce(makeStreamResponse(['{"response":"ok"}\n']))

    await ollama.generate('prompt', 'system', 'llama3')

    const body = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(body.options.num_ctx).toBe(16384)
  })

  it('lets an explicit numCtx override the configured default', async () => {
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockResolvedValueOnce(makeStreamResponse(['{"response":"ok"}\n']))

    await ollama.generate('prompt', 'system', 'llama3', { numCtx: 8192 })

    const body = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(body.options.num_ctx).toBe(8192)
  })

  it('omits num_ctx when numCtx is 0, deferring to the server default', async () => {
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockResolvedValueOnce(makeStreamResponse(['{"response":"ok"}\n']))

    await ollama.generate('prompt', 'system', 'llama3', { numCtx: 0 })

    const body = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(body.options?.num_ctx).toBeUndefined()
  })

  it('surfaces the real error when a signal is present, not a ReferenceError', async () => {
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockRejectedValueOnce(new Error('connection reset by peer'))

    const controller = new AbortController()
    await expect(
      ollama.generate('prompt', 'system', 'llama3', { signal: controller.signal })
    ).rejects.toThrow(/connection reset by peer/)
  })

  it('stream surfaces the real error when a signal is present', async () => {
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockRejectedValueOnce(new Error('connection reset by peer'))

    const controller = new AbortController()
    await expect(
      ollama.stream('prompt', 'system', 'llama3', vi.fn(), { signal: controller.signal })
    ).rejects.toThrow(/connection reset by peer/)
  })

  it('surfaces a model-not-found error rather than masking it, with a signal', async () => {
    mockFetch.mockResolvedValueOnce(mockTags([]))

    const controller = new AbortController()
    await expect(
      ollama.generate('prompt', 'system', 'llama3', { signal: controller.signal })
    ).rejects.toThrow(/not found in Ollama/)
  })

  it('reports a ceiling breach distinctly from a user cancellation', async () => {
    mockFetch.mockResolvedValueOnce(mockTags())
    mockFetch.mockImplementationOnce(() =>
      Promise.reject(new DOMException('The operation was aborted', 'AbortError'))
    )
    await expect(ollama.generate('prompt', 'system', 'llama3', { timeout: 1 })).rejects.toThrow(
      /exceeded its 1ms ceiling/
    )
  })

  it('propagates a user-initiated abort as an abort, not as a timeout', async () => {
    // Pressing Stop is an outcome, not a fault. Rewriting it as "timed out" made
    // every cancelled run report itself as a failure.
    mockFetch.mockResolvedValueOnce(mockTags())
    const controller = new AbortController()
    controller.abort()
    mockFetch.mockImplementationOnce(() =>
      Promise.reject(new DOMException('The operation was aborted', 'AbortError'))
    )

    await expect(
      ollama.generate('prompt', 'system', 'llama3', { signal: controller.signal })
    ).rejects.toThrow(/aborted/i)
  })

  it('decorates GPU errors', async () => {
    mockFetch.mockResolvedValueOnce(mockTags())
    mockFetch.mockImplementationOnce(() => Promise.reject(new Error('CUDA error: out of memory')))
    await expect(ollama.generate('prompt', 'system', 'llama3', { timeout: 1 })).rejects.toThrow(
      'GPU'
    )
  })
})

describe('ollama idle timeout', () => {
  it('fails fast when the stream stalls, and keeps the partial output', async () => {
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('{"response":"partial"}\n')
        })
        // Then nothing, ever — a wedged server.
        .mockImplementation(() => new Promise(() => {})),
      cancel: vi.fn()
    }
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockResolvedValueOnce({ ok: true, body: { getReader: () => reader } })

    const err = await ollama
      .generate('prompt', 'system', 'llama3', { idleTimeout: 20, firstTokenTimeout: 50 })
      .catch((e) => e)

    expect(err.name).toBe('OllamaStalledError')
    expect(err.partial).toBe('partial')
  })

  it('does NOT kill a slow-but-progressing stream', async () => {
    // The regression that broke 10-chapter runs: a healthy 6 tok/s generation was
    // cancelled by a wall-clock budget. Tokens spaced under the idle limit must
    // survive indefinitely, regardless of total elapsed time.
    let emitted = 0
    const reader = {
      read: vi.fn().mockImplementation(() => {
        if (emitted >= 6) return Promise.resolve({ done: true, value: undefined })
        emitted++
        return new Promise((resolve) =>
          setTimeout(
            () => resolve({ done: false, value: new TextEncoder().encode('{"response":"tok"}\n') }),
            15
          )
        )
      }),
      cancel: vi.fn()
    }
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockResolvedValueOnce({ ok: true, body: { getReader: () => reader } })

    // Total elapsed (~90ms) far exceeds any single gap (~15ms).
    const result = await ollama.generate('prompt', 'system', 'llama3', {
      idleTimeout: 60,
      firstTokenTimeout: 60
    })
    expect(result.text).toBe('toktoktoktoktoktok')
  })

  it('allows a longer silence before the first token than between tokens', async () => {
    // Prompt evaluation produces no output at all and scales with prompt size;
    // holding it to the between-token budget failed large prompts spuriously.
    const reader = {
      read: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    done: false,
                    value: new TextEncoder().encode('{"response":"late"}\n')
                  }),
                40
              )
            )
        )
        .mockResolvedValue({ done: true, value: undefined }),
      cancel: vi.fn()
    }
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockResolvedValueOnce({ ok: true, body: { getReader: () => reader } })

    const result = await ollama.generate('prompt', 'system', 'llama3', {
      idleTimeout: 10,
      firstTokenTimeout: 200
    })
    expect(result.text).toBe('late')
  })
})

describe('ollama stream', () => {
  it('calls onChunk for each response line', async () => {
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockResolvedValueOnce(
        makeStreamResponse(['{"response":"Hello"}\n', '{"response":" world"}\n'])
      )
    const onChunk = vi.fn()
    const result = await ollama.stream('prompt', 'system', 'llama3', onChunk)
    expect(onChunk).toHaveBeenCalledTimes(2)
    expect(result).toBe('Hello world')
  })
})

describe('ollama reasoning models', () => {
  it('disables thinking by default', async () => {
    // Measured on qwen3:8b: with thinking on, a 40-token budget was spent
    // entirely on reasoning and the response came back EMPTY. The same call with
    // thinking off answers in 2 tokens.
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockResolvedValueOnce(makeStreamResponse(['{"response":"ready"}\n']))

    await ollama.generate('prompt', 'system', 'llama3')

    const body = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(body.think).toBe(false)
  })

  it('lets a caller opt thinking back on', async () => {
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockResolvedValueOnce(makeStreamResponse(['{"response":"ok"}\n']))

    await ollama.generate('prompt', 'system', 'llama3', { think: true })

    expect(JSON.parse(mockFetch.mock.calls[1][1].body).think).toBe(true)
  })

  it('never mistakes reasoning tokens for output', async () => {
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockResolvedValueOnce(
        makeStreamResponse([
          '{"thinking":"Let me consider this carefully"}\n',
          '{"response":"the answer"}\n'
        ])
      )

    const result = await ollama.generate('prompt', 'system', 'llama3', { think: true })
    expect(result.text).toBe('the answer')
  })

  it('warns when a call produced only reasoning and no output', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockResolvedValueOnce(
        makeStreamResponse(['{"thinking":"thinking hard"}\n', '{"done":true,"eval_count":40}\n'])
      )

    const result = await ollama.generate('prompt', 'system', 'llama3', { think: true })

    expect(result.text).toBe('')
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/entire 40-token budget on reasoning/))
    warn.mockRestore()
  })
})

describe('ollama generateStructured', () => {
  it('sends the schema as `format` and still streams', async () => {
    const schema = { type: 'object', properties: { a: { type: 'string' } } }
    mockFetch
      .mockResolvedValueOnce(mockTags())
      .mockResolvedValueOnce(
        makeStreamResponse(['{"response":"{\\"a\\":"}\n', '{"response":"\\"b\\"}"}\n'])
      )

    const result = await ollama.generateStructured('p', 's', 'llama3', schema)

    const body = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(body.format).toEqual(schema)
    expect(body.stream).toBe(true)
    expect(result.data).toEqual({ a: 'b' })
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
