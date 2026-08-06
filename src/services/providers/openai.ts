import { PROVIDER_BASE_URLS, PROVIDERS } from '../../config/ai'
import { DEFAULT_MAX_OUTPUT_TOKENS } from '../../config/generationLimits'
import { TokenLimitError } from '../ai/tokenLimitError'
import { armTimeLimit } from '../../config/timeLimits'

interface OpenAIOptions {
  apiKey?: string
  timeout?: number
  signal?: AbortSignal
  maxTokens?: number
  temperature?: number
  schemaName?: string
}

function timeoutSignal(options: OpenAIOptions) {
  const timeoutMs = options.timeout || 120000
  const controller = new AbortController()
  const externalSignal = options.signal

  const timer = armTimeLimit(timeoutMs, (ms) =>
    controller.abort(new DOMException(`Request timed out after ${ms}ms`, 'AbortError'))
  )

  function onAbort() {
    controller.abort(externalSignal!.reason)
  }
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason)
    } else {
      externalSignal.addEventListener('abort', onAbort, { once: true })
    }
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer)
      if (externalSignal) externalSignal.removeEventListener('abort', onAbort)
    }
  }
}

export async function generate(prompt: string, systemPrompt: string, model: string, options: OpenAIOptions = {}) {
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('OpenAI API key not configured')

  const { signal, cleanup } = timeoutSignal(options)
  try {
    const response = await fetch(`${PROVIDER_BASE_URLS[PROVIDERS.OPENAI]}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      signal,
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS
      })
    })

    cleanup()

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const errMsg = error.error?.message || `OpenAI error: ${response.status}`
      if (error.error?.code === 'context_length_exceeded' || /(?:context_length_exceeded|maximum context length|too many tokens)/i.test(errMsg)) {
        throw new TokenLimitError(errMsg, PROVIDERS.OPENAI, model, options.maxTokens)
      }
      throw new Error(errMsg)
    }

    const data = await response.json()
    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        }
      : null
    return { text: data.choices[0]?.message?.content || '', usage }
  } catch (error) {
    cleanup()
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`OpenAI request timed out`)
    }
    throw error
  }
}

export async function stream(prompt: string, systemPrompt: string, model: string, onChunk?: (text: string, full: string) => void, options: OpenAIOptions = {}) {
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('OpenAI API key not configured')

  const { signal, cleanup } = timeoutSignal(options)
  try {
    const response = await fetch(`${PROVIDER_BASE_URLS[PROVIDERS.OPENAI]}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      signal,
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        stream: true
      })
    })

    cleanup()

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const errMsg = error.error?.message || `OpenAI error: ${response.status}`
      if (error.error?.code === 'context_length_exceeded' || /(?:context_length_exceeded|maximum context length|too many tokens)/i.test(errMsg)) {
        throw new TokenLimitError(errMsg, PROVIDERS.OPENAI, model, options.maxTokens)
      }
      throw new Error(errMsg)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let fullResponse = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') break

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            fullResponse += delta
            if (onChunk) onChunk(delta, fullResponse)
          }
        } catch {
          // Partial/non-JSON SSE line mid-stream; skip — the next chunk continues.
        }
      }
    }

    return fullResponse
  } catch (error) {
    cleanup()
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`OpenAI stream timed out`)
    }
    throw error
  }
}

// Structured output via response_format json_schema. strict:false keeps the
// call resilient to loosely-specified schemas; the caller adds a sanitizeJson
// fallback for older models that ignore the directive.
export async function generateStructured(prompt: string, systemPrompt: string, model: string, schema: Record<string, unknown>, options: OpenAIOptions = {}) {
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('OpenAI API key not configured')

  const { signal, cleanup } = timeoutSignal(options)
  try {
    const response = await fetch(`${PROVIDER_BASE_URLS[PROVIDERS.OPENAI]}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      signal,
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        response_format: {
          type: 'json_schema',
          json_schema: { name: options.schemaName || 'result', schema, strict: false }
        }
      })
    })

    cleanup()

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const errMsg = error.error?.message || `OpenAI error: ${response.status}`
      if (error.error?.code === 'context_length_exceeded' || /(?:context_length_exceeded|maximum context length|too many tokens)/i.test(errMsg)) {
        throw new TokenLimitError(errMsg, PROVIDERS.OPENAI, model, options.maxTokens)
      }
      throw new Error(errMsg)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || ''
    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        }
      : null
    return { data: JSON.parse(content), usage }
  } catch (error) {
    cleanup()
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`OpenAI structured request timed out`)
    }
    throw error
  }
}

export async function testConnection(apiKey: string) {
  try {
    const response = await fetch(`${PROVIDER_BASE_URLS[PROVIDERS.OPENAI]}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    return response.ok
  } catch {
    return false
  }
}
