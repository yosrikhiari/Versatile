import { getOllamaEndpoint } from '../../config/ollama'

function decorateOllamaError(message, original) {
  const lower = message.toLowerCase()
  if (lower.includes('cuda') || lower.includes('shared object') || lower.includes('llama runner')) {
    return new Error(
      `Ollama GPU error — try restarting Ollama or set OLLAMA_INTEL_GPU=1 to force CPU mode`
    )
  }
  return original instanceof Error ? original : new Error(message)
}

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
  const timeoutMs = options.timeout || 180000

  try {
    await ensureModelAvailable(model)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'AbortError')), timeoutMs)

    const response = await fetch(`${getOllamaEndpoint()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        system: systemPrompt,
        prompt: prompt,
        stream: false,
        ...(options?.maxTokens ? { num_predict: options.maxTokens } : {})
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
      const msg = `Ollama error (${response.status}): ${detail}`.trim()
      throw decorateOllamaError(msg, detail)
    }

    const data = await response.json()
    return data.response
  } catch (error) {
    clearTimeout(timeout)
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Ollama request timed out after ${timeoutMs}ms`)
    }
    throw decorateOllamaError(error.message || String(error), error)
  }
}

export async function stream(prompt, systemPrompt, model, onChunk, options = {}) {
  const timeoutMs = options.timeout || 120000

  try {
    await ensureModelAvailable(model)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'AbortError')), timeoutMs)

    const response = await fetch(`${getOllamaEndpoint()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        system: systemPrompt,
        prompt: prompt,
        stream: true,
        ...(options?.maxTokens ? { num_predict: options.maxTokens } : {})
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
      const msg = `Ollama error (${response.status}): ${detail}`.trim()
      throw decorateOllamaError(msg, detail)
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
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Ollama request timed out after ${timeoutMs}ms`)
    }
    throw decorateOllamaError(error.message || String(error), error)
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
