import { PROVIDER_BASE_URLS, PROVIDERS } from '../../config/ai'
import { DEFAULT_MAX_OUTPUT_TOKENS } from '../../config/generationLimits'
import { TokenLimitError } from '../ai/tokenLimitError'
import { armTimeLimit } from '../../config/timeLimits'

interface GroqOptions {
  apiKey?: string
  timeout?: number
  signal?: AbortSignal
  maxTokens?: number
  temperature?: number
}

export async function generate(prompt: string, systemPrompt: string, model: string, options: GroqOptions = {}) {
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('Groq API key not configured')

  const timeoutMs = options.timeout || 120000
  let timeout: ReturnType<typeof setTimeout> | undefined
  const controller = new AbortController()
  const externalSignal = options.signal
  const onAbort = () => controller.abort(externalSignal!.reason)

  try {
    timeout = armTimeLimit(timeoutMs, (ms) =>
      controller.abort(new DOMException(`Groq request timed out after ${ms}ms`, 'AbortError'))
    )
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason)
      } else {
        externalSignal.addEventListener('abort', onAbort, { once: true })
      }
    }

    const response = await fetch(`${PROVIDER_BASE_URLS[PROVIDERS.GROQ]}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
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

    clearTimeout(timeout)
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort)

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const errMsg = error.error?.message || `Groq error: ${response.status}`
      if (error.error?.code === 'context_length_exceeded' || /(?:context_length_exceeded|maximum context length|too many tokens)/i.test(errMsg)) {
        throw new TokenLimitError(errMsg, PROVIDERS.GROQ, model, options.maxTokens)
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
    clearTimeout(timeout)
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort)
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Groq request timed out after ${timeoutMs}ms`)
    }
    throw error
  }
}

export async function stream(prompt: string, systemPrompt: string, model: string, onChunk?: (text: string, full: string) => void, options: GroqOptions = {}) {
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('Groq API key not configured')

  const timeoutMs = options.timeout || 120000
  let timeout: ReturnType<typeof setTimeout> | undefined
  const controller = new AbortController()
  const externalSignal = options.signal
  const onAbort = () => controller.abort(externalSignal!.reason)

  try {
    timeout = armTimeLimit(timeoutMs, (ms) =>
      controller.abort(new DOMException(`Groq stream timed out after ${ms}ms`, 'AbortError'))
    )
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason)
      } else {
        externalSignal.addEventListener('abort', onAbort, { once: true })
      }
    }

    const response = await fetch(`${PROVIDER_BASE_URLS[PROVIDERS.GROQ]}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
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

    clearTimeout(timeout)
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort)

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const errMsg = error.error?.message || `Groq error: ${response.status}`
      if (error.error?.code === 'context_length_exceeded' || /(?:context_length_exceeded|maximum context length|too many tokens)/i.test(errMsg)) {
        throw new TokenLimitError(errMsg, PROVIDERS.GROQ, model, options.maxTokens)
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
    clearTimeout(timeout)
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort)
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Groq stream timed out after ${timeoutMs}ms`)
    }
    throw error
  }
}

export async function testConnection(apiKey: string) {
  try {
    const response = await fetch(`${PROVIDER_BASE_URLS[PROVIDERS.GROQ]}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    return response.ok
  } catch {
    return false
  }
}
