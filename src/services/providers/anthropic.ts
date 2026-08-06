import { PROVIDER_BASE_URLS, PROVIDERS } from '../../config/ai'
import { DEFAULT_MAX_OUTPUT_TOKENS } from '../../config/generationLimits'
import { TokenLimitError } from '../ai/tokenLimitError'
import { armTimeLimit } from '../../config/timeLimits'

interface AnthropicOptions {
  apiKey?: string
  timeout?: number
  signal?: AbortSignal
  maxTokens?: number
  temperature?: number
  schemaName?: string
}

interface Usage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

function timeoutSignal(options: AnthropicOptions) {
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

export async function generate(prompt: string, systemPrompt: string, model: string, options: AnthropicOptions = {}) {
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('Anthropic API key not configured')

  const { signal, cleanup } = timeoutSignal(options)
  try {
    const response = await fetch(`${PROVIDER_BASE_URLS[PROVIDERS.ANTHROPIC]}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      signal,
      body: JSON.stringify({
        model: model,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        temperature: options.temperature ?? 0.7
      })
    })

    cleanup()

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const errMsg = error.error?.message || `Anthropic error: ${response.status}`
      if (
        error.error?.type === 'invalid_request_error' &&
        /(?:too_many_tokens|prompt is too long|context_length_exceeded)/i.test(errMsg)
      ) {
        throw new TokenLimitError(errMsg, PROVIDERS.ANTHROPIC, model, options.maxTokens)
      }
      throw new Error(errMsg)
    }

    const data = await response.json()
    const usage = data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens
        }
      : null
    return { text: data.content?.[0]?.text || '', usage }
  } catch (error) {
    cleanup()
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Anthropic request timed out`)
    }
    throw error
  }
}

export async function stream(prompt: string, systemPrompt: string, model: string, onChunk?: (text: string, full: string) => void, options: AnthropicOptions = {}) {
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('Anthropic API key not configured')

  const { signal, cleanup } = timeoutSignal(options)
  try {
    const response = await fetch(`${PROVIDER_BASE_URLS[PROVIDERS.ANTHROPIC]}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      signal,
      body: JSON.stringify({
        model: model,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        temperature: options.temperature ?? 0.7,
        stream: true
      })
    })

    cleanup()

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const errMsg = error.error?.message || `Anthropic error: ${response.status}`
      if (
        error.error?.type === 'invalid_request_error' &&
        /(?:too_many_tokens|prompt is too long|context_length_exceeded)/i.test(errMsg)
      ) {
        throw new TokenLimitError(errMsg, PROVIDERS.ANTHROPIC, model, options.maxTokens)
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
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullResponse += parsed.delta.text
            if (onChunk) onChunk(parsed.delta.text, fullResponse)
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
      throw new Error(`Anthropic stream timed out`)
    }
    throw error
  }
}

// Structured output via forced tool-use: the model must call our single tool,
// whose input_schema is the caller's JSON schema, so the return is a validated
// object rather than free text we have to regex out of prose.
export async function generateStructured(prompt: string, systemPrompt: string, model: string, schema: Record<string, unknown>, options: AnthropicOptions = {}) {
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('Anthropic API key not configured')

  const toolName = options.schemaName || 'emit_result'
  const { signal, cleanup } = timeoutSignal(options)
  try {
    const response = await fetch(`${PROVIDER_BASE_URLS[PROVIDERS.ANTHROPIC]}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      signal,
      body: JSON.stringify({
        model: model,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        temperature: options.temperature ?? 0.7,
        tools: [
          {
            name: toolName,
            description: 'Return the structured result for this request.',
            input_schema: schema
          }
        ],
        tool_choice: { type: 'tool', name: toolName }
      })
    })

    cleanup()

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const errMsg = error.error?.message || `Anthropic error: ${response.status}`
      if (
        error.error?.type === 'invalid_request_error' &&
        /(?:too_many_tokens|prompt is too long|context_length_exceeded)/i.test(errMsg)
      ) {
        throw new TokenLimitError(errMsg, PROVIDERS.ANTHROPIC, model, options.maxTokens)
      }
      throw new Error(errMsg)
    }

    const data = await response.json()
    const toolUse = (data.content || []).find((b: { type: string }) => b.type === 'tool_use')
    if (!toolUse || typeof toolUse.input !== 'object') {
      throw new Error('Anthropic returned no structured tool_use output')
    }
    const usage = data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens
        }
      : null
    return { data: toolUse.input, usage }
  } catch (error) {
    cleanup()
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Anthropic structured request timed out`)
    }
    throw error
  }
}

export async function testConnection(apiKey: string) {
  try {
    const response = await fetch(`${PROVIDER_BASE_URLS[PROVIDERS.ANTHROPIC]}/models`, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      }
    })
    return response.ok
  } catch {
    return false
  }
}
