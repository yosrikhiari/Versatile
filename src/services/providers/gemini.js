import { PROVIDER_BASE_URLS, PROVIDERS } from '../../config/ai'

function timeoutSignal(options) {
  const timeoutMs = options.timeout || 120000
  const controller = new AbortController()
  const externalSignal = options.signal

  const timer = setTimeout(
    () =>
      controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'AbortError')),
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

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer)
      if (externalSignal) externalSignal.removeEventListener('abort', onAbort)
    }
  }
}

function buildBody(prompt, systemPrompt, options) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens || 4096
    }
  }
  // Use Gemini's native system_instruction rather than faking a user/model turn —
  // the model follows a real system instruction far more reliably.
  if (systemPrompt) {
    body.system_instruction = { parts: [{ text: systemPrompt }] }
  }
  if (options.stop) {
    body.generationConfig.stopSequences = Array.isArray(options.stop)
      ? options.stop
      : [options.stop]
  }
  return body
}

export async function generate(prompt, systemPrompt, model, options = {}) {
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
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  } catch (error) {
    cleanup()
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Gemini request timed out`)
    }
    throw error
  }
}

export async function stream(prompt, systemPrompt, model, onChunk, options = {}) {
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

export async function testConnection(apiKey) {
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
