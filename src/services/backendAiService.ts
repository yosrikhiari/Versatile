import * as signalR from '@microsoft/signalr'
import { ensureConnection, disconnect as signalrDisconnect } from './signalrService'

interface BackendStreamOptions {
  provider: string
  signal?: AbortSignal
}

/**
 * Stream a generation via the backend's SignalR hub.
 *
 * Matches the provider-module `stream()` signature:
 *   stream(prompt, systemPrompt, model, onChunk, options)
 *
 * Calls GenerationHub.GenerateStream which routes through the user's
 * server-side encrypted API key.
 */
export async function backendStream(
  prompt: string,
  systemPrompt: string,
  model: string,
  onChunk?: (text: string, accumulated: string) => void,
  options: BackendStreamOptions = {} as BackendStreamOptions
): Promise<string> {
  const provider = options.provider
  if (!provider) throw new Error('backendStream requires options.provider')

  const messages = [
    { role: 'system', content: systemPrompt || '' },
    { role: 'user', content: prompt }
  ]
  const filtered = messages.filter((m: { content: string }) => m.content.length > 0)

  const conn = await ensureConnection()

  return new Promise((resolve, reject) => {
    const chunks: string[] = []
    let cleanedUp = false

    function cleanup(): void {
      if (cleanedUp) return
      cleanedUp = true
      conn.off('StreamChunk', onChunkHandler)
      conn.off('StreamEnd', onEndHandler)
      conn.off('StreamError', onErrorHandler)
      if (options.signal) {
        options.signal.removeEventListener('abort', onAbort)
      }
    }

    function onChunkHandler(text: string): void {
      if (typeof text !== 'string') return
      chunks.push(text)
      if (onChunk) onChunk(text, chunks.join(''))
    }

    function onEndHandler(finishReason?: string): void {
      cleanup()
      resolve(chunks.join(''))
    }

    function onErrorHandler(message: string): void {
      cleanup()
      reject(new Error(message || 'Generation failed'))
    }

    function onAbort(): void {
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

    conn.invoke('GenerateStream', provider, model, filtered).catch((err: Error) => {
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
export async function backendTestConnection(provider: string, model: string): Promise<{ success: boolean; model: string | null; error: string | null }> {
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
export async function backendListModels(provider: string): Promise<{ success: boolean; models: Array<{ id: string; name: string }>; error: string | null }> {
  const conn = await ensureConnection()
  const result = await conn.invoke('ListModels', provider)
  return {
    success: result?.success ?? false,
    models: (result?.models ?? []).map((m: { id: string; name: string }) => ({ id: m.id, name: m.name })),
    error: result?.error ?? null
  }
}

export { signalrDisconnect as disconnectBackend }
