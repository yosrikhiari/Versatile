import { getOllamaEndpoint } from '../../config/ollama'

const modelCache = new Set()
let modelCacheLoaded = false

async function ensureModelAvailable(model) {
  if (!model) return
  if (modelCache.has(model)) return

  if (!modelCacheLoaded) {
    try {
      const response = await fetch(`${getOllamaEndpoint()}/api/tags`)
      if (response.ok) {
        const data = await response.json()
        for (const m of (data.models || [])) {
          modelCache.add(m.name)
        }
        modelCacheLoaded = true
      }
    } catch {}
  }

  if (modelCacheLoaded && !modelCache.has(model)) {
    throw new Error(`Model "${model}" not found in Ollama. Pull it first with: ollama pull ${model}`)
  }
}

export async function generate(prompt, systemPrompt, model, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeout || 180000)

  try {
    await ensureModelAvailable(model)

    const response = await fetch(`${getOllamaEndpoint()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        system: systemPrompt,
        prompt: prompt,
        stream: false
      }),
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (!response.ok) {
      let detail = ''
      try {
        const errBody = await response.json()
        detail = errBody.error || JSON.stringify(errBody)
      } catch {}
      throw new Error(`Ollama error (${response.status}): ${detail}`.trim())
    }

    const data = await response.json()
    return data.response
  } catch (error) {
    clearTimeout(timeout)
    throw error
  }
}

export async function stream(prompt, systemPrompt, model, onChunk, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeout || 120000)

  try {
    await ensureModelAvailable(model)

    const response = await fetch(`${getOllamaEndpoint()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        system: systemPrompt,
        prompt: prompt,
        stream: true
      }),
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (!response.ok) {
      let detail = ''
      try {
        const errBody = await response.json()
        detail = errBody.error || JSON.stringify(errBody)
      } catch {}
      throw new Error(`Ollama error (${response.status}): ${detail}`.trim())
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullResponse = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter(line => line.trim())

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          if (parsed.response) {
            fullResponse += parsed.response
            if (onChunk) onChunk(parsed.response, fullResponse)
          }
        } catch {}
      }
    }

    return fullResponse
  } catch (error) {
    clearTimeout(timeout)
    throw error
  }
}

export async function listModels() {
  try {
    const response = await fetch(`${getOllamaEndpoint()}/api/tags`)
    if (response.ok) {
      const data = await response.json()
      return data.models?.map(m => m.name) || []
    }
    return []
  } catch {
    return []
  }
}

export async function testConnection() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(`${getOllamaEndpoint()}/api/tags`, { signal: controller.signal })
    clearTimeout(timeout)
    return response.ok
  } catch {
    return false
  }
}

export async function generateEmbedding(text, model = 'nomic-embed-text') {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await fetch(`${getOllamaEndpoint()}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`Ollama embeddings error: ${response.status}`)
    }

    const data = await response.json()
    return data.embeddings?.[0]
  } catch (error) {
    clearTimeout(timeout)
    throw error
  }
}
