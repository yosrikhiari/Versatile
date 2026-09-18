import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()

vi.mock('@/config/ollama', () => ({
  getOllamaEndpoint: vi.fn(() => 'http://localhost:11434'),
  getOllamaNumCtx: vi.fn(() => 8192),
  getOllamaRepeatPenalty: vi.fn(() => 1.15),
  getOllamaRepeatLastN: vi.fn(() => 512),
  getOllamaTopP: vi.fn(() => 0.9),
  getOllamaMinP: vi.fn(() => 0.05)
}))

let transport, agentops, traceContext, ollama
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  localStorage.clear()
  global.fetch = mockFetch
  transport = await import('@/services/providers/agentopsTransport')
  agentops = await import('@/config/agentops')
  traceContext = await import('@/services/traceContext')
  ollama = await import('@/services/providers/ollama')
})

describe('buildAgentOpsRequest', () => {
  it('sends the OpenAI chat shape with the Ollama knobs, the role and a bounded client ref', () => {
    agentops.setAgentOpsUrl('http://gateway:8080/')
    traceContext.setTraceContext({ runId: 'project-uuid-0000-0000:kx1z9', step: 4 })
    const req = transport.buildAgentOpsRequest({
      model: 'qwen2.5:3b-instruct',
      systemPrompt: 'You judge scenes.',
      prompt: 'Score this.',
      ollamaOptions: { num_predict: 300, num_gpu: 0, num_ctx: 8192, temperature: 0.2 },
      format: { type: 'object' },
      keepAlive: '30m',
      think: false,
      agentRole: 'critic'
    })
    expect(req.url).toBe('http://gateway:8080/v1/chat/completions')
    expect(req.headers['X-Agent-Role']).toBe('critic')
    expect(req.headers['X-Client-Ref']).toBe('-0000-0000:kx1z9/4/critic')
    expect(req.clientRef.length).toBeLessThanOrEqual(64)
    const body = JSON.parse(req.body)
    expect(body).toEqual({
      model: 'qwen2.5:3b-instruct',
      messages: [
        { role: 'system', content: 'You judge scenes.' },
        { role: 'user', content: 'Score this.' }
      ],
      stream: true,
      max_tokens: 300,
      options: { num_gpu: 0, num_ctx: 8192, temperature: 0.2 },
      format: { type: 'object' },
      keep_alive: '30m',
      think: false
    })
  })

  it('marks an unplaced call and omits empty parts', () => {
    const req = transport.buildAgentOpsRequest({
      model: 'qwen3:8b',
      systemPrompt: '',
      prompt: 'hi',
      ollamaOptions: {},
      agentRole: null
    })
    expect(req.headers['X-Agent-Role']).toBeUndefined()
    expect(req.clientRef).toBe('adhoc/0/unplaced')
    const body = JSON.parse(req.body)
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(body).not.toHaveProperty('options')
    expect(body).not.toHaveProperty('max_tokens')
    expect(body).not.toHaveProperty('keep_alive')
  })
})

describe('parseAgentOpsLine', () => {
  it('reads deltas, the final usage chunk and [DONE]; ignores comments', () => {
    expect(transport.parseAgentOpsLine(': keep-alive')).toBeNull()
    expect(
      transport.parseAgentOpsLine(
        'data: {"choices":[{"index":0,"delta":{"content":"Hel"},"finish_reason":null}]}'
      )
    ).toEqual({ text: 'Hel' })
    expect(
      transport.parseAgentOpsLine(
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12},"backend":"ollama"}'
      )
    ).toEqual({
      done: true,
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
      backend: 'ollama'
    })
    expect(transport.parseAgentOpsLine('data: [DONE]')).toEqual({ done: true })
    expect(
      transport.parseAgentOpsLine('data: {"error":{"code":"stream_failed","message":"mid-stream"}}')
    ).toEqual({ error: 'mid-stream' })
  })
})

describe('describeAgentOpsError', () => {
  it('tells the operator to register a model the gateway does not serve', () => {
    const msg = transport.describeAgentOpsError(
      400,
      { error: { code: 'unknown_model', message: 'unknown model' } },
      'qwen2.5:3b-instruct'
    )
    expect(msg).toContain('OLLAMA_MODELS=qwen2.5:3b-instruct')
  })
})

