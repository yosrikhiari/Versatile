/**
 * The AgentOps wire shape for a local model call.
 *
 * When tracing is on (`config/agentops.ts`) the Ollama provider keeps its whole
 * request path — stall detection, first-token budget, partial-output salvage —
 * and swaps only the transport: `POST ${gateway}/v1/chat/completions` (OpenAI
 * shape, streamed as SSE) instead of Ollama's `/api/generate` (NDJSON). The
 * gateway forwards every Ollama knob this app relies on — `options` (num_ctx,
 * num_gpu, repeat_penalty, …), `format`, `keep_alive`, `think` — and records
 * their values (never the prompt, never the schema) on the `model.generate`
 * span, together with the agent role and client ref sent as headers.
 *
 * What the gateway does not give back: `eval_duration`, so throughput samples
 * (`generationEstimate`) are not recorded for traced calls.
 */
import { getAgentOpsUrl } from '../../config/agentops'
import { buildClientRef } from '../traceContext'

export interface AgentOpsRequestInput {
  model: string
  systemPrompt: string
  prompt: string
  /** The Ollama `options` object the native path would send (may be empty). */
  ollamaOptions: Record<string, unknown>
  format?: Record<string, unknown> | string
  keepAlive?: string
  think?: boolean
  agentRole?: string | null
}

export interface AgentOpsRequest {
  url: string
  headers: Record<string, string>
  body: string
  clientRef: string
  agentRole: string | null
}

export function buildAgentOpsRequest(input: AgentOpsRequestInput): AgentOpsRequest {
  const clientRef = buildClientRef(input.agentRole)
  const agentRole = input.agentRole ? String(input.agentRole).slice(0, 32) : null
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Ref': clientRef
  }
  if (agentRole) headers['X-Agent-Role'] = agentRole
  const messages: { role: string; content: string }[] = []
  if (input.systemPrompt) messages.push({ role: 'system', content: input.systemPrompt })
  messages.push({ role: 'user', content: input.prompt })
  const { num_predict: numPredict, ...options } = input.ollamaOptions
  const body: Record<string, unknown> = {
    model: input.model,
    messages,
    stream: true,
    ...(typeof numPredict === 'number' ? { max_tokens: numPredict } : {}),
    ...(Object.keys(options).length ? { options } : {}),
    ...(input.format ? { format: input.format } : {}),
    ...(input.keepAlive ? { keep_alive: input.keepAlive } : {}),
    ...(typeof input.think === 'boolean' ? { think: input.think } : {})
  }
  return {
    url: `${getAgentOpsUrl()}/v1/chat/completions`,
    headers,
    body: JSON.stringify(body),
    clientRef,
    agentRole
  }
}

export interface AgentOpsChunk {
  /** A content delta, when the chunk carried one. */
  text?: string
  /** True for the terminal `[DONE]` marker or a finish_reason chunk. */
  done?: boolean
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  backend?: string
  /** A mid-stream error event from the gateway. */
  error?: string
}

/**
 * One SSE line → what the stream loop needs. Non-`data:` lines (comments,
 * blank keep-alives) yield null.
 */
export function parseAgentOpsLine(line: string): AgentOpsChunk | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const data = trimmed.slice(5).trim()
  if (data === '[DONE]') return { done: true }
  let parsed: {
    choices?: { delta?: { content?: string }; finish_reason?: string | null }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    backend?: string
    error?: { message?: string; code?: string }
  }
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (parsed.error) {
    return { error: parsed.error.message || parsed.error.code || 'gateway error' }
  }
  const out: AgentOpsChunk = {}
  const choice = parsed.choices?.[0]
  if (choice?.delta?.content) out.text = choice.delta.content
  if (choice?.finish_reason) out.done = true
  if (parsed.usage) {
    const promptTokens = parsed.usage.prompt_tokens || 0
    const completionTokens = parsed.usage.completion_tokens || 0
    out.usage = {
      promptTokens,
      completionTokens,
      totalTokens: parsed.usage.total_tokens || promptTokens + completionTokens
    }
  }
  if (parsed.backend) out.backend = parsed.backend
  return out
}

/**
 * The gateway's error body → a message that says what to do. `unknown_model`
 * is the one every multi-agent setup hits first: the 3B critic model is placed
 * in Versatile but not registered on the gateway.
 */
export function describeAgentOpsError(
  status: number,
  body: { error?: { code?: string; message?: string } } | null,
  model: string
): string {
  const code = body?.error?.code
  const message = body?.error?.message || ''
  if (code === 'unknown_model') {
    return (
      `AgentOps does not serve "${model}". Register it on the gateway: ` +
      `OLLAMA_MODELS=${model} (comma-separated for several), then restart AgentOps.`
    )
  }
  if (code === 'sensitive_cloud_blocked') {
    return `AgentOps refused to send a sensitive request to a non-local model (${model}).`
  }
  if (code === 'unauthorized' || status === 401) {
    return 'AgentOps requires an API key (REQUIRE_API_KEY is on); tracing from Versatile sends none.'
  }
  return `AgentOps error (${status}): ${message || code || 'no detail'}`.trim()
}
