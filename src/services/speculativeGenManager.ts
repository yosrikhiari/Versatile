export class SceneSpeculativeCache<T = unknown> {
  private _map: Map<number, T>
  private _reserved: Set<number>

  constructor() {
    this._map = new Map()
    this._reserved = new Set()
  }

  reserve(index: number): boolean {
    if (this._map.has(index) || this._reserved.has(index)) return false
    this._reserved.add(index)
    return true
  }

  set(index: number, result: T): void {
    this._map.set(index, result)
    this._reserved.delete(index)
  }

  consume(index: number): T | null {
    const result = this._map.get(index)
    if (result !== undefined) this._map.delete(index)
    return result ?? null
  }

  has(index: number): boolean {
    return this._map.has(index)
  }

  flush() {
    this._map.clear()
    this._reserved.clear()
  }

  get size(): number {
    return this._map.size
  }
}