/** The gateway's SSE stream, chunked over the wire. */
function sseResponse(lines, traceId = 'abc123def4567890') {
  const reader = { read: vi.fn(), cancel: vi.fn() }
  let idx = 0
  reader.read.mockImplementation(() => {
    if (idx < lines.length) {
      const chunk = lines[idx++]
      return Promise.resolve({ done: false, value: new TextEncoder().encode(chunk) })
    }
    return Promise.resolve({ done: true, value: undefined })
  })
  return {
    ok: true,
    headers: { get: (k) => (k === 'X-Trace-ID' ? traceId : null) },
    body: { getReader: () => reader }
  }
}

describe('ollama provider through AgentOps', () => {
  it('posts to the gateway with the role, parses SSE, reports the trace id', async () => {
    agentops.setAgentOpsTracing(true)
    traceContext.setTraceContext({ runId: 'p:run1', step: 2 })
    const reports = []
    traceContext.onTrace((r) => reports.push(r))
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ models: [{ name: 'm' }] }) })
      .mockResolvedValueOnce(
        sseResponse([
          'data: {"choices":[{"index":0,"delta":{"content":"Hel"},"finish_reason":null}]}\n\n',
          'data: {"choices":[{"index":0,"delta":{"content":"lo"},"fini',
          'sh_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\ndata: [DONE]\n\n'
        ])
      )
    const chunks = []
    const result = await ollama.generate('prompt', 'sys', 'm', {
      agentRole: 'critic',
      numGpu: 0,
      keepAlive: '30m',
      maxTokens: 50,
      onToken: (c) => chunks.push(c)
    })
    expect(result).toEqual({
      text: 'Hello',
      usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 }
    })
    expect(chunks).toEqual(['Hel', 'lo'])

    const [url, init] = mockFetch.mock.calls[1]
    expect(url).toBe('http://localhost:8080/v1/chat/completions')
    expect(init.headers['X-Agent-Role']).toBe('critic')
    expect(init.headers['X-Client-Ref']).toBe('p:run1/2/critic')
    const body = JSON.parse(init.body)
    expect(body.options.num_gpu).toBe(0)
    expect(body.keep_alive).toBe('30m')
    expect(body.max_tokens).toBe(50)
    expect(body.think).toBe(false)
    expect(body.messages[1]).toEqual({ role: 'user', content: 'prompt' })

    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      traceId: 'abc123def4567890',
      agentRole: 'critic',
      clientRef: 'p:run1/2/critic',
      model: 'm'
    })
  })

  it('leaves the native path untouched when tracing is off', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ models: [{ name: 'm' }] }) })
      .mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => {
            let sent = false
            return {
              read: () =>
                sent
                  ? Promise.resolve({ done: true })
                  : ((sent = true),
                    Promise.resolve({
                      done: false,
                      value: new TextEncoder().encode('{"response":"ok","done":true}\n')
                    })),
              cancel: vi.fn()
            }
          }
        }
      })
    const result = await ollama.generate('prompt', 'sys', 'm', { agentRole: 'writer' })
    expect(result.text).toBe('ok')
    const [url, init] = mockFetch.mock.calls[1]
    expect(url).toBe('http://localhost:11434/api/generate')
    expect(init.headers['X-Agent-Role']).toBeUndefined()
    expect(traceContext.recentTraces()).toHaveLength(0)
  })

  it('names the fix when the gateway does not serve the placed model', async () => {
    agentops.setAgentOpsTracing(true)
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ models: [{ name: 'm' }] }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({ error: { code: 'unknown_model', message: 'unknown model "m"' } })
      })
    await expect(ollama.generate('prompt', 'sys', 'm', { agentRole: 'critic' })).rejects.toThrow(
      /OLLAMA_MODELS=m/
    )
  })

  it('surfaces a mid-stream gateway error', async () => {
    agentops.setAgentOpsTracing(true)
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ models: [{ name: 'm' }] }) })
      .mockResolvedValueOnce(
        sseResponse([
          'data: {"choices":[{"index":0,"delta":{"content":"Hel"},"finish_reason":null}]}\n\n',
          'data: {"error":{"code":"stream_failed","message":"model backend failed mid-stream"}}\n\ndata: [DONE]\n\n'
        ])
      )
    await expect(ollama.generate('prompt', 'sys', 'm')).rejects.toThrow(/failed mid-stream/)
  })
})
