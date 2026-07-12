export interface LangfuseConfig {
  publicKey: string
  secretKey: string
  host?: string
}

interface LangfuseEvent {
  id: string
  type: string
  timestamp: string
  body: Record<string, unknown>
}

class LangfuseService {
  private config: LangfuseConfig | null = null
  private buffer: LangfuseEvent[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly flushInterval = 2000

  configure(config: LangfuseConfig) {
    this.config = config
  }

  reset() {
    this.config = null
    this.buffer = []
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }

  get isConfigured() {
    return !!this.config?.publicKey && !!this.config?.secretKey
  }

  createTrace(traceId: string, body: Record<string, unknown>) {
    this.enqueue({
      id: crypto.randomUUID(),
      type: 'trace-create',
      timestamp: new Date().toISOString(),
      body: { id: traceId, ...body }
    })
  }

  createGeneration(traceId: string, generationId: string, body: Record<string, unknown>) {
    this.enqueue({
      id: crypto.randomUUID(),
      type: 'generation-create',
      timestamp: new Date().toISOString(),
      body: { id: generationId, traceId, ...body }
    })
  }

  endGeneration(generationId: string, body: Record<string, unknown>) {
    this.enqueue({
      id: crypto.randomUUID(),
      type: 'generation-update',
      timestamp: new Date().toISOString(),
      body: { id: generationId, ...body }
    })
  }

  score(traceId: string, name: string, value: number, comment?: string) {
    this.enqueue({
      id: crypto.randomUUID(),
      type: 'score-create',
      timestamp: new Date().toISOString(),
      body: { id: crypto.randomUUID(), traceId, name, value, comment }
    })
  }

  flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.buffer.length === 0 || !this.config) return Promise.resolve()
    return flushBatch(this.config, this.buffer.splice(0))
  }

  private enqueue(event: LangfuseEvent) {
    this.buffer.push(event)
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushInterval)
    }
  }
}

async function flushBatch(config: LangfuseConfig, batch: LangfuseEvent[]) {
  const host = config.host?.replace(/\/+$/, '') || 'https://cloud.langfuse.com'
  const encoded = btoa(`${config.publicKey}:${config.secretKey}`)
  try {
    const res = await fetch(`${host}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${encoded}`
      },
      body: JSON.stringify({ batch })
    })
    if (!res.ok) {
      console.warn(`[langfuse] ingestion returned ${res.status}`, await res.text().catch(() => ''))
    }
    return res
  } catch (err) {
    console.warn('[langfuse] ingestion failed', err)
  }
}

export const langfuseService = new LangfuseService()
