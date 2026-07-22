const FLUSH_DELAY = 500

class SyncQueue {
  constructor() {
    this._pending = new Map()
    this._flushTimer = null
    this._writers = new Map()
    this._flushCallbacks = []
  }

  register(tableName, writer) {
    this._writers.set(tableName, writer)
  }

  onFlush(callback) {
    this._flushCallbacks.push(callback)
  }

  isRegistered(tableName) {
    return this._writers.has(tableName)
  }

  push(tableName, recordId, data) {
    const key = `${tableName}:${recordId}`
    this._pending.set(key, { tableName, recordId, data })
    this._scheduleFlush()
  }

  _scheduleFlush() {
    if (this._flushTimer) return
    this._flushTimer = setTimeout(() => this._flush(), FLUSH_DELAY)
  }

  async flushNow() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer)
      this._flushTimer = null
    }
    await this._flush()
  }

  async _flush() {
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

  cancel(tableName, recordId) {
    const key = `${tableName}:${recordId}`
    this._pending.delete(key)
  }

  destroy() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer)
      this._flushTimer = null
    }
    this._pending.clear()
    this._writers.clear()
    this._flushCallbacks = []
  }

  get pendingCount() {
    return this._pending.size
  }
}

export const syncQueue = new SyncQueue()
