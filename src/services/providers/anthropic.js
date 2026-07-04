import { PROVIDER_BASE_URLS, PROVIDERS } from '../../config/ai'

export async function generate(prompt, systemPrompt, model, options = {}) {
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('Anthropic API key not configured')

  const response = await fetch(`${PROVIDER_BASE_URLS[PROVIDERS.ANTHROPIC]}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    signal: options.signal,
    body: JSON.stringify({
      model: model,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || `Anthropic error: ${response.status}`)
  }

  const data = await response.json()
  return data.content?.[0]?.text || ''
}

export async function stream(prompt, systemPrompt, model, onChunk, options = {}) {
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('Anthropic API key not configured')

  const response = await fetch(`${PROVIDER_BASE_URLS[PROVIDERS.ANTHROPIC]}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    signal: options.signal,
    body: JSON.stringify({
      model: model,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
      stream: true
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || `Anthropic error: ${response.status}`)
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
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullResponse += parsed.delta.text
          if (onChunk) onChunk(parsed.delta.text, fullResponse)
        }
      } catch {}
    }
  }

  return fullResponse
}

export async function testConnection(apiKey) {
  try {
    const response = await fetch(`${PROVIDER_BASE_URLS[PROVIDERS.ANTHROPIC]}/models`, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    })
    return response.ok
  } catch {
    return false
  }
}
