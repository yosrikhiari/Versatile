import { PROVIDER_BASE_URLS, PROVIDERS } from '../../config/ai'

export async function generate(prompt, systemPrompt, model, options = {}) {
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('Gemini API key not configured')

  const url = `${PROVIDER_BASE_URLS[PROVIDERS.GEMINI]}/models/${model}:generateContent?key=${apiKey}`

  const contents = []
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] })
    contents.push({ role: 'model', parts: [{ text: 'Understood.' }] })
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] })

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens || 4096
      }
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || `Gemini error: ${response.status}`)
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

export async function stream(prompt, systemPrompt, model, onChunk, options = {}) {
  const apiKey = options.apiKey
  if (!apiKey) throw new Error('Gemini API key not configured')

  const url = `${PROVIDER_BASE_URLS[PROVIDERS.GEMINI]}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`

  const contents = []
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] })
    contents.push({ role: 'model', parts: [{ text: 'Understood.' }] })
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] })

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens || 4096
      }
    })
  })

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
      } catch {}
    }
  }

  return fullResponse
}

export async function testConnection(apiKey) {
  try {
    const url = `${PROVIDER_BASE_URLS[PROVIDERS.GEMINI]}/models?key=${apiKey}`
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}
