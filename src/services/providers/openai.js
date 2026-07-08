import { PROVIDER_BASE_URLS, PROVIDERS } from '../../config/ai'

function timeoutSignal(options) {
  const timeoutMs = options.timeout || 120000
  const controller = new AbortController()
  const externalSignal = options.signal

  const timer = setTimeout(
    () => controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'AbortError')),
    timeoutMs
  )

  function onAbort() {
    controller.abort(externalSignal.reason)
  }
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason)
    } else {
      externalSignal.addEventListener('abort', onAbort, { once: true })
    }
  }

  return { signal: controller.signal, cleanup() { clearTimeout(timer); if (externalSignal) externalSignal.removeEventListener('abort', onAbort) } }
}

export async function generate(prompt, systemPrompt, model, options = {}) {
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
        max_tokens: options.maxTokens || 4096
      })
    })

    cleanup()

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || `OpenAI error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ''
  } catch (error) {
    cleanup()
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`OpenAI request timed out`)
    }
    throw error
  }
}

export async function stream(prompt, systemPrompt, model, onChunk, options = {}) {
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
        max_tokens: options.maxTokens || 4096,
        stream: true
      })
    })

    cleanup()

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || `OpenAI error: ${response.status}`)
    }

    const reader = response.body.getReader()
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
export async function generateStructured(prompt, systemPrompt, model, schema, options = {}) {
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
        max_tokens: options.maxTokens || 4096,
        response_format: {
          type: 'json_schema',
          json_schema: { name: options.schemaName || 'result', schema, strict: false }
        }
      })
    })

    cleanup()

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || `OpenAI error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || ''
    return JSON.parse(content)
  } catch (error) {
    cleanup()
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`OpenAI structured request timed out`)
    }
    throw error
  }
}

export async function testConnection(apiKey) {
  try {
    const response = await fetch(`${PROVIDER_BASE_URLS[PROVIDERS.OPENAI]}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    return response.ok
  } catch {
    return false
  }
}
