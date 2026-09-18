/**
 * The join between the orchestrator's record and the gateway's traces.
 *
 * The graph sets the run context (run id, superstep) before it fires a
 * superstep; the AgentOps transport reads it to build the `X-Client-Ref` it
 * sends with every call (`<run>/<step>/<role>`), and reports back the
 * `X-Trace-ID` the gateway answered with. The graph forwards those reports to
 * the orchestration store so the Agents panel can list them, and a person can
 * open the exact gateway trace for a given decision.
 *
 * A plain module, not a store: the transport is a service and services must
 * not import stores.
 */
export interface TraceRunContext {
  runId: string
  step: number
}

export interface TraceReport {
  traceId: string
  clientRef: string
  agentRole: string | null
  model: string
  at: number
  /** The gateway's own routing reason / backend when the final chunk carried them. */
  backend: string | null
}

const MAX_RECENT = 200

let context: TraceRunContext | null = null
const recent: TraceReport[] = []
const listeners = new Set<(report: TraceReport) => void>()

export function setTraceContext(next: TraceRunContext | null) {
  context = next
}

export function getTraceContext(): TraceRunContext | null {
  return context
}

/**
 * `<run>/<step>/<role>`, bounded to the gateway's 64-char limit. The run id is
 * `<projectId>:<base36 time>`; a UUID project id alone is 36 chars, so only the
 * tail that changes between runs is kept.
 */
export function buildClientRef(role: string | null | undefined): string {
  const ctx = context
  const runTail = ctx ? ctx.runId.slice(-16) : 'adhoc'
  const step = ctx ? String(ctx.step) : '0'
  const ref = `${runTail}/${step}/${role || 'unplaced'}`
  return ref.length > 64 ? ref.slice(0, 64) : ref
}

export function reportTrace(report: TraceReport) {
  recent.push(report)
  if (recent.length > MAX_RECENT) recent.splice(0, recent.length - MAX_RECENT)
  for (const fn of listeners) {
    try {
      fn(report)
    } catch {
      // A listener must never break a model call.
    }
  }
}

export function onTrace(fn: (report: TraceReport) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function recentTraces(): readonly TraceReport[] {
  return recent
}

export function __resetTraceContext() {
  context = null
  recent.length = 0
  listeners.clear()
}
