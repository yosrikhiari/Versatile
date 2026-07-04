import { PROVIDER_BASE_URLS, PROVIDERS } from '../../config/ai'

export async function generate(prompt, systemPrompt, model, options = {}) {
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('Groq API key not configured')

  const timeoutMs = options.timeout || 120000
  let timeout
  const controller = new AbortController()
  const externalSignal = options.signal

  try {
    timeout = setTimeout(
      () =>
        controller.abort(
          new DOMException(`Groq request timed out after ${timeoutMs}ms`, 'AbortError')
        ),
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
        max_tokens: options.maxTokens || 4096
      })
    })

    clearTimeout(timeout)
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort)

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || `Groq error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ''
  } catch (error) {
    clearTimeout(timeout)
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort)
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Groq request timed out after ${timeoutMs}ms`)
    }
    throw error
  }
}

export async function stream(prompt, systemPrompt, model, onChunk, options = {}) {
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('Groq API key not configured')

  const timeoutMs = options.timeout || 120000
  let timeout
  const controller = new AbortController()
  const externalSignal = options.signal

  try {
    timeout = setTimeout(
      () =>
        controller.abort(
          new DOMException(`Groq stream timed out after ${timeoutMs}ms`, 'AbortError')
        ),
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
        max_tokens: options.maxTokens || 4096,
        stream: true
      })
    })

    clearTimeout(timeout)
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort)

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || `Groq error: ${response.status}`)
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
        } catch {}
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

export async function testConnection(apiKey) {
  try {
    const response = await fetch(`${PROVIDER_BASE_URLS[PROVIDERS.GROQ]}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    return response.ok
  } catch {
    return false
  }
}
