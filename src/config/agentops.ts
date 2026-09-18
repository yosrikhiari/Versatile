/**
 * AgentOps tracing: route local model calls through the AgentOps gateway
 * instead of straight at Ollama, so every call the orchestrator makes lands as
 * a trace (route.decide → model.generate → router.respond) with the agent role,
 * the placement (num_gpu, num_ctx, keep_alive) and the sampling parameters on
 * its spans — and nothing else: the gateway never records prompts.
 *
 * Off by default. When on, the Ollama provider posts to
 * `${url}/v1/chat/completions` (OpenAI shape, streamed) with `X-Agent-Role`
 * and `X-Client-Ref` headers and reads the `X-Trace-ID` it gets back
 * (`services/providers/agentopsTransport.ts`). Every model a role is placed on
 * must be registered on the gateway (`OLLAMA_MODELS=qwen3:8b,qwen2.5:3b-instruct`)
 * or the call answers `unknown_model` — the transport turns that into a
 * message that says so.
 *
 * Kept here, not in the settings store, because the provider is a service and
 * services must not import stores.
 */
import { STORAGE_KEYS } from './storageKeys'

export const DEFAULT_AGENTOPS_URL = 'http://localhost:8080'

export function isAgentOpsTracing(): boolean {
  try {
    // STORAGE_KEYS ref
    return localStorage.getItem(STORAGE_KEYS.AGENTOPS_TRACING) === 'true'
  } catch {
    return false
  }
}

export function setAgentOpsTracing(on: boolean) {
  // STORAGE_KEYS ref
  localStorage.setItem(STORAGE_KEYS.AGENTOPS_TRACING, on ? 'true' : 'false')
}

export function getAgentOpsUrl(): string {
  // STORAGE_KEYS ref
  const raw = localStorage.getItem(STORAGE_KEYS.AGENTOPS_URL) || DEFAULT_AGENTOPS_URL
  return raw.replace(/\/+$/, '')
}

export function setAgentOpsUrl(url: string) {
  // STORAGE_KEYS ref
  localStorage.setItem(STORAGE_KEYS.AGENTOPS_URL, (url || DEFAULT_AGENTOPS_URL).trim())
}

/** Where a trace can be opened in the Tower console. */
export function agentOpsTraceUrl(traceId: string): string {
  return `${getAgentOpsUrl()}/#/traces/${encodeURIComponent(traceId)}`
}
