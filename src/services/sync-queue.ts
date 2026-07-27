type QueueWriter = (recordId: string, data: unknown) => Promise<void>
type FlushCallback = () => Promise<void> | void

interface QueueEntry {
  tableName: string
  recordId: string
  data: unknown
}

const FLUSH_DELAY = 500

class SyncQueue {
  private _pending: Map<string, QueueEntry>
  private _flushTimer: ReturnType<typeof setTimeout> | null
  private _writers: Map<string, QueueWriter>
  private _flushCallbacks: FlushCallback[]

  constructor() {
    this._pending = new Map()
    this._flushTimer = null
    this._writers = new Map()
    this._flushCallbacks = []
  }

  register(tableName: string, writer: QueueWriter): void {
    this._writers.set(tableName, writer)
  }

  onFlush(callback: FlushCallback): void {
    this._flushCallbacks.push(callback)
  }

  isRegistered(tableName: string): boolean {
    return this._writers.has(tableName)
  }

  push(tableName: string, recordId: string, data: unknown): void {
    const key = `${tableName}:${recordId}`
    this._pending.set(key, { tableName, recordId, data })
    this._scheduleFlush()
  }

  private _scheduleFlush(): void {
    if (this._flushTimer) return
    this._flushTimer = setTimeout(() => this._flush(), FLUSH_DELAY)
  }

  async flushNow(): Promise<void> {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer)
      this._flushTimer = null
    }
    await this._flush()
  }

  private async _flush(): Promise<void> {
    const entries = Array.from(this._pending.values())
    this._pending.clear()

    for (const { tableName, recordId, data } of entries) {
      const writer = this._writers.get(tableName)
      if (!writer) {
        console.warn(`[SyncQueue] No writer registered for "${tableName}"`)
        continue
      }
      try {
        await writer(recordId, data)
      } catch (err) {
        console.error(`[SyncQueue] Writer failed for ${tableName}:${recordId}:`, err)
      }
    }

    for (const cb of this._flushCallbacks) {
      try {
        await cb()
      } catch (err) {
        console.error('[SyncQueue] Flush callback failed:', err)
      }
    }
  }

  cancel(tableName: string, recordId: string): void {
    const key = `${tableName}:${recordId}`
    this._pending.delete(key)
  }

  destroy(): void {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer)
      this._flushTimer = null
    }
    this._pending.clear()
    this._writers.clear()
    this._flushCallbacks = []
  }

  get pendingCount(): number {
    return this._pending.size
  }
}

export const syncQueue = new SyncQueue()
