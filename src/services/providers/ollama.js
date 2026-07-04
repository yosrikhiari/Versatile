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
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const response = await fetch(`${getOllamaEndpoint()}/api/tags`, { signal: controller.signal })
      clearTimeout(timeout)
      if (response.ok) {
        const data = await response.json()
        for (const m of data.models || []) {
          modelCache.add(m.name)
        }
        modelCacheLoaded = true
      }
    } catch {}
  }

  if (modelCacheLoaded && !modelCache.has(model)) {
    throw new Error(
      `Model "${model}" not found in Ollama. Pull it first with: ollama pull ${model}`
    )
  }
}

// Ollama reads generation params from a nested `options` object; top-level
// keys like num_predict are ignored. Build it only with the keys we have.
function buildOllamaOptions(options = {}) {
  const opts = {}
  if (options.maxTokens) opts.num_predict = options.maxTokens
  if (options.temperature != null) opts.temperature = options.temperature
  if (Array.isArray(options.stop) && options.stop.length) opts.stop = options.stop
  return Object.keys(opts).length ? { options: opts } : {}
}

async function readWithTimeout(reader, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new DOMException(`Stream read timed out after ${timeoutMs}ms`, 'AbortError'))
    }, timeoutMs)
    reader.read().then(
      (result) => {
        clearTimeout(timer)
        resolve(result)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

export async function generate(prompt, systemPrompt, model, options = {}) {
  const timeoutMs = options.timeout || 1200000
  let timeout
  const externalSignal = options.signal

  try {
    await ensureModelAvailable(model)

    const controller = new AbortController()
    timeout = setTimeout(
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

    const response = await fetch(`${getOllamaEndpoint()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        system: systemPrompt,
        prompt: prompt,
        stream: false,
        ...buildOllamaOptions(options)
      }),
      signal: controller.signal
    })

    clearTimeout(timeout)
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort)

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
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort)
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Ollama request timed out after ${timeoutMs}ms`)
    }
    throw decorateOllamaError(error.message || String(error), error)
  }
}

export async function stream(prompt, systemPrompt, model, onChunk, options = {}) {
  const timeoutMs = options.timeout || 1200000
  let timeout
  const externalSignal = options.signal

  try {
    await ensureModelAvailable(model)

    const controller = new AbortController()
    timeout = setTimeout(
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

    const response = await fetch(`${getOllamaEndpoint()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        system: systemPrompt,
        prompt: prompt,
        stream: true,
        ...buildOllamaOptions(options)
      }),
      signal: controller.signal
    })

    clearTimeout(timeout)
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort)

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
    const CHUNK_TIMEOUT = options.chunkTimeout || 60000

    function onStreamAbort() {
      try {
        reader.cancel()
      } catch {}
    }
    if (externalSignal) {
      if (externalSignal.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      externalSignal.addEventListener('abort', onStreamAbort, { once: true })
    }

    try {
      while (true) {
        const { done, value } = await readWithTimeout(reader, CHUNK_TIMEOUT)
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter((line) => line.trim())

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
    } finally {
      if (externalSignal) externalSignal.removeEventListener('abort', onStreamAbort)
    }

    return fullResponse
  } catch (error) {
    clearTimeout(timeout)
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort)
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
      return data.models?.map((m) => m.name) || []
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
