import { PROVIDER_BASE_URLS, PROVIDERS } from '../../config/ai'
import { DEFAULT_MAX_OUTPUT_TOKENS } from '../../config/generationLimits'

interface GeminiOptions {
  apiKey?: string
  timeout?: number
  signal?: AbortSignal
  maxTokens?: number
  temperature?: number
  stop?: string | string[]
}

function timeoutSignal(options: GeminiOptions) {
  const timeoutMs = options.timeout || 120000
  const controller = new AbortController()
  const externalSignal = options.signal

  const timer = setTimeout(
    () =>
      controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'AbortError')),
    timeoutMs
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

function buildBody(prompt: string, systemPrompt: string, options: GeminiOptions) {
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS
    }
  }
  if (systemPrompt) {
    body.system_instruction = { parts: [{ text: systemPrompt }] }
  }
  if (options.stop) {
    body.generationConfig = {
      ...(body.generationConfig as Record<string, unknown>),
      stopSequences: Array.isArray(options.stop)
        ? options.stop
        : [options.stop]
    }
  }
  return body
}

export async function generate(prompt: string, systemPrompt: string, model: string, options: GeminiOptions = {}) {
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('Gemini API key not configured')

  const url = `${PROVIDER_BASE_URLS[PROVIDERS.GEMINI]}/models/${model}:generateContent`
  const { signal, cleanup } = timeoutSignal(options)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal,
      body: JSON.stringify(buildBody(prompt, systemPrompt, options))
    })

    cleanup()

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || `Gemini error: ${response.status}`)
    }

    const data = await response.json()
    const usage = data.usageMetadata
      ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount
        }
      : null
    return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || '', usage }
  } catch (error) {
    cleanup()
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Gemini request timed out`)
    }
    throw error
  }
}

export async function stream(prompt: string, systemPrompt: string, model: string, onChunk?: (text: string, full: string) => void, options: GeminiOptions = {}) {
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('Gemini API key not configured')

  const url = `${PROVIDER_BASE_URLS[PROVIDERS.GEMINI]}/models/${model}:streamGenerateContent?alt=sse`
  const { signal, cleanup } = timeoutSignal(options)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal,
      body: JSON.stringify(buildBody(prompt, systemPrompt, options))
    })

    cleanup()

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || `Gemini error: ${response.status}`)
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
        if (!data || data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) {
            fullResponse += text
            if (onChunk) onChunk(text, fullResponse)
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
      throw new Error(`Gemini stream timed out`)
    }
    throw error
  }
}

export async function testConnection(apiKey: string) {
  try {
    const url = `${PROVIDER_BASE_URLS[PROVIDERS.GEMINI]}/models`
    const response = await fetch(url, {
      headers: { 'x-goog-api-key': apiKey }
    })
    return response.ok
  } catch {
    return false
  }
}
