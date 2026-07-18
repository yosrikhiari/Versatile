import * as signalR from '@microsoft/signalr'
import { ensureConnection, disconnect as signalrDisconnect } from './signalrService'

/**
 * Stream a generation via the backend's SignalR hub.
 *
 * Matches the provider-module `stream()` signature:
 *   stream(prompt, systemPrompt, model, onChunk, options)
 *
 * Calls GenerationHub.GenerateStream which routes through the user's
 * server-side encrypted API key.
 */
export async function backendStream(prompt, systemPrompt, model, onChunk, options = {}) {
  const provider = options.provider
  if (!provider) throw new Error('backendStream requires options.provider')

  const messages = [
    { role: 'system', content: systemPrompt || '' },
    { role: 'user', content: prompt }
  ]
  // Filter out empty system prompts
  const filtered = messages.filter((m) => m.content.length > 0)

  const conn = await ensureConnection()

  return new Promise((resolve, reject) => {
    const chunks = []
    let cleanedUp = false

    function cleanup() {
      if (cleanedUp) return
      cleanedUp = true
      conn.off('StreamChunk', onChunkHandler)
      conn.off('StreamEnd', onEndHandler)
      conn.off('StreamError', onErrorHandler)
      if (options.signal) {
        options.signal.removeEventListener('abort', onAbort)
      }
    }

    function onChunkHandler(text) {
      if (typeof text !== 'string') return
      chunks.push(text)
      if (onChunk) onChunk(text, chunks.join(''))
    }

    function onEndHandler(finishReason) {
      cleanup()
      resolve(chunks.join(''))
    }

    function onErrorHandler(message) {
      cleanup()
      reject(new Error(message || 'Generation failed'))
    }

    function onAbort() {
      cleanup()
      conn.stop().catch(() => {})
      reject(new DOMException('Generation aborted', 'AbortError'))
    }

    conn.on('StreamChunk', onChunkHandler)
    conn.on('StreamEnd', onEndHandler)
    conn.on('StreamError', onErrorHandler)

    if (options.signal) {
      if (options.signal.aborted) {
        cleanup()
        reject(new DOMException('Generation aborted', 'AbortError'))
        return
      }
      options.signal.addEventListener('abort', onAbort, { once: true })
    }

    conn.invoke('GenerateStream', provider, model, filtered).catch((err) => {
      cleanup()
      reject(err)
    })
  })
}

/**
 * Test a provider connection via the backend hub.
 *
 * Returns { success, model, error }.
 */
export async function backendTestConnection(provider, model) {
  const conn = await ensureConnection()
  const result = await conn.invoke('TestConnection', provider, model)
  return {
    success: result?.success ?? false,
    model: result?.model ?? null,
    error: result?.error ?? null
  }
}

/**
 * List models for a provider via the backend hub.
 *
 * Returns { success, models: [{id, name}], error }.
 */
export async function backendListModels(provider) {
  const conn = await ensureConnection()
  const result = await conn.invoke('ListModels', provider)
  return {
    success: result?.success ?? false,
    models: (result?.models ?? []).map((m) => ({ id: m.id, name: m.name })),
    error: result?.error ?? null
  }
}

export { signalrDisconnect as disconnectBackend }
