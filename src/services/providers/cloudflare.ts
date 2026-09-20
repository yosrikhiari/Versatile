import { PROVIDER_BASE_URLS, PROVIDERS } from '../../config/ai'
import { DEFAULT_MAX_OUTPUT_TOKENS } from '../../config/generationLimits'
import { TokenLimitError } from '../ai/tokenLimitError'
import { armTimeLimit } from '../../config/timeLimits'

interface CloudflareOptions {
  apiKey?: string
  accountId?: string
  timeout?: number
  signal?: AbortSignal
  maxTokens?: number
  temperature?: number
  stop?: string | string[]
}

interface CloudflareMessage {
  role: string
  content: string
}

interface CloudflareEnvelope {
  result?: { response?: string }
  success?: boolean
  errors?: Array<{ message?: string }>
}

function requireCredentials(options: CloudflareOptions): { token: string; accountId: string } {
  if (!options.apiKey) throw new Error('Cloudflare API token not configured')
  if (!options.accountId) {
    throw new Error('Cloudflare account ID not configured (Settings > AI Providers)')
  }
  return { token: options.apiKey, accountId: options.accountId }
}

function runUrl(accountId: string, model: string): string {
  return `${PROVIDER_BASE_URLS[PROVIDERS.CLOUDFLARE]}/accounts/${accountId}/ai/run/${model}`
}

function buildBody(
  prompt: string,
  systemPrompt: string,
  options: CloudflareOptions,
  stream: boolean
): Record<string, unknown> {
  const messages: CloudflareMessage[] = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: prompt })
  const body: Record<string, unknown> = {
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS
  }
  if (stream) body.stream = true
  return body
}

function throwIfLimitError(message: string, model: string, maxTokens: number | undefined): void {
  if (/(?:context length|too large|too long|too many tokens|max tokens)/i.test(message)) {
    throw new TokenLimitError(message, PROVIDERS.CLOUDFLARE, model, maxTokens)
  }
}

function timeoutSignal(options: CloudflareOptions): { signal: AbortSignal; cleanup: () => void } {
  const timeoutMs = options.timeout || 120000
  const controller = new AbortController()
  const externalSignal = options.signal

  const timer = armTimeLimit(timeoutMs, (ms: number) =>
    controller.abort(new DOMException(`Request timed out after ${ms}ms`, 'AbortError'))
  )

  function onAbort(): void {
    controller.abort(externalSignal!.reason)
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
    cleanup(): void {
      clearTimeout(timer)
      if (externalSignal) externalSignal.removeEventListener('abort', onAbort)
    }
  }
}

export async function generate(
  prompt: string,
  systemPrompt: string,
  model: string,
  options: CloudflareOptions = {}
) {
  const { token, accountId } = requireCredentials(options)
  const { signal, cleanup } = timeoutSignal(options)
  try {
    const response = await fetch(runUrl(accountId, model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      signal,
      body: JSON.stringify(buildBody(prompt, systemPrompt, options, false))
    })
    cleanup()

    if (!response.ok) {
      const envelope = (await response.json().catch(() => null)) as CloudflareEnvelope | null
      const errMsg = envelope?.errors?.[0]?.message || `Cloudflare error: ${response.status}`
      throwIfLimitError(errMsg, model, options.maxTokens)
      throw new Error(errMsg)
    }

    const envelope = (await response.json()) as CloudflareEnvelope
    return { text: envelope.result?.response || '', usage: null }
  } catch (error) {
    cleanup()
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Cloudflare request timed out')
    }
    throw error
  }
}

export async function stream(
  prompt: string,
  systemPrompt: string,
  model: string,
  onChunk?: (text: string, full: string) => void,
  options: CloudflareOptions = {}
) {
  const { token, accountId } = requireCredentials(options)
  const { signal, cleanup } = timeoutSignal(options)
  try {
    const response = await fetch(runUrl(accountId, model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      signal,
      body: JSON.stringify(buildBody(prompt, systemPrompt, options, true))
    })
    cleanup()

    if (!response.ok) {
      const envelope = (await response.json().catch(() => null)) as CloudflareEnvelope | null
      const errMsg = envelope?.errors?.[0]?.message || `Cloudflare error: ${response.status}`
      throwIfLimitError(errMsg, model, options.maxTokens)
      throw new Error(errMsg)
    }

    const reader = response.body!.getReader()
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
          const parsed = JSON.parse(data) as { response?: string }
          if (parsed.response) {
            fullResponse += parsed.response
            if (onChunk) onChunk(parsed.response, fullResponse)
          }
        } catch {
          // Partial SSE line mid-stream; the next chunk continues it.
        }
      }
    }

    return fullResponse
  } catch (error) {
    cleanup()
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Cloudflare stream timed out')
    }
    throw error
  }
}

export async function testConnection(apiKey: string, accountId?: string) {
  // Workers AI exposes no ping endpoint, so TestConnectionAsync on the backend
  // sends a 1-token probe instead. The browser-direct path mirrors that here.
  if (!apiKey || !accountId) return false
  try {
    const result = await generate('ping', '', '@cf/meta/llama-3.1-8b-instruct', {
      apiKey,
      accountId,
      maxTokens: 1,
      timeout: 30000
    })
    return typeof result.text === 'string'
  } catch {
    return false
  }
}